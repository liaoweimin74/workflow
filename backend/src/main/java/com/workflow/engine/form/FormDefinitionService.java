package com.workflow.engine.form;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.datasource.event.FormCreatedEvent;
import com.workflow.engine.datasource.event.FormDeletedEvent;
import com.workflow.engine.datasource.event.FormUpdatedEvent;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.common.exception.BusinessException;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * 表单定义服务。
 * 管理表单定义的 CRUD、版本管理和发布流程。
 *
 * 版本管理策略：
 * - create: 创建 version=1, status=DRAFT 的记录
 * - update: 原地更新（不创建新版本，不改变状态）
 * - publish: 草稿直接发布（同一记录改 status=PUBLISHED），旧 PUBLISHED 降为 ARCHIVED
 * - delete: 软删除，状态改为 ARCHIVED
 */
@Service
public class FormDefinitionService {

    private final FormDefinitionRepository formDefRepository;
    private final TenantProvider tenantProvider;
    private final DynamicTableManager tableManager;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;

    /** 不支持映射为业务表单列的组件（人员/部门选择、分割线、容器、历史数据表组件等） */
    private static final Set<String> UNSUPPORTED_COMPONENTS = Set.of(
            "userPicker", "deptPicker", "divider", "groupContainer", "dataTable");

    /** 子表组件：发布时创建独立子表物理表（wf_biz_<formKey>_<field>） */
    private static final Set<String> SUBTABLE_COMPONENTS = Set.of("group", "tableForm", "subForm");

    public FormDefinitionService(FormDefinitionRepository formDefRepository,
                                 TenantProvider tenantProvider,
                                 DynamicTableManager tableManager,
                                 ObjectMapper objectMapper,
                                 ApplicationEventPublisher eventPublisher) {
        this.formDefRepository = formDefRepository;
        this.tenantProvider = tenantProvider;
        this.tableManager = tableManager;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
    }

    /**
     * 创建表单定义（默认工作流表单）。
     *
     * @param name 表单名称
     * @param key  表单唯一标识（同租户内不可重复）
     * @return 创建的表单定义
     * @throws RuntimeException 如果 key 已存在
     */
    @Transactional
    public FormDefinition create(String name, String key) {
        return create(name, key, null);
    }

    /**
     * 创建表单定义。
     *
     * @param name 表单名称
     * @param key  表单唯一标识（同租户内不可重复）
     * @param type 表单类型（WORKFLOW/BUSINESS，null 或空白默认 WORKFLOW）
     * @return 创建的表单定义
     * @throws RuntimeException 如果 key 已存在
     */
    @Transactional
    public FormDefinition create(String name, String key, String type) {
        String tenantId = tenantProvider.getTenantId();

        if (formDefRepository.existsByTenantIdAndKey(tenantId, key)) {
            throw new RuntimeException("Form key already exists: " + key);
        }

        FormDefinition formDef = new FormDefinition();
        formDef.setId(UUID.randomUUID().toString().replace("-", ""));
        formDef.setTenantId(tenantId);
        formDef.setName(name);
        formDef.setKey(key);
        formDef.setType(type == null || type.isBlank() ? "WORKFLOW" : type);
        formDef.setSchema("[]");
        formDef.setVersion(1);
        formDef.setStatus("DRAFT");

        FormDefinition saved = formDefRepository.save(formDef);
        
        // 发布表单创建事件（含类型：BUSINESS → FORM 数据源；WORKFLOW → WORKFLOW 数据源）
        eventPublisher.publishEvent(new FormCreatedEvent(this, saved.getId(), saved.getName(), saved.getKey(),
                tenantId, saved.getType()));
        
        return saved;
    }

