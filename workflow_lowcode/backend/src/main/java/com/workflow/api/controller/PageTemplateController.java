package com.workflow.api.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.workflow.api.dto.PageTemplateBundleDTO;
import com.workflow.api.dto.PageTemplateDTO;
import com.workflow.api.dto.PageTemplateDetailDTO;
import com.workflow.api.dto.PageTemplateImportResultDTO;
import com.workflow.api.dto.PageTemplateSaveRequest;
import com.workflow.api.dto.PageResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.PageTemplateService;
import com.workflow.engine.page.entity.PageTemplate;
import com.workflow.framework.security.domain.LoginUser;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 页面模板 Controller。
 * CRUD + key upsert（另存为模板/覆盖更新）+ 详情读取 + bundle 导出/导入（跨项目搬运）。
 * bundle 文件格式（导出响应与导入请求同构）：
 * {kind:"page-template-bundle", schemaVersion:1, templates:[{key,name,schema}]}
 */
@RestController
@RequestMapping("/api/v1/page-templates")
public class PageTemplateController {

    /** 模板文件包格式标识 */
    public static final String BUNDLE_KIND = "page-template-bundle";
    /** 当前支持的 bundle 最高版本 */
    public static final int BUNDLE_SCHEMA_VERSION = 1;

    private final PageTemplateService templateService;
    private final com.fasterxml.jackson.databind.ObjectMapper objectMapper;

    public PageTemplateController(PageTemplateService templateService,
                                  com.fasterxml.jackson.databind.ObjectMapper objectMapper) {
        this.templateService = templateService;
        this.objectMapper = objectMapper;
    }

    /**
     * 分页查询模板列表（不含 schema）。
     */
    @GetMapping
    public R<PageResponse<PageTemplateDTO>> list(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String name) {

        PageRequest pageable = PageRequest.of(Math.max(page, 1) - 1, size);
        Page<PageTemplate> result = templateService.list(name, pageable);
        List<PageTemplateDTO> dtos = result.getContent().stream()
                .map(this::toDTO)
                .collect(Collectors.toList());
        return R.ok(new PageResponse<>(dtos, result.getNumber() + 1, result.getSize(), result.getTotalElements()));
    }

    /**
     * 模板详情（含 schema 快照原文，导出/实例化用）。
     */
    @GetMapping("/{id}")
    public R<PageTemplateDetailDTO> getById(@PathVariable String id) {
        return R.ok(toDetailDTO(templateService.getById(id)));
    }

    /**
     * 创建模板。
     */
    @PostMapping
    public R<PageTemplateDTO> create(@RequestBody PageTemplateSaveRequest request) {
        PageTemplate template = templateService.create(
                request.getName(), request.getKey(), request.getSchema(), request.getKind(), currentUsername());
        return R.ok(toDTO(template));
    }

    /**
     * 按 key upsert 保存（另存为模板 / 覆盖更新）。
     */
    @PostMapping("/save")
    public R<PageTemplateDTO> save(@RequestBody PageTemplateSaveRequest request) {
        PageTemplate template = templateService.saveByKey(
                request.getName(), request.getKey(), request.getSchema(), request.getKind(), currentUsername());
        return R.ok(toDTO(template));
    }

    /**
     * 更新模板（name/key/schema/kind，null 字段不更新）。
     */
    @PutMapping("/{id}")
    public R<PageTemplateDTO> update(@PathVariable String id, @RequestBody PageTemplateSaveRequest request) {
        PageTemplate template = templateService.update(
                id, request.getName(), request.getKey(), request.getSchema(), request.getKind());
        return R.ok(toDTO(template));
    }

    /**
     * 删除模板（硬删除）。
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable String id) {
        templateService.delete(id);
        return R.ok();
    }

    /**
     * 批量导出 bundle（跨项目搬运文件）；ids 为空 → 导出当前租户全部模板。
     */
    @PostMapping("/export")
    public R<PageTemplateBundleDTO> export(@RequestBody(required = false) List<String> ids) {
        List<PageTemplate> templates;
        if (ids == null || ids.isEmpty()) {
            templates = templateService.list(null, PageRequest.of(0, 1000)).getContent();
        } else {
            templates = ids.stream().map(templateService::getById).collect(Collectors.toList());
        }
        List<PageTemplateBundleDTO.Item> items = templates.stream().map(t -> {
            PageTemplateBundleDTO.Item item = new PageTemplateBundleDTO.Item();
            item.setKey(t.getKey());
            item.setName(t.getName());
            item.setKind(kindOrFull(t));
            item.setSchema(parseSchemaOrThrow(t));
            return item;
        }).collect(Collectors.toList());

        PageTemplateBundleDTO bundle = new PageTemplateBundleDTO();
        bundle.setKind(BUNDLE_KIND);
        bundle.setSchemaVersion(BUNDLE_SCHEMA_VERSION);
        bundle.setTemplates(items);
        return R.ok(bundle);
    }

