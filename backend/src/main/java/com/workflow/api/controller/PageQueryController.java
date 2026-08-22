package com.workflow.api.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.form.bizdata.BizDataService;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import org.springframework.web.bind.annotation.*;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 页面数据查询 Controller。
 * 视图（VIEW）页面渲染时的数据查询入口：按 pageKey 取已发布页面定义，
 * 以 schema 声明的 searchFields 作 filter 白名单，委托 BizDataService 查询业务表。
 * 自定义页面（PAGE）数据源查询：按页面内 dataSourceId 解析全局数据源 refId，
 * 委托 DataSourceDefinitionService.queryData（经 DataSourceAdapter）查询。
 */
@RestController
@RequestMapping("/api/v1/pages")
public class PageQueryController {

    private final PageDefinitionService pageDefService;
    private final BizDataService bizDataService;
    private final DataSourceDefinitionService dsService;
    private final ObjectMapper objectMapper;

    public PageQueryController(PageDefinitionService pageDefService,
                               BizDataService bizDataService,
                               DataSourceDefinitionService dsService,
                               ObjectMapper objectMapper) {
        this.pageDefService = pageDefService;
        this.bizDataService = bizDataService;
        this.dsService = dsService;
        this.objectMapper = objectMapper;
    }

    /**
     * 视图数据分页查询。
     * 参数对齐 BizDataQueryRequest（filter 为 JSON 字符串），filter 仅保留
     * schema 声明的 searchFields key（白名单）；pageKey 未发布/不存在 → 404。
     * 取数来源三分支：
     * 1. dataSourceId 非空（新协议）→ 经统一数据源 SPI 查询（DataSourceDefinitionService.queryData）
     * 2. 仅剩 formKey（兼容）→ 遗留 BizDataService 直连业务表
     * 3. 两者皆无 → 400「页面未绑定数据源」
     */
    @GetMapping("/{pageKey}/data")
    public R<BizDataPageVO> query(@PathVariable String pageKey, BizDataQueryRequest req) {
        PageDefinition page = pageDefService.getPublishedByKey(pageKey);
        if (!"VIEW".equals(page.getType())) {
            throw new BusinessException(400, "页面 " + pageKey + " 不是视图类型，不支持数据查询");
        }
        boolean hasDataSourceId = page.getDataSourceId() != null && !page.getDataSourceId().isBlank();
        boolean hasFormKey = page.getFormKey() != null && !page.getFormKey().isBlank();
        if (!hasDataSourceId && !hasFormKey) {
            throw new BusinessException(400, "页面 " + pageKey + " 未绑定数据源");
        }

        // filter 白名单：仅保留 schema 声明的 searchFields key
        Set<String> whitelist = searchFieldKeys(page.getSchema());
        req.setFilter(whitelistFilter(req.getFilter(), whitelist));

        if (hasDataSourceId) {
            return R.ok(dsService.queryData(page.getDataSourceId(), req));
        }
        return R.ok(bizDataService.query(page.getFormKey(), req));
    }

    /**
     * 自定义页面（PAGE）数据源查询。
     * 按页面内 dataSourceId 在已发布 schema 的 dataSources 中解析 refId，
     * 委托 DataSourceDefinitionService.queryData（经 DataSourceAdapter）查询。
     *
     * @param pageKey       页面 key（已发布 PAGE）
     * @param dataSourceId  页面内数据源 id（dataSources[].id）
     * @param req           查询参数（filter 为 JSON 字符串，受数据源 searchFields 白名单约束）
     */
    @GetMapping("/{pageKey}/ds/{dataSourceId}/data")
    public R<BizDataPageVO> queryPageDataSource(@PathVariable String pageKey,
                                                @PathVariable String dataSourceId,
                                                BizDataQueryRequest req) {
        PageDefinition page = pageDefService.getPublishedByKey(pageKey);
        if (!"PAGE".equals(page.getType())) {
            throw new BusinessException(400, "页面 " + pageKey + " 不是自定义页面类型");
        }
        String refId = resolveDataSourceRefId(page.getSchema(), dataSourceId);
        // filter 白名单：仅保留该数据源条目声明的 searchFields
        Set<String> whitelist = pageDataSourceSearchFields(page.getSchema(), dataSourceId);
        req.setFilter(whitelistFilter(req.getFilter(), whitelist));
        return R.ok(dsService.queryData(refId, req));
    }