    /**
     * 获取表单定义详情。
     */
    public FormDefinition getById(String id) {
        String tenantId = tenantProvider.getTenantId();
        return formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));
    }

    /**
     * 按 key 获取表单定义（最新版本记录，用于业务数据管理页加载列映射与 schema）。
     */
    public FormDefinition getByKey(String key) {
        String tenantId = tenantProvider.getTenantId();
        return formDefRepository.findFirstByTenantIdAndKeyOrderByVersionDesc(tenantId, key)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + key));
    }

    /**
     * 分页查询表单定义列表（无类型过滤，兼容旧调用）。
     *
     * @param status 状态过滤（可选）
     * @param name   名称模糊搜索（可选）
     */
    public Page<FormDefinition> list(String status, String name, Pageable pageable) {
        return list(status, name, null, pageable);
    }

    /**
     * 分页查询表单定义列表。
     *
     * @param status 状态过滤（可选）
     * @param name   名称模糊搜索（可选）
     * @param type   类型过滤（可选：WORKFLOW/BUSINESS）
     */
    public Page<FormDefinition> list(String status, String name, String type, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        boolean hasType = type != null && !type.isBlank();
        boolean hasName = name != null && !name.isBlank();
        boolean hasStatus = status != null && !status.isBlank();

        if (hasType) {
            if (hasName) {
                return formDefRepository.findByTenantIdAndTypeAndNameContainingOrderByUpdatedAtDesc(tenantId, type, name, pageable);
            } else if (hasStatus) {
                return formDefRepository.findByTenantIdAndTypeAndStatusOrderByUpdatedAtDesc(tenantId, type, status, pageable);
            } else {
                return formDefRepository.findByTenantIdAndTypeOrderByUpdatedAtDesc(tenantId, type, pageable);
            }
        } else if (hasName) {
            return formDefRepository.findByTenantIdAndNameContainingOrderByUpdatedAtDesc(tenantId, name, pageable);
        } else if (hasStatus) {
            return formDefRepository.findByTenantIdAndStatusOrderByUpdatedAtDesc(tenantId, status, pageable);
        } else {
            return formDefRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId, pageable);
        }
    }

    /**
     * 更新表单定义（原地更新，不创建新版本）。
     * 直接在当前记录上更新 name、key、schema，无论 DRAFT 还是 PUBLISHED 状态。
     *
     * @param id     表单定义 ID
     * @param name   表单名称（null 表示不更新）
     * @param key    表单 key（null 表示不更新）
     * @param schema 新的 schema JSON（null 表示不更新）
     * @return 更新后的表单定义
     */
    @Transactional
    public FormDefinition update(String id, String name, String key, String schema) {
        return update(id, name, key, schema, null);
    }

    /**
     * 更新表单定义（原地更新，不创建新版本）。
     * 直接在当前记录上更新 name、key、schema、columnConfig，无论 DRAFT 还是 PUBLISHED 状态。
     *
     * @param id           表单定义 ID
     * @param name         表单名称（null 表示不更新）
     * @param key          表单 key（null 表示不更新）
     * @param schema       新的 schema JSON（null 表示不更新）
     * @param columnConfig 新的列映射 JSON（null 表示不更新）
     * @return 更新后的表单定义
     */
    @Transactional
    public FormDefinition update(String id, String name, String key, String schema, String columnConfig) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition current = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        if (name != null) {
            current.setName(name);
        }
        if (key != null) {
            current.setKey(key);
        }
        if (schema != null) {
            current.setSchema(schema);
        }
        if (columnConfig != null) {
            current.setColumnConfig(columnConfig);
        }
        
        FormDefinition saved = formDefRepository.save(current);
        
        // 发布表单更新事件（含类型）
        eventPublisher.publishEvent(new FormUpdatedEvent(this, saved.getId(), saved.getName(), saved.getKey(),
                tenantId, saved.getType()));
        
        return saved;
    }

    /**
     * 删除表单定义（软删除，状态改为 ARCHIVED）。
     */
    @Transactional
    public void delete(String id) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        if ("PUBLISHED".equals(formDef.getStatus())) {
            throw new BusinessException(400, "已发布的表单不能删除");
        }

        formDef.setStatus("ARCHIVED");
        formDefRepository.save(formDef);
        
        // 发布表单删除事件（含类型）
        eventPublisher.publishEvent(new FormDeletedEvent(this, formDef.getId(), formDef.getKey(), tenantId,
                formDef.getType()));
    }

    /**
     * 发布/重新发布表单定义（不创建新记录，原地改状态）。
     * - DRAFT → PUBLISHED：首次发布，旧 PUBLISHED（同 key 其他记录）降为 ARCHIVED。
     * - PUBLISHED → PUBLISHED：重新发布（已发布表单编辑后再发布），排除自身比较内容变化。
     * 发布前校验 schema 是否与上次发布（排除自身）相同，相同则拒绝。
     * type=BUSINESS 时，发布前校验 schema 不含子表/嵌套组件，并基于 column_config 触发受控 DDL 建表/变更。
     *
     * @param id 表单定义 ID
     * @return 发布后的表单定义（同一条记录，状态改为 PUBLISHED）
     * @throws BusinessException 如果 schema 与上一已发布版本相同；业务表单含不支持组件或 column_config 非法
     */
    @Transactional
    public FormDefinition publish(String id) {
        String tenantId = tenantProvider.getTenantId();
        // 悲观锁读取，串行化发布（防并发 DDL 竞态）
        FormDefinition draft = formDefRepository.findByIdForUpdate(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        boolean republish = "PUBLISHED".equals(draft.getStatus());
        if (!"DRAFT".equals(draft.getStatus()) && !republish) {
            throw new BusinessException(400, "仅草稿或已发布表单可发布，当前状态: " + draft.getStatus());
        }

        // 重新发布：排除当前记录自身（其已是 PUBLISHED），避免与自己的 schema 比较恒等
        Optional<FormDefinition> lastPublished = republish
                ? formDefRepository.findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
                        tenantId, draft.getKey(), "PUBLISHED", draft.getId())
                : formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                        tenantId, draft.getKey(), "PUBLISHED");

        if (lastPublished.isPresent() && Objects.equals(lastPublished.get().getSchema(), draft.getSchema())) {
            throw new BusinessException(400, "表单内容未变化，无需发布");
        }

        // 业务表单：校验 schema 并同步物理表结构（DDL 隐式提交，先于版本记录保存）
        if ("BUSINESS".equals(draft.getType())) {
            validateBusinessSchema(draft.getSchema());
            validatePickerReferences(draft.getSchema());
            List<ColumnConfig> columns = parseColumnConfig(draft.getColumnConfig());
            tableManager.ensureTable(draft.getKey(), columns);
            // 子表字段：创建/变更独立子表物理表 wf_biz_<formKey>_<field>
            for (ColumnConfig c : columns) {
                if (c.getSubColumns() != null && !c.getSubColumns().isEmpty()) {
                    tableManager.ensureSubTable(draft.getKey(), c.getKey(), c.getSubColumns());
                }
            }
        }

        // 旧 PUBLISHED（非当前记录）降为 ARCHIVED
        lastPublished.ifPresent(old -> {
            old.setStatus("ARCHIVED");
            formDefRepository.save(old);
        });

        // 原地改状态：草稿或已发布记录直接改为 PUBLISHED
        draft.setStatus("PUBLISHED");
        draft.setPublishedVersion(draft.getVersion());
        FormDefinition saved = formDefRepository.save(draft);

        // 发布表单创建事件（业务表单与工作流表单发布后均触发数据源同步）
        eventPublisher.publishEvent(new FormCreatedEvent(this, saved.getId(), saved.getName(), saved.getKey(),
                tenantId, saved.getType()));

        return saved;
    }

    /**
     * 校验业务表单 schema 不含不支持组件（人员/部门选择、分割线、容器等）。
     * 子表组件（group/tableForm/subForm）放行，由发布流程创建独立子表物理表。
     * schema 格式兼容：{rule: [...]} 与纯数组两种。
     */
    private void validateBusinessSchema(String schema) throws BusinessException {
        try {
            JsonNode root = objectMapper.readTree(schema == null ? "[]" : schema);
            JsonNode rule = root.isArray() ? root : root.path("rule");
            if (!rule.isArray()) {
                throw new BusinessException(400, "表单 schema 格式非法");
            }
            for (JsonNode field : rule) {
                String type = field.path("type").asText();
                if (UNSUPPORTED_COMPONENTS.contains(type)) {
                    throw new BusinessException(400, "业务表单暂不支持组件（" + type + "），请移除后发布");
                }
            }
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "表单 schema 解析失败");
        }
    }

    /**
     * 按 key 获取已发布业务表单的列映射。
     *
     * @param key 表单 key
     * @return 列映射列表
     * @throws BusinessException 表单不存在/未发布/非业务表单/column_config 非法
     */
    public List<ColumnConfig> getBusinessColumnsByKey(String key) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition published = formDefRepository
                .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, key, "PUBLISHED")
                .orElseThrow(() -> new BusinessException(404, "业务表单不存在或未发布: " + key));
        if (!"BUSINESS".equals(published.getType())) {
            throw new BusinessException(400, "表单 " + key + " 不是业务表单");
        }
        return parseColumnConfig(published.getColumnConfig());
    }

    /**
     * 校验业务表单 schema 中的 data-picker 引用配置：
     * 目标表单存在且已发布、引用列（displayField/columns/dependOn.sourceColumn）仍存在于目标 column_config。
     */
    private void validatePickerReferences(String schema) throws BusinessException {
        try {
            JsonNode root = objectMapper.readTree(schema == null ? "[]" : schema);
            JsonNode rule = root.isArray() ? root : root.path("rule");
            if (!rule.isArray()) {
                return;
            }
            for (JsonNode field : rule) {
                if (!"dataPicker".equals(field.path("type").asText())) {
                    continue;
                }
                String fieldKey = field.path("field").asText();
                JsonNode props = field.path("props");
                String sourceFormKey = props.path("sourceFormKey").asText();
                if (sourceFormKey.isBlank()) {
                    throw new BusinessException(400, "data-picker 字段 " + fieldKey + " 未配置目标表单");
                }
                List<ColumnConfig> targetColumns;
                try {
                    targetColumns = getBusinessColumnsByKey(sourceFormKey);
                } catch (BusinessException e) {
                    throw new BusinessException(400, "data-picker 目标表单不存在或未发布: " + sourceFormKey);
                }
                Set<String> targetKeys = targetColumns.stream()
                        .map(ColumnConfig::getKey)
                        .collect(java.util.stream.Collectors.toSet());

                String displayField = props.path("displayField").asText();
                if (displayField.isBlank()) {
                    throw new BusinessException(400, "data-picker 字段 " + fieldKey + " 未配置显示字段");
                }
                if (!targetKeys.contains(displayField)) {
                    throw new BusinessException(400, "data-picker 引用列已不存在: " + displayField);
                }
                for (JsonNode col : props.path("columns")) {
                    String c = col.asText();
                    if (!c.isBlank() && !targetKeys.contains(c)) {
                        throw new BusinessException(400, "data-picker 引用列已不存在: " + c);
                    }
                }
                String sourceColumn = props.path("dependOn").path("sourceColumn").asText();
                if (!sourceColumn.isBlank() && !targetKeys.contains(sourceColumn)) {
                    throw new BusinessException(400, "data-picker 级联引用列已不存在: " + sourceColumn);
                }
                Set<String> hiddenKeys = targetColumns.stream()
                        .filter(ColumnConfig::isHidden)
                        .map(ColumnConfig::getKey)
                        .collect(java.util.stream.Collectors.toSet());
                for (JsonNode filter : props.path("filters")) {
                    String fCol = filter.path("column").asText();
                    if (fCol.isBlank()) {
                        continue;
                    }
                    if (!targetKeys.contains(fCol)) {
                        throw new BusinessException(400, "data-picker 过滤条件引用列已不存在: " + fCol);
                    }
                    if (hiddenKeys.contains(fCol)) {
                        throw new BusinessException(400, "data-picker 过滤条件不能引用隐藏列: " + fCol);
                    }
                }
            }
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "表单 schema 解析失败");
        }
    }

    /**
     * 解析 column_config JSON 为列映射列表。
     */
    private List<ColumnConfig> parseColumnConfig(String columnConfig) throws BusinessException {
        if (columnConfig == null || columnConfig.isBlank()) {
            throw new BusinessException(400, "业务表单发布前必须配置列映射（column_config）");
        }
        try {
            List<ColumnConfig> columns = objectMapper.readValue(columnConfig,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, ColumnConfig.class));
            if (columns == null || columns.isEmpty()) {
                throw new BusinessException(400, "业务表单列映射不能为空");
            }
            // 触发 DdlBuilder 校验（列名/类型/长度），提前暴露非法配置
            for (ColumnConfig c : columns) {
                validateColumnConfig(c);
                if ("SUB_TABLE".equals(c.getStorageMode())) {
                    throw new BusinessException(400, "子表存储模式暂未实现: " + c.getKey());
                }
            }
            return new ArrayList<>(columns);
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "业务表单列映射配置非法: " + e.getOriginalMessage());
        }
    }

    private void validateColumnConfig(ColumnConfig c) {
        if (c.getKey() == null || !c.getKey().matches("^[a-zA-Z][a-zA-Z0-9_]{0,63}$")) {
            throw new BusinessException(400, "非法列名: " + c.getKey());
        }
        // 子表字段：自身无列类型，递归校验子列
        if (c.getSubColumns() != null && !c.getSubColumns().isEmpty()) {
            for (ColumnConfig sub : c.getSubColumns()) {
                validateColumnConfig(sub);
            }
            return;
        }
        Set<String> reserved = Set.of("id", "tenant_id", "version", "created_by", "created_at", "updated_at");
        if (reserved.contains(c.getKey())) {
            throw new BusinessException(400, "列名 " + c.getKey() + " 为系统保留列");
        }
        if (c.getColumnType() == null || !Set.of("VARCHAR", "TEXT", "LONGTEXT", "INT", "DECIMAL", "DATE", "DATETIME", "TINYINT", "JSON")
                .contains(c.getColumnType())) {
            throw new BusinessException(400, "非法列类型: " + c.getColumnType());
        }
    }

    /**
     * 获取表单定义的所有版本列表。
     */
    public List<FormDefinition> getVersions(String id) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        return formDefRepository.findByTenantIdAndKeyOrderByVersionDesc(tenantId, formDef.getKey());
    }

    /**
     * 获取特定版本的表单定义。
     */
    public FormDefinition getByVersion(String id, Integer version) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        return formDefRepository.findByTenantIdAndKeyAndVersion(tenantId, formDef.getKey(), version)
                .orElseThrow(() -> new RuntimeException("Form version not found: " + formDef.getKey() + " v" + version));
    }

    /**
     * 获取已发布版本的表单定义。
     * 如果有多个版本，返回 published_version 对应的版本。
     */
    public FormDefinition getPublishedVersion(String id) {
        String tenantId = tenantProvider.getTenantId();
        FormDefinition formDef = formDefRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new RuntimeException("Form definition not found: " + id));

        if (formDef.getPublishedVersion() == null) {
            throw new RuntimeException("Form definition has no published version: " + id);
        }

        return formDefRepository.findByTenantIdAndKeyAndVersion(tenantId, formDef.getKey(), formDef.getPublishedVersion())
                .orElseThrow(() -> new RuntimeException("Published version not found: " + formDef.getKey() + " v" + formDef.getPublishedVersion()));
    }
}
