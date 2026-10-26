package com.workflow.engine.page;

import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.engine.page.repository.PageDefinitionRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.framework.security.permission.PermissionEvaluator;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
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
    private PageDefinitionRepository pageDefRepository;
    private TenantProvider tenantProvider;
    private PageAccessGuard guard;

    private SysMenu menuA;
    private SysMenu menuB;

    @BeforeEach
    void setUp() {
        menuRepository = mock(SysMenuRepository.class);
        permissionEvaluator = mock(PermissionEvaluator.class);
        pageDefRepository = mock(PageDefinitionRepository.class);
        tenantProvider = mock(TenantProvider.class);
        guard = new PageAccessGuard(menuRepository, permissionEvaluator, pageDefRepository, tenantProvider);

        menuA = buildMenu(1L, 1);
        menuB = buildMenu(2L, 1);

        // A5 发布端闸缺省桩：本例库页面已发布到司机端(7)——端隔离历史用例语义不变，
        // 发布端闸用例各自覆写 findFirst 返回值
        lenient().when(tenantProvider.getTenantId()).thenReturn("default");
        lenient().when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "default", "leave-query", "PUBLISHED"))
                .thenReturn(Optional.of(publishedRow("7")));
    }

    private PageDefinition publishedRow(String targetClients) {
        PageDefinition p = new PageDefinition();
        p.setId("row-1");
        p.setTenantId("default");
        p.setName("请假查询");
        p.setKey("leave-query");
        p.setType("PAGE");
        p.setStatus("PUBLISHED");
        p.setTargetClients(targetClients);
        return p;
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    /** 以「带端上下文的登录态」执行请求（J4：guard 依据 token claim 建立的端上下文）。 */
    private void loginAs(Long clientId) {
        LoginUser loginUser = new LoginUser(1L, "u", null, List.of(), Set.of(), true, clientId, "MP");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, List.of()));
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

    // ------------------------------------------------------------ J4 端上下文隔离

    @Test
    void nonPortalClient_otherClientMenusInvisible_throws404() {
        // 司机端(7) token：页面只挂了 portal(1) 菜单 → 对本端而言「未挂接」，404 不暴露存在
        loginAs(7L);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA)); // clientId 默认 1

        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面不存在或未挂接菜单");
    }

    @Test
    void nonPortalClient_ownClientMenuStillGrants() {
        loginAs(7L);
        menuB.setClientId(7L);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB)); // A 属 portal，被端过滤剔除
        when(permissionEvaluator.hasPermission("page:read:leave-query")).thenReturn(true);

        assertThatCode(() -> guard.assertPageAccess("leave-query")).doesNotThrowAnyException();
        // 仅本端菜单 B 触发一次权限检查
        verify(permissionEvaluator, org.mockito.Mockito.times(1)).hasPermission("page:read:leave-query");
    }

    @Test
    void portalClient_considersAllClientMenus_zeroBreakage() {
        // client=1 全量查（PageAccessGuard 裁定）：他人端菜单也参与 OR
        loginAs(1L);
        menuB.setClientId(7L);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuB));
        when(permissionEvaluator.hasPermission("page:read:leave-query")).thenReturn(true);

        assertThatCode(() -> guard.assertPageAccess("leave-query")).doesNotThrowAnyException();
    }

    // ------------------------------------------------------------ B5 端空态安全（真实 evaluator，不 mock 绕过语义）

    /** 用真实 PermissionEvaluator 重建 guard：钉「空端态不放行」端到端语义 */
    private void withRealEvaluator() {
        guard = new PageAccessGuard(menuRepository,
                new com.workflow.framework.security.permission.PermissionEvaluator(),
                pageDefRepository, tenantProvider);
    }

    private void loginAsWithGrants(Long clientId, List<String> roles, Set<String> permissions) {
        LoginUser loginUser = new LoginUser(1L, "u", null, roles, permissions, true, clientId, "MP");
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(loginUser, null, List.of()));
    }

    @Test
    void nonPortalEmptyState_pageWithOwnClientMenu_still403() {
        withRealEvaluator();
        loginAsWithGrants(7L, List.of(), Set.of()); // LoginUserService 修复后的 admin 端空态产物
        menuB.setClientId(7L); // 页面在本端有挂接菜单——端过滤剔除不了，授权段必须拦住
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));

        // roles=[] → 无 ROLE_ADMIN 绕过；permissions=[] → 无码命中 → 403，页面 API 不放行
        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("无页面访问权限");
    }

    @Test
    void portalAdmin_withRealEvaluator_grants_zeroBreakage() {
        withRealEvaluator();
        loginAsWithGrants(1L, List.of("ROLE_ADMIN"), Set.of());
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA));

        // portal 端 admin 绕过语义保持（存量零破坏——修复只剥跨端携带，不动端内特权）
        assertThatCode(() -> guard.assertPageAccess("leave-query")).doesNotThrowAnyException();
    }

    // ------------------------------------------------------------ A5 发布目标端闸

    @Test
    void nonPortal_notPublishedToClient_throws404_sameWordingAsUnbound() {
        loginAs(7L);
        menuB.setClientId(7L); // 本端有挂接菜单（端过滤剔除不了）
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "default", "leave-query", "PUBLISHED"))
                .thenReturn(Optional.of(publishedRow("1"))); // 资产仅发布到 portal

        // 未发布到本端 → 404 且与「未挂接」同文案：不暴露资产存在性
        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面不存在或未挂接菜单");
        // 闸必须走在授权段之前
        verify(permissionEvaluator, never()).hasPermission(anyString());
    }

    @Test
    void nonPortal_legacyNullTargetClients_treatedAsPortalOnly_throws404() {
        loginAs(7L);
        menuB.setClientId(7L);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "default", "leave-query", "PUBLISHED"))
                .thenReturn(Optional.of(publishedRow(null))); // 存量 PUBLISHED 行

        // NULL=缺省仅 portal（与 publish 归一口径同轨）：存量行在他端一律不放行
        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面不存在或未挂接菜单");
    }

    @Test
    void nonPortal_noPublishedRow_throws404() {
        loginAs(7L);
        menuB.setClientId(7L);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "default", "leave-query", "PUBLISHED"))
                .thenReturn(Optional.empty()); // 只有 DRAFT 稿

        // 本端挂了菜单但从未发布 → 同样 404（发布闸覆盖「未发布」与「未发到本端」两种空态）
        assertThatThrownBy(() -> guard.assertPageAccess("leave-query"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("页面不存在或未挂接菜单");
    }

    @Test
    void nonPortal_publishedToClient_passesGate_toAuthStage() {
        loginAs(7L);
        menuB.setClientId(7L);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA, menuB));
        when(pageDefRepository.findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
                "default", "leave-query", "PUBLISHED"))
                .thenReturn(Optional.of(publishedRow("1,7")));
        when(permissionEvaluator.hasPermission("page:read:leave-query")).thenReturn(true);

        assertThatCode(() -> guard.assertPageAccess("leave-query")).doesNotThrowAnyException();
    }

    @Test
    void portalClient_skipsPublishGate_zeroBreakage() {
        loginAs(1L);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(menuA));
        when(permissionEvaluator.hasPermission("page:read:leave-query")).thenReturn(true);

        assertThatCode(() -> guard.assertPageAccess("leave-query")).doesNotThrowAnyException();
        // portal 端不查发布表：存量链路的 DB 触点与放行结果都零变化
        verify(pageDefRepository, never())
                .findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(anyString(), anyString(), anyString());
    }
}
