package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.AggregateRequest;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataVO;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.repository.DataSourceDefinitionRepository;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
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
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * 字段策略生效服务：链内覆写、跨链取最严、序列化出口掩码/隐藏、写载荷剔除、
 * 引用显示文本旁路封口、统计泄漏封口，豁免口径与行范围同源。
 *
 * <p>stub 形态与 {@link DataScopeServiceTest} 同一套（真实 SubjectResolver，
 * DataScopeService 用真身——formKey 反查与管理员豁免必须走同一实现）。
 */
class FieldPolicyServiceTest {

    private static final String DS_ID = "ds-driver";
    private static final String FORM_KEY = "driver_info";
    private static final String TENANT = "t1";

    private static final String PHONE_MASK = "[{\"column\":\"phone\",\"policy\":\"MASK\",\"rule\":\"PHONE\"}]";
    private static final String PHONE_VISIBLE = "[{\"column\":\"phone\",\"policy\":\"VISIBLE\"}]";
    private static final String PHONE_HIDDEN = "[{\"column\":\"phone\",\"policy\":\"HIDDEN\"}]";
    private static final String SALARY_HIDDEN = "[{\"column\":\"salary\",\"policy\":\"HIDDEN\"}]";

    private RowPermissionRepository permissionRepository;
    private RowPermissionSourceRepository sourceRepository;
    private RowPermissionGrantRepository grantRepository;
    private DataSourceDefinitionRepository dataSourceRepository;
    private FieldPolicyService service;

    @BeforeEach
    void setUp() {
        permissionRepository = mock(RowPermissionRepository.class);
        sourceRepository = mock(RowPermissionSourceRepository.class);
        grantRepository = mock(RowPermissionGrantRepository.class);
        dataSourceRepository = mock(DataSourceDefinitionRepository.class);
        DataScopeSubjectResolver subjectResolver = new DataScopeSubjectResolver();
        DataScopeService dataScopeService = new DataScopeService(permissionRepository, sourceRepository,
                grantRepository, subjectResolver,
                new DataScopeVariables(mock(SysOrganizationRepository.class)),
                new ObjectMapper(), new TenantProvider(), dataSourceRepository);
        service = new FieldPolicyService(permissionRepository, sourceRepository, grantRepository,
                subjectResolver, dataScopeService, new TenantProvider());
        TenantContext.setTenantId(TENANT);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    // ==================== 生效策略解析 ====================

    @Test
    void adminAndAnonymousAreExempted() {
        loginAs(List.of("admin"));
        stubScope(List.of(permission(1L, "p1", PHONE_MASK)), List.of(grant(11L, 1L, "clerk", null)));
        assertTrue(service.effectivePolicies(DS_ID).isEmpty());

        SecurityContextHolder.clearContext();
        assertTrue(service.effectivePolicies(DS_ID).isEmpty());
    }

    @Test
    void unlinkedSourceHasNoColumnPolicies() {
        loginAs(List.of("clerk"));
        stubScope(List.of(), List.of());
        assertTrue(service.effectivePolicies(DS_ID).isEmpty());
    }

    /** 受控未授权：行可见集合已是 0 行，列策略无物可掩（空 = 不追加列处置，不是放行泄漏）。 */
    @Test
    void linkedWithoutGrantIsEmptyColumnPolicy() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", PHONE_MASK)), List.of(grant(11L, 1L, "purchase_manager", null)));
        assertTrue(service.effectivePolicies(DS_ID).isEmpty());
    }

