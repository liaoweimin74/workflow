package com.workflow.api.controller;

import com.workflow.api.dto.MountMenuRequest;
import com.workflow.api.dto.PageMenuResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.domain.entity.SysRoleMenu;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.repository.SysRoleMenuRepository;
import com.workflow.system.repository.SysRoleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * PageMenuController 单元测试。
 * 验证：
 * - mount-menu：仅 PUBLISHED 可挂接（DRAFT → 400）、每次调用创建新菜单（多挂接）、
 *   name 缺省用页面 name、parentId 可空
 * - getMenus：按 key 返回全部关联菜单（数组）、未挂接返回空数组、页面不存在 → 404
 * - unmountMenu：软删（is_deleted=1）、不存在/已软删 → 404
 */
class PageMenuControllerTest {

    private PageDefinitionService pageDefService;
    private SysMenuRepository menuRepository;
    private SysRoleRepository roleRepository;
    private SysRoleMenuRepository roleMenuRepository;
    private PageMenuController controller;

    private PageDefinition publishedPage;

    @BeforeEach
    void setUp() {
        pageDefService = mock(PageDefinitionService.class);
        menuRepository = mock(SysMenuRepository.class);
        roleRepository = mock(SysRoleRepository.class);
        roleMenuRepository = mock(SysRoleMenuRepository.class);
        controller = new PageMenuController(pageDefService, menuRepository, roleRepository, roleMenuRepository);

        publishedPage = new PageDefinition();
        publishedPage.setId("p1");
        publishedPage.setKey("leave-query");
        publishedPage.setName("请假查询");
        publishedPage.setType("VIEW");
        publishedPage.setStatus("PUBLISHED");
    }

    private SysMenu buildMenu(Long id, String name, Long parentId) {
        SysMenu m = new SysMenu();
        m.setId(id);
        m.setMenuName(name);
        m.setPath("/page/leave-query");
        m.setPermission("page:read:leave-query");
        m.setParentId(parentId);
        m.setStatus(1);
        m.setIsDeleted(0);
        return m;
    }

    // ---------- mount-menu ----------