    /** 在 PAGE schema dataSources 中按页面内 id 解析 refId */
    private String resolveDataSourceRefId(String schema, String dataSourceId) {
        JsonNode dataSources = pageDataSources(schema);
        if (dataSources.isArray()) {
            for (JsonNode entry : dataSources) {
                if (dataSourceId.equals(entry.path("id").asText())) {
                    String refId = entry.path("refId").asText();
                    if (!refId.isBlank()) return refId;
                }
            }
        }
        throw new BusinessException(400, "页面未声明数据源: " + dataSourceId);
    }

    /** 该数据源条目声明的 searchFields key 集合（未声明 → 空 = 不限制） */
    private Set<String> pageDataSourceSearchFields(String schema, String dataSourceId) {
        Set<String> keys = new HashSet<>();
        JsonNode dataSources = pageDataSources(schema);
        if (dataSources.isArray()) {
            for (JsonNode entry : dataSources) {
                if (!dataSourceId.equals(entry.path("id").asText())) continue;
                JsonNode searchFields = entry.path("searchFields");
                if (searchFields.isArray()) {
                    for (JsonNode sf : searchFields) {
                        String k = sf.asText();
                        if (!k.isBlank()) keys.add(k);
                    }
                }
                break;
            }
        }
        return keys;
    }

    /** 解析 PAGE schema 的 dataSources 数组 */
    private JsonNode pageDataSources(String schema) {
        try {
            JsonNode root = objectMapper.readTree(schema == null || schema.isBlank() ? "{}" : schema);
            return root.path("dataSources");
        } catch (Exception e) {
            throw new BusinessException(400, "页面 schema 解析失败");
        }
    }

    /**
     * 解析 schema 中声明的 searchFields key 集合。
     */
    private Set<String> searchFieldKeys(String schema) {
        Set<String> keys = new HashSet<>();
        try {
            JsonNode root = objectMapper.readTree(schema == null || schema.isBlank() ? "{}" : schema);
            JsonNode searchFields = root.path("searchFields");
            if (searchFields.isArray()) {
                for (JsonNode field : searchFields) {
                    keys.add(field.path("key").asText());
                }
            }
        } catch (Exception e) {
            throw new BusinessException(400, "页面 schema 解析失败");
        }
        return keys;
    }

    /**
     * 过滤 filter JSON：仅保留白名单内的字段。
     * 支持两种格式：
     * - 扁平格式 {@code {"col":"value"}}：按顶层 key 校验
     * - 结构化格式 {@code {"logic":"AND","conditions":[{column,op,value}]}}
     *   （前端 PageRenderer.buildFilter 输出）：按 conditions[].column 校验
     */
    @SuppressWarnings("unchecked")
    private String whitelistFilter(String filterJson, Set<String> whitelist) {
        if (filterJson == null || filterJson.isBlank()) {
            return null;
        }
        // 白名单为空（数据源未声明 searchFields）= 不限制
        if (whitelist == null || whitelist.isEmpty()) {
            return filterJson;
        }
        try {
            Map<String, Object> filter = objectMapper.readValue(filterJson, Map.class);
            if (filter == null || filter.isEmpty()) {
                return null;
            }
            if (filter.get("conditions") instanceof List<?> conditions) {
                // 结构化格式：{logic, conditions:[{column,op,value}]}
                for (Object o : conditions) {
                    if (o instanceof Map<?, ?> c) {
                        String column = String.valueOf(c.get("column"));
                        if (!whitelist.contains(column)) {
                            throw new BusinessException(400, "筛选字段不在页面声明白名单: " + column);
                        }
                    }
                }
            } else {
                // 扁平格式：{col: value}
                for (String key : filter.keySet()) {
                    if (!whitelist.contains(key)) {
                        throw new BusinessException(400, "筛选字段不在页面声明白名单: " + key);
                    }
                }
            }
            return objectMapper.writeValueAsString(filter);
        } catch (BusinessException e) {
            throw e;
        } catch (Exception e) {
            throw new BusinessException(400, "筛选参数 filter 格式非法，应为 JSON 对象");
        }
    }
}