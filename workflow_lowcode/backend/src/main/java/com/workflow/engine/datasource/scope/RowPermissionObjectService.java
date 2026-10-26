package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 权限对象的管理端 CRUD（对象视角）：一组条件 + 关联数据源。
 *
 * <p>对象只定义「什么条件算本人/本部门的数据，挂到哪些数据源上」，不再负责授予谁：
 * 授权（主体 × 对象）的唯一写入方是 {@link RoleDataPermissionService}（角色管理 → 数据权限），
 * 这里的保存即便收到授权字段也不会触碰 {@code wf_row_permission_grant}——
 * 两个入口轮流改同一张表是权限配置最容易出错的地方。
 *
 * <p>读取视图仍返回既有授权（含历史遗留的非角色主体），供管理页只读回显；
 * 删除对象时连同授权与数据源关联一起清理，避免角色侧出现幽灵行。
 */
@Service
public class RowPermissionObjectService {

    /** 系统内置列的展示名：单表/JOIN 路径自动带上这几列，metadata 的声明列里没有它们。 */
    private static final Map<String, String> BUILTIN_COLUMN_LABELS = Map.of(
            "id", "记录ID",
            "created_at", "创建时间",
            "updated_at", "更新时间",
            "created_by", "创建人");

    private final RowPermissionRepository permissionRepository;
    private final RowPermissionSourceRepository sourceRepository;
    private final RowPermissionGrantRepository grantRepository;
    private final DataScopeService dataScopeService;
    private final DataSourceDefinitionService dataSourceService;
    private final TenantProvider tenantProvider;
    private final ObjectMapper objectMapper;

    public RowPermissionObjectService(RowPermissionRepository permissionRepository,
                                      RowPermissionSourceRepository sourceRepository,
                                      RowPermissionGrantRepository grantRepository,
                                      DataScopeService dataScopeService,
                                      DataSourceDefinitionService dataSourceService,
                                      TenantProvider tenantProvider,
                                      ObjectMapper objectMapper) {
        this.permissionRepository = permissionRepository;
        this.sourceRepository = sourceRepository;
        this.grantRepository = grantRepository;
        this.dataScopeService = dataScopeService;
        this.dataSourceService = dataSourceService;
        this.tenantProvider = tenantProvider;
        this.objectMapper = objectMapper;
    }

    public List<Detail> list() {
        String tenantId = tenantProvider.getTenantId();
        return permissionRepository.findByTenantIdOrderByIdDesc(tenantId).stream()
                .map(permission -> detail(permission, tenantId))
                .toList();
    }

    public Detail get(Long id) {
        String tenantId = tenantProvider.getTenantId();
        return detail(requireObject(id, tenantId), tenantId);
    }

    @Transactional
    public Detail save(Input input) {
        if (input == null) {
            throw new BusinessException(400, "权限对象不能为空");
        }
        String name = requireName(input.name());
        String remark = requireRemark(input.remark());
        List<Map<String, Object>> conditions = dataScopeService.validateConditions(input.conditions());
        List<DataSourceDefinition> sources = requireSources(input.dataSourceIds());
        List<String> dataSourceIds = sources.stream().map(DataSourceDefinition::getId).toList();
        requireColumnsUsable(sources, conditions);
        List<FieldPolicy> fieldPolicies = FieldPolicies.fromEntries(input.fieldPolicies());
        requirePolicyColumnsKnown(sources, fieldPolicies);
        String tenantId = tenantProvider.getTenantId();

        RowPermission permission;
        if (input.id() == null) {
            permission = new RowPermission();
            permission.setTenantId(tenantId);
        } else {
            permission = requireObject(input.id(), tenantId);
        }
        permission.setName(name);
        permission.setRemark(remark);
        permission.setConditionsJson(writeConditions(conditions));
        permission.setFieldPoliciesJson(FieldPolicies.writeJson(fieldPolicies));
        permission = permissionRepository.save(permission);

        syncSources(tenantId, permission.getId(), dataSourceIds);
        return detail(permission, tenantId);
    }

    /** 删除对象连同关联与授权；对象本身不再被引用，直接物理删除。 */
    @Transactional
    public void delete(Long id) {
        String tenantId = tenantProvider.getTenantId();
        RowPermission permission = requireObject(id, tenantId);
        grantRepository.deleteByTenantIdAndPermissionId(tenantId, id);
        sourceRepository.deleteByTenantIdAndPermissionId(tenantId, id);
        permissionRepository.delete(permission);
    }

    // ==================== 校验 ====================

    private RowPermission requireObject(Long id, String tenantId) {
        if (id == null) {
            throw new BusinessException(400, "权限对象 id 不能为空");
        }
        return permissionRepository.findByIdAndTenantId(id, tenantId)
                .orElseThrow(() -> new BusinessException(404, "权限对象不存在: " + id));
    }

