package com.workflow.engine.page;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * 页面发布校验器。
 * 校验 VIEW 页面发布前的绑定正确性：
 * - 绑定表单存在、已发布且为 BUSINESS 类型
 * - searchFields/columns 引用的列存在于绑定表单 column_config
 * - searchFields/columns 不得引用隐藏列；searchFields 不得引用 JSON/TEXT 列
 */
@Component
public class PageValidator {

    private final FormDefinitionRepository formDefRepository;
    private final ObjectMapper objectMapper;
    private final TenantProvider tenantProvider;

    /** 不可作为查询条件的列类型（大字段） */
    private static final Set<String> NON_FILTERABLE_TYPES = Set.of("JSON", "TEXT", "LONGTEXT");

    public PageValidator(FormDefinitionRepository formDefRepository,
                         ObjectMapper objectMapper,
                         TenantProvider tenantProvider) {
        this.formDefRepository = formDefRepository;
        this.objectMapper = objectMapper;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 校验页面可发布。
     *
     * @param page 待发布页面（type=VIEW）
     * @throws BusinessException 各类校验失败（错误码 400）
     */
    public void validateForPublish(PageDefinition page) {
        if ("PAGE".equals(page.getType())) {
            // 阶段二预留：仅做基础校验（绑定/JSON 合法性），联动动作总线校验阶段二实现
            validateSchemaJson(page.getSchema());
            return;
        }

        String tenantId = tenantProvider.getTenantId();

        // 1. 绑定表单校验：存在、已发布、BUSINESS 类型
        if (page.getFormKey() == null || page.getFormKey().isBlank()) {
            throw new BusinessException(400, "视图必须绑定业务表单");
        }
        Optional<FormDefinition> boundFormOpt = formDefRepository
                .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, page.getFormKey(), "PUBLISHED");
        if (boundFormOpt.isEmpty()) {
            throw new BusinessException(400, "绑定表单不存在或未发布: " + page.getFormKey());
        }
        FormDefinition boundForm = boundFormOpt.get();
        if (!"BUSINESS".equals(boundForm.getType())) {
            throw new BusinessException(400, "绑定表单 " + page.getFormKey() + " 不是业务表单");
        }

        // 2. 解析 column_config，构建合法列 / 隐藏列 / 不可筛选列集合
        List<ColumnConfig> columns = parseColumnConfig(boundForm.getColumnConfig());
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
     * 解析绑定表单的列映射（供发布时编译视图使用）。
     * 调用前提：validateForPublish 已通过（绑定表单存在且已发布）。
     *
     * @param page 待发布页面（type=VIEW，formKey 已绑定）
     * @return 绑定表单的 column_config 列映射列表
     * @throws BusinessException 绑定表单不存在/未发布或列映射非法
     */
    public List<ColumnConfig> resolveBindColumns(PageDefinition page) {
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