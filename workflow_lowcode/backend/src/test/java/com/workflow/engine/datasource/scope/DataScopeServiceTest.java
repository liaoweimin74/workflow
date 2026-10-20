package com.workflow.engine.datasource.scope;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.AggregateRequest;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.tenant.TenantContext;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysMemberGroupMember;
import com.workflow.system.repository.SysMemberGroupMemberRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DataScope 服务端注入语义验证：默认不收紧、交集时服务端优先、模板变量解析、管理员豁免、脏配置快速失败。
 *
 * <p>三轴（主体 × 动作 × 范围类型）用真实 {@link DataScopeSubjectResolver} 跑，
 * 主体命中走的是线上那条 subjectsOf 路径，不是桩。
 */
class DataScopeServiceTest {

    private static final String DS_ID = "ds-order";

    private WfDataScopeRepository repository;
    private SysMemberGroupMemberRepository memberRepository;
    private DataScopeService service;

    @BeforeEach
    void setUp() {
        repository = mock(WfDataScopeRepository.class);
        memberRepository = mock(SysMemberGroupMemberRepository.class);
        service = new DataScopeService(repository, new DataScopeSubjectResolver(memberRepository),
                new ObjectMapper(), new TenantProvider());
        TenantContext.setTenantId("t1");
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
        TenantContext.clear();
    }