    /**
     * 导入 bundle：逐条按 key upsert（已存在覆盖，不存在创建）。
     * body 即导出文件格式 {kind, schemaVersion, templates:[{key,name,schema}]}。
     */
    @PostMapping("/import")
    public R<PageTemplateImportResultDTO> importBundle(@RequestBody PageTemplateBundleDTO bundle) {
        if (bundle == null || !BUNDLE_KIND.equals(bundle.getKind())) {
            throw new BusinessException(400, "不是页面模板文件（kind 应为 " + BUNDLE_KIND + "）");
        }
        Integer version = bundle.getSchemaVersion();
        if (version == null || version < 1 || version > BUNDLE_SCHEMA_VERSION) {
            throw new BusinessException(400, "模板文件版本不支持: " + version);
        }
        List<PageTemplateBundleDTO.Item> templates = bundle.getTemplates();
        if (templates == null || templates.isEmpty()) {
            throw new BusinessException(400, "模板文件不含任何模板");
        }
        int created = 0;
        int updated = 0;
        for (PageTemplateBundleDTO.Item item : templates) {
            String key = item.getKey();
            String name = item.getName();
            Object schema = item.getSchema();
            if (key == null || key.isBlank() || name == null || name.isBlank() || !(schema instanceof Map)) {
                throw new BusinessException(400, "模板条目缺少 key/name/schema 或 schema 非法");
            }
            PageTemplateService.UpsertResult result =
                    templateService.upsertByKey(name, key, writeJson(schema), item.getKind(), currentUsername());
            if (result.created()) {
                created++;
            } else {
                updated++;
            }
        }
        return R.ok(new PageTemplateImportResultDTO(created, updated));
    }

    /** schema 快照解析后转普通 Map/List 放入 bundle（项目 HTTP 层用 Jackson 3，不能让 Jackson 2 的 JsonNode 直接进响应体） */
    private Object parseSchemaOrThrow(PageTemplate t) {
        try {
            JsonNode node = objectMapper.readTree(t.getSchema() == null || t.getSchema().isBlank() ? "{}" : t.getSchema());
            return objectMapper.convertValue(node, Object.class);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException(400, "模板 schema 已损坏: " + t.getKey());
        }
    }

    /** 导入条目的 schema（Map/List）序列化为落库字符串 */
    private String writeJson(Object schema) {
        try {
            return objectMapper.writeValueAsString(schema);
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            throw new BusinessException(400, "模板 schema 序列化失败");
        }
    }

    /** 存量行 kind 为 NULL/空串（加列前的数据），读侧归一为 full */
    private String kindOrFull(PageTemplate t) {
        return t.getKind() == null || t.getKind().isBlank() ? "full" : t.getKind();
    }

    private PageTemplateDTO toDTO(PageTemplate t) {
        PageTemplateDTO dto = new PageTemplateDTO();
        dto.setId(t.getId());
        dto.setName(t.getName());
        dto.setKey(t.getKey());
        dto.setSchemaVersion(t.getSchemaVersion());
        dto.setKind(kindOrFull(t));
        int[] ds = countDataSources(t.getSchema());
        dto.setDsCount(ds[0]);
        dto.setDsBound(ds[1]);
        dto.setCreatedBy(t.getCreatedBy());
        dto.setCreatedAt(t.getCreatedAt());
        dto.setUpdatedAt(t.getUpdatedAt());
        return dto;
    }

    private PageTemplateDetailDTO toDetailDTO(PageTemplate t) {
        PageTemplateDetailDTO dto = new PageTemplateDetailDTO();
        dto.setId(t.getId());
        dto.setName(t.getName());
        dto.setKey(t.getKey());
        dto.setSchemaVersion(t.getSchemaVersion());
        dto.setKind(kindOrFull(t));
        int[] ds = countDataSources(t.getSchema());
        dto.setDsCount(ds[0]);
        dto.setDsBound(ds[1]);
        dto.setCreatedBy(t.getCreatedBy());
        dto.setCreatedAt(t.getCreatedAt());
        dto.setUpdatedAt(t.getUpdatedAt());
        dto.setSchema(t.getSchema());
        return dto;
    }

    /** 解析 schema 统计数据源绑定状态：[总数, refId 非空数]；解析失败返回 [0,0]（由实例化环节报错） */
    private int[] countDataSources(String schemaJson) {
        try {
            JsonNode root = objectMapper.readTree(schemaJson == null || schemaJson.isBlank() ? "{}" : schemaJson);
            JsonNode dataSources = root.path("dataSources");
            if (!dataSources.isArray()) {
                return new int[]{0, 0};
            }
            int total = 0;
            int bound = 0;
            for (JsonNode entry : dataSources) {
                total++;
                if (!entry.path("refId").asText().isBlank()) {
                    bound++;
                }
            }
            return new int[]{total, bound};
        } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
            return new int[]{0, 0};
        }
    }

    private String currentUsername() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof LoginUser loginUser) {
            return loginUser.getUsername();
        }
        return "system";
    }
}
