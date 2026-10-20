package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.repository.SysOrganizationRepository;
import com.workflow.system.repository.SysRoleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 角色数据权限：授权唯一入口，按 roleCode 维护该角色的 ROLE 授权与读写轴。 */
class RoleDataPermissionServiceTest {

    private static final String TENANT = "t1";
    private static final String ROLE_CODE = "ROLE_CLERK";

    private final ObjectMapper om = new ObjectMapper();

    private SysRoleRepository roleRepository;
    private RowPermissionRepository permissionRepository;
    private RowPermissionSourceRepository sourceRepository;
    private RowPermissionGrantRepository grantRepository;
    private RoleDataPermissionService service;

    @BeforeEach
    void setUp() {
        roleRepository = mock(SysRoleRepository.class);
        permissionRepository = mock(RowPermissionRepository.class);
        sourceRepository = mock(RowPermissionSourceRepository.class);
        grantRepository = mock(RowPermissionGrantRepository.class);
        DataScopeService dataScopeService = new DataScopeService(permissionRepository, sourceRepository,
                grantRepository,
                new DataScopeSubjectResolver(),
                new DataScopeVariables(mock(SysOrganizationRepository.class)),
                om, new TenantProvider());
        service = new RoleDataPermissionService(roleRepository, permissionRepository, sourceRepository,
                grantRepository, dataScopeService, new TenantProvider());
        TenantContext.setTenantId(TENANT);
        when(roleRepository.findById(2L)).thenReturn(Optional.of(role(2L, ROLE_CODE)));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void list_returns_all_objects_with_axes_for_the_role() throws Exception {
        RowPermission p1 = permission(1L, "一线可见");
        p1.setConditionsJson(om.writeValueAsString(List.of(leaf("owner_id", "eq", "{userId}"))));
        RowPermission p2 = permission(2L, "只读共享");
        p2.setConditionsJson(om.writeValueAsString(List.of(leaf("dept_id", "in", "{orgIdSubtree}"))));
        when(permissionRepository.findByTenantIdOrderByIdDesc(TENANT)).thenReturn(List.of(p2, p1));
        when(sourceRepository.findByTenantIdAndPermissionIdIn(eq(TENANT), anyCollection()))
                .thenReturn(List.of(link(1L, "ds-b"), link(1L, "ds-a"), link(2L, "ds-a")));
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of(
                        grant(1L, DataScopeAction.READ, ROLE_CODE),
                        grant(2L, DataScopeAction.WRITE, ROLE_CODE),
                        grant(99L, DataScopeAction.READ, ROLE_CODE)));

        List<RoleDataPermissionService.View> views = service.list(2L);

        assertEquals(2, views.size());
        RoleDataPermissionService.View read = views.get(0);
        assertEquals(2L, read.permissionId());
        assertEquals("只读共享", read.permissionName());
        assertEquals(List.of("ds-a"), read.dataSourceIds());
        assertFalse(read.read());
        assertTrue(read.write());

        RoleDataPermissionService.View owner = views.get(1);
        assertEquals(List.of("ds-a", "ds-b"), owner.dataSourceIds());
        assertTrue(owner.read());
        assertFalse(owner.write());
        assertEquals(List.of(leaf("owner_id", "eq", "{userId}")), owner.conditions());
    }

    @Test
    void list_unknown_role_returns_404() {
        BusinessException e = assertThrows(BusinessException.class, () -> service.list(9L));

        assertEquals(404, e.getCode());
        verify(permissionRepository, never()).findByTenantIdOrderByIdDesc(any());
    }

    @Test
    void save_replaces_only_role_grants_of_that_role() {
        RowPermissionGrant read = grant(1L, DataScopeAction.READ, ROLE_CODE);
        RowPermissionGrant write = grant(1L, DataScopeAction.WRITE, ROLE_CODE);
        RowPermissionGrant otherObject = grant(2L, DataScopeAction.READ, ROLE_CODE);
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenReturn(List.of(permission(1L, "p1"), permission(2L, "p2")));
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of(read, write, otherObject));

