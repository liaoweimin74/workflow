package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.form.column.ColumnConfig;
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

/** 角色数据权限：授权唯一入口，按 roleCode 维护该角色被授到的权限对象（v3：不分读写轴）。 */
class RoleDataPermissionServiceTest {

    private static final String TENANT = "t1";
    private static final String ROLE_CODE = "ROLE_CLERK";

    private final ObjectMapper om = new ObjectMapper();

    private SysRoleRepository roleRepository;
    private RowPermissionRepository permissionRepository;
    private RowPermissionSourceRepository sourceRepository;
    private RowPermissionGrantRepository grantRepository;
    private DataSourceDefinitionService dataSourceService;
    private RoleDataPermissionService service;

    @BeforeEach
    void setUp() {
        roleRepository = mock(SysRoleRepository.class);
        permissionRepository = mock(RowPermissionRepository.class);
        sourceRepository = mock(RowPermissionSourceRepository.class);
        grantRepository = mock(RowPermissionGrantRepository.class);
        dataSourceService = mock(DataSourceDefinitionService.class);
        DataScopeService dataScopeService = new DataScopeService(permissionRepository, sourceRepository,
                grantRepository,
                new DataScopeSubjectResolver(),
                new DataScopeVariables(mock(SysOrganizationRepository.class)),
                om, new TenantProvider(), mock(DataSourceDefinitionRepository.class));
        service = new RoleDataPermissionService(roleRepository, permissionRepository, sourceRepository,
                grantRepository, dataScopeService, new TenantProvider(), dataSourceService);
        TenantContext.setTenantId(TENANT);
        when(roleRepository.findById(2L)).thenReturn(Optional.of(role(2L, ROLE_CODE)));
        // 默认源元数据含 phone：授权列策略保存期校验读这一面，具体用例按需收窄
        when(dataSourceService.metadata(org.mockito.ArgumentMatchers.anyString()))
                .thenAnswer(inv -> metadata(column("phone", "手机号")));
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void list_returns_all_objects_with_granted_flag_for_the_role() throws Exception {
        RowPermission p1 = permission(1L, "一线可见");
        p1.setConditionsJson(om.writeValueAsString(List.of(leaf("owner_id", "eq", "{userId}"))));
        RowPermission p2 = permission(2L, "全部行");
        p2.setConditionsJson("[]");
        when(permissionRepository.findByTenantIdOrderByIdDesc(TENANT)).thenReturn(List.of(p2, p1));
        when(sourceRepository.findByTenantIdAndPermissionIdIn(eq(TENANT), anyCollection()))
                .thenReturn(List.of(link(1L, "ds-b"), link(1L, "ds-a"), link(2L, "ds-a")));
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of(grant(1L, ROLE_CODE), grant(99L, ROLE_CODE)));

        List<RoleDataPermissionService.View> views = service.list(2L);

        assertEquals(2, views.size());
        RoleDataPermissionService.View all = views.get(0);
        assertEquals(2L, all.permissionId());
        assertEquals("全部行", all.permissionName());
        assertEquals(List.of("ds-a"), all.dataSourceIds());
        assertFalse(all.granted());
        assertEquals(List.of(), all.conditions());

        RoleDataPermissionService.View owner = views.get(1);
        assertEquals(List.of("ds-a", "ds-b"), owner.dataSourceIds());
        assertTrue(owner.granted());
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
        RowPermissionGrant keep = grant(1L, ROLE_CODE);
        RowPermissionGrant obsolete = grant(2L, ROLE_CODE);
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenReturn(List.of(permission(1L, "p1"), permission(3L, "p3")));
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of(keep, obsolete));

        service.save(2L, List.of(
                new RoleDataPermissionService.Item(1L),
                new RoleDataPermissionService.Item(3L)));

