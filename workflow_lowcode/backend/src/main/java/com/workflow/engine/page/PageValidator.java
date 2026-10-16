package com.workflow.engine.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * 页面发布校验器（VIEW 视图编译已废弃，仅校验自定义页面 PAGE）。
 * PAGE 自定义页面：
 * - rule 可解析、dataSources 条目 id 唯一、refId 指向存在且 ENABLED 的全局数据源
 * - rule 中数据组件 dataSourceId 命中 dataSources[].id
 * - actions set-filter 字段命中目标数据源 searchFields 白名单
 */
@Component
public class PageValidator {

    private final FormDefinitionRepository formDefRepository;
    private final ObjectMapper objectMapper;
    private final TenantProvider tenantProvider;
    private final DataSourceDefinitionService dsService;

    /** 可声明数据源绑定的数据组件类型 */
    private static final Set<String> DATA_COMPONENT_TYPES = Set.of("page-table", "page-tree");

    public PageValidator(FormDefinitionRepository formDefRepository,
                         ObjectMapper objectMapper,
                         TenantProvider tenantProvider,
                         DataSourceDefinitionService dsService) {
        this.formDefRepository = formDefRepository;
        this.objectMapper = objectMapper;
        this.tenantProvider = tenantProvider;
        this.dsService = dsService;
    }

    /**
     * 校验页面可发布（VIEW 视图编译已废弃，统一走自定义页面 PAGE 校验）。
     *
     * @param page 待发布页面
     * @throws BusinessException 各类校验失败（错误码 400）
     */
    public void validateForPublish(PageDefinition page) {
        validateForPublishPage(page);
    }

    private void validateSchemaJson(String schema) {
        parseSchema(schema);
    }

