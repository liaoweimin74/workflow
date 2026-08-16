package com.workflow.api.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
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
 */
@RestController
@RequestMapping("/api/v1/pages")
public class PageQueryController {

    private final PageDefinitionService pageDefService;
    private final BizDataService bizDataService;
    private final ObjectMapper objectMapper;

    public PageQueryController(PageDefinitionService pageDefService,
                               BizDataService bizDataService,
                               ObjectMapper objectMapper) {
        this.pageDefService = pageDefService;
        this.bizDataService = bizDataService;
        this.objectMapper = objectMapper;
    }

    /**
     * 视图数据分页查询。
     * 参数对齐 BizDataQueryRequest（filter 为 JSON 字符串），filter 仅保留
     * schema 声明的 searchFields key（白名单）；pageKey 未发布/不存在 → 404。
     */
    @GetMapping("/{pageKey}/data")
    public R<BizDataPageVO> query(@PathVariable String pageKey, BizDataQueryRequest req) {
        PageDefinition page = pageDefService.getPublishedByKey(pageKey);
        if (!"VIEW".equals(page.getType())) {
            throw new BusinessException(400, "页面 " + pageKey + " 不是视图类型，不支持数据查询");
        }
        if (page.getFormKey() == null || page.getFormKey().isBlank()) {
            throw new BusinessException(400, "视图 " + pageKey + " 未绑定业务表单");
        }

        // filter 白名单：仅保留 schema 声明的 searchFields key
        Set<String> whitelist = searchFieldKeys(page.getSchema());
        req.setFilter(whitelistFilter(req.getFilter(), whitelist));

        return R.ok(bizDataService.query(page.getFormKey(), req));
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