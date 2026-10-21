package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.AggregateRequest;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.FilterAware;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
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
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 行权限 v3 语义验证：关联即受控、授权即赋予（未授权 = 不可见）、空条件对象 = 全部行、
 * 多对象并集、保留键只由服务端写入、模板解析与脏配置快速失败。
 *
 * <p>主体命中走真实 {@link DataScopeSubjectResolver}（只解析角色），不是桩。
 * 授权写入入口在角色管理，这里只验证读取链路。
 */
class DataScopeServiceTest {

    private static final String DS_ID = "ds-order";
    private static final String FORM_KEY = "supplier_quote";
    private static final String TENANT = "t1";

    private final ObjectMapper om = new ObjectMapper();

    private RowPermissionRepository permissionRepository;
    private RowPermissionSourceRepository sourceRepository;
    private RowPermissionGrantRepository grantRepository;
    private SysOrganizationRepository organizationRepository;
    private DataSourceDefinitionRepository dataSourceRepository;
    private DataScopeService service;

    @BeforeEach
    void setUp() {
        permissionRepository = mock(RowPermissionRepository.class);
        sourceRepository = mock(RowPermissionSourceRepository.class);
        grantRepository = mock(RowPermissionGrantRepository.class);
        organizationRepository = mock(SysOrganizationRepository.class);
        dataSourceRepository = mock(DataSourceDefinitionRepository.class);
        service = new DataScopeService(permissionRepository, sourceRepository, grantRepository,
                new DataScopeSubjectResolver(),
                new DataScopeVariables(organizationRepository), om, new TenantProvider(),
                dataSourceRepository);
        TenantContext.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    // ==================== 受控判定 ====================

    @Test
    void unlinked_data_source_is_unrestricted() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(), List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.apply(DS_ID, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
        assertFalse(service.hasScope(DS_ID));
    }

    /** 关联即受控：数据源挂了权限对象但角色没被授到 = 0 行（保留键写成空数组组）。 */
    @Test
    void linked_without_any_grant_denies_everything() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())), List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.apply(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertEquals("paid", filter.get("status"));
        assertEquals(List.of(), filter.get(FilterAware.ROW_SCOPE_KEY));
        assertTrue(service.hasScope(DS_ID));
    }

    /** 授的是别的角色不救当前角色：受控数据源上仍然 0 行。 */
    @Test
    void grant_to_another_role_still_denies() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeSubject.ROLE, "purchase_manager")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, req);

        assertEquals(List.of(), groupsOf(req));
    }

    @Test
    void user_without_roles_is_denied_on_linked_source() {
        loginAs(200L, "u200", null, List.of());
        stubScope(List.of(permission(1L, "p1", selfConditions())), List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, req);

        assertEquals(List.of(), groupsOf(req));
        assertTrue(service.hasScope(DS_ID));
    }

    // ==================== 施加：授权即赋予 ====================

    @Test
    void apply_injects_granted_object_as_one_and_group() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.apply(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertEquals("paid", filter.get("status"));
        assertEquals(List.of(List.of(leaf("created_by", "eq", "200"))), filter.get(FilterAware.ROW_SCOPE_KEY));
        assertTrue(service.hasScope(DS_ID));
    }

    @Test
    void apply_unions_every_granted_permission_instead_of_picking_one() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission self = permission(1L, "self", selfConditions());
        RowPermission owner = permission(2L, "owner", conditions(leaf("owner_id", "eq", "{userId}")));
        stubScope(List.of(self, owner), List.of(
                grant(11L, 1L, DataScopeSubject.ROLE, "clerk"),
                grant(12L, 2L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, req);

        List<List<Map<String, Object>>> groups = groupsOf(req);
        assertEquals(2, groups.size());
        assertEquals(List.of(leaf("created_by", "eq", "200")), groups.get(0));
        assertEquals(List.of(leaf("owner_id", "eq", "200")), groups.get(1));
    }

    @Test
    void apply_ignores_permissions_not_linked_to_this_data_source() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission linked = permission(1L, "linked", selfConditions());
        RowPermission elsewhere = permission(2L, "elsewhere", selfConditions());
        when(sourceRepository.findByTenantIdAndDataSourceId(TENANT, DS_ID))
                .thenReturn(List.of(link(1L, DS_ID)));
        stubGrants(List.of(
                grant(11L, 1L, DataScopeSubject.ROLE, "clerk"),
                grant(12L, 2L, DataScopeSubject.ROLE, "clerk")));
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenAnswer(inv -> {
                    Collection<Long> ids = inv.getArgument(1);
                    return List.of(linked, elsewhere).stream().filter(p -> ids.contains(p.getId())).toList();
                });
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, req);

        assertEquals(1, groupsOf(req).size());
    }

    @Test
    void apply_admin_is_exempt_even_on_linked_denied_source() {
        loginAs(1L, "admin", null, List.of("admin"));
        stubScope(List.of(permission(1L, "p1", selfConditions())), List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.apply(DS_ID, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
        assertFalse(service.hasScope(DS_ID));
    }

    /** 空条件对象 = 全部行：授到的角色不受限，即便数据源受控。 */
    @Test
    void granted_empty_conditions_object_means_unrestricted() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "allow-all", "[]")),
                List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.apply(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertFalse(filter.containsKey(FilterAware.ROW_SCOPE_KEY));
        assertEquals("paid", filter.get("status"));
        assertFalse(service.hasScope(DS_ID));
    }

    /** 并集里有一条不受限（空条件对象），整体不受限。 */
    @Test
    void union_with_empty_conditions_object_wins_over_narrower_grants() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(
                        permission(1L, "allow-all", "[]"),
                        permission(2L, "self", selfConditions())),
                List.of(
                        grant(11L, 1L, DataScopeSubject.ROLE, "clerk"),
                        grant(12L, 2L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.apply(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertFalse(filter.containsKey(FilterAware.ROW_SCOPE_KEY));
        assertEquals("paid", filter.get("status"));
        assertFalse(service.hasScope(DS_ID));
    }

    @Test
    void apply_is_shared_by_list_and_aggregate_requests() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        AggregateRequest req = new AggregateRequest();

        service.apply(DS_ID, req);

        assertEquals(List.of(List.of(leaf("created_by", "eq", "200"))),
                filterMap(req.getFilter()).get(FilterAware.ROW_SCOPE_KEY));
    }

    // ==================== 业务表单底表通道（formKey 反查数据源） ====================

    /** 同一张物理表两条通道必须同一口径：formKey 入口拿到的就是数据源入口的那份条件组。 */
    @Test
    void form_key_channel_injects_the_same_groups_as_the_data_source_channel() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        stubFormSource();
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyByFormKey(FORM_KEY, req);

        assertEquals(List.of(List.of(leaf("created_by", "eq", "200"))), groupsOf(req));
        assertEquals("paid", filterMap(req.getFilter()).get("status"));
    }

    /** 受控未授权：底表通道同样一行不给（保留键空数组，生成器拼 1 = 0）。 */
    @Test
    void form_key_channel_linked_without_grant_denies_everything() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())), List.of());
        stubFormSource();
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyByFormKey(FORM_KEY, req);

        assertEquals(List.of(), groupsOf(req));
        assertTrue(service.hasScopeByFormKey(FORM_KEY));
    }

    /** 该表单没有对应数据源 = 没有任何权限对象能挂到它上面：放行，但伪造的保留键仍要丢弃。 */
    @Test
    void form_without_data_source_is_unrestricted_and_strips_forged_key() {
        loginAs(200L, "u200", null, List.of("clerk"));
        when(dataSourceRepository.findByTenantIdAndFormKey(TENANT, FORM_KEY))
                .thenReturn(Optional.empty());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"__row_scope\":[[{\"column\":\"owner_id\",\"op\":\"eq\",\"value\":\"999\"}]]}");

        service.applyByFormKey(FORM_KEY, req);

        assertFalse(filterMap(req.getFilter()).containsKey(FilterAware.ROW_SCOPE_KEY));
        assertFalse(service.hasScopeByFormKey(FORM_KEY));
    }

    /** 管理员走同一入口：不受限。 */
    @Test
    void form_key_channel_skips_admin() {
        loginAs(1L, "admin", null, List.of("ROLE_ADMIN"));
        stubScope(List.of(permission(1L, "p1", selfConditions())), List.of());
        stubFormSource();
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyByFormKey(FORM_KEY, req);

        assertFalse(filterMap(req.getFilter()).containsKey(FilterAware.ROW_SCOPE_KEY));
        assertFalse(service.hasScopeByFormKey(FORM_KEY));
    }

    @Test
    void blank_form_key_is_never_scoped() {
        loginAs(200L, "u200", null, List.of("clerk"));
        assertFalse(service.hasScopeByFormKey(null));
        assertFalse(service.hasScopeByFormKey(" "));
    }

    // ==================== 保留键通道 ====================

    @Test
    void client_supplied_row_scope_is_discarded_and_replaced_by_server_groups() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"__row_scope\":[[{\"column\":\"owner_id\",\"op\":\"eq\",\"value\":\"999\"}]],"
                + "\"status\":\"paid\"}");

        service.apply(DS_ID, req);

        assertEquals(List.of(List.of(leaf("created_by", "eq", "200"))), groupsOf(req));
    }

    /** 拒绝时的空数组也只由服务端写：客户端塞的同名键先丢弃再换成服务端的判定。 */
    @Test
    void client_supplied_row_scope_is_discarded_when_server_denies() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())), List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"__row_scope\":[[{\"column\":\"owner_id\",\"op\":\"eq\",\"value\":\"999\"}]]}");

        service.apply(DS_ID, req);

        assertEquals(List.of(), groupsOf(req));
    }

    @Test
    void client_supplied_row_scope_is_discarded_even_when_unrestricted() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(), List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"__row_scope\":[[{\"column\":\"owner_id\",\"op\":\"eq\",\"value\":\"999\"}]],"
                + "\"status\":\"paid\"}");

        service.apply(DS_ID, req);

        Map<String, Object> filter = filterMap(req.getFilter());
        assertFalse(filter.containsKey(FilterAware.ROW_SCOPE_KEY));
        assertEquals("paid", filter.get("status"));
    }

    /** 客户端 OR 结构化筛选不与保留键互扰，由 SQL 生成器 AND 叠加。 */
    @Test
    void caller_or_filter_is_kept_alongside_row_scope() {
        loginAs(200L, "u200", null, List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", selfConditions())),
                List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"logic\":\"OR\",\"conditions\":["
                + "{\"column\":\"a\",\"op\":\"eq\",\"value\":1},"
                + "{\"column\":\"b\",\"op\":\"eq\",\"value\":2}]}");

        service.apply(DS_ID, req);

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
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, req);

        assertEquals(List.of(
                leaf("owner_id", "in", List.of("200", "u200")),
                leaf("dept_id", "eq", "77")), groupsOf(req).get(0));
    }

    /** 范围在受控数据源上必须成立：脏配置宁可报错，绝不退化成放行或拒绝。 */
    @Test
    void unknown_template_variable_fails_fast_instead_of_allowing_all() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission p = permission(1L, "bad", conditions(leaf("owner_id", "eq", "{nonexistent}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.apply(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("未知变量"), e.getMessage());
    }

    @Test
    void template_without_org_for_user_fails_fast() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission p = permission(1L, "org", conditions(leaf("dept_id", "eq", "{orgId}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.apply(DS_ID, new BizDataQueryRequest()));

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
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, req);

        assertEquals(List.of(leaf("dept_id", "in", List.of("77", "78", "79", "80"))), groupsOf(req).get(0));
    }

    /** 集合变量作为 in 列表的一项时并入列表，不嵌套：`5, {orgIdSubtree}` 混写仍然是一维 id 列表。 */
    @Test
    void subtree_variable_expands_flat_inside_an_in_list() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        when(organizationRepository.findByParentIdOrderBySortOrder(77L)).thenReturn(List.of(org(78L, 77L)));
        RowPermission p = permission(1L, "mixed", conditions(
                leaf("dept_id", "in", List.of("1000", "{orgIdSubtree}"))));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, req);

        assertEquals(List.of(leaf("dept_id", "in", List.of("1000", "77", "78"))), groupsOf(req).get(0));
    }

    @Test
    void subtree_variable_without_org_fails_fast() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission p = permission(1L, "dept-tree", conditions(
                leaf("dept_id", "in", "{orgIdSubtree}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.apply(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("未归属任何组织"), e.getMessage());
    }

    @Test
    void subtree_variable_with_eq_operator_fails_fast() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        RowPermission p = permission(1L, "bad", conditions(leaf("dept_id", "eq", "{orgIdSubtree}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.apply(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("只能配合 in"), e.getMessage());
    }

    @Test
    void removed_function_syntax_is_now_a_plain_literal() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        // fn: 语法随协议收缩一并撤下：残留写法不再有特殊语义，按字面量比较
        RowPermission p = permission(1L, "stale", conditions(leaf("dept_id", "eq", "fn:currentUserOrg()")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, req);

        assertEquals(List.of(leaf("dept_id", "eq", "fn:currentUserOrg()")), groupsOf(req).get(0));
    }

    @Test
    void list_variable_spliced_with_literal_fails_fast() {
        loginAs(200L, "u200", 77L, List.of("clerk"));
        // 拼接会静默取子树的首个 id 或拼成一条没人要的字符串，条件看起来生效实则不是
        RowPermission p = permission(1L, "mixed", conditions(leaf("dept_id", "like", "x{orgIdSubtree}")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.apply(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("独占"), e.getMessage());
    }

    @Test
    void illegal_column_in_stored_conditions_is_rejected_before_sql() {
        loginAs(200L, "u200", null, List.of("clerk"));
        RowPermission p = permission(1L, "bad", conditions(leaf("owner_id or 1=1", "eq", "1")));
        stubScope(List.of(p), List.of(grant(11L, 1L, DataScopeSubject.ROLE, "clerk")));

        BusinessException e = assertThrows(BusinessException.class,
                () -> service.apply(DS_ID, new BizDataQueryRequest()));

        assertEquals(400, e.getCode());
        assertTrue(e.getMessage().contains("列名非法"), e.getMessage());
    }

    // ==================== 条件校验（对象级权限管理复用） ====================

    /** v3：空条件合法——「全部行」形态靠空条件对象表达并授给主体。 */
    @Test
    void validate_conditions_accepts_empty_list_as_all_rows() {
        assertEquals(List.of(), service.validateConditions(List.of()));
        assertEquals(List.of(), service.validateConditions(null));
    }

    @Test
    void validate_conditions_accepts_subtree_variable_with_in() {
        List<Map<String, Object>> validated = service.validateConditions(
                List.of(leaf("dept_id", "in", "{orgIdSubtree}")));

        assertEquals(List.of(leaf("dept_id", "in", "{orgIdSubtree}")), validated);
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

    private RowPermissionGrant grant(Long id, Long permissionId,
                                     DataScopeSubject subjectType, String subjectKey) {
        RowPermissionGrant grant = new RowPermissionGrant();
        grant.setId(id);
        grant.setTenantId(TENANT);
        grant.setPermissionId(permissionId);
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

    /** 底表通道按 formKey 反查数据源：把 FORM_KEY 指向 DS_ID。 */
    private void stubFormSource() {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(DS_ID);
        ds.setTenantId(TENANT);
        ds.setFormKey(FORM_KEY);
        ds.setType("FORM");
        when(dataSourceRepository.findByTenantIdAndFormKey(TENANT, FORM_KEY))
                .thenReturn(Optional.of(ds));
    }

    private void stubGrants(List<RowPermissionGrant> grants) {        when(grantRepository.findByTenantIdAndPermissionIdIn(eq(TENANT), anyCollection()))
                .thenAnswer(inv -> {
                    Collection<Long> ids = inv.getArgument(1);
                    return grants.stream().filter(g -> ids.contains(g.getPermissionId())).toList();
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