    @Test
    void mountMenu_createsNewMenuWithRequestFields() {
        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });

        MountMenuRequest req = new MountMenuRequest();
        req.setName("考勤请假");
        req.setParentId(2L);

        R<PageMenuResponse.MenuItem> result = controller.mountMenu("p1", req);

        assertThat(result.getCode()).isEqualTo(200);
        PageMenuResponse.MenuItem item = result.getData();
        assertThat(item.getMenuId()).isEqualTo(101L);
        assertThat(item.getMenuName()).isEqualTo("考勤请假");
        assertThat(item.getPath()).isEqualTo("/page/leave-query");
        assertThat(item.getParentId()).isEqualTo(2L);
        assertThat(item.getPermission()).isEqualTo("page:read:leave-query");

        verify(menuRepository).save(any(SysMenu.class));
    }

    @Test
    void mountMenu_nameDefaultsToPageName() {
        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> inv.getArgument(0));

        MountMenuRequest req = new MountMenuRequest();
        req.setParentId(null);

        R<PageMenuResponse.MenuItem> result = controller.mountMenu("p1", req);

        assertThat(result.getData().getMenuName()).isEqualTo("请假查询");
        assertThat(result.getData().getParentId()).isNull();
    }

    @Test
    void mountMenu_multipleMounts_createSeparateMenus() {
        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });

        MountMenuRequest reqA = new MountMenuRequest();
        reqA.setName("考勤请假");
        reqA.setParentId(2L);
        MountMenuRequest reqB = new MountMenuRequest();
        reqB.setName("人事请假");
        reqB.setParentId(1L);

        controller.mountMenu("p1", reqA);
        controller.mountMenu("p1", reqB);

        // 每次挂接都 save 一次，不查重、不合并
        verify(menuRepository, org.mockito.Mockito.times(2)).save(any(SysMenu.class));
        verify(menuRepository, never()).findByPathAndIsDeleted(org.mockito.ArgumentMatchers.anyString(),
                org.mockito.ArgumentMatchers.anyInt());
    }

    @Test
    void mountMenu_rejectsDraft() {
        publishedPage.setStatus("DRAFT");
        when(pageDefService.getById("p1")).thenReturn(publishedPage);

        MountMenuRequest req = new MountMenuRequest();

        assertThatThrownBy(() -> controller.mountMenu("p1", req))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("仅可挂接已发布的页面");

        verify(menuRepository, never()).save(any(SysMenu.class));
    }

    // ---------- getMenus ----------

    @Test
    void getMenus_returnsAllAssociatedMenus() {
        when(pageDefService.getPublishedByKey("leave-query")).thenReturn(publishedPage);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0))
                .thenReturn(List.of(buildMenu(100L, "人事请假", 1L), buildMenu(101L, "考勤请假", 2L)));

        R<PageMenuResponse> result = controller.getMenus("leave-query");

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getItems()).hasSize(2);
        assertThat(result.getData().getItems())
                .extracting(PageMenuResponse.MenuItem::getMenuId)
                .containsExactlyInAnyOrder(100L, 101L);
    }

    @Test
    void getMenus_emptyWhenNotMounted() {
        when(pageDefService.getPublishedByKey("leave-query")).thenReturn(publishedPage);
        when(menuRepository.findByPathAndIsDeleted("/page/leave-query", 0)).thenReturn(List.of());

        R<PageMenuResponse> result = controller.getMenus("leave-query");

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getItems()).isEmpty();
    }

    @Test
    void getMenus_pageNotFound_throws404() {
        when(pageDefService.getPublishedByKey("ghost")).thenThrow(new BusinessException(404, "页面未发布或不存在: ghost"));

        assertThatThrownBy(() -> controller.getMenus("ghost"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("未发布或不存在");
    }

    // ---------- unmountMenu ----------

    @Test
    void unmountMenu_softDeletesMenu() {
        SysMenu menu = buildMenu(100L, "人事请假", 1L);
        when(menuRepository.findById(100L)).thenReturn(Optional.of(menu));

        R<Void> result = controller.unmountMenu(100L);

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(menu.getIsDeleted()).isEqualTo(1);
        verify(menuRepository).save(menu);
    }

    @Test
    void unmountMenu_notFound_throws404() {
        when(menuRepository.findById(999L)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.unmountMenu(999L))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("菜单不存在或已解除");

        verify(menuRepository, never()).save(any(SysMenu.class));
    }

    // ---------- 管理员挂接自动授权 ROLE_ADMIN ----------

    @Test
    void mountMenu_byAdmin_autoGrantsToAdminRole() {
        // 以 ROLE_ADMIN 登录
        LoginUser admin = new LoginUser(1L, "admin", "pwd",
                List.of("ROLE_ADMIN"), java.util.Set.of(), true);
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        admin, null, admin.getAuthorities()));

        SysRole adminRole = new SysRole();
        adminRole.setId(10L);
        adminRole.setRoleCode("ROLE_ADMIN");

        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });
        when(roleRepository.findByRoleCode("ROLE_ADMIN")).thenReturn(Optional.of(adminRole));
        when(roleMenuRepository.findByRoleId(10L)).thenReturn(List.of());

        MountMenuRequest req = new MountMenuRequest();

        controller.mountMenu("p1", req);

        // 新菜单应授权给 ROLE_ADMIN
        org.mockito.ArgumentCaptor<SysRoleMenu> captor =
                org.mockito.ArgumentCaptor.forClass(SysRoleMenu.class);
        verify(roleMenuRepository).save(captor.capture());
        assertThat(captor.getValue().getRoleId()).isEqualTo(10L);
        assertThat(captor.getValue().getMenuId()).isEqualTo(101L);

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }

    @Test
    void mountMenu_byNonAdmin_doesNotAutoGrant() {
        LoginUser user = new LoginUser(2L, "test", "pwd",
                List.of("ROLE_USER"), java.util.Set.of(), true);
        org.springframework.security.core.context.SecurityContextHolder.getContext()
                .setAuthentication(new org.springframework.security.authentication.UsernamePasswordAuthenticationToken(
                        user, null, user.getAuthorities()));

        when(pageDefService.getById("p1")).thenReturn(publishedPage);
        when(menuRepository.save(any(SysMenu.class))).thenAnswer(inv -> {
            SysMenu m = inv.getArgument(0);
            m.setId(101L);
            return m;
        });

        MountMenuRequest req = new MountMenuRequest();

        controller.mountMenu("p1", req);

        verify(roleRepository, never()).findByRoleCode(any());
        verify(roleMenuRepository, never()).save(any(SysRoleMenu.class));

        org.springframework.security.core.context.SecurityContextHolder.clearContext();
    }
}
