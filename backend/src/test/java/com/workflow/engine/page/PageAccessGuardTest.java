package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PageAccessGuard 单元测试。
 * 验证 OR 语义：
 * - 无任何关联菜单 → 404
 * - 任一菜单有权限 → 放行（OR）
 * - 全部菜单均无权限 → 403
 * - 禁用菜单（status!=1）不参与授权
 */
class PageAccessGuardTest {

    private SysMenuRepository menuRepository;
    private PermissionEvaluator permissionEvaluator;
    private PageAccessGuard guard;

    private SysMenu menuA;
    private SysMenu menuB;

    @BeforeEach
    void setUp() {
        menuRepository = mock(SysMenuRepository.class);
        permissionEvaluator = mock(PermissionEvaluator.class);
        guard = new PageAccessGuard(menuRepository, permissionEvaluator);

        menuA = buildMenu(1L, 1);
        menuB = buildMenu(2L, 1);
    }

    private SysMenu buildMenu(Long id, int status) {
        SysMenu m = new SysMenu();
        m.setId(id);
        m.setPath("/page/leave-query");
        m.setPermission("page:read:leave-query");
        m.setStatus(status);
        m.setIsDeleted(0);
        return m;
    }

    @Test
    void assertPageAccess_noMenu_throws404() {
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(List.of());

        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面不存在或未挂接菜单");
    }

    @Test
    void assertPageAccess_anyMenuGrants_orSemantics() {
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        // 仅菜单 B 有权限 → OR 放行（两次调用，第一次 false 第二次 true）
        when(permissionEvaluator.hasPermission("page:read:leave-query"))
                .thenReturn(false, true);

        assertThatCode(() -> guard.assertPageAccess("leave-query"))
                .doesNotThrowAnyException();

        // 两个启用菜单各触发一次权限检查（第一个 false，第二个 true → OR 放行）
        verify(permissionEvaluator, org.mockito.Mockito.times(2))
                .hasPermission("page:read:leave-query");
    }

    @Test
    void assertPageAccess_allDenied_throws403() {
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        when(permissionEvaluator.hasPermission("page:read:leave-query")).thenReturn(false);

        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("无页面访问权限");
    }

    @Test
    void assertPageAccess_disabledMenusDoNotGrant_throws403() {
        // 两个菜单都被禁用 → 没有可授权的菜单 → 403
        menuA.setStatus(0);
        menuB.setStatus(0);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));

        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("无页面访问权限");

        // 禁用菜单不触发权限检查
        verify(permissionEvaluator, never()).hasPermission(org.mockito.ArgumentMatchers.anyString());
    }

    @Test
    void assertPageAccess_mixedDisabledAndEnabled_grantsViaEnabled() {
        menuA.setStatus(0); // 禁用，不参与
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        when(permissionEvaluator.hasPermission("page:read:leave-query")).thenReturn(true);

        assertThatCode(() -> guard.assertPageAccess("leave-query"))
                .doesNotThrowAnyException();
    }

    @Test
    void assertPageAccess_nullPermissionMenu_skipped() {
        menuA.setPermission(null); // 无权限码，跳过
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA));
        when(permissionEvaluator.hasPermission("page:read:leave-query")).thenReturn(false);

        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("无页面访问权限");
    }
}
