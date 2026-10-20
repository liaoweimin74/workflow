package com.workflow.engine.datasource.scope;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.repository.SysRoleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 角色视角的数据权限：一个角色在若干权限对象上的读/写勾选。
 *
 * <p>这是授权的唯一写入口（对齐「角色管理 → 分配菜单」）。权限对象页只展示既有授权，
 * 不再新增、修改或删除；保存时全量替换 {@code subjectType=ROLE,
 * subjectKey=roleCode} 的授权行，读写轴按勾选重建。
 */
@Service
public class RoleDataPermissionService {

    private final SysRoleRepository roleRepository;
    private final RowPermissionRepository permissionRepository;
    private final RowPermissionSourceRepository sourceRepository;
    private final RowPermissionGrantRepository grantRepository;
    private final DataScopeService dataScopeService;
    private final TenantProvider tenantProvider;

    public RoleDataPermissionService(SysRoleRepository roleRepository,
                                     RowPermissionRepository permissionRepository,
                                     RowPermissionSourceRepository sourceRepository,
                                     RowPermissionGrantRepository grantRepository,
                                     DataScopeService dataScopeService,
                                     TenantProvider tenantProvider) {
        this.roleRepository = roleRepository;
        this.permissionRepository = permissionRepository;
        this.sourceRepository = sourceRepository;
        this.grantRepository = grantRepository;
        this.dataScopeService = dataScopeService;
        this.tenantProvider = tenantProvider;
    }

    /** 全部权限对象 × 当前角色的读写勾选；未授予的对象也会返回（勾选状态为 false）。 */
    public List<View> list(Long roleId) {
        SysRole role = requireRole(roleId);
        String tenantId = tenantProvider.getTenantId();
        List<RowPermission> permissions = permissionRepository.findByTenantIdOrderByIdDesc(tenantId);
        if (permissions.isEmpty()) {
            return List.of();
        }
        List<Long> permissionIds = permissions.stream().map(RowPermission::getId).toList();
        Map<Long, List<String>> sources = sourceRepository
                .findByTenantIdAndPermissionIdIn(tenantId, permissionIds).stream()
                .collect(Collectors.groupingBy(RowPermissionSource::getPermissionId,
                        Collectors.mapping(RowPermissionSource::getDataSourceId, Collectors.toList())));
        Map<Long, Set<DataScopeAction>> axes = grantedAxes(tenantId, role.getRoleCode(), permissionIds);
        return permissions.stream()
                .map(permission -> new View(permission.getId(), permission.getName(), permission.getRemark(),
                        dataScopeService.parseStoredConditions(permission.getConditionsJson()),
                        sources.getOrDefault(permission.getId(), List.of()).stream().sorted().toList(),
                        axes.getOrDefault(permission.getId(), Set.of()).contains(DataScopeAction.READ),
                        axes.getOrDefault(permission.getId(), Set.of()).contains(DataScopeAction.WRITE)))
                .toList();
    }

    /**
     * 全量替换该角色的数据权限；空列表表示清空。
     * 只按 roleCode 定位该角色的 ROLE 授权，其他角色的授权不参与比较也不会被删除。
     */
    @Transactional
    public void save(Long roleId, List<Item> items) {
        SysRole role = requireRole(roleId);
        String tenantId = tenantProvider.getTenantId();
        List<Item> normalized = normalize(items, tenantId);
        String roleCode = role.getRoleCode();

        Set<String> desired = normalized.stream()
                .flatMap(item -> item.actions().stream().map(action -> key(item.permissionId(), action)))
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<RowPermissionGrant> existing = grantRepository
                .findByTenantIdAndSubjectTypeAndSubjectKey(tenantId, DataScopeSubject.ROLE, roleCode);
        List<RowPermissionGrant> obsolete = existing.stream()
                .filter(grant -> !desired.contains(key(grant.getPermissionId(), grant.getAction())))
                .toList();
        if (!obsolete.isEmpty()) {
            grantRepository.deleteAll(obsolete);
            // 唯一键 (permission_id, subject_type, subject_key, scope_action)：先落删除再插新增
            grantRepository.flush();
        }
        Set<String> kept = existing.stream()
                .map(grant -> key(grant.getPermissionId(), grant.getAction()))
                .filter(desired::contains)
                .collect(Collectors.toSet());
        for (Item item : normalized) {
            for (DataScopeAction action : item.actions()) {
                if (kept.contains(key(item.permissionId(), action))) {
                    continue;
                }
                RowPermissionGrant grant = new RowPermissionGrant();
                grant.setTenantId(tenantId);
                grant.setPermissionId(item.permissionId());
                grant.setAction(action);
                grant.setSubjectType(DataScopeSubject.ROLE);
                grant.setSubjectKey(roleCode);
                grantRepository.save(grant);
            }
        }
    }

