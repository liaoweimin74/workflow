package com.workflow.engine.datasource;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.bizdata.JoinSqlGenerator;
import com.workflow.engine.form.bizdata.JoinTargetCatalog;
import com.workflow.engine.form.bizdata.SqlTemplateEngine;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.entity.FormDefinition;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * 全局数据源定义服务。
 * 状态机：DRAFT → ENABLED ⇄ DISABLED；任意状态可删除（被页面引用时拒绝）。
 * 不执行 DDL（构造不含 DynamicTableManager/JdbcTemplate，结构性排除动态建表）。
 */
@Service
public class DataSourceDefinitionService {

    private static final String STATUS_DRAFT = "DRAFT";
    private static final String STATUS_ENABLED = "ENABLED";
    private static final String STATUS_DISABLED = "DISABLED";
    private static final String TYPE_FORM = "FORM";
    private static final String TYPE_SYSTEM = "SYSTEM";
    private static final String TYPE_API = "API";
    private static final String TYPE_WORKFLOW = "WORKFLOW";
    private static final String TYPE_SQL = "SQL";
    private static final Set<String> SUPPORTED_TYPES = Set.of(TYPE_FORM, TYPE_SYSTEM, TYPE_API, TYPE_WORKFLOW, TYPE_SQL);

    /** SYSTEM 数据源 sourceKey 枚举（internal:// allowlist；唯一事实源见 BuiltInSystemSources，8 个内建数据源） */
    private static final Set<String> SYSTEM_SOURCE_KEYS = BuiltInSystemSources.SOURCE_KEYS;