        service.save(2L, List.of(
                new RoleDataPermissionService.Item(1L, List.of(DataScopeAction.READ)),
                new RoleDataPermissionService.Item(2L, List.of(DataScopeAction.WRITE))));

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<RowPermissionGrant>> deleted = ArgumentCaptor.forClass(List.class);
        verify(grantRepository).deleteAll(deleted.capture());
        assertEquals(List.of(write, otherObject), deleted.getValue());
        verify(grantRepository).flush();
        ArgumentCaptor<RowPermissionGrant> saved = ArgumentCaptor.forClass(RowPermissionGrant.class);
        verify(grantRepository).save(saved.capture());
        assertEquals(2L, saved.getValue().getPermissionId());
        assertEquals(DataScopeAction.WRITE, saved.getValue().getAction());
        assertEquals(DataScopeSubject.ROLE, saved.getValue().getSubjectType());
        assertEquals(ROLE_CODE, saved.getValue().getSubjectKey());
    }

    @Test
    void save_empty_list_clears_all_role_grants() {
        RowPermissionGrant read = grant(1L, DataScopeAction.READ, ROLE_CODE);
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of(read));

        service.save(2L, List.of());

        verify(grantRepository).deleteAll(List.of(read));
        verify(grantRepository, never()).save(any(RowPermissionGrant.class));
    }

    @Test
    void save_rejects_unknown_permission() {
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection())).thenReturn(List.of());

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(2L, List.of(
                        new RoleDataPermissionService.Item(99L, List.of(DataScopeAction.READ)))));

        assertEquals(404, e.getCode());
        verify(grantRepository, never()).deleteAll(any());
        verify(grantRepository, never()).save(any(RowPermissionGrant.class));
    }

    @Test
    void save_rejects_duplicate_permission() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(2L, List.of(
                        new RoleDataPermissionService.Item(1L, List.of(DataScopeAction.READ)),
                        new RoleDataPermissionService.Item(1L, List.of(DataScopeAction.WRITE)))));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("不能重复提交"), e.getMessage());
    }

    @Test
    void save_unknown_role_returns_404() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(9L, List.of()));

        assertEquals(404, e.getCode());
        verify(grantRepository, never()).findByTenantIdAndSubjectTypeAndSubjectKey(any(), any(), any());
    }

    // ==================== 辅助 ====================

    private SysRole role(Long id, String roleCode) {
        SysRole role = new SysRole();
        role.setId(id);
        role.setRoleName("职员");
        role.setRoleCode(roleCode);
        return role;
    }

    private RowPermission permission(Long id, String name) {
        RowPermission permission = new RowPermission();
        permission.setId(id);
        permission.setTenantId(TENANT);
        permission.setName(name);
        permission.setConditionsJson("[]");
        return permission;
    }

    private RowPermissionSource link(Long permissionId, String dataSourceId) {
        RowPermissionSource link = new RowPermissionSource();
        link.setTenantId(TENANT);
        link.setPermissionId(permissionId);
        link.setDataSourceId(dataSourceId);
        return link;
    }

    private RowPermissionGrant grant(Long permissionId, DataScopeAction action, String roleCode) {
        RowPermissionGrant grant = new RowPermissionGrant();
        grant.setTenantId(TENANT);
        grant.setPermissionId(permissionId);
        grant.setAction(action);
        grant.setSubjectType(DataScopeSubject.ROLE);
        grant.setSubjectKey(roleCode);
        return grant;
    }

    private Map<String, Object> leaf(String column, String op, Object value) {
        Map<String, Object> leaf = new java.util.LinkedHashMap<>();
        leaf.put("column", column);
        leaf.put("op", op);
        leaf.put("value", value);
        return leaf;
    }
}