    private void loginAs(long userId, String username, List<String> roles) {
        LoginUser loginUser = new LoginUser(userId, username, null, roles, Set.of(), true);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities()));
    }

    private void stubRules(DataScopeAction action, WfDataScope... rules) {
        when(repository.findByTenantIdAndDataSourceIdAndAction(eq("t1"), eq(DS_ID), eq(action)))
                .thenReturn(List.of(rules));
    }

    private WfDataScope rule(DataScopeSubject type, String key, DataScopeType scopeType,
                             String column, String value) {
        WfDataScope scope = new WfDataScope();
        scope.setTenantId("t1");
        scope.setDataSourceId(DS_ID);
        scope.setAction(DataScopeAction.READ);
        scope.setSubjectType(type);
        scope.setSubjectKey(key);
        scope.setScopeType(scopeType);
        scope.setScopeColumn(column);
        scope.setScopeValue(value);
        return scope;
    }

    private WfDataScope roleRule(String roleCode, DataScopeType type) {
        return rule(DataScopeSubject.ROLE, roleCode, type, null, null);
    }

    @Test
    void applyRead_leaves_filter_untouched_when_no_rule_configured() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ);
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
    }

    @Test
    void applyRead_injects_created_by_for_self_scope() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, roleRule("clerk", DataScopeType.SELF));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertTrue(req.getFilter().contains("\"status\":\"paid\""), "客户端筛选须保留（交集而非覆盖）");
        assertTrue(req.getFilter().contains("\"created_by\":\"200\""), req.getFilter());
    }

    @Test
    void applyRead_self_scope_overrides_client_supplied_created_by() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, roleRule("clerk", DataScopeType.SELF));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"created_by\":\"999\"}");

        service.applyRead(DS_ID, req);

        assertTrue(req.getFilter().contains("\"created_by\":\"200\""), req.getFilter());
        assertFalse(req.getFilter().contains("999"), req.getFilter());
    }

    @Test
    void applyRead_preserves_structured_operator_conditions() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, roleRule("clerk", DataScopeType.SELF));
        AggregateRequest req = new AggregateRequest();
        req.setFilter("{\"amount\":{\"op\":\"gt\",\"value\":10}}");

        service.applyRead(DS_ID, req);

        assertTrue(req.getFilter().contains("\"op\":\"gt\""), req.getFilter());
        assertTrue(req.getFilter().contains("\"created_by\""), req.getFilter());
    }

    @Test
    void applyRead_composes_scope_into_structured_and_group() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, roleRule("clerk", DataScopeType.SELF));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"logic\":\"AND\",\"conditions\":[{\"column\":\"status\",\"op\":\"eq\",\"value\":\"paid\"}]}");

        service.applyRead(DS_ID, req);

        // 三个 SQL 生成器见到 conditions 就只走结构化分支并忽略顶层键，
        // 所以范围条件必须进 conditions，挂在顶层等于没施加
        assertTrue(req.getFilter().contains("\"column\":\"created_by\""), req.getFilter());
        assertTrue(req.getFilter().contains("\"value\":\"200\""), req.getFilter());
        assertTrue(req.getFilter().contains("\"status\""), req.getFilter());
    }

    @Test
    void applyRead_rejects_or_group_instead_of_silently_narrowing_it() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, roleRule("clerk", DataScopeType.SELF));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"logic\":\"OR\",\"conditions\":["
                + "{\"column\":\"status\",\"op\":\"eq\",\"value\":\"paid\"},"
                + "{\"column\":\"channel\",\"op\":\"eq\",\"value\":\"web\"}]}");

        BusinessException ex = assertThrows(BusinessException.class, () -> service.applyRead(DS_ID, req));

        assertEquals(400, ex.getCode());
        assertTrue(ex.getMessage().contains("OR"), ex.getMessage());
    }

    @Test
    void applyRead_keeps_or_group_when_no_scope_applies() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ);
        BizDataQueryRequest req = new BizDataQueryRequest();
        String orFilter = "{\"logic\":\"OR\",\"conditions\":[{\"column\":\"status\",\"op\":\"eq\",\"value\":\"paid\"}]}";
        req.setFilter(orFilter);

        service.applyRead(DS_ID, req);

        assertEquals(orFilter, req.getFilter(), "不受限的请求不该被改写");
    }

    @Test
    void applyRead_custom_scope_resolves_user_id_template() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ,
                rule(DataScopeSubject.ROLE, "clerk", DataScopeType.CUSTOM, "owner_id", "{userId}"));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertTrue(req.getFilter().contains("\"owner_id\":\"200\""), req.getFilter());
    }

    @Test
    void applyRead_custom_scope_resolves_org_id_template() {
        LoginUser loginUser = new LoginUser(200L, "u200", null, List.of("clerk"), Set.of(), true);
        loginUser.setOrgId(77L);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities()));
        stubRules(DataScopeAction.READ,
                rule(DataScopeSubject.ROLE, "clerk", DataScopeType.CUSTOM, "dept_id", "{orgId}"));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertTrue(req.getFilter().contains("\"dept_id\":\"77\""), req.getFilter());
    }

    @Test
    void applyRead_all_scope_is_permissive() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, roleRule("clerk", DataScopeType.ALL));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
    }

    @Test
    void applyRead_takes_most_permissive_rule_across_roles() {
        loginAs(200L, "u200", List.of("clerk", "auditor"));
        stubRules(DataScopeAction.READ, roleRule("clerk", DataScopeType.SELF), roleRule("auditor", DataScopeType.ALL));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertFalse(req.getFilter() != null && req.getFilter().contains("created_by"), String.valueOf(req.getFilter()));
    }

    @Test
    void applyRead_skips_lookup_for_admin() {
        loginAs(1L, "admin", List.of("ROLE_ADMIN"));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        verify(repository, never()).findByTenantIdAndDataSourceIdAndAction(any(), any(), any());
    }

    @Test
    void applyRead_queries_by_tenant_datasource_and_action() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ);

        service.applyRead(DS_ID, new BizDataQueryRequest());

        ArgumentCaptor<String> tenant = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> ds = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<DataScopeAction> action = ArgumentCaptor.forClass(DataScopeAction.class);
        verify(repository).findByTenantIdAndDataSourceIdAndAction(tenant.capture(), ds.capture(), action.capture());
        assertEquals("t1", tenant.getValue());
        assertEquals(DS_ID, ds.getValue());
        assertEquals(DataScopeAction.READ, action.getValue());
    }

    @Test
    void applyRead_does_not_match_write_axis_rules() {
        loginAs(200L, "u200", List.of("clerk"));
        WfDataScope writeRule = roleRule("clerk", DataScopeType.SELF);
        writeRule.setAction(DataScopeAction.WRITE);
        when(repository.findByTenantIdAndDataSourceIdAndAction("t1", DS_ID, DataScopeAction.WRITE))
                .thenReturn(List.of(writeRule));
        when(repository.findByTenantIdAndDataSourceIdAndAction("t1", DS_ID, DataScopeAction.READ))
                .thenReturn(List.of());
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
    }

    @Test
    void apply_WRITE_injects_its_own_condition() {
        loginAs(200L, "u200", List.of("clerk"));
        WfDataScope writeRule = roleRule("clerk", DataScopeType.SELF);
        writeRule.setAction(DataScopeAction.WRITE);
        stubRules(DataScopeAction.WRITE, writeRule);
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.apply(DS_ID, DataScopeAction.WRITE, req);

        assertTrue(req.getFilter().contains("\"created_by\":\"200\""), req.getFilter());
    }

    @Test
    void subject_axis_USER_rule_matches_only_that_user() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, rule(DataScopeSubject.USER, "200", DataScopeType.SELF, null, null));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertTrue(req.getFilter().contains("\"created_by\":\"200\""), req.getFilter());
    }

    @Test
    void subject_axis_USER_rule_of_other_user_does_not_match() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, rule(DataScopeSubject.USER, "201", DataScopeType.SELF, null, null));
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setFilter("{\"status\":\"paid\"}");

        service.applyRead(DS_ID, req);

        assertEquals("{\"status\":\"paid\"}", req.getFilter());
    }

    @Test
    void subject_axis_ORG_rule_matches_user_org_id() {
        LoginUser loginUser = new LoginUser(200L, "u200", null, List.of("clerk"), Set.of(), true);
        loginUser.setOrgId(77L);
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities()));
        stubRules(DataScopeAction.READ,
                rule(DataScopeSubject.ORG, "77", DataScopeType.CUSTOM, "dept_id", "{orgId}"));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertTrue(req.getFilter().contains("\"dept_id\":\"77\""), req.getFilter());
    }

    @Test
    void subject_axis_MEMBER_GROUP_rule_matches() {
        loginAs(200L, "u200", List.of("clerk"));
        when(memberRepository.findByUserIdAndIsDeleted(200L, 0)).thenReturn(List.of(memberGroup(9L)));
        stubRules(DataScopeAction.READ,
                rule(DataScopeSubject.MEMBER_GROUP, "9", DataScopeType.SELF, null, null));
        BizDataQueryRequest req = new BizDataQueryRequest();

        service.applyRead(DS_ID, req);

        assertTrue(req.getFilter().contains("\"created_by\":\"200\""), req.getFilter());
    }

    private SysMemberGroupMember memberGroup(Long groupId) {
        SysMemberGroupMember member = new SysMemberGroupMember();
        member.setGroupId(groupId);
        return member;
    }

    @Test
    void applyRead_custom_scope_without_column_fails_closed() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ,
                rule(DataScopeSubject.ROLE, "clerk", DataScopeType.CUSTOM, "  ", "{userId}"));
        BizDataQueryRequest req = new BizDataQueryRequest();

        BusinessException e = assertThrows(BusinessException.class, () -> service.applyRead(DS_ID, req));
        assertTrue(e.getMessage().contains("列"), e.getMessage());
    }

    @Test
    void applyRead_rejects_illegal_column_name_before_reaching_sql() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ, rule(DataScopeSubject.ROLE, "clerk", DataScopeType.CUSTOM,
                "owner_id; DROP TABLE wf_biz_x", "{userId}"));
        BizDataQueryRequest req = new BizDataQueryRequest();

        BusinessException e = assertThrows(BusinessException.class, () -> service.applyRead(DS_ID, req));
        assertTrue(e.getMessage().contains("列"), e.getMessage());
    }

    @Test
    void applyRead_rejects_unknown_template_variable() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ,
                rule(DataScopeSubject.ROLE, "clerk", DataScopeType.CUSTOM, "owner_id", "{nonexistent}"));
        BizDataQueryRequest req = new BizDataQueryRequest();

        BusinessException e = assertThrows(BusinessException.class, () -> service.applyRead(DS_ID, req));
        assertTrue(e.getMessage().contains("nonexistent"), e.getMessage());
    }

    @Test
    void applyRead_rejects_blank_resolved_value() {
        LoginUser loginUser = new LoginUser(200L, "u200", null, List.of("clerk"), Set.of(), true);
        // orgId 未设置（null）→ {orgId} 解析为空 → 空值条件会匹配不到数据但也可能是配置错误，拒绝而非静默放行
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities()));
        stubRules(DataScopeAction.READ,
                rule(DataScopeSubject.ROLE, "clerk", DataScopeType.CUSTOM, "dept_id", "{orgId}"));
        BizDataQueryRequest req = new BizDataQueryRequest();

        BusinessException e = assertThrows(BusinessException.class, () -> service.applyRead(DS_ID, req));
        assertTrue(e.getMessage().contains("orgId"), e.getMessage());
    }

    @Test
    void applyRead_throws_when_tenant_missing() {
        TenantContext.clear();
        loginAs(200L, "u200", List.of("clerk"));

        assertThrows(RuntimeException.class, () -> service.applyRead(DS_ID, new BizDataQueryRequest()));
    }

    @Test
    void subjects_of_user_lists_role_user_org_and_member_group() {
        LoginUser loginUser = new LoginUser(200L, "u200", null, List.of("clerk"), Set.of(), true);
        loginUser.setOrgId(77L);

        Set<String> subjects = service.subjectsOf(loginUser);

        assertEquals(Set.of("ROLE:clerk", "USER:200", "ORG:77"), subjects);
    }

    @Test
    void effectiveRule_is_the_most_permissive_matched_rule() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ,
                roleRule("clerk", DataScopeType.SELF),
                rule(DataScopeSubject.USER, "200", DataScopeType.CUSTOM, "owner_id", "{userId}"));

        WfDataScope effective = service.effectiveRule(DS_ID, DataScopeAction.READ,
                (LoginUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal());

        assertEquals(DataScopeType.CUSTOM, effective.getScopeType());
    }

    @Test
    void matchedRules_returns_every_hit_including_overridden_ones() {
        loginAs(200L, "u200", List.of("clerk"));
        stubRules(DataScopeAction.READ,
                roleRule("clerk", DataScopeType.SELF),
                roleRule("auditor", DataScopeType.ALL),
                rule(DataScopeSubject.USER, "999", DataScopeType.ALL, null, null));

        List<WfDataScope> matched = service.matchedRules(DS_ID, DataScopeAction.READ,
                (LoginUser) SecurityContextHolder.getContext().getAuthentication().getPrincipal());

        assertEquals(1, matched.size());
    }

    // ==================== 配置写入校验 ====================

    @Test
    void save_overwrites_same_subject_and_action() {
        WfDataScope existing = roleRule("clerk", DataScopeType.SELF);
        when(repository.findByTenantIdAndDataSourceIdAndActionAndSubjectTypeAndSubjectKey(
                "t1", DS_ID, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk"))
                .thenReturn(java.util.Optional.of(existing));
        when(repository.save(any(WfDataScope.class))).thenAnswer(i -> i.getArgument(0));

        WfDataScope saved = service.save(DS_ID, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk",
                DataScopeType.ALL, null, null);

        assertEquals(DataScopeType.ALL, saved.getScopeType());
        assertEquals(saved, existing);
    }

    @Test
    void save_custom_requires_column_and_value() {
        BusinessException e = assertThrows(BusinessException.class, () -> service.save(DS_ID,
                DataScopeAction.READ, DataScopeSubject.ROLE, "clerk", DataScopeType.CUSTOM, null, null));
        assertTrue(e.getMessage().contains("列"), e.getMessage());
    }

    @Test
    void save_non_role_subject_requires_numeric_key() {
        BusinessException e = assertThrows(BusinessException.class, () -> service.save(DS_ID,
                DataScopeAction.READ, DataScopeSubject.USER, "u200", DataScopeType.SELF, null, null));
        assertTrue(e.getMessage().contains("数字"), e.getMessage());
        verify(repository, never()).save(any());
    }

    @Test
    void save_rejects_blank_subject_key() {
        assertThrows(BusinessException.class, () -> service.save(DS_ID,
                DataScopeAction.READ, DataScopeSubject.ROLE, "  ", DataScopeType.SELF, null, null));
    }

    @Test
    void save_self_scope_clears_stale_column_and_value() {
        WfDataScope existing = rule(DataScopeSubject.ROLE, "clerk", DataScopeType.CUSTOM, "owner_id", "{userId}");
        when(repository.findByTenantIdAndDataSourceIdAndActionAndSubjectTypeAndSubjectKey(
                "t1", DS_ID, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk"))
                .thenReturn(java.util.Optional.of(existing));
        when(repository.save(any(WfDataScope.class))).thenAnswer(i -> i.getArgument(0));

        WfDataScope saved = service.save(DS_ID, DataScopeAction.READ, DataScopeSubject.ROLE, "clerk",
                DataScopeType.SELF, null, null);

        assertEquals(null, saved.getScopeColumn());
        assertEquals(null, saved.getScopeValue());
    }
}