    /** FORM 目标 key 合法格式（对齐 NodeJS 保存校验 /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/） */
    private static final Pattern FORM_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    /** joins[] alias 合法格式（传入才校验；缺省由运行时自动分配） */
    private static final Pattern JOIN_ALIAS_PATTERN = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    /** joins[] 主表关联字段合法格式（对齐 Node 新版 JOIN_FIELD_PATTERN；首字符允许下划线，上限 64 字符） */
    private static final Pattern JOIN_FIELD_PATTERN = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]{0,63}$");

    /**
     * FORM 查询配置段字段清单（对齐 Node data-source-write.service）。
     * 双段并存语义：queryMode 标注当前生效段（单表查询=不写 queryMode），
     * joins/query/columns/params 为草稿段——草稿段随 params 落库供下次迭代，
     * 运行时 FormQueryConfig.parse 只读 queryMode 对应活跃段，草稿段不参与执行。
     * create 草稿判定（hasFormQueryDraft）与端点合并（mergeQueryConfig）共用此清单防漂移。
     */
    private static final List<String> FORM_QUERY_FIELDS = List.of("queryMode", "joins", "query", "columns", "params");

    private final DataSourceDefinitionRepository dsRepository;
    private final FormDefinitionRepository formDefRepository;
    private final PageDefinitionRepository pageRepository;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper;
    private final List<DataSourceAdapter> adapters;

    /**
     * @param adapters Spring 自动注入所有 DataSourceAdapter bean（无则空列表）
     */
    public DataSourceDefinitionService(DataSourceDefinitionRepository dsRepository,
                                       FormDefinitionRepository formDefRepository,
                                       PageDefinitionRepository pageRepository,
                                       TenantProvider tenantProvider,
                                       ObjectMapper objectMapper,
                                       List<DataSourceAdapter> adapters) {
        this.dsRepository = dsRepository;
        this.formDefRepository = formDefRepository;
        this.pageRepository = pageRepository;
        this.tenantProvider = tenantProvider;
        this.objectMapper = objectMapper;
        this.adapters = adapters == null ? List.of() : adapters;
    }

    /**
     * 创建数据源（默认 DRAFT）。
     * 校验：type 必填且合法；同租户 name 唯一；按类型必填项（FORM→formKey + 表单存在；
     * SYSTEM/API→sourceKey；API→params 须为合法 JSON）。
     * 
     * 注意：此方法仅供系统内部调用，用户不能直接创建数据源。
     */
    @Transactional
    public DataSourceDefinition create(String name, String type, String formKey, String sourceKey, String params) {
        String tenantId = tenantProvider.getTenantId();

        if (type == null || type.isBlank()) {
            throw new BusinessException(400, "数据源类型 type 必填");
        }
        if (!SUPPORTED_TYPES.contains(type)) {
            throw new BusinessException(400, "不支持的数据源类型: " + type);
        }
        if (name == null || name.isBlank()) {
            throw new BusinessException(400, "数据源名称不能为空");
        }
        if (dsRepository.existsByTenantIdAndName(tenantId, name)) {
            throw new BusinessException(400, "数据源名称已存在: " + name);
        }
        // FORM/WORKFLOW：sourceKey 恒等于 formKey（formKey 权威）；其余类型以入参 sourceKey 为准
        boolean formBound = TYPE_FORM.equals(type) || TYPE_WORKFLOW.equals(type);
        String effSourceKey = formBound ? formKey : sourceKey;
        validateRequiredFields(type, formKey, effSourceKey, params);
        if (formBound && !formDefRepository.existsByTenantIdAndKey(tenantId, formKey)) {
            throw new BusinessException(400, "绑定的表单不存在: " + formKey);
        }
        if (effSourceKey == null || effSourceKey.isBlank()) {
            throw new BusinessException(400, "数据源必须填写 sourceKey");
        }
        if (dsRepository.existsByTenantIdAndSourceKey(tenantId, effSourceKey)) {
            throw new BusinessException(400, "数据源标识 sourceKey 已存在: " + effSourceKey);
        }

        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(UUID.randomUUID().toString().replace("-", ""));
        ds.setTenantId(tenantId);
        ds.setName(name);
        ds.setType(type);
        ds.setFormKey(formKey);
        ds.setSourceKey(effSourceKey);
        if (TYPE_FORM.equals(type) || TYPE_SYSTEM.equals(type)) {
            if (TYPE_FORM.equals(type) && hasFormQueryDraft(params)) {
                // FORM 携带 query 配置段（queryMode 或任一草稿段）：端点段系统权威重建，
                // 草稿段原样保留入库（支持迭代修改）；queryMode 缺省（单表查询+草稿）时
                // validateFormQueryConfig 对活跃段早退不校验（对齐 Node create 分支）
                validateFormQueryConfig(params, formKey);
                ds.setParams(mergeQueryConfig(generateParams(type, formKey, sourceKey), params));
            } else {
                ds.setParams(generateParams(type, formKey, sourceKey));
            }
        } else {
            ds.setParams(params);
        }
        // API/SQL 为手动配置的数据源：创建即发布（ENABLED）；其余类型仍 DRAFT（防御：手动创建仅 API/SQL）
        boolean manualPublish = TYPE_API.equals(type) || TYPE_SQL.equals(type);
        ds.setStatus(manualPublish ? STATUS_ENABLED : STATUS_DRAFT);
        return dsRepository.save(ds);
    }

    /**
     * 原地更新数据源（name/type/formKey/sourceKey/params；null 表示不更新）。
     * 若当前 ENABLED 且 type/formKey 变更，重新校验（FORM 须仍指向已发布表单）。
     * 
     * 注意：此方法仅供系统内部调用，用户不能直接编辑数据源。
     */
    @Transactional
    public DataSourceDefinition update(String id, String name, String type, String formKey,
                                       String sourceKey, String params) {
        String tenantId = tenantProvider.getTenantId();
        DataSourceDefinition ds = getById(id);
        // 内建保护：tenant_id='system' 的预置行不允许修改（对齐 NodeJS requireNotBuiltIn）
        requireNotBuiltIn(ds, "修改");

        String newType = type == null || type.isBlank() ? ds.getType() : type;
        if (type != null && !type.isBlank() && !SUPPORTED_TYPES.contains(newType)) {
            throw new BusinessException(400, "不支持的数据源类型: " + newType);
        }
        if (name != null && !name.isBlank() && !name.equals(ds.getName())
                && dsRepository.existsByTenantIdAndName(tenantId, name)) {
            throw new BusinessException(400, "数据源名称已存在: " + name);
        }

        String newFormKey = formKey == null ? ds.getFormKey() : formKey;
        String newSourceKey = sourceKey == null ? ds.getSourceKey() : sourceKey;
        String newParams = params == null ? ds.getParams() : params;
        // FORM/WORKFLOW：sourceKey 恒等于 formKey（formKey 权威），忽略入参 sourceKey 差异
        boolean formBound = TYPE_FORM.equals(newType) || TYPE_WORKFLOW.equals(newType);
        String effNewSourceKey = formBound ? newFormKey : newSourceKey;
        // FORM + 入参 params 非空：与 generateParams 的端点段合并（对齐 Node update 分支）——
        // 端点段系统权威重建，queryMode/joins/query/columns/params 草稿段原样保留入库
        if (TYPE_FORM.equals(newType) && params != null && !params.isBlank()) {
            newParams = mergeQueryConfig(generateParams(newType, newFormKey, effNewSourceKey), newParams);
        }
        validateRequiredFields(newType, newFormKey, effNewSourceKey, newParams);
        if (formBound && !formDefRepository.existsByTenantIdAndKey(tenantId, newFormKey)) {
            throw new BusinessException(400, "绑定的表单不存在: " + newFormKey);
        }
        if (TYPE_FORM.equals(newType)) {
            // FORM 查询配置段（queryMode/joins/query/columns/params）保存校验（主表 key = newFormKey，对齐 Node update 分支）
            validateFormQueryConfig(newParams, newFormKey);
        }
        // sourceKey 变更（不等于当前值）时校验租户内唯一；保持不变则跳过（自身不算冲突）
        if (!java.util.Objects.equals(effNewSourceKey, ds.getSourceKey())
                && dsRepository.existsByTenantIdAndSourceKey(tenantId, effNewSourceKey)) {
            throw new BusinessException(400, "数据源标识 sourceKey 已存在: " + effNewSourceKey);
        }

        // 已启用数据源若变更类型/绑定对象，须重新校验发布状态
        boolean bindChanged = !TYPE_FORM.equals(ds.getType()) || (formKey != null && !formKey.equals(ds.getFormKey()));
        if (STATUS_ENABLED.equals(ds.getStatus()) && bindChanged) {
            if (TYPE_FORM.equals(newType)) {
                requirePublishedForm(tenantId, newFormKey);
            } else if (TYPE_WORKFLOW.equals(newType)) {
                requireWorkflowForm(tenantId, newFormKey);
            }
        }

        ds.setName(name == null ? ds.getName() : name);
        ds.setType(newType);
        ds.setFormKey(newFormKey);
        ds.setSourceKey(effNewSourceKey);
        ds.setParams(newParams);
        return dsRepository.save(ds);
    }

    /**
     * 启用数据源：校验按类型必填项齐全；FORM 类型须绑定已发布表单。成功置 ENABLED。
     * 
     * 注意：此方法仅供系统内部调用，用户不能直接启用数据源。
     */
    @Transactional
    public DataSourceDefinition enable(String id) {
        String tenantId = tenantProvider.getTenantId();
        DataSourceDefinition ds = getById(id);
        validateRequiredFields(ds.getType(), ds.getFormKey(), ds.getSourceKey(), ds.getParams());
        if (TYPE_FORM.equals(ds.getType())) {
            requirePublishedForm(tenantId, ds.getFormKey());
            // 主表 key = 已落数据源的 formKey（对齐 Node enable 分支 ds.form_key）
            validateFormQueryConfig(ds.getParams(), ds.getFormKey());
        } else if (TYPE_WORKFLOW.equals(ds.getType())) {
            requireWorkflowForm(tenantId, ds.getFormKey());
        }
        ds.setStatus(STATUS_ENABLED);
        if ((TYPE_FORM.equals(ds.getType()) || TYPE_SYSTEM.equals(ds.getType())) && ds.getParams() == null) {
            ds.setParams(generateParams(ds.getType(), ds.getFormKey(), ds.getSourceKey()));
        }
        return dsRepository.save(ds);
    }

    /**
     * 禁用数据源（不校验引用；不影响已发布页面运行）。
     * 
     * 注意：此方法仅供系统内部调用，用户不能直接禁用数据源。
     */
    @Transactional
    public DataSourceDefinition disable(String id) {
        DataSourceDefinition ds = getById(id);
        // 内建保护：禁用会让设计器/页面取数失败，直接 400（对齐 NodeJS requireNotBuiltIn）
        requireNotBuiltIn(ds, "禁用");
        ds.setStatus(STATUS_DISABLED);
        return dsRepository.save(ds);
    }

    /**
     * 删除数据源：任意状态可删除（ENABLED/DISABLED 均可），但被页面引用时拒绝（400）。
     * 引用统计覆盖两种绑定方式：
     * 1) PageDefinition.dataSourceId 列（VIEW 新协议，迁移器回填）；
     * 2) PAGE 类型页面 schema.dataSources[].refId（设计器 dataSources 声明）。
     * 两者取并集，任一命中即拒绝删除。
     * 
     * 注意：此方法仅供系统内部调用，用户不能直接删除数据源。
     */
    @Transactional
    public void delete(String id) {
        DataSourceDefinition ds = getById(id);
        // 内建保护：先于引用统计（对齐 NodeJS remove：requireNotBuiltIn → countRefs → delete）
        requireNotBuiltIn(ds, "删除");
        String tenantId = ds.getTenantId();
        long refCount = countRefs(tenantId, id);
        if (refCount > 0) {
            throw new BusinessException(400, "数据源已被 " + refCount + " 个页面引用，无法删除");
        }
        dsRepository.delete(ds);
    }

    /**
     * 统计当前租户内引用指定数据源的页面数（dataSourceId 列 + PAGE schema dataSources[].refId 并集）。
     */
    private long countRefs(String tenantId, String dataSourceId) {
        long columnRefs = pageRepository.countByTenantIdAndDataSourceId(tenantId, dataSourceId);
        if (columnRefs > 0) {
            return columnRefs;
        }
        // PAGE 类型页面引用声明在 schema.dataSources[].refId（dataSourceId 列为空），需扫描；
        // 页面软删除（ARCHIVED）后不再使用，其 schema 引用不阻塞删除
        long schemaRefs = 0;
        Page<PageDefinition> pages = pageRepository
                .findByTenantIdAndTypeOrderByUpdatedAtDesc(tenantId, "PAGE", PageRequest.of(0, Integer.MAX_VALUE));
        for (PageDefinition page : pages.getContent()) {
            if ("ARCHIVED".equals(page.getStatus())) {
                continue;
            }
            if (schemaRefsDataSource(page.getSchema(), dataSourceId)) {
                schemaRefs++;
            }
        }
        return schemaRefs;
    }

    /**
     * 判断页面 schema 的 dataSources[].refId 是否指向指定数据源。
     */
    private boolean schemaRefsDataSource(String schema, String dataSourceId) {
        if (schema == null || schema.isBlank()) {
            return false;
        }
        try {
            JsonNode root = objectMapper.readTree(schema);
            JsonNode dataSources = root.path("dataSources");
            if (!dataSources.isArray()) {
                return false;
            }
            for (JsonNode ds : dataSources) {
                String refId = ds.path("refId").asText(null);
                if (dataSourceId.equals(refId)) {
                    return true;
                }
            }
        } catch (JsonProcessingException e) {
            return false;
        }
        return false;
    }

    /**
     * 按 id 获取数据源（租户隔离；SYSTEM 类型跨租户可见；不存在 → 404）。
     */
    public DataSourceDefinition getById(String id) {
        String tenantId = tenantProvider.getTenantId();
        return dsRepository.findByIdAccessible(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "数据源不存在: " + id));
    }

    /**
     * 分页查询数据源列表（type/status 可选过滤，按更新时间倒序）。
     * SYSTEM 类型（系统结构）对所有租户可见（跨租户查询）。
     */
    public Page<DataSourceDefinition> list(String type, String status, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        boolean hasType = type != null && !type.isBlank();
        boolean hasStatus = status != null && !status.isBlank();
        if (hasType && hasStatus) {
            return dsRepository.findByAccessibleTenantAndTypeAndStatusOrderByUpdatedAtDesc(tenantId, type, status, pageable);
        }
        if (hasType) {
            return dsRepository.findByAccessibleTenantAndTypeOrderByUpdatedAtDesc(tenantId, type, pageable);
        }
        if (hasStatus) {
            return dsRepository.findByAccessibleTenantAndStatusOrderByUpdatedAtDesc(tenantId, status, pageable);
        }
        return dsRepository.findByAccessibleTenantOrderByUpdatedAtDesc(tenantId, pageable);
    }

    /**
     * 仅已启用数据源（页面设计器下拉用）。
     * SYSTEM 类型（系统结构）对所有租户可见。
     */
    public List<DataSourceDefinition> getEnabled() {
        String tenantId = tenantProvider.getTenantId();
        return dsRepository.findByStatusAndAccessibleTenant(STATUS_ENABLED, tenantId);
    }

    /**
     * 数据源查询分发：数据源须 ENABLED；按 type 找 supports 的适配器；
     * 无适配器 → 400"数据源类型未启用"。
     */
    public BizDataPageVO queryData(String id, BizDataQueryRequest req) {
        if (req == null) {
            req = new BizDataQueryRequest();
        }
        return adapterOf(id).query(getById(id), req);
    }

    /**
     * 数据源元数据分发：数据源须 ENABLED。
     */
    public DataSourceMetadata metadata(String id) {
        return adapterOf(id).metadata(getById(id));
    }

    /**
     * 数据源单条查询分发。
     */
    public BizDataVO getData(String id, String rowId) {
        return adapterOf(id).get(getById(id), rowId);
    }

    /**
     * 数据源新增分发（只读数据源 → 适配器 default 抛不支持）。
     */
    public String createData(String id, Map<String, Object> data) {
        return adapterOf(id).create(getById(id), data);
    }

    /**
     * 数据源修改分发。
     */
    public void updateData(String id, String rowId, Map<String, Object> data, Integer version) {
        adapterOf(id).update(getById(id), rowId, data, version);
    }

    /**
     * 数据源删除分发。
     */
    public void deleteData(String id, String rowId) {
        adapterOf(id).delete(getById(id), rowId);
    }

    /** 按数据源类型找适配器（数据源须 ENABLED） */
    private DataSourceAdapter adapterOf(String id) {
        DataSourceDefinition ds = getById(id);
        if (!STATUS_ENABLED.equals(ds.getStatus())) {
            throw new BusinessException(400, "数据源未启用，无法访问: " + ds.getName());
        }
        for (DataSourceAdapter adapter : adapters) {
            if (adapter.supports(ds.getType())) {
                return adapter;
            }
        }
        throw new BusinessException(400, "数据源类型未启用: " + ds.getType());
    }

    // ==================== 参数自动生成 ====================

    /**
     * 为 FORM/SYSTEM 数据源自动生成 params JSON（只读配置，UI 不可编辑）。
     * - FORM：list/get/create/update/delete → /api/v1/biz-data/{formKey}[/{id}]
     * - SYSTEM：list → /api/v1/internal/system/{internalKey}，internalKey 由 sourceKey 映射
     */
    private String generateParams(String type, String formKey, String sourceKey) {
        ObjectNode params = objectMapper.getNodeFactory().objectNode();
        if (TYPE_FORM.equals(type)) {
            String base = "/api/v1/biz-data/" + formKey;
            JsonNode list = params.putObject("list")
                    .put("action", base).put("method", "GET")
                    .put("parse", "records").put("totalParse", "total");
            params.putObject("create").put("action", base).put("method", "POST");
            params.putObject("get").put("action", base + "/{id}").put("method", "GET");
            params.putObject("update").put("action", base + "/{id}").put("method", "PUT");
            params.putObject("delete").put("action", base + "/{id}").put("method", "DELETE");
        } else if (TYPE_SYSTEM.equals(type)) {
            params.putObject("list")
                    .put("action", "/api/v1/internal/system/" + mapSystemInternalKey(sourceKey))
                    .put("method", "GET");
        }
        return params.toString();
    }

    /** sourceKey → internal API 路径 key 映射（唯一事实源见 BuiltInSystemSources.mapSystemInternalPath） */
    private String mapSystemInternalKey(String sourceKey) {
        String path = BuiltInSystemSources.mapSystemInternalPath(sourceKey);
        if (path == null || path.isBlank()) {
            throw new BusinessException(400, "未注册的系统数据源: " + sourceKey);
        }
        return path;
    }

    // ==================== FORM 查询配置段（queryMode + 草稿段）判定与校验 ====================

    /**
     * FORM params 是否携带 query 配置段（queryMode 或任一草稿段 joins/query/columns/params）。
     * <p>
     * 双段并存语义：前端可能只提交草稿段（如声明式 JOIN 配好后切回单表查询保存，
     * queryMode 缺省但 joins 保留以便下次迭代），create 路径据此走 mergeQueryConfig
     * 合并而非纯 generateParams 覆盖（对齐 Node hasFormQueryDraft 与 update 路径行为）。
     * null/空白/非法 JSON/非 JSON 对象（数组、标量）→ false，交给后续校验或覆盖处理。
     */
    private boolean hasFormQueryDraft(String params) {
        if (params == null || params.isBlank()) {
            return false;
        }
        try {
            JsonNode root = objectMapper.readTree(params);
            if (root == null || !root.isObject()) {
                return false;
            }
            for (String field : FORM_QUERY_FIELDS) {
                if (root.has(field)) {
                    return true;
                }
            }
            return false;
        } catch (JsonProcessingException e) {
            return false;
        }
    }

    /**
     * FORM 数据源查询配置段保存校验（Task 5；Task 51 扩展内建目标）。
     * <ul>
     *   <li>无 queryMode 段 → 向后兼容，跳过校验</li>
     *   <li>config：joins 非空；alias 可缺省（运行时自动分配）；目标支持业务表单（存在性）
     *       与内建数据源（JoinTargetCatalog 物理列白名单）；必填字段齐全、virtualKey 唯一；
     *       主表/目标物理列存在性按已发布表单校验（主表 key 三条路径穿透：create=入参 formKey /
     *       update=newFormKey / enable=ds.formKey，对齐 Node 三处调用点）</li>
     *   <li>sql：query/columns 合法性复用 SqlTemplateEngine.validate（SELECT / :tenantId / 列匹配 / 参数白名单）</li>
     *   <li>未知 queryMode → 400</li>
     * </ul>
     */
    private void validateFormQueryConfig(String params, String mainFormKey) {
        if (params == null || params.isBlank()) {
            return;
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(params);
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "数据源参数 params 必须是合法 JSON: " + e.getOriginalMessage());
        }
        if (root == null || !root.isObject()) {
            throw new BusinessException(400, "数据源参数 params 必须是 JSON 对象");
        }
        JsonNode modeNode = root.get("queryMode");
        if (modeNode == null || modeNode.isNull() || modeNode.asText().isBlank()) {
            return; // 无 queryMode 段 → 单表查询，向后兼容
        }
        String mode = modeNode.asText();
        if ("config".equals(mode)) {
            validateConfigJoins(root.get("joins"), mainFormKey);
        } else if ("sql".equals(mode)) {
            validateSqlConfig(root);
        } else {
            throw new BusinessException(400, "未知查询模式 queryMode: " + mode + "（支持 config / sql）");
        }
    }

    /** config 模式：joins[] 结构校验（别名/目标表/字段/虚拟列唯一性）。
     * <p>
     * alias 可缺省：前端不录入，由运行时 {@code FormQueryConfig.parseJoins} 自动分配（j1/j2/...）；
     * 传入则校验格式与唯一性。目标表支持内建数据源（JoinTargetCatalog 白名单）：
     * SYSTEM 目标不查 form_def，且 foreignField/joinField 必须是目录内物理列。
     * <p>
     * 新增（对齐 Node 新版）：主表关联字段格式 + 存在性校验（避免手输错列名保存成功、
     * 运行时才爆 SQL 错）；FORM 目标的 foreignField/joinField 存在性校验（与 SYSTEM 目标
     * 白名单对称）；virtualKey 与主表列冲突校验（SELECT m.* 同名重复列）。
     * 主表/目标表单未发布时存在性校验优雅降级跳过（启用时 requirePublishedForm 兜底），
     * 格式校验始终生效。
     *
     * @param mainFormKey 数据源绑定的主表单 key（调用链拿不到时传 null，存在性校验降级）
     */
    private void validateConfigJoins(JsonNode joins, String mainFormKey) {
        if (joins == null || !joins.isArray() || joins.isEmpty()) {
            throw new BusinessException(400, "queryMode=config 时必须配置至少一个关联 joins");
        }
        String tenantId = tenantProvider.getTenantId();
        // 主表物理列候选：业务列 + 系统列（id/created_at/updated_at；SELECT m.* 全量带出，
        // virtualKey 同名会重复列）。主表单未发布 → null（存在性校验降级跳过）
        Set<String> mainColumns = publishedColumnKeys(mainFormKey, tenantId, true);
        Set<String> virtualKeys = new HashSet<>();
        Set<String> aliases = new HashSet<>();
        int idx = 0;
        for (JsonNode j : joins) {
            idx++;
            if (j == null || !j.isObject()) {
                throw new BusinessException(400, "joins 第 " + idx + " 项必须是对象");
            }
            String alias = text(j, "alias");
            if (alias != null) {
                if (!JOIN_ALIAS_PATTERN.matcher(alias).matches()) {
                    throw new BusinessException(400, "joins 第 " + idx + " 项 alias 非法: " + alias);
                }
                if (!aliases.add(alias)) {
                    throw new BusinessException(400, "joins 第 " + idx + " 项 alias 重复: " + alias);
                }
            }
            String targetFormKey = text(j, "targetFormKey");
            if (targetFormKey == null || targetFormKey.isBlank()) {
                throw new BusinessException(400, "joins 第 " + idx + " 项必须指定目标表 targetFormKey");
            }
            Set<String> foreignCandidates = null;
            if (JoinTargetCatalog.isJoinTargetSystemKey(targetFormKey)) {
                // 内建目标：物理列白名单来自 JoinTargetCatalog（不走 form_def）
                foreignCandidates = JoinTargetCatalog.systemColumnKeys(targetFormKey);
            } else {
                if (!FORM_KEY_PATTERN.matcher(targetFormKey).matches()) {
                    throw new BusinessException(400, "非法关联目标: " + targetFormKey);
                }
                if (!formDefRepository.existsByTenantIdAndKey(tenantId, targetFormKey)) {
                    throw new BusinessException(400, "目标表单不存在: " + targetFormKey);
                }
                // FORM 目标：物理列候选 = 目标表单业务列 + id（对齐前端 targetFormColumns 候选）
                Set<String> targetColumns = publishedColumnKeys(targetFormKey, tenantId, false);
                if (targetColumns != null) {
                    foreignCandidates = targetColumns;
                }
            }
            String foreignField = text(j, "foreignField");
            String localField = text(j, "localField");
            requireJoinField(j, "foreignField", "目标表关联字段", idx);
            requireJoinField(j, "localField", "主表关联字段", idx);
            requireJoinField(j, "joinField", "显示字段", idx);
            // 主表关联字段：格式 + 存在性（引用列必须在主表物理列中，杜绝运行时畸形 SQL）
            if (localField != null && !JOIN_FIELD_PATTERN.matcher(localField).matches()) {
                throw new BusinessException(400, "joins 第 " + idx + " 项主表关联字段非法: " + localField);
            }
            if (mainColumns != null && localField != null && !mainColumns.contains(localField)) {
                throw new BusinessException(400, "joins 第 " + idx + " 项主表关联字段不在绑定表单列中: " + localField);
            }
            if (foreignCandidates != null) {
                if (foreignField == null || !foreignCandidates.contains(foreignField)) {
                    String label = JoinTargetCatalog.isJoinTargetSystemKey(targetFormKey)
                            ? "joins 第 " + idx + " 项目标表关联字段不在内建数据源物理列中: " + foreignField
                            : "joins 第 " + idx + " 项目标表关联字段不在目标表单列中: " + foreignField;
                    throw new BusinessException(400, label);
                }
                String joinFieldValue = text(j, "joinField");
                if (joinFieldValue == null || !foreignCandidates.contains(joinFieldValue)) {
                    String label = JoinTargetCatalog.isJoinTargetSystemKey(targetFormKey)
                            ? "joins 第 " + idx + " 项显示字段不在内建数据源物理列中: " + joinFieldValue
                            : "joins 第 " + idx + " 项显示字段不在目标表单列中: " + joinFieldValue;
                    throw new BusinessException(400, label);
                }
            }
            requireJoinField(j, "label", "显示名称", idx);
            String virtualKey = text(j, "virtualKey");
            if (virtualKey == null || virtualKey.isBlank()) {
                throw new BusinessException(400, "joins 第 " + idx + " 项必须指定虚拟列标识 virtualKey");
            }
            if (!virtualKeys.add(virtualKey)) {
                throw new BusinessException(400, "虚拟列 virtualKey 重复: " + virtualKey);
            }
            if (mainColumns != null && mainColumns.contains(virtualKey)) {
                throw new BusinessException(400, "joins 第 " + idx + " 项虚拟列 virtualKey 与主表列冲突: " + virtualKey);
            }
        }
    }

    private void requireJoinField(JsonNode j, String field, String label, int idx) {
        String v = text(j, field);
        if (v == null || v.isBlank()) {
            throw new BusinessException(400, "joins 第 " + idx + " 项必须指定" + label + " " + field);
        }
    }

    /**
     * 已发布表单的物理列候选集合：业务列（column_config）+ 系统列。
     *
     * @param formKey         表单 key（null/空白 → null）
     * @param tenantId        租户
     * @param withTimeColumns 是否附加 created_at/updated_at（主表候选要；目标表 JOIN 候选不要）
     * @return 未发布 → null（调用方降级跳过存在性校验）；id 始终在候选中
     */
    private Set<String> publishedColumnKeys(String formKey, String tenantId, boolean withTimeColumns) {
        if (formKey == null || formKey.isBlank()) {
            return null;
        }
        FormDefinition published = formDefRepository
                .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, formKey, "PUBLISHED")
                .orElse(null);
        if (published == null) {
            return null;
        }
        Set<String> keys = new HashSet<>();
        keys.add("id");
        if (withTimeColumns) {
            keys.add("created_at");
            keys.add("updated_at");
        }
        for (ColumnConfig column : parsePublishedColumnConfig(published.getColumnConfig())) {
            if (column.getKey() != null && !column.getKey().isBlank()) {
                keys.add(column.getKey());
            }
        }
        return keys;
    }

    /**
     * 解析 column_config JSON 为列映射列表（与 FormDefinitionService.getBusinessColumnsByKey
     * 同一解析链路：Jackson → ColumnConfig 列表；缺失/非法配置按既有文案 400）。
     */
    private List<ColumnConfig> parsePublishedColumnConfig(String columnConfig) {
        if (columnConfig == null || columnConfig.isBlank()) {
            throw new BusinessException(400, "业务表单发布前必须配置列映射（column_config）");
        }
        try {
            List<ColumnConfig> columns = objectMapper.readValue(columnConfig,
                    objectMapper.getTypeFactory().constructCollectionType(List.class, ColumnConfig.class));
            if (columns == null || columns.isEmpty()) {
                throw new BusinessException(400, "业务表单列映射不能为空");
            }
            return columns;
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "业务表单列映射配置非法: " + e.getOriginalMessage());
        }
    }

    /** sql 模式：query/columns/参数白名单复用 SqlTemplateEngine.validate（IllegalArgumentException → 400） */
    private void validateSqlConfig(JsonNode root) {
        String query = text(root, "query");
        List<JoinSqlGenerator.QueryColumn> columns = parseSqlColumns(root.get("columns"));
        List<String> declaredParams = parseStringList(root.get("params"));
        try {
            SqlTemplateEngine.validate(query, columns, declaredParams);
        } catch (IllegalArgumentException e) {
            throw new BusinessException(400, e.getMessage());
        }
    }

    private List<JoinSqlGenerator.QueryColumn> parseSqlColumns(JsonNode node) {
        List<JoinSqlGenerator.QueryColumn> out = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return out;
        }
        for (JsonNode n : node) {
            if (n == null || !n.isObject()) {
                continue;
            }
            out.add(new JoinSqlGenerator.QueryColumn(
                    text(n, "key"), text(n, "key"), text(n, "columnType"),
                    boolVal(n, "sortable"), boolVal(n, "filterable")));
        }
        return out;
    }

    private List<String> parseStringList(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return out;
        }
        for (JsonNode n : node) {
            if (n != null && n.isTextual() && !n.asText().isBlank()) {
                out.add(n.asText());
            }
        }
        return out;
    }

    /** 合并：生成端点 params 之上叠加 query 配置段（queryMode 活跃段 + joins/query/columns/params 草稿段原样保留） */
    private String mergeQueryConfig(String generated, String params) {
        try {
            ObjectNode out = (ObjectNode) objectMapper.readTree(generated);
            JsonNode input = objectMapper.readTree(params);
            for (String field : FORM_QUERY_FIELDS) {
                if (input.has(field)) {
                    out.set(field, input.get(field));
                }
            }
            return out.toString();
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "数据源参数 params 必须是合法 JSON: " + e.getOriginalMessage());
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static boolean boolVal(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && v.isBoolean() && v.asBoolean();
    }

    // ==================== 内部工具 ====================

    /**
     * 内建保护：{@code tenant_id = BUILT_IN_TENANT} 的预置行不允许修改/禁用/删除。
     * enable 不拦（对已 ENABLED 的内建行是幂等空操作，且拦了反而让前端开关卡死）。
     */
    private void requireNotBuiltIn(DataSourceDefinition ds, String action) {
        if (BuiltInSystemSources.BUILT_IN_TENANT.equals(ds.getTenantId())) {
            throw new BusinessException(400, "系统内建数据源不允许" + action + ": " + ds.getName());
        }
    }

    /** 按类型校验必填项：FORM/WORKFLOW→formKey（sourceKey 由 formKey 派生）；SYSTEM/API/SQL→sourceKey；API→params 合法 JSON */
    private void validateRequiredFields(String type, String formKey, String sourceKey, String params) {
        if (TYPE_FORM.equals(type) || TYPE_WORKFLOW.equals(type)) {
            if (formKey == null || formKey.isBlank()) {
                throw new BusinessException(400, type + " 类型数据源必须绑定表单 formKey");
            }
        } else if (TYPE_SYSTEM.equals(type) || TYPE_API.equals(type) || TYPE_SQL.equals(type)) {
            if (sourceKey == null || sourceKey.isBlank()) {
                throw new BusinessException(400, type + " 类型数据源必须填写 sourceKey");
            }
            if (TYPE_SYSTEM.equals(type) && !SYSTEM_SOURCE_KEYS.contains(sourceKey)) {
                throw new BusinessException(400, "未注册的系统数据源: " + sourceKey);
            }
            if (TYPE_API.equals(type)) {
                // LookupFetchConfig 契约：params 须为 JSON 对象且 action 必填
                if (params == null || params.isBlank()) {
                    throw new BusinessException(400, "API 数据源参数 params 必须包含 action（API 路径）");
                }
                try {
                    JsonNode node = objectMapper.readTree(params);
                    if (!node.isObject()) {
                        throw new BusinessException(400, "API 数据源参数 params 必须是 JSON 对象");
                    }
                    JsonNode action = node.get("action");
                    if (action == null || action.isNull() || action.asText().isBlank()) {
                        throw new BusinessException(400, "API 数据源参数 params 必须包含 action（API 路径）");
                    }
                } catch (BusinessException e) {
                    throw e;
                } catch (JsonProcessingException e) {
                    throw new BusinessException(400, "API 数据源参数 params 必须是合法 JSON: " + e.getOriginalMessage());
                }
            }
            // SQL：仅要求 sourceKey（query 配置在 params 中，DRAFT 阶段可为空，启用后由适配器校验）
        }
    }

    /** FORM 数据源启用/重绑前置校验：须存在已发布版本 */
    private void requirePublishedForm(String tenantId, String formKey) {
        if (formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, formKey, "PUBLISHED")
                .isEmpty()) {
            throw new BusinessException(400, "绑定的表单未发布，无法启用: " + formKey);
        }
    }

    /** WORKFLOW 数据源启用前置校验：表单存在、已发布且非 BUSINESS（业务表单无流程实例，无法跨实例聚合）。 */
    private void requireWorkflowForm(String tenantId, String formKey) {
        if (!formDefRepository.existsByTenantIdAndKey(tenantId, formKey)) {
            throw new BusinessException(400, "表单不存在: " + formKey);
        }
        FormDefinition form = formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                        tenantId, formKey, "PUBLISHED")
                .orElseThrow(() -> new BusinessException(400, "工作流表单必须先发布: " + formKey));
        if ("BUSINESS".equals(form.getType())) {
            throw new BusinessException(400, "业务表单不可配置为工作流表单数据源: " + formKey);
        }
    }
}