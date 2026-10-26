package com.workflow.api.controller;

import com.workflow.api.dto.RoleDataPermissionDTO;
import com.workflow.api.dto.RoleDataPermissionSaveRequest;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.datasource.scope.RoleDataPermissionService;
import com.workflow.framework.security.domain.LoginUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Map;
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

/** 角色数据权限端点的管理员门禁与请求映射（v3 单轴：授权即赋予可见行）。 */
class RoleDataPermissionControllerTest {

    private RoleDataPermissionService service;
    private RoleDataPermissionController controller;

    @BeforeEach
    void setUp() {
        service = mock(RoleDataPermissionService.class);
        controller = new RoleDataPermissionController(service);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    private void login(List<String> roles) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new LoginUser(1L, "u", null, roles, Set.of(), true), null));
    }

    @Test
    void list_requires_admin() {
        login(List.of("clerk"));

        BusinessException e = assertThrows(BusinessException.class, () -> controller.list(2L));

        assertEquals(403, e.getCode());
        verify(service, never()).list(any());
    }

    @Test
    void list_maps_view_fields() {
        login(List.of("admin"));
        when(service.list(2L)).thenReturn(List.of(new RoleDataPermissionService.View(
                10L, "一线可见", "备注", List.of(Map.of("column", "owner_id", "op", "eq", "value", "{userId}")),
                List.of("ds-1"), true, List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE")))));

        RoleDataPermissionDTO dto = controller.list(2L).getData().get(0);

        assertEquals(10L, dto.getPermissionId());
        assertEquals("一线可见", dto.getPermissionName());
        assertEquals(List.of("ds-1"), dto.getDataSourceIds());
        assertTrue(dto.isGranted());
        assertEquals(List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE")),
                dto.getFieldPolicies());
    }

    @Test
    void list_maps_ungranted_flag() {
        login(List.of("admin"));
        when(service.list(2L)).thenReturn(List.of(new RoleDataPermissionService.View(
                10L, "一线可见", null, List.of(), List.of("ds-1"), false, List.of())));

        assertFalse(controller.list(2L).getData().get(0).isGranted());
    }

    @Test
    void save_requires_admin() {
        login(List.of("clerk"));

        BusinessException e = assertThrows(BusinessException.class,
                () -> controller.save(2L, new RoleDataPermissionSaveRequest()));

        assertEquals(403, e.getCode());
        verify(service, never()).save(any(), any());
    }

    @Test
    void save_maps_items_and_treats_missing_as_empty() {
        login(List.of("ROLE_ADMIN"));
        RoleDataPermissionSaveRequest request = new RoleDataPermissionSaveRequest();
        RoleDataPermissionSaveRequest.Item item = new RoleDataPermissionSaveRequest.Item();
        item.setPermissionId(10L);
        request.setItems(List.of(item));

        controller.save(2L, request);

        verify(service).save(eq(2L), eq(List.of(new RoleDataPermissionService.Item(10L))));

        RoleDataPermissionSaveRequest empty = new RoleDataPermissionSaveRequest();
        controller.save(2L, empty);

        verify(service).save(2L, List.of());
    }

    /** 授权级策略随条目透传给服务（保存期校验与落库在服务层，controller 只做映射）。 */
    @Test
    void save_maps_grant_field_policies() {
        login(List.of("admin"));
        RoleDataPermissionSaveRequest request = new RoleDataPermissionSaveRequest();
        RoleDataPermissionSaveRequest.Item item = new RoleDataPermissionSaveRequest.Item();
        item.setPermissionId(10L);
        item.setFieldPolicies(List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE")));
        request.setItems(List.of(item));

        controller.save(2L, request);

        verify(service).save(eq(2L), eq(List.of(new RoleDataPermissionService.Item(10L,
                List.of(Map.of("column", "phone", "policy", "MASK", "rule", "PHONE"))))));
    }
}
