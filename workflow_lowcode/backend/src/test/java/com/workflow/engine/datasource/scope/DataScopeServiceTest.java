package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.AggregateRequest;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.FilterAware;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysOrganization;
import com.workflow.system.repository.SysOrganizationRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 行权限 v2 语义验证：默认放行、多对象并集、读写分轴、保留键只由服务端写入、模板解析与脏配置快速失败。
 *
 * <p>主体命中走真实 {@link DataScopeSubjectResolver}（只解析角色），不是桩。
 * 授权写入入口在角色管理，这里只验证读取链路。
 */
class DataScopeServiceTest {

    private static final String DS_ID = "ds-order";
    private static final String TENANT = "t1";

    private final ObjectMapper om = new ObjectMapper();

    private RowPermissionRepository permissionRepository;
    private RowPermissionSourceRepository sourceRepository;
    private RowPermissionGrantRepository grantRepository;
    private SysOrganizationRepository organizationRepository;
    private DataScopeService service;

    @BeforeEach
    void setUp() {
        permissionRepository = mock(RowPermissionRepository.class);
        sourceRepository = mock(RowPermissionSourceRepository.class);
        grantRepository = mock(RowPermissionGrantRepository.class);
        organizationRepository = mock(SysOrganizationRepository.class);
        service = new DataScopeService(permissionRepository, sourceRepository, grantRepository,
                new DataScopeSubjectResolver(),
                new DataScopeVariables(organizationRepository), om, new TenantProvider());
        TenantContext.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    // ==================== 施加：并集与默认放行 ====================

    @Test
    void applyRead_leaves_filter_untouched_when_no_grant() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())), List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
        assertFalse(service.hasScope(DS_ID, DataScopeAction.READ));
    }

    @Test
    void applyRead_injects_self_grant_as_one_and_group() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertEquals("paid", filter.get("status"));
        assertEquals(List.of(List.of(leaf("created_by", "eq", "200"))), filter.get(FilterAware.ROW_SCOPE_KEY));
        assertTrue(service.hasScope(DS_ID, DataScopeAction.READ));
    }

    @Test
    void applyRead_unions_every_matched_permission_instead_of_picking_one() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission self = permission(1L, "self", selfConditions());
        RowPermission owner = permission(2L, "owner", conditions(leaf("owner_id", "eq", "{userId}")));
        stubScope(List.of(self, owner), List.of(
                grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk"),
                grant(12L, 2L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        List<List<Map<String, Object>>> groups = groupsOf(req);
        assertEquals(2, groups.size());
        assertEquals(List.of(leaf("created_by", "eq", "200")), groups.get(0));
        assertEquals(List.of(leaf("owner_id", "eq", "200")), groups.get(1));
    }

    @Test
    void applyRead_ignores_permissions_not_linked_to_this_data_source() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission linked = permission(1L, "linked", selfConditions());
        RowPermission elsewhere = permission(2L, "elsewhere", selfConditions());
        when(sourceRepository.findByTenantIdAndDataSourceId(TENANT, DS_ID))
                .thenReturn(List.of(link(1L, DS_ID)));
        stubGrants(List.of(
                grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk"),
                grant(12L, 2L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenAnswer(inv -> {
                    Collection<Long> ids = inv.getArgument(1);
                    return List.of(linked, elsewhere).stream().filter(p -> ids.contains(p.getId())).toList();
                });
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertEquals(1, groupsOf(req).size());
    }

    @Test
    void applyRead_is_per_axis_read_grant_does_not_constrain_write() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.apply(DS_ID, DataScopeAction.WRITE, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
        assertFalse(service.hasScope(DS_ID, DataScopeAction.WRITE));
        assertTrue(service.hasScope(DS_ID, DataScopeAction.READ));
    }

    @Test
    void applyAll_intersectsReadAndWriteGroups_asCrossProduct() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission self = permission(1L, "self", selfConditions());
        RowPermission owner = permission(2L, "owner", conditions(leaf("owner_id", "eq", "{userId}")));
        RowPermission writeOwn = permission(3L, "write-own", conditions(leaf("order_no", "eq", "SO-1")));
        stubScope(List.of(self, owner, writeOwn), List.of(
                grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk"),
                grant(12L, 2L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk"),
                grant(13L, 3L, DataScopeAction.WRITE, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyAll(DS_ID, List.of(DataScopeAction.READ, DataScopeAction.WRITE), req);

        List<List<Map<String, Object>>> groups = groupsOf(req);
        assertEquals(2, groups.size());
        assertEquals(List.of(leaf("created_by", "eq", "200"), leaf("order_no", "eq", "SO-1")), groups.get(0));
        assertEquals(List.of(leaf("owner_id", "eq", "200"), leaf("order_no", "eq", "SO-1")), groups.get(1));
    }

    @Test
    void applyAll_keepsWritableRowsAlignedWithReadScope() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission read = permission(1L, "read", conditions(leaf("status", "eq", "open")));
        stubScope(List.of(read), List.of(
                grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"id\":\"r1\"}");

        service.applyAll(DS_ID, List.of(DataScopeAction.READ, DataScopeAction.WRITE), req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertEquals("r1", filter.get("id"));
        assertEquals(List.of(List.of(leaf("status", "eq", "open"))), filter.get(FilterAware.ROW_SCOPE_KEY));
        assertFalse(service.hasScope(DS_ID, DataScopeAction.WRITE));
    }

    @Test
    void apply_is_shared_by_list_and_aggregate_requests() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        AggregateRequest req = new AggregateRequest();

        service.applyRead(DS_ID, req);

        assertEquals(List.of(List.of(leaf("created_by", "eq", "200"))),
                filterMap(req.getFilter()).get(FilterAware.ROW_SCOPE_KEY));
    }

    @Test
    void applyRead_admin_is_exempt() {
        loginAs(1L, "admin", null, List.of("admin"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "admin")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
        assertFalse(service.hasScope(DS_ID, DataScopeAction.READ));
    }

    /** 空条件对象 = 显式放行；并集里有一条不受限，整体不受限。 */
    @Test
    void applyRead_empty_conditions_object_means_unrestricted() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(
                        permission(1L, "allow-all", "[]"),
                        permission(2L, "self", selfConditions())),
                List.of(
                        grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk"),
                        grant(12L, 2L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertFalse(filter.containsKey(FilterAware.ROW_SCOPE_KEY));
        assertEquals("paid", filter.get("status"));
        assertFalse(service.hasScope(DS_ID, DataScopeAction.READ));
    }

    // ==================== 保留键通道 ====================

    @Test
    void client_supplied_row_scope_is_discarded_and_replaced_by_server_groups() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"__row_scope\":[[{\"column\":\"owner_id\",\"op\":\"eq\",\"value\":\"999\"}]],"
                + "\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertEquals(List.of(List.of(leaf("created_by", "eq", "200"))), groupsOf(req));
    }

    @Test
    void client_supplied_row_scope_is_discarded_even_without_any_scope() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(), List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"__row_scope\":[[{\"column\":\"owner_id\",\"op\":\"eq\",\"value\":\"999\"}]],"
                + "\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertFalse(filter.containsKey(FilterAware.ROW_SCOPE_KEY));
        assertEquals("paid", filter.get("status"));
    }

    /** 客户端 OR 结构化筛选不再被拒：与保留键互不干扰，由 SQL 生成器 AND 叠加。 */
    @Test
    void caller_or_filter_is_kept_alongside_row_scope() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"logic\":\"OR\",\"conditions\":["
                + "{\"column\":\"a\",\"op\":\"eq\",\"value\":1},"
                + "{\"column\":\"b\",\"op\":\"eq\",\"value\":2}]}");

        service.applyRead(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertEquals("OR", filter.get("logic"));
        assertEquals(2, ((List<?>) filter.get("conditions")).size());
        assertEquals(List.of(List.of(leaf("created_by", "eq", "200"))), filter.get(FilterAware.ROW_SCOPE_KEY));
    }

    // ==================== 模板解析 ====================

    @Test
    void templates_resolve_user_org_and_list_values() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        RowPermission p = permission(1L, "multi", conditions(
                leaf("owner_id", "in", List.of("{userId}", "{username}")),
                leaf("dept_id", "eq", "{orgId}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertEquals(List.of(
                leaf("owner_id", "in", List.of("200", "u200")),
                leaf("dept_id", "eq", "77")), groupsOf(req).get(0));
    }

    @Test
    void unknown_template_variable_fails_fast_instead_of_allowing_all() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission p = permission(1L, "bad", conditions(leaf("owner_id", "eq", "{nonexistent}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.applyRead(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("未知变量"), e.getMessage());
    }

    @Test
    void template_without_org_for_user_fails_fast() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission p = permission(1L, "org", conditions(leaf("dept_id", "eq", "{orgId}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.applyRead(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("{orgId}"), e.getMessage());
    }

    // ==================== 集合变量 ====================

    @Test
    void subtree_variable_resolves_to_an_in_list_of_org_ids() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        when(organizationRepository.findByParentIdOrderBySortOrder(77L))
                .thenReturn(List.of(org(78L, 77L), org(79L, 77L)));
        when(organizationRepository.findByParentIdOrderBySortOrder(78L))
                .thenReturn(List.of(org(80L, 78L)));
        RowPermission p = permission(1L, "dept-tree", conditions(
                leaf("dept_id", "in", "{orgIdSubtree}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertEquals(List.of(leaf("dept_id", "in", List.of("77", "78", "79", "80"))), groupsOf(req).get(0));
    }

    /** 集合变量作为 in 列表的一项时并入列表，不嵌套：`5, {orgIdSubtree}` 混写仍然是一维 id 列表。 */
    @Test
    void subtree_variable_expands_flat_inside_an_in_list() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        when(organizationRepository.findByParentIdOrderBySortOrder(77L)).thenReturn(List.of(org(78L, 77L)));
        RowPermission p = permission(1L, "mixed", conditions(
                leaf("dept_id", "in", List.of("1000", "{orgIdSubtree}"))));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertEquals(List.of(leaf("dept_id", "in", List.of("1000", "77", "78"))), groupsOf(req).get(0));
    }

    @Test
    void subtree_variable_without_org_fails_fast() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission p = permission(1L, "dept-tree", conditions(
                leaf("dept_id", "in", "{orgIdSubtree}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.applyRead(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("未归属任何组织"), e.getMessage());
    }

    @Test
    void subtree_variable_with_eq_operator_fails_fast() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        RowPermission p = permission(1L, "bad", conditions(leaf("dept_id", "eq", "{orgIdSubtree}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.applyRead(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("只能配合 in"), e.getMessage());
    }

    @Test
    void removed_function_syntax_is_now_a_plain_literal() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        // fn: 语法随协议收缩一并撤下：残留写法不再有特殊语义，按字面量比较
        RowPermission p = permission(1L, "stale", conditions(leaf("dept_id", "eq", "fn:currentUserOrg()")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertEquals(List.of(leaf("dept_id", "eq", "fn:currentUserOrg()")), groupsOf(req).get(0));
    }

    @Test
    void list_variable_spliced_with_literal_fails_fast() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        // 拼接会静默取子树的首个 id 或拼成一条没人要的字符串，条件看起来生效实则不是
        RowPermission p = permission(1L, "mixed", conditions(leaf("dept_id", "like", "x{orgIdSubtree}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.applyRead(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("独占"), e.getMessage());
    }

    @Test
    void illegal_column_in_stored_conditions_is_rejected_before_sql() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission p = permission(1L, "bad", conditions(leaf("owner_id or 1=1", "eq", "1")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.applyRead(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("列名非法"), e.getMessage());
    }

    // ==================== 条件校验（对象级权限管理复用） ====================

    @Test
    void validate_conditions_accepts_subtree_variable_with_in() {
        List<Map<String, Object>> validated = service.validateConditions(
                List.of(leaf("dept_id", "in", "{orgIdSubtree}")));

        assertEquals(List.of(leaf("dept_id", "in", "{orgIdSubtree}")), validated);
    }

    @Test
    void validate_conditions_rejects_empty_array() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> service.validateConditions(List.of()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("至少需要一条条件"), e.getMessage());
    }

    @Test
    void validate_conditions_rejects_empty_in_list_and_bad_range() {
        assertThrows(BusinessException.class,
                () -> service.validateConditions(List.of(leaf("dept_id", "in", List.of()))));
        assertThrows(BusinessException.class,
                () -> service.validateConditions(List.of(leaf("amount", "range", List.of(1)))));
        assertThrows(BusinessException.class,
                () -> service.validateConditions(List.of(leaf("dept_id", "in", "77"))));
    }

    @Test
    void validate_conditions_rejects_list_variable_with_eq() {
        BusinessException e = assertThrows(BusinessException.class,
                () -> service.validateConditions(List.of(leaf("dept_id", "eq", "{orgIdSubtree}"))));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("只能配合 in"), e.getMessage());
    }

    @Test
    void validate_conditions_rejects_unknown_and_spliced_variables() {
        BusinessException unknown = assertThrows(BusinessException.class,
                () -> service.validateConditions(List.of(leaf("dept_id", "eq", "{orgCode}"))));
        assertTrue(unknown.getMessage().contains("未知变量"), unknown.getMessage());

        BusinessException spliced = assertThrows(BusinessException.class,
                () -> service.validateConditions(List.of(leaf("dept_id", "in", List.of("A{orgIdSubtree}")))));
        assertTrue(spliced.getMessage().contains("独占"), spliced.getMessage());
    }

    // ==================== 辅助 ====================

    private void loginAs(long userId, String username, Long orgId, List<String> roles) {
        LoginUser loginUser = new LoginUser(userId, username, null, roles, Set.of(), true);
        loginUser.setOrgId(orgId);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities()));
    }

    private SysOrganization org(Long id, Long parentId) {
        SysOrganization org = new SysOrganization();
        org.setId(id);
        org.setParentId(parentId);
        org.setOrgName("org-" + id);
        org.setOrgCode("code-" + id);
        return org;
    }

    private LoginUser currentUser() {
        return (LoginUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
    }

    private RowPermission permission(Long id, String name, String conditionsJson) {
        RowPermission permission = new RowPermission();
        permission.setId(id);
        permission.setTenantId(TENANT);
        permission.setName(name);
        permission.setConditionsJson(conditionsJson);
        return permission;
    }

    private RowPermissionSource link(Long permissionId, String dataSourceId) {
        RowPermissionSource source = new RowPermissionSource();
        source.setTenantId(TENANT);
        source.setPermissionId(permissionId);
        source.setDataSourceId(dataSourceId);
        return source;
    }

    private RowPermissionGrant grant(Long id, Long permissionId, DataScopeAction action,
                                     DataScopeSubject subjectType, String subjectKey) {
        RowPermissionGrant grant = new RowPermissionGrant();
        grant.setId(id);
        grant.setTenantId(TENANT);
        grant.setPermissionId(permissionId);
        grant.setAction(action);
        grant.setSubjectType(subjectType);
        grant.setSubjectKey(subjectKey);
        return grant;
    }

    private void stubScope(List<RowPermission> permissions, List<RowPermissionGrant> grants) {
        when(sourceRepository.findByTenantIdAndDataSourceId(TENANT, DS_ID))
                .thenReturn(permissions.stream().map(p -> link(p.getId(), DS_ID)).toList());
        stubGrants(grants);
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenAnswer(inv -> {
                    Collection<Long> ids = inv.getArgument(1);
                    return permissions.stream().filter(p -> ids.contains(p.getId())).toList();
                });
    }

    private void stubGrants(List<RowPermissionGrant> grants) {
        when(grantRepository.findByTenantIdAndPermissionIdInAndAction(
                eq(TENANT), anyCollection(), any(DataScopeAction.class))).thenAnswer(inv -> {
                    Collection<Long> ids = inv.getArgument(1);
                    DataScopeAction action = inv.getArgument(2);
                    return grants.stream()
                            .filter(g -> ids.contains(g.getPermissionId()) && g.getAction() == action)
                            .toList();
                });
    }

    private String selfConditions() {
        return conditions(leaf("created_by", "eq", "{userId}"));
    }

    @SafeVarargs
    private final String conditions(Map<String, Object>... leaves) {
        try {
            return om.writeValueAsString(List.of(leaves));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    private Map<String, Object> leaf(String column, String op, Object value) {
        Map<String, Object> leaf = new LinkedHashMap<>();
        leaf.put("column", column);
        leaf.put("op", op);
        leaf.put("value", value);
        return leaf;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> filterMap(String filterJson) {
        try {
            return om.readValue(filterJson, Map.class);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private List<List<Map<String, Object>>> groupsOf(FilterAware req) {
        return (List<List<Map<String, Object>>>) filterMap(req.getFilter()).get(FilterAware.ROW_SCOPE_KEY);
    }
}