    private Map<Long, Set<DataScopeAction>> grantedAxes(String tenantId, String roleCode, List<Long> permissionIds) {
        Set<Long> visible = Set.copyOf(permissionIds);
        Map<Long, Set<DataScopeAction>> axes = new LinkedHashMap<>();
        for (RowPermissionGrant grant : grantRepository
                .findByTenantIdAndSubjectTypeAndSubjectKey(tenantId, DataScopeSubject.ROLE, roleCode)) {
            if (visible.contains(grant.getPermissionId())) {
                axes.computeIfAbsent(grant.getPermissionId(), id -> EnumSet.noneOf(DataScopeAction.class))
                        .add(grant.getAction());
            }
        }
        return axes;
    }

    private List<Item> normalize(List<Item> items, String tenantId) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        Map<Long, Set<DataScopeAction>> byPermission = new LinkedHashMap<>();
        for (Item item : items) {
            if (item == null || item.permissionId() == null) {
                throw new BusinessException(400, "权限对象 id 不能为空");
            }
            if (byPermission.containsKey(item.permissionId())) {
                throw new BusinessException(400, "同一权限对象不能重复提交: " + item.permissionId());
            }
            Set<DataScopeAction> actions = EnumSet.noneOf(DataScopeAction.class);
            if (item.actions() != null) {
                for (DataScopeAction action : item.actions()) {
                    if (action == null) {
                        throw new BusinessException(400, "读写动作不能为空");
                    }
                    actions.add(action);
                }
            }
            byPermission.put(item.permissionId(), actions);
        }
        Set<Long> found = permissionRepository
                .findByTenantIdAndIdIn(tenantId, byPermission.keySet()).stream()
                .map(RowPermission::getId)
                .collect(Collectors.toSet());
        List<Long> missing = byPermission.keySet().stream()
                .filter(id -> !found.contains(id))
                .toList();
        if (!missing.isEmpty()) {
            throw new BusinessException(404, "权限对象不存在: " + missing);
        }
        List<Item> out = new ArrayList<>(byPermission.size());
        byPermission.forEach((permissionId, actions) ->
                out.add(new Item(permissionId, List.copyOf(actions))));
        return out;
    }

    private SysRole requireRole(Long roleId) {
        if (roleId == null) {
            throw new BusinessException(400, "角色 id 不能为空");
        }
        SysRole role = roleRepository.findById(roleId)
                .orElseThrow(() -> new BusinessException(404, "角色不存在: " + roleId));
        if (role.getIsDeleted() != null && role.getIsDeleted() != 0) {
            throw new BusinessException(404, "角色不存在: " + roleId);
        }
        return role;
    }

    private String key(Long permissionId, DataScopeAction action) {
        return permissionId + "|" + action.name();
    }

    public record Item(Long permissionId, List<DataScopeAction> actions) {
    }

    public record View(Long permissionId, String permissionName, String remark,
                       List<Map<String, Object>> conditions, List<String> dataSourceIds,
                       boolean read, boolean write) {
    }
}
