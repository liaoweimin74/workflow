package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.PageDataExportRequest;
import com.workflow.api.dto.PageDataImportResultVO;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.PageDataExcelService;
import com.workflow.engine.page.PageAccessGuard;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;

/**
 * 页面数据视图 Excel 导入导出 Controller。
 *
 * <p>导出：POST /api/v1/pages/{pageKey}/data/export —— 入参与分页查询接口
 * {@link PageQueryController#query} 同构（filter/sort 同白名单），返回 xlsx 二进制流。
 * <p>导入：POST /api/v1/pages/{pageKey}/data/import —— multipart 上传 .xlsx +
 * 可选表头映射，逐行复用 DATA_INSERT 同款通用写入（{@link com.workflow.engine.form.bizdata.BizDataService#create}
 * ：必填校验 / JSON 列 / 日期归一 / 租户注入），单行失败收集不中断。
 * <p>权限与查询接口一致：JWT 全局认证 + PageAccessGuard 页面访问校验（无菜单 404 / 无权限 403）。
 */
@RestController
@RequestMapping("/api/v1/pages")
public class PageDataExcelController {

    private static final MediaType XLSX_MEDIA_TYPE =
            MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    /** 导入文件大小上限（xlsx 结构化文件 20MB 足够覆盖 5000 行上限） */
    private static final long MAX_IMPORT_FILE_BYTES = 20L * 1024 * 1024;

    private final PageDefinitionService pageDefService;
    private final PageAccessGuard pageAccessGuard;
    private final PageViewQuerySupport querySupport;
    private final PageDataExcelService excelService;
    private final ObjectMapper objectMapper;

    public PageDataExcelController(PageDefinitionService pageDefService,
                                   PageAccessGuard pageAccessGuard,
                                   PageViewQuerySupport querySupport,
                                   PageDataExcelService excelService,
                                   ObjectMapper objectMapper) {
        this.pageDefService = pageDefService;
        this.pageAccessGuard = pageAccessGuard;
        this.querySupport = querySupport;
        this.excelService = excelService;
        this.objectMapper = objectMapper;
    }

    /**
     * 导出视图当前查询结果为 .xlsx。
     * 入参 = 查询上下文（filter/keyword/sort/order/params 与查询接口同构，
     * filter/sort 同受页面 schema 白名单约束）+ 可选导出列子集 + 可选文件名。
     * 结果超 {@link PageDataExcelService#MAX_EXPORT_ROWS} 行时截断，响应头 X-Export-Truncated: true。
     */
    @PostMapping("/{pageKey}/data/export")
    public ResponseEntity<byte[]> export(@PathVariable String pageKey,
                                         @RequestBody(required = false) PageDataExportRequest req) {
        if (req == null) {
            req = new PageDataExportRequest();
        }
        PageDefinition page = resolveViewPage(pageKey);

        BizDataQueryRequest query = new BizDataQueryRequest();
        Set<String> whitelist = querySupport.searchFieldKeys(page.getSchema());
        query.setFilter(querySupport.whitelistFilter(req.getFilter(), whitelist));
        Set<String> sortable = querySupport.sortableFieldKeys(page.getSchema());
        if (req.getSort() != null && !req.getSort().isBlank()
                && !sortable.isEmpty() && !sortable.contains(req.getSort())) {
            throw new BusinessException(400, "排序字段不在页面声明的可排序字段中: " + req.getSort());
        }
        query.setKeyword(req.getKeyword());
        query.setKeywordColumn(req.getKeywordColumn());
        query.setSort(req.getSort());
        query.setOrder(req.getOrder());
        query.setParams(req.getParams());

        PageDataExcelService.ExportResult result = excelService.export(page, query, req.getColumns());

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(XLSX_MEDIA_TYPE);
        headers.setContentDisposition(ContentDisposition.attachment()
                .filename(sanitizeFilename(req.getFilename(), page.getName()), StandardCharsets.UTF_8).build());
        if (result.truncated()) {
            headers.set("X-Export-Truncated", "true");
        }
        return ResponseEntity.ok().headers(headers).body(result.xlsx());
    }