    @Test
    void objectBaselineAppliesWhenGrantCarriesNothing() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", PHONE_MASK)), List.of(grant(11L, 1L, "clerk", null)));
        Map<String, FieldPolicy> policies = service.effectivePolicies(DS_ID);
        assertEquals(FieldAccess.MASK, policies.get("phone").access());
        assertEquals(MaskRule.PHONE, policies.get("phone").rule());
    }

    @Test
    void grantOverridesBaselineWithinItsChain() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", PHONE_MASK)),
                List.of(grant(11L, 1L, "clerk", PHONE_VISIBLE)));
        assertEquals(FieldAccess.VISIBLE, service.effectivePolicies(DS_ID).get("phone").access());
    }

    @Test
    void crossChainTakesStrictestColumnWise() {
        loginAs(List.of("driver", "passenger"));
        stubScope(List.of(
                        permission(1L, "p1", PHONE_HIDDEN),
                        permission(2L, "p2", PHONE_MASK)),
                List.of(grant(11L, 1L, "driver", null), grant(12L, 2L, "passenger", null)));
        Map<String, FieldPolicy> merged = service.effectivePolicies(DS_ID);
        assertEquals(FieldAccess.HIDDEN, merged.get("phone").access());
    }

    /** 关键防放大：grant 显式 VISIBLE 不得穿越另一条链上的 MASK。 */
    @Test
    void visibleNeverEscapesAcrossChains() {
        loginAs(List.of("driver", "passenger"));
        stubScope(List.of(
                        permission(1L, "p1", PHONE_VISIBLE),
                        permission(2L, "p2", PHONE_MASK)),
                List.of(grant(11L, 1L, "driver", null), grant(12L, 2L, "passenger", null)));
        assertEquals(FieldAccess.MASK, service.effectivePolicies(DS_ID).get("phone").access());
    }

    // ==================== 序列化出口 ====================

    @Test
    void applyToPageMasksAndHidesColumns() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", "[{\"column\":\"phone\",\"policy\":\"MASK\",\"rule\":\"PHONE\"},"
                        + "{\"column\":\"salary\",\"policy\":\"HIDDEN\"}]")),
                List.of(grant(11L, 1L, "clerk", null)));
        BizDataPageVO page = new BizDataPageVO(List.of(row("r1",
                data("phone", "13812345678", "salary", 9000, "age", 30, "name", null))), 1, 1, 10);

        BizDataPageVO out = service.applyToPage(DS_ID, page);

        Map<String, Object> data = out.getRecords().get(0).getData();
        assertEquals("138****5678", data.get("phone"));
        assertFalse(data.containsKey("salary"), "HIDDEN 列必须键缺席而非空值");
        assertEquals(30, data.get("age"));
        assertNull(data.get("name"), "null 值经掩码仍为 null");
    }

    @Test
    void applyToPageWithoutPoliciesReturnsSameInstance() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", null)), List.of(grant(11L, 1L, "clerk", null)));
        BizDataPageVO page = new BizDataPageVO(List.of(row("r1", data("phone", "13812345678"))), 1, 1, 10);
        assertSame(page, service.applyToPage(DS_ID, page));
    }

    @Test
    void applyToRowMasksSingleRecord() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", PHONE_HIDDEN)), List.of(grant(11L, 1L, "clerk", null)));
        BizDataVO out = service.applyToRow(DS_ID, row("r1", data("phone", "13812345678", "age", 30)));
        assertFalse(out.getData().containsKey("phone"));
        assertEquals(30, out.getData().get("age"));
    }

    // ==================== 写载荷防御 ====================

    @Test
    void stripForWriteDropsCoveredColumnsAndKeepsRest() {
        loginAs(List.of("clerk"));
        Map<String, Object> baseline = new LinkedHashMap<>();
        baseline.put("column", "phone");
        baseline.put("policy", "MASK");
        baseline.put("rule", "PHONE");
        stubScope(List.of(permission(1L, "p1", "[{\"column\":\"phone\",\"policy\":\"MASK\",\"rule\":\"PHONE\"},"
                        + "{\"column\":\"salary\",\"policy\":\"HIDDEN\"}]")),
                List.of(grant(11L, 1L, "clerk", null)));
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("phone", "138****5678");
        payload.put("salary", "9000");
        payload.put("age", 31);

        Map<String, Object> stripped = service.stripForWrite(DS_ID, payload);

        assertFalse(stripped.containsKey("phone"), "MASK 列回写必须剔除，防掩码污染真值");
        assertFalse(stripped.containsKey("salary"));
        assertEquals(31, stripped.get("age"));
    }

    @Test
    void stripForWriteWithoutPoliciesReturnsSameInstance() {
        loginAs(List.of("admin"));
        Map<String, Object> payload = Map.of("phone", "13812345678");
        assertSame(payload, service.stripForWrite(DS_ID, payload));
    }

    // ==================== 引用显示文本旁路 ====================

    @Test
    void resolveTextsFollowColumnPolicy() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", PHONE_MASK)), List.of(grant(11L, 1L, "clerk", null)));
        Map<String, String> texts = Map.of("r1", "13812345678");
        stubFormSource();

        Map<String, String> masked = service.maskResolveTexts(FORM_KEY, "phone", texts);
        assertEquals(Map.of("r1", "138****5678"), masked);

        Map<String, String> untouched = service.maskResolveTexts(FORM_KEY, "name", texts);
        assertSame(texts, untouched);
    }

    @Test
    void resolveTextsOnHiddenColumnYieldsNothing() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", PHONE_HIDDEN)), List.of(grant(11L, 1L, "clerk", null)));
        stubFormSource();
        Map<String, String> out = service.maskResolveTexts(FORM_KEY, "phone", Map.of("r1", "13812345678"));
        assertTrue(out.isEmpty());
    }

    // ==================== 统计泄漏封口 ====================

    @Test
    void aggregateGroupOnMaskedColumnThrows400() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", PHONE_MASK)), List.of(grant(11L, 1L, "clerk", null)));
        AggregateRequest req = new AggregateRequest();
        req.setGroup("phone");
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.requireAggregateAllowed(DS_ID, req));
        assertEquals(400, ex.getCode());
    }

    @Test
    void aggregateMetricOnHiddenColumnThrows400() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", SALARY_HIDDEN)), List.of(grant(11L, 1L, "clerk", null)));
        AggregateRequest req = new AggregateRequest();
        req.setGroup("age");
        req.setAgg("sum");
        req.setMetric("salary");
        assertThrows(BusinessException.class, () -> service.requireAggregateAllowed(DS_ID, req));
    }

    @Test
    void aggregateOnUncontrolledColumnsPasses() {
        loginAs(List.of("clerk"));
        stubScope(List.of(permission(1L, "p1", PHONE_HIDDEN)), List.of(grant(11L, 1L, "clerk", null)));
        AggregateRequest req = new AggregateRequest();
        req.setGroup("age");
        req.setAgg("sum");
        req.setMetric("score");
        service.requireAggregateAllowed(DS_ID, req);
    }

    // ==================== 底表通道反查 ====================

    @Test
    void policiesByFormKeyResolveThroughDataSourceLookup() {
        loginAs(List.of("clerk"));
        stubFormSource();
        stubScope(List.of(permission(1L, "p1", PHONE_MASK)), List.of(grant(11L, 1L, "clerk", null)));
        assertEquals(FieldAccess.MASK, service.effectivePoliciesByFormKey(FORM_KEY).get("phone").access());
    }

    @Test
    void formWithoutDataSourceHasNoPolicies() {
        loginAs(List.of("clerk"));
        when(dataSourceRepository.findByTenantIdAndFormKey(TENANT, "ghost_form")).thenReturn(Optional.empty());
        assertTrue(service.effectivePoliciesByFormKey("ghost_form").isEmpty());
    }

    // ==================== helpers ====================

    private void loginAs(List<String> roles) {
        LoginUser loginUser = new LoginUser(200L, "u200", null, roles, Set.of(), true);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities()));
    }

    private RowPermission permission(Long id, String name, String fieldPoliciesJson) {
        RowPermission permission = new RowPermission();
        permission.setId(id);
        permission.setTenantId(TENANT);
        permission.setName(name);
        permission.setConditionsJson("[]");
        permission.setFieldPoliciesJson(fieldPoliciesJson);
        return permission;
    }

    private RowPermissionGrant grant(Long id, Long permissionId, String roleCode, String fieldPoliciesJson) {
        RowPermissionGrant grant = new RowPermissionGrant();
        grant.setId(id);
        grant.setTenantId(TENANT);
        grant.setPermissionId(permissionId);
        grant.setSubjectType(DataScopeSubject.ROLE);
        grant.setSubjectKey(roleCode);
        grant.setFieldPoliciesJson(fieldPoliciesJson);
        return grant;
    }

    private void stubScope(List<RowPermission> permissions, List<RowPermissionGrant> grants) {
        when(sourceRepository.findByTenantIdAndDataSourceId(TENANT, DS_ID))
                .thenReturn(permissions.stream().map(p -> link(p.getId())).toList());
        when(grantRepository.findByTenantIdAndPermissionIdIn(eq(TENANT), anyCollection()))
                .thenAnswer(inv -> {
                    Collection<Long> ids = inv.getArgument(1);
                    return grants.stream().filter(g -> ids.contains(g.getPermissionId())).toList();
                });
        when(permissionRepository.findByTenantIdAndIdIn(eq(TENANT), anyCollection()))
                .thenAnswer(inv -> {
                    Collection<Long> ids = inv.getArgument(1);
                    return permissions.stream().filter(p -> ids.contains(p.getId())).toList();
                });
    }

    private RowPermissionSource link(Long permissionId) {
        RowPermissionSource source = new RowPermissionSource();
        source.setTenantId(TENANT);
        source.setPermissionId(permissionId);
        source.setDataSourceId(DS_ID);
        return source;
    }

    private void stubFormSource() {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setId(DS_ID);
        ds.setTenantId(TENANT);
        ds.setFormKey(FORM_KEY);
        ds.setType("FORM");
        when(dataSourceRepository.findByTenantIdAndFormKey(TENANT, FORM_KEY)).thenReturn(Optional.of(ds));
    }

    private Map<String, Object> data(Object... kv) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            map.put(String.valueOf(kv[i]), kv[i + 1]);
        }
        return map;
    }

    private BizDataVO row(String id, Map<String, Object> data) {
        return new BizDataVO(id, data, 1, null, null);
    }
}
