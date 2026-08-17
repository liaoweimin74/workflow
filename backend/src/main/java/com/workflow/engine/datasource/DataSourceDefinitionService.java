package com.workflow.engine.datasource;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.repository.FormDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * 全局数据源定义服务。
 * 状态机：DRAFT → ENABLED ⇄ DISABLED；仅 DRAFT 可删除。
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
    private static final Set<String> SUPPORTED_TYPES = Set.of(TYPE_FORM, TYPE_SYSTEM, TYPE_API);

    private final DataSourceDefinitionRepository dsRepository;
    private final FormDefinitionRepository formDefRepository;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper;
    private final List<DataSourceAdapter> adapters;

    /**
     * @param adapters Spring 自动注入所有 DataSourceAdapter bean（无则空列表）
     */
    public DataSourceDefinitionService(DataSourceDefinitionRepository dsRepository,
                                       FormDefinitionRepository formDefRepository,
                                       TenantProvider tenantProvider,
                                       ObjectMapper objectMapper,
                                       List<DataSourceAdapter> adapters) {
        this.dsRepository = dsRepository;
        this.formDefRepository = formDefRepository;
        this.tenantProvider = tenantProvider;
        this.objectMapper = objectMapper;
        this.adapters = adapters == null ? List.of() : adapters;
    }

    /**
     * 创建数据源（默认 DRAFT）。
     * 校验：type 必填且合法；同租户 name 唯一；按类型必填项（FORM→formKey + 表单存在；
     * SYSTEM/API→sourceKey；API→params 须为合法 JSON）。
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
        validateRequiredFields(type, formKey, sourceKey, params);
        if (TYPE_FORM.equals(type) && !formDefRepository.existsByTenantIdAndKey(tenantId, formKey)) {
            throw new BusinessException(400, "绑定的表单不存在: " + formKey);
        }

        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(UUID.randomUUID().toString().replace("-", ""));
        ds.setTenantId(tenantId);
        ds.setName(name);
        ds.setType(type);
        ds.setFormKey(formKey);
        ds.setSourceKey(sourceKey);
        ds.setParams(params);
        ds.setStatus(STATUS_DRAFT);
        return dsRepository.save(ds);
    }

    /**
     * 原地更新数据源（name/type/formKey/sourceKey/params；null 表示不更新）。
     * 若当前 ENABLED 且 type/formKey 变更，重新校验（FORM 须仍指向已发布表单）。
     */
    @Transactional
    public DataSourceDefinition update(String id, String name, String type, String formKey,
                                       String sourceKey, String params) {
        String tenantId = tenantProvider.getTenantId();
        DataSourceDefinition ds = getById(id);

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
        validateRequiredFields(newType, newFormKey, newSourceKey, newParams);
        if (TYPE_FORM.equals(newType) && !formDefRepository.existsByTenantIdAndKey(tenantId, newFormKey)) {
            throw new BusinessException(400, "绑定的表单不存在: " + newFormKey);
        }

        // 已启用数据源若变更类型/绑定对象，须重新校验发布状态
        boolean bindChanged = !TYPE_FORM.equals(ds.getType()) || (formKey != null && !formKey.equals(ds.getFormKey()));
        if (STATUS_ENABLED.equals(ds.getStatus()) && bindChanged && TYPE_FORM.equals(newType)) {
            requirePublishedForm(tenantId, newFormKey);
        }

        ds.setName(name == null ? ds.getName() : name);
        ds.setType(newType);
        ds.setFormKey(newFormKey);
        ds.setSourceKey(newSourceKey);
        ds.setParams(newParams);
        return dsRepository.save(ds);
    }

    /**
     * 启用数据源：校验按类型必填项齐全；FORM 类型须绑定已发布表单。成功置 ENABLED。
     */
    @Transactional
    public DataSourceDefinition enable(String id) {
        String tenantId = tenantProvider.getTenantId();
        DataSourceDefinition ds = getById(id);
        validateRequiredFields(ds.getType(), ds.getFormKey(), ds.getSourceKey(), ds.getParams());
        if (TYPE_FORM.equals(ds.getType())) {
            requirePublishedForm(tenantId, ds.getFormKey());
        }
        ds.setStatus(STATUS_ENABLED);
        return dsRepository.save(ds);
    }

    /**
     * 禁用数据源（不校验引用；不影响已发布页面运行）。
     */
    @Transactional
    public DataSourceDefinition disable(String id) {
        DataSourceDefinition ds = getById(id);
        ds.setStatus(STATUS_DISABLED);
        return dsRepository.save(ds);
    }

    /**
     * 删除数据源：仅 DRAFT 可删除（ENABLED/DISABLED → 400）。
     */
    @Transactional
    public void delete(String id) {
        DataSourceDefinition ds = getById(id);
        if (!STATUS_DRAFT.equals(ds.getStatus())) {
            throw new BusinessException(400, "仅 DRAFT 状态可删除，请先禁用后再删除");
        }
        dsRepository.delete(ds);
    }

    /**
     * 按 id 获取数据源（租户隔离；不存在 → 404）。
     */
    public DataSourceDefinition getById(String id) {
        String tenantId = tenantProvider.getTenantId();
        return dsRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "数据源不存在: " + id));
    }

    /**
     * 分页查询数据源列表（type/status 可选过滤，按更新时间倒序）。
     */
    public Page<DataSourceDefinition> list(String type, String status, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        boolean hasType = type != null && !type.isBlank();
        boolean hasStatus = status != null && !status.isBlank();
        if (hasType && hasStatus) {
            return dsRepository.findByTenantIdAndTypeAndStatusOrderByUpdatedAtDesc(tenantId, type, status, pageable);
        }
        if (hasType) {
            return dsRepository.findByTenantIdAndTypeOrderByUpdatedAtDesc(tenantId, type, pageable);
        }
        if (hasStatus) {
            return dsRepository.findByTenantIdAndStatusOrderByUpdatedAtDesc(tenantId, status, pageable);
        }
        return dsRepository.findByTenantIdOrderByUpdatedAtDesc(tenantId, pageable);
    }

    /**
     * 仅已启用数据源（页面设计器下拉用）。
     */
    public List<DataSourceDefinition> getEnabled() {
        String tenantId = tenantProvider.getTenantId();
        return dsRepository.findByTenantIdAndStatus(tenantId, STATUS_ENABLED);
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

    // ==================== 内部工具 ====================

    /** 按类型校验必填项：FORM→formKey；SYSTEM/API→sourceKey；API→params 合法 JSON */
    private void validateRequiredFields(String type, String formKey, String sourceKey, String params) {
        if (TYPE_FORM.equals(type)) {
            if (formKey == null || formKey.isBlank()) {
                throw new BusinessException(400, "FORM 类型数据源必须绑定表单 formKey");
            }
        } else if (TYPE_SYSTEM.equals(type) || TYPE_API.equals(type)) {
            if (sourceKey == null || sourceKey.isBlank()) {
                throw new BusinessException(400, type + " 类型数据源必须填写 sourceKey");
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
        }
    }

    /** FORM 数据源启用/重绑前置校验：须存在已发布版本 */
    private void requirePublishedForm(String tenantId, String formKey) {
        if (formDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(tenantId, formKey, "PUBLISHED")
                .isEmpty()) {
            throw new BusinessException(400, "绑定的表单未发布，无法启用: " + formKey);
        }
    }
}