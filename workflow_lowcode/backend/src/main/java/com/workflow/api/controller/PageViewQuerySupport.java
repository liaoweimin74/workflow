package com.workflow.api.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 页面视图查询的共享安全辅助（schema 白名单解析 / filter 白名单过滤）。
 * 从 {@link PageQueryController} 抽取，供页面数据查询与 Excel 导入导出
 * （{@link PageDataExcelController}）复用，保证两侧白名单语义一致不漂移。
 */
@Component
public class PageViewQuerySupport {

    private final ObjectMapper objectMapper;

    public PageViewQuerySupport(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    /** 在 PAGE schema dataSources 中按页面内 id 解析 refId */
    public String resolveDataSourceRefId(String schema, String dataSourceId) {
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
    public Set<String> pageDataSourceSearchFields(String schema, String dataSourceId) {
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
     * 同时包含 filter.conditions 中引用的列（静态筛选列也需白名单校验）。
     */
    public Set<String> searchFieldKeys(String schema) {
        Set<String> keys = new HashSet<>();
        try {
            JsonNode root = objectMapper.readTree(schema == null || schema.isBlank() ? "{}" : schema);
            JsonNode searchFields = root.path("searchFields");
            if (searchFields.isArray()) {
                for (JsonNode field : searchFields) {
                    keys.add(field.path("key").asText());
                }
            }
            // 静态筛选列也纳入白名单（ViewDesigner 数据源页签配置）
            JsonNode filter = root.path("filter");
            if (filter.isObject()) {
                JsonNode conditions = filter.path("conditions");
                if (conditions.isArray()) {
                    for (JsonNode c : conditions) {
                        String column = c.path("column").asText();
                        if (column != null && !column.isBlank()) {
                            keys.add(column);
                        }
                    }
                }
            }
        } catch (Exception e) {
            throw new BusinessException(400, "页面 schema 解析失败");
        }
        return keys;
    }

    /**
     * 解析 schema 中声明的 sortableFields key 集合（视图级排序收窄；未声明为空=不限制）。
     */
    public Set<String> sortableFieldKeys(String schema) {
        Set<String> keys = new HashSet<>();
        try {
            JsonNode root = objectMapper.readTree(schema == null || schema.isBlank() ? "{}" : schema);
            JsonNode fields = root.path("sortableFields");
            if (fields.isArray()) {
                for (JsonNode f : fields) {
                    keys.add(f.asText());
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
    public String whitelistFilter(String filterJson, Set<String> whitelist) {
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