    private JsonNode parseSchema(String schema) throws BusinessException {
        try {
            JsonNode root = objectMapper.readTree(schema == null || schema.isBlank() ? "{}" : schema);
            // 兼容纯数组形式：{rule:[...]} 与裸数组
            if (root.isArray()) {
                return objectMapper.createObjectNode().set("rule", root);
            }
            return root;
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "页面 schema 解析失败");
        }
    }

    /**
     * 自定义页面（PAGE）发布校验：
     * 1. rule 可被 FormRenderer 解析（JSON 合法 + rule 数组）
     * 2. dataSources 条目 id 页面内唯一、refId 非空且指向存在且 ENABLED 的全局数据源
     * 3. rule 中数据组件（el-table/table）dataSourceId 命中 dataSources[].id
     * 4. actions set-filter 字段命中目标数据源 searchFields 白名单
     */
    private void validateForPublishPage(PageDefinition page) {
        String tenantId = tenantProvider.getTenantId();
        JsonNode root = parseSchema(page.getSchema());
        if (!root.isObject() || !root.path("rule").isArray()) {
            throw new BusinessException(400, "自定义页面 schema 必须为 {rule, option, dataSources, actions}");
        }

        // 已启用全局数据源映射（refId → DataSourceDefinition）
        Map<String, DataSourceDefinition> enabledDsMap = new HashMap<>();
        for (DataSourceDefinition ds : dsService.getEnabled()) {
            enabledDsMap.put(ds.getId(), ds);
        }

        // 2. dataSources 校验
        Map<String, JsonNode> dsById = new HashMap<>();
        JsonNode dataSources = root.path("dataSources");
        if (dataSources.isArray()) {
            for (JsonNode entry : dataSources) {
                String id = entry.path("id").asText();
                if (id.isBlank()) {
                    throw new BusinessException(400, "自定义页面 dataSources 条目 id 不能为空");
                }
                if (dsById.containsKey(id)) {
                    throw new BusinessException(400, "自定义页面 dataSources id 重复: " + id);
                }
                String refId = entry.path("refId").asText();
                if (refId.isBlank()) {
                    throw new BusinessException(400, "自定义页面 dataSources[" + id + "] refId 不能为空");
                }
                DataSourceDefinition ds = enabledDsMap.get(refId);
                if (ds == null) {
                    throw new BusinessException(400, "自定义页面引用的数据源不存在或未启用: " + refId);
                }
                // FORM 数据源：绑定表单须已发布；searchFields/columns 引用列存在
                if ("FORM".equals(ds.getType())) {
                    Optional<FormDefinition> formOpt = formDefRepository
                            .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                                    tenantId, ds.getFormKey(), "PUBLISHED");
                    if (formOpt.isEmpty()) {
                        throw new BusinessException(400, "自定义页面引用的表单未发布: " + ds.getFormKey());
                    }
                    validatePageDsFields(entry, formOpt.get());
                }
                dsById.put(id, entry);
            }
        }

        // 3. rule 中数据组件 dataSourceId 命中
        JsonNode rule = root.path("rule");
        for (JsonNode node : rule) {
            String type = node.path("type").asText();
            if (!DATA_COMPONENT_TYPES.contains(type)) continue;
            String dsId = node.path("props").path("dataSourceId").asText();
            if (!dsId.isBlank() && !dsById.containsKey(dsId)) {
                throw new BusinessException(400, "数据组件 dataSourceId 未在 dataSources 声明: " + dsId);
            }
        }

        // 4. actions set-filter 字段白名单
        JsonNode actions = root.path("actions");
        if (actions.isArray()) {
            for (JsonNode action : actions) {
                JsonNode steps = action.path("steps");
                if (!steps.isArray()) continue;
                for (JsonNode step : steps) {
                    if (!"set-filter".equals(step.path("op").asText())) continue;
                    String target = step.path("target").asText();
                    String field = step.path("field").asText();
                    if (target.isBlank() || field.isBlank()) continue;
                    JsonNode dsEntry = dsById.get(target);
                    if (dsEntry == null) {
                        throw new BusinessException(400, "set-filter 目标数据源未声明: " + target);
                    }
                    JsonNode searchFields = dsEntry.path("searchFields");
                    if (searchFields.isArray() && searchFields.size() > 0) {
                        boolean declared = false;
                        for (JsonNode sf : searchFields) {
                            if (field.equals(sf.asText())) { declared = true; break; }
                        }
                        if (!declared) {
                            throw new BusinessException(400, "set-filter 字段未在数据源 searchFields 白名单: " + field);
                        }
                    }
                }
            }
        }
    }

    /** 校验 PAGE dataSources 条目的 searchFields/columns 引用列存在（FORM 绑定） */
    private void validatePageDsFields(JsonNode dsEntry, FormDefinition form) {
        List<ColumnConfig> columns = parseColumnConfig(form.getColumnConfig());
        Set<String> validKeys = new HashSet<>();
        for (ColumnConfig c : columns) {
            validKeys.add(c.getKey());
        }
        JsonNode searchFields = dsEntry.path("searchFields");
        if (searchFields.isArray()) {
            for (JsonNode sf : searchFields) {
                String key = sf.asText();
                if (!key.isBlank() && !validKeys.contains(key)) {
                    throw new BusinessException(400, "数据源 searchFields 引用列不存在: " + key);
                }
            }
        }
        JsonNode pageColumns = dsEntry.path("columns");
        if (pageColumns.isArray()) {
            for (JsonNode col : pageColumns) {
                String key = col.asText();
                if (!key.isBlank() && !validKeys.contains(key)) {
                    throw new BusinessException(400, "数据源 columns 引用列不存在: " + key);
                }
            }
        }
    }

    private List<ColumnConfig> parseColumnConfig(String columnConfig) throws BusinessException {
        if (columnConfig == null || columnConfig.isBlank()) {
            throw new BusinessException(400, "绑定表单未配置列映射（column_config）");
        }
        try {
            return objectMapper.readValue(columnConfig,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, ColumnConfig.class));
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "绑定表单列映射配置非法");
        }
    }
}