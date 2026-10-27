package com.workflow.api.controller;

import com.workflow.api.dto.DataScopeEffectiveVO;
import com.workflow.api.dto.DataScopeSaveRequest;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.DataSourceDefinitionService;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.datasource.scope.DataScopeAction;
import com.workflow.engine.datasource.scope.DataScopeService;
import com.workflow.engine.datasource.scope.DataScopeSubject;
import com.workflow.engine.datasource.scope.DataScopeType;
import com.workflow.engine.datasource.scope.WfDataScope;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.framework.security.service.LoginUserService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 数据范围配置端点的管理员门禁、悬空数据源校验与生效预览。
 */
class DataScopeControllerTest {

    private DataScopeService scopeService;
    private DataSourceDefinitionService dsService;
    private LoginUserService loginUserService;
    private DataScopeController controller;

    @BeforeEach
    void setUp() {
        scopeService = mock(DataScopeService.class);
        dsService = mock(DataSourceDefinitionService.class);
        loginUserService = mock(LoginUserService.class);
        controller = new DataScopeController(scopeService, dsService, loginUserService);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void login(List<String> roles) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new LoginUser(1L, "u", null, roles, Set.of(), true), null));
    }

    private WfDataScope roleRule(Long id, String roleCode, DataScopeType type) {
        WfDataScope scope = new WfDataScope();
        scope.setId(id);
        scope.setDataSourceId("ds-1");
        scope.setAction(DataScopeAction.READ);
        scope.setSubjectType(DataScopeSubject.ROLE);
        scope.setSubjectKey(roleCode);
        scope.setScopeType(type);
        return scope;
    }

    @Test
    void list_returns_dto_without_tenant_fields() {
        login(List.of("ROLE_ADMIN"));
        when(scopeService.list("ds-1")).thenReturn(List.of(roleRule(5L, "clerk", DataScopeType.SELF)));

        var resp = controller.list("ds-1").getData();

        assertEquals(1, resp.size());
        assertEquals(5L, resp.get(0).getId());
        assertEquals(DataScopeSubject.ROLE, resp.get(0).getSubjectType());
        assertEquals("clerk", resp.get(0).getSubjectKey());
        assertEquals(DataScopeAction.READ, resp.get(0).getAction());
        assertEquals(DataScopeType.SELF, resp.get(0).getScopeType());
    }

    @Test
    void list_rejected_for_non_admin() {
        login(List.of("clerk"));

        BusinessException e = assertThrows(BusinessException.class, () -> controller.list("ds-1"));
        assertEquals(403, e.getCode());
        verify(scopeService, never()).list(any());
    }

    @Test
    void list_rejected_without_login() {
        assertThrows(BusinessException.class, () -> controller.list("ds-1"));
    }

    @Test
    void save_verifies_data_source_exists_first() {
        login(List.of("admin"));
        when(dsService.getById("ds-1")).thenReturn(new DataSourceDefinition());
        when(scopeService.save(eq("ds-1"), eq(DataScopeAction.READ), eq(DataScopeSubject.ROLE), eq("clerk"),
                eq(DataScopeType.CUSTOM), eq("owner_id"), eq("{userId}")))
                .thenReturn(roleRule(9L, "clerk", DataScopeType.CUSTOM));
        DataScopeSaveRequest req = saveRequest("ds-1", "clerk", DataScopeType.CUSTOM);
        req.setScopeColumn("owner_id");
        req.setScopeValue("{userId}");

        assertEquals(9L, controller.save(req).getData().getId());
        verify(dsService).getById("ds-1");
    }

    @Test
    void request_defaults_to_READ_ROLE_axis() {
        // 缺省即「某角色读」：界面少两个字段；显式传 null 则在 service 层 400，不会静默按某轴执行
        DataScopeSaveRequest req = new DataScopeSaveRequest();

        assertEquals(DataScopeAction.READ, req.getAction());
        assertEquals(DataScopeSubject.ROLE, req.getSubjectType());
    }

    @Test
    void save_refuses_dangling_data_source() {
        login(List.of("ROLE_ADMIN"));
        when(dsService.getById("nope")).thenThrow(new BusinessException(404, "数据源不存在: nope"));

        assertThrows(BusinessException.class,
                () -> controller.save(saveRequest("nope", "clerk", DataScopeType.SELF)));
        verify(scopeService, never()).save(any(), any(), any(), any(), any(), any(), any());
    }

    @Test
    void delete_requires_admin() {
        login(List.of("clerk"));

        assertThrows(BusinessException.class, () -> controller.delete(1L));
        verify(scopeService, never()).delete(any());
    }

    // ==================== 生效预览 ====================

    @Test
    void effective_for_current_user_by_default() {
        login(List.of("ROLE_ADMIN"));
        when(dsService.getById("ds-1")).thenReturn(new DataSourceDefinition());
        when(scopeService.subjectsOf(any())).thenReturn(Set.of("ROLE:admin", "USER:1"));
        when(scopeService.effectiveRule(eq("ds-1"), eq(DataScopeAction.READ), any())).thenReturn(null);
        when(scopeService.conditionFor(eq("ds-1"), eq(DataScopeAction.READ), any())).thenReturn(Map.of());
        when(scopeService.matchedRules(eq("ds-1"), eq(DataScopeAction.READ), any())).thenReturn(List.of());

        DataScopeEffectiveVO vo = controller.effective("ds-1", DataScopeAction.READ, null).getData();

        assertEquals(1L, vo.getUserId());
        assertTrue(vo.isUnrestricted());
        assertNull(vo.getEffectiveRule());
        assertEquals(Set.of("ROLE:admin", "USER:1"), Set.copyOf(vo.getSubjects()));
    }

    @Test
    void effective_resolves_other_user_by_id() {
        login(List.of("admin"));
        when(dsService.getById("ds-1")).thenReturn(new DataSourceDefinition());
        LoginUser target = new LoginUser(200L, "clerk01", null, List.of("clerk"), Set.of(), true);
        when(loginUserService.buildLoginUser(200L)).thenReturn(target);
        when(scopeService.subjectsOf(target)).thenReturn(Set.of("ROLE:clerk", "USER:200"));
        when(scopeService.effectiveRule("ds-1", DataScopeAction.WRITE, target))
                .thenReturn(roleRule(3L, "clerk", DataScopeType.SELF));
        when(scopeService.conditionFor("ds-1", DataScopeAction.WRITE, target))
                .thenReturn(Map.of("created_by", "200"));
        when(scopeService.matchedRules("ds-1", DataScopeAction.WRITE, target))
                .thenReturn(List.of(roleRule(3L, "clerk", DataScopeType.SELF)));

        DataScopeEffectiveVO vo = controller.effective("ds-1", DataScopeAction.WRITE, 200L).getData();

        assertEquals(200L, vo.getUserId());
        assertEquals("clerk01", vo.getUsername());
        assertTrue(!vo.isUnrestricted());
        assertEquals(Map.of("created_by", "200"), vo.getCondition());
        assertEquals(1, vo.getMatchedRules().size());
    }

    @Test
    void effective_rejects_unknown_user() {
        login(List.of("admin"));
        when(dsService.getById("ds-1")).thenReturn(new DataSourceDefinition());
        when(loginUserService.buildLoginUser(999L)).thenReturn(null);

        BusinessException e = assertThrows(BusinessException.class,
                () -> controller.effective("ds-1", DataScopeAction.READ, 999L));
        assertEquals(404, e.getCode());
    }

    @Test
    void effective_rejected_for_non_admin() {
        login(List.of("clerk"));

        BusinessException e = assertThrows(BusinessException.class,
                () -> controller.effective("ds-1", DataScopeAction.READ, null));
        assertEquals(403, e.getCode());
        verify(scopeService, never()).conditionFor(any(), any(), any());
    }

    private DataScopeSaveRequest saveRequest(String dataSourceId, String subjectKey, DataScopeType type) {
        DataScopeSaveRequest req = new DataScopeSaveRequest();
        req.setDataSourceId(dataSourceId);
        req.setSubjectKey(subjectKey);
        req.setScopeType(type);
        return req;
    }
}