        ArgumentCaptor<RowPermissionGrant> saved = ArgumentCaptor.forClass(RowPermissionGrant.class);
        verify(grantRepository).deleteAll(List.of(obsolete));
        verify(grantRepository).flush();
        verify(grantRepository).save(saved.capture());
        assertEquals(3L, saved.getValue().getPermissionId());
        assertEquals(DataScopeSubject.ROLE, saved.getValue().getSubjectType());
        assertEquals(ROLE_CODE, saved.getValue().getSubjectKey());
    }

    @Test
    void save_empty_list_clears_all_role_grants() {
        RowPermissionGrant existing = grant(1L, ROLE_CODE);
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of(existing));

        service.save(2L, List.of());

        verify(grantRepository).deleteAll(List.of(existing));
        verify(grantRepository, never()).save(any(RowPermissionGrant.class));
    }

    @Test
    void save_rejects_unknown_permission() {
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection())).thenReturn(List.of());

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(2L, List.of(new RoleDataPermissionService.Item(99L))));

        assertEquals(404, e.getCode());
        verify(grantRepository, never()).deleteAll(any());
        verify(grantRepository, never()).save(any(RowPermissionGrant.class));
    }

    @Test
    void save_rejects_duplicate_permission() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(2L, List.of(
                        new RoleDataPermissionService.Item(1L),
                        new RoleDataPermissionService.Item(1L))));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("不能重复提交"), e.getMessage());
    }

    // ==================== 授权级字段策略（grant 覆写对象基线） ====================

    /** 合法策略随授权落库：grant 的列策略是这条链的精调，与对象基线分开存储。 */
    @Test
    void save_stores_grant_field_policies() throws Exception {
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenReturn(List.of(permission(1L, "p1")));
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 1L))
                .thenReturn(List.of(link(1L, "ds-a")));
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of());

        service.save(2L, List.of(new RoleDataPermissionService.Item(1L,
                List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE")))));

        ArgumentCaptor<RowPermissionGrant> saved = ArgumentCaptor.forClass(RowPermissionGrant.class);
        verify(grantRepository).save(saved.capture());
        assertEquals("[{\"column\":\"phone\",\"policy\":\"MASK\",\"rule\":\"PHONE\"}]",
                saved.getValue().getFieldPoliciesJson());
    }

    /** 全量替换语义补洞：kept grant 的策略变化必须同步覆写，否则重保存丢更新。 */
    @Test
    void save_updates_field_policies_on_kept_grant() throws Exception {
        RowPermissionGrant kept = grant(1L, ROLE_CODE);
        kept.setFieldPoliciesJson(om.writeValueAsString(List.of(Map.of("column", "name", "policy", "HIDDEN"))));
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenReturn(List.of(permission(1L, "p1")));
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 1L)).thenReturn(List.of(link(1L, "ds-a")));
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of(kept));

        service.save(2L, List.of(new RoleDataPermissionService.Item(1L,
                List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE")))));

        assertEquals("[{\"column\":\"phone\",\"policy\":\"MASK\",\"rule\":\"PHONE\"}]",
                kept.getFieldPoliciesJson());
        verify(grantRepository).save(kept);
        verify(grantRepository, never()).deleteAll(any());
    }

    /** 策略列必须在权限对象关联的每个源上存在——与对象基线同一保存期口径。 */
    @Test
    void save_rejects_policy_column_missing_on_linked_source() {
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenReturn(List.of(permission(1L, "p1")));
        when(sourceRepository.findByTenantIdAndPermissionId(TENANT, 1L)).thenReturn(List.of(link(1L, "ds-a")));
        when(dataSourceService.metadata("ds-a")).thenReturn(metadata());

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.save(2L, List.of(new RoleDataPermissionService.Item(1L,
                        List.of(Map.of("column", "phone", "policy", "HIDDEN"))))));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("phone"), e.getMessage());
        verify(grantRepository, never()).save(any(RowPermissionGrant.class));
    }

    /** 角色页要能回显每条授权已配的策略（编辑入口前置）；未授权对象回显空列表。 */
    @Test
    void list_views_echo_grant_field_policies() throws Exception {
        RowPermission p1 = permission(1L, "一线可见");
        p1.setConditionsJson("[]");
        RowPermission p2 = permission(2L, "未授权对象");
        p2.setConditionsJson("[]");
        RowPermissionGrant g = grant(1L, ROLE_CODE);
        g.setFieldPoliciesJson(om.writeValueAsString(List.of(Map.of("column", "phone", "policy", "HIDDEN"))));
        when(permissionRepository.findByTenantIdOrderByIdDesc(TENANT)).thenReturn(List.of(p1, p2));
        when(sourceRepository.findByTenantIdAndPermissionIdIn(eq(TENANT), anyCollection()))
                .thenReturn(List.of(link(1L, "ds-a")));
        when(grantRepository.findByTenantIdAndSubjectTypeAndSubjectKey(TENANT, DataScopeSubject.ROLE, ROLE_CODE))
                .thenReturn(List.of(g));

        List<RoleDataPermissionService.View> views = service.list(2L);

        assertEquals(List.of(Map.of("column", "phone", "policy", "HIDDEN")), views.get(0).fieldPolicies());
        assertEquals(List.of(), views.get(1).fieldPolicies());
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

    private RowPermissionGrant grant(Long permissionId, String roleCode) {
        RowPermissionGrant grant = new RowPermissionGrant();
        grant.setTenantId(TENANT);
        grant.setPermissionId(permissionId);
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

    private DataSourceMetadata metadata(ColumnConfig... columns) {
        DataSourceMetadata meta = new DataSourceMetadata();
        meta.setColumns(List.of(columns));
        return meta;
    }

    private ColumnConfig column(String key, String label) {
        ColumnConfig column = new ColumnConfig();
        column.setKey(key);
        column.setLabel(label);
        return column;
    }
}
