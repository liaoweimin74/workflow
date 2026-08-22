package com.workflow.engine.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.DataSourceMetadata;
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
 * 页面发布校验器。
 * 校验 VIEW 页面发布前的绑定正确性：
 * - 绑定表单存在、已发布且为 BUSINESS 类型
 * - searchFields/columns 引用的列存在于绑定表单 column_config
 * - searchFields/columns 不得引用隐藏列；searchFields 不得引用 JSON/TEXT 列
 * PAGE 自定义页面（阶段二）：
 * - dataSources 条目 id 唯一、refId 指向存在且 ENABLED 的全局数据源
 * - rule 中数据组件 dataSourceId 命中 dataSources[].id
 * - actions set-filter 字段命中目标数据源 searchFields 白名单
 */
@Component
public class PageValidator {

    private final FormDefinitionRepository formDefRepository;
    private final ObjectMapper objectMapper;
    private final TenantProvider tenantProvider;
    private final DataSourceDefinitionService dsService;

    /** 不可作为查询条件的列类型（大字段） */
    private static final Set<String> NON_FILTERABLE_TYPES = Set.of("JSON", "TEXT", "LONGTEXT");

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
     * 校验页面可发布。
     *
     * <p>VIEW 绑定协议：dataSourceId（新协议，经 SPI metadata 取列）优先；
     * dataSourceId 为空且 formKey 非空（迁移被跳过的页）走遗留校验逻辑兜底。
     *
     * @param page 待发布页面（type=VIEW 或 PAGE）
     * @throws BusinessException 各类校验失败（错误码 400）
     */
    public void validateForPublish(PageDefinition page) {
        if ("PAGE".equals(page.getType())) {
            validateForPublishPage(page);
            return;
        }

        String tenantId = tenantProvider.getTenantId();
        String dataSourceId = page.getDataSourceId();
        String formKey = page.getFormKey();
        boolean hasDataSource = dataSourceId != null && !dataSourceId.isBlank();
        boolean hasFormKey = formKey != null && !formKey.isBlank();

        // 1. 绑定来源校验：数据源与遗留 formKey 至少其一
        if (!hasDataSource && !hasFormKey) {
            throw new BusinessException(400, "请选择数据源");
        }

        // 2. 取列并构建合法列 / 隐藏列 / 不可筛选列集合
        List<ColumnConfig> columns;
        if (hasDataSource) {
            // 新协议：数据源 metadata 取列（定义不存在/未启用 → dsService.metadata 抛 400/404）
            DataSourceMetadata meta = dsService.metadata(dataSourceId);
            columns = meta.getColumns() == null ? List.of() : meta.getColumns();
        } else {
            // 兼容兜底：formKey 遗留协议（绑定表单存在、已发布、BUSINESS 类型）
            Optional<FormDefinition> boundFormOpt = formDefRepository
                    .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, formKey, "PUBLISHED");
            if (boundFormOpt.isEmpty()) {
                throw new BusinessException(400, "绑定表单不存在或未发布: " + formKey);
            }
            FormDefinition boundForm = boundFormOpt.get();
            if (!"BUSINESS".equals(boundForm.getType())) {
                throw new BusinessException(400, "绑定表单 " + formKey + " 不是业务表单");
            }
            columns = parseColumnConfig(boundForm.getColumnConfig());
        }

        Set<String> validKeys = new HashSet<>();
        Set<String> hiddenKeys = new HashSet<>();
        Set<String> nonFilterableKeys = new HashSet<>();
        for (ColumnConfig c : columns) {
            validKeys.add(c.getKey());
            if (c.isHidden()) {
                hiddenKeys.add(c.getKey());
            }
            if (NON_FILTERABLE_TYPES.contains(c.getColumnType())) {
                nonFilterableKeys.add(c.getKey());
            }
        }

        // 3. 解析页面 schema
        JsonNode root = parseSchema(page.getSchema());
        JsonNode searchFields = root.path("searchFields");
        JsonNode pageColumns = root.path("columns");

        // 4. searchFields：引用列必须存在、非隐藏、非 JSON/TEXT
        if (searchFields.isArray()) {
            for (JsonNode field : searchFields) {
                String key = field.path("key").asText();
                if (!validKeys.contains(key)) {
                    throw new BusinessException(400, "查询字段引用列不存在: " + key);
                }
                if (hiddenKeys.contains(key)) {
                    throw new BusinessException(400, "查询字段不能引用隐藏列: " + key);
                }
                if (nonFilterableKeys.contains(key)) {
                    throw new BusinessException(400, "查询字段不能引用大字段列（JSON/TEXT）: " + key);
                }
            }
        }

        // 5. columns：引用列必须存在、非隐藏
        if (pageColumns.isArray()) {
            for (JsonNode column : pageColumns) {
                String key = column.path("key").asText();
                if (!validKeys.contains(key)) {
                    throw new BusinessException(400, "展示列引用列不存在: " + key);
                }
                if (hiddenKeys.contains(key)) {
                    throw new BusinessException(400, "展示列不能引用隐藏列: " + key);
                }
            }
        }
    }

    private void validateSchemaJson(String schema) {
        parseSchema(schema);
    }

    /**
     * 解析发布时编译视图所需的列（供 ViewCompiler 使用）。
     * 调用前提：validateForPublish 已通过。
     * dataSourceId 非空 → 数据源 metadata 列；否则 → 遗留 formKey 表单 column_config。
     *
     * @param page 待发布页面（type=VIEW）
     * @return 列定义列表
     * @throws BusinessException 数据源不可用或绑定表单不存在/未发布
     */
    public List<ColumnConfig> resolveBindColumns(PageDefinition page) {
        String dataSourceId = page.getDataSourceId();
        if (dataSourceId != null && !dataSourceId.isBlank()) {
            DataSourceMetadata meta = dsService.metadata(dataSourceId);
            return meta.getColumns() == null ? List.of() : meta.getColumns();
        }
        String tenantId = tenantProvider.getTenantId();
        if (page.getFormKey() == null || page.getFormKey().isBlank()) {
            throw new BusinessException(400, "视图必须绑定业务表单");
        }
        Optional<FormDefinition> boundFormOpt = formDefRepository
                .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, page.getFormKey(), "PUBLISHED");
        if (boundFormOpt.isEmpty()) {
            throw new BusinessException(400, "绑定表单不存在或未发布: " + page.getFormKey());
        }
        return parseColumnConfig(boundFormOpt.get().getColumnConfig());
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