package com.workflow.engine.datasource.scope;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.repository.SysRoleRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 角色视角的数据权限：一个角色被授了哪些权限对象。
 *
 * <p>v3 语义：授权 = 赋予可见行。受控数据源（被任意对象关联）上，
 * 角色没被授到的行既看不见也改不了删不掉；一条都没授 = 该数据源整源不可见。
 *
 * <p>这是授权的唯一写入口（对齐「角色管理 → 分配菜单」）。权限对象页只展示既有授权，
 * 不再新增、修改或删除；保存时全量替换 {@code subjectType=ROLE,
 * subjectKey=roleCode} 的授权行。
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

    /** 全部权限对象 × 当前角色的授权勾选；未授予的对象也会返回（勾选状态为 false）。 */
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
        Set<Long> granted = grantedIds(tenantId, role.getRoleCode(), permissionIds);
        return permissions.stream()
                .map(permission -> new View(permission.getId(), permission.getName(), permission.getRemark(),
                        dataScopeService.parseStoredConditions(permission.getConditionsJson()),
                        sources.getOrDefault(permission.getId(), List.of()).stream().sorted().toList(),
                        granted.contains(permission.getId())))
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

        Set<Long> desired = normalized.stream().map(Item::permissionId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        List<RowPermissionGrant> existing = grantRepository
                .findByTenantIdAndSubjectTypeAndSubjectKey(tenantId, DataScopeSubject.ROLE, roleCode);
        List<RowPermissionGrant> obsolete = existing.stream()
                .filter(grant -> !desired.contains(grant.getPermissionId()))
                .toList();
        if (!obsolete.isEmpty()) {
            grantRepository.deleteAll(obsolete);
            // 唯一键 (permission_id, subject_type, subject_key)：先落删除再插新增
            grantRepository.flush();
        }
        Set<Long> kept = existing.stream()
                .map(RowPermissionGrant::getPermissionId)
                .filter(desired::contains)
                .collect(Collectors.toSet());
        for (Long permissionId : desired) {
            if (kept.contains(permissionId)) {
                continue;
            }
            RowPermissionGrant grant = new RowPermissionGrant();
            grant.setTenantId(tenantId);
            grant.setPermissionId(permissionId);
            grant.setSubjectType(DataScopeSubject.ROLE);
            grant.setSubjectKey(roleCode);
            grantRepository.save(grant);
        }
    }

    private Set<Long> grantedIds(String tenantId, String roleCode, List<Long> permissionIds) {
        Set<Long> visible = Set.copyOf(permissionIds);
        return grantRepository
                .findByTenantIdAndSubjectTypeAndSubjectKey(tenantId, DataScopeSubject.ROLE, roleCode).stream()
                .map(RowPermissionGrant::getPermissionId)
                .filter(visible::contains)
                .collect(Collectors.toSet());
    }

    private List<Item> normalize(List<Item> items, String tenantId) {
        if (items == null || items.isEmpty()) {
            return List.of();
        }
        Set<Long> byPermission = new LinkedHashSet<>();
        for (Item item : items) {
            if (item == null || item.permissionId() == null) {
                throw new BusinessException(400, "权限对象 id 不能为空");
            }
            if (!byPermission.add(item.permissionId())) {
                throw new BusinessException(400, "同一权限对象不能重复提交: " + item.permissionId());
            }
        }
        Set<Long> found = permissionRepository
                .findByTenantIdAndIdIn(tenantId, byPermission).stream()
                .map(RowPermission::getId)
                .collect(Collectors.toSet());
        List<Long> missing = byPermission.stream()
                .filter(id -> !found.contains(id))
                .toList();
        if (!missing.isEmpty()) {
            throw new BusinessException(404, "权限对象不存在: " + missing);
        }
        List<Item> out = new ArrayList<>(byPermission.size());
        byPermission.forEach(permissionId -> out.add(new Item(permissionId)));
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

    public record Item(Long permissionId) {
    }

    public record View(Long permissionId, String permissionName, String remark,
                       List<Map<String, Object>> conditions, List<String> dataSourceIds,
                       boolean granted) {
    }
}