    private String requireName(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessException(400, "权限名称不能为空");
        }
        String trimmed = name.trim();
        if (trimmed.length() > 100) {
            throw new BusinessException(400, "权限名称最长 100 个字符");
        }
        return trimmed;
    }

    private String requireRemark(String remark) {
        if (remark == null) {
            return null;
        }
        String trimmed = remark.trim();
        if (trimmed.length() > 255) {
            throw new BusinessException(400, "备注最长 255 个字符");
        }
        return trimmed.isEmpty() ? null : trimmed;
    }

    /**
     * 候选条件列 = 所选数据源「都能施加范围条件」的列交集。
     *
     * <p>条件会同时下发到所有关联源，只要有一个源筛不出这一列，保存就会被
     * {@link #requireColumnsUsable} 拒掉，所以候选给交集而不是并集——并集等于放着一个注定存不进去的列。
     * 可筛性口径复用 {@link DataSourceDefinitionService#scopeColumns}（与查询期三个生成器对齐），
     * 前端不再自行推断，避免「下拉里有、保存却说没有」。
     *
     * <p>没选源时返回空列表（不是报错）：这是配置辅助，列名输入框允许手输，真正的把关在保存。
     */
    public List<ColumnOption> columnCandidates(List<String> dataSourceIds) {
        List<String> ids = uniqueIds(dataSourceIds);
        if (ids.isEmpty()) {
            return List.of();
        }
        // 先把「能不能施加范围」判完再取列：不可施加的源要当场点名，不该先白跑一轮元数据
        ids.forEach(dataSourceService::requireScopeConfigurable);
        Set<String> shared = null;
        Map<String, String> labels = new LinkedHashMap<>();
        for (String dataSourceId : ids) {
            Set<String> usable = dataSourceService.scopeColumns(dataSourceId);
            shared = shared == null ? new LinkedHashSet<>(usable) : retain(shared, usable);
            for (ColumnConfig column : dataSourceService.metadata(dataSourceId).getColumns()) {
                String key = column.getKey();
                if (key != null && usable.contains(key) && column.getLabel() != null
                        && !column.getLabel().isBlank()) {
                    labels.putIfAbsent(key, column.getLabel());
                }
            }
        }
        return shared.stream()
                .map(key -> new ColumnOption(key,
                        labels.getOrDefault(key, BUILTIN_COLUMN_LABELS.getOrDefault(key, key))))
                .toList();
    }

    private static Set<String> retain(Set<String> columns, Set<String> other) {
        Set<String> retained = new LinkedHashSet<>(columns);
        retained.retainAll(other);
        return retained;
    }

    /** 至少关联一个数据源：没有关联的对象永远不会生效，存下来只会让管理页看起来「配了」。 */
    private List<DataSourceDefinition> requireSources(List<String> dataSourceIds) {
        List<String> ids = uniqueIds(dataSourceIds);
        if (ids.isEmpty()) {
            throw new BusinessException(400, "权限对象至少关联一个数据源");
        }
        List<DataSourceDefinition> sources = new ArrayList<>(ids.size());
        for (String dataSourceId : ids) {
            dataSourceService.requireScopeConfigurable(dataSourceId);
            sources.add(dataSourceService.getById(dataSourceId));
        }
        return sources;
    }

    private static List<String> uniqueIds(List<String> dataSourceIds) {
        if (dataSourceIds == null) {
            return List.of();
        }
        return new ArrayList<>(new LinkedHashSet<>(dataSourceIds.stream()
                .filter(id -> id != null && !id.isBlank())
                .map(String::trim)
                .toList()));
    }

    /**
     * 逐源确认每个条件列都能被该源的取数实现筛出来。
     *
     * <p>条件同时施加到所有关联数据源，所以「列在其中一个源上不存在／不可筛」不是警告而是致命配置：
     * 生成器在查询期会对该列抛「非法筛选字段」，症状是这个数据源的列表和聚合整条请求报错，
     * 而报错的人不会想到是权限对象改过关联数据源。放在保存期拦，消息里点名是哪个源。
     */
    private void requireColumnsUsable(List<DataSourceDefinition> sources, List<Map<String, Object>> conditions) {
        for (DataSourceDefinition source : sources) {
            Set<String> usable = dataSourceService.scopeColumns(source.getId());
            for (Map<String, Object> condition : conditions) {
                String column = String.valueOf(condition.get("column"));
                if (usable.contains(column)) {
                    continue;
                }
                String reason = usable.isEmpty()
                        ? "该数据源没有可施加范围条件的列（SQL 模板需把列 SELECT 出来并标记可筛选）"
                        : "该源没有这一列，或该列未标记为可筛选";
                throw new BusinessException(400, "条件列 " + column + " 在数据源「"
                        + sourceDisplayName(source) + "」上不可施加：" + reason);
            }
        }
    }

    private static String sourceDisplayName(DataSourceDefinition source) {
        String name = source.getName();
        return name == null || name.isBlank() ? source.getId() : name + "（" + source.getType() + "）";
    }

    /**
     * 字段策略列必须被每个关联源声明为输出列（消息与列集口径见 {@link FieldPolicies#requireColumnsKnown}）：
     * 生效侧对未知列不会报错、只会静默无匹配，等于策略失效——比条件列更该在保存期把关。
     */
    private void requirePolicyColumnsKnown(List<DataSourceDefinition> sources, List<FieldPolicy> policies) {
        if (policies.isEmpty()) {
            return;
        }
        Map<String, Set<String>> columnsBySource = new LinkedHashMap<>();
        Map<String, String> namesById = new LinkedHashMap<>();
        for (DataSourceDefinition source : sources) {
            columnsBySource.put(source.getId(), declaredColumns(source.getId()));
            namesById.put(source.getId(), sourceDisplayName(source));
        }
        FieldPolicies.requireColumnsKnown(policies, columnsBySource, namesById::get);
    }

    /** 源声明的输出列 key 集（metadata 口径；内置列不在其中，天然排除在策略范围外）。 */
    private Set<String> declaredColumns(String dataSourceId) {
        DataSourceMetadata metadata = dataSourceService.metadata(dataSourceId);
        if (metadata == null || metadata.getColumns() == null) {
            return Set.of();
        }
        return metadata.getColumns().stream()
                .map(ColumnConfig::getKey)
                .filter(key -> key != null && !key.isBlank())
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private String writeConditions(List<Map<String, Object>> conditions) {
        try {
            return objectMapper.writeValueAsString(conditions);
        } catch (JsonProcessingException e) {
            throw new BusinessException(500, "行权限条件写入失败");
        }
    }

    // ==================== 关联同步（全量替换，保留未变动的行） ====================

    private void syncSources(String tenantId, Long permissionId, List<String> dataSourceIds) {
        List<RowPermissionSource> existing = sourceRepository.findByTenantIdAndPermissionId(tenantId, permissionId);
        Set<String> desired = new LinkedHashSet<>(dataSourceIds);
        List<RowPermissionSource> obsolete = existing.stream()
                .filter(link -> !desired.contains(link.getDataSourceId()))
                .toList();
        if (!obsolete.isEmpty()) {
            sourceRepository.deleteAll(obsolete);
            // 唯一键 (permission_id, data_source_id)：先落删除再插新增，避免同 key 的删-插在 flush 时撞车
            sourceRepository.flush();
        }
        Set<String> kept = existing.stream()
                .filter(link -> desired.contains(link.getDataSourceId()))
                .map(RowPermissionSource::getDataSourceId)
                .collect(Collectors.toSet());
        for (String dataSourceId : desired) {
            if (kept.contains(dataSourceId)) {
                continue;
            }
            RowPermissionSource link = new RowPermissionSource();
            link.setTenantId(tenantId);
            link.setPermissionId(permissionId);
            link.setDataSourceId(dataSourceId);
            sourceRepository.save(link);
        }
    }

    // ==================== 视图 ====================

    private Detail detail(RowPermission permission, String tenantId) {
        List<String> dataSourceIds = sourceRepository.findByTenantIdAndPermissionId(tenantId, permission.getId())
                .stream()
                .map(RowPermissionSource::getDataSourceId)
                .sorted()
                .toList();
        List<GrantView> grants = grantRepository.findByTenantIdAndPermissionId(tenantId, permission.getId()).stream()
                .sorted(Comparator.comparing((RowPermissionGrant grant) -> grant.getSubjectType().name())
                        .thenComparing(RowPermissionGrant::getSubjectKey))
                .map(grant -> new GrantView(grant.getSubjectType(), grant.getSubjectKey()))
                .toList();
        return new Detail(permission, dataScopeService.parseStoredConditions(permission.getConditionsJson()),
                dataSourceIds, grants,
                FieldPolicies.toJsonEntries(FieldPolicies.parse(permission.getFieldPoliciesJson())));
    }

    public record Input(Long id, String name, String remark,
                        List<Map<String, Object>> conditions,
                        List<String> dataSourceIds,
                        List<Map<String, Object>> fieldPolicies) {

        /** 兼容旧 5 参调用点：不带策略 = null（写 NULL 列）。 */
        public Input(Long id, String name, String remark,
                     List<Map<String, Object>> conditions, List<String> dataSourceIds) {
            this(id, name, remark, conditions, dataSourceIds, null);
        }
    }

    /** 候选条件列（配置辅助，只给展示用信息；可筛性判定不在这里重复）。 */
    public record ColumnOption(String key, String label) {
    }

    public record GrantView(DataScopeSubject subjectType, String subjectKey) {
    }

    public record Detail(RowPermission permission, List<Map<String, Object>> conditions,
                         List<String> dataSourceIds, List<GrantView> grants,
                         List<Map<String, Object>> fieldPolicies) {
    }
}