    /**
     * 导入 .xlsx 批量插入到视图绑定的业务表。
     * multipart 表单：file（必填，.xlsx）+ mapping（可选 JSON 字符串 {表头: 字段key}）。
     * 返回 {total, success, failed, skipped, errors:[{row, message}]}（row = Excel 行号）。
     */
    @PostMapping(value = "/{pageKey}/data/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public R<PageDataImportResultVO> importExcel(@PathVariable String pageKey,
                                                 @RequestParam("file") MultipartFile file,
                                                 @RequestParam(value = "mapping", required = false) String mappingJson) {
        PageDefinition page = resolveViewPage(pageKey);
        if (page.getFormKey() == null || page.getFormKey().isBlank()) {
            throw new BusinessException(400, "页面未绑定业务表单，无法导入（仅支持业务表单视图）");
        }
        if (file == null || file.isEmpty()) {
            throw new BusinessException(400, "未上传文件");
        }
        if (file.getSize() > MAX_IMPORT_FILE_BYTES) {
            throw new BusinessException(400, "文件超过导入大小上限 20MB");
        }
        String original = file.getOriginalFilename();
        if (original != null && !original.isBlank() && !original.toLowerCase().endsWith(".xlsx")) {
            throw new BusinessException(400, "仅支持 .xlsx 格式");
        }

        return R.ok(excelService.importRows(page.getFormKey(), parseMapping(mappingJson), inputStreamOf(file)));
    }

    /** 公共前置：页面访问权限 → 已发布 → VIEW 类型 → 已绑定数据源（与查询接口一致） */
    private PageDefinition resolveViewPage(String pageKey) {
        pageAccessGuard.assertPageAccess(pageKey);
        PageDefinition page = pageDefService.getPublishedByKey(pageKey);
        if (!"VIEW".equals(page.getType())) {
            throw new BusinessException(400, "页面 " + pageKey + " 不是视图类型，不支持数据导入导出");
        }
        boolean hasDataSourceId = page.getDataSourceId() != null && !page.getDataSourceId().isBlank();
        boolean hasFormKey = page.getFormKey() != null && !page.getFormKey().isBlank();
        if (!hasDataSourceId && !hasFormKey) {
            throw new BusinessException(400, "页面 " + pageKey + " 未绑定数据源");
        }
        return page;
    }

    /** mapping 表单字段解析：空 → null；非 JSON 对象 / 值非字符串 → 400 */
    private Map<String, String> parseMapping(String mappingJson) {
        if (mappingJson == null || mappingJson.isBlank()) {
            return null;
        }
        try {
            Map<String, String> mapping = objectMapper.readValue(mappingJson, Map.class);
            if (mapping == null || mapping.isEmpty()) {
                return null;
            }
            for (Map.Entry<String, String> e : mapping.entrySet()) {
                if (e.getKey() == null || e.getKey().isBlank()
                        || e.getValue() == null || String.valueOf(e.getValue()).isBlank()) {
                    throw new BusinessException(400, "mapping 映射键值均不能为空");
                }
            }
            return mapping;
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(400, "mapping 参数非法，应为 JSON 对象 {\"表头\":\"字段key\"}");
        }
    }

    private java.io.InputStream inputStreamOf(MultipartFile file) {
        try {
            return file.getInputStream();
        } catch (IOException e) {
            throw new BusinessException(400, "文件读取失败: " + e.getMessage());
        }
    }

    /** 文件名清洗：去路径/引号/控制字符，缺省 = 页面名称，强制 .xlsx 后缀 */
    private String sanitizeFilename(String requested, String pageName) {
        String base = requested;
        if (base == null || base.isBlank()) {
            base = pageName == null || pageName.isBlank() ? "export" : pageName;
        }
        base = base.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "_").trim();
        if (base.isBlank()) {
            base = "export";
        }
        return base.toLowerCase().endsWith(".xlsx") ? base : base + ".xlsx";
    }
}
