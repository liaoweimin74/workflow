package com.workflow.framework.security.service;

import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.domain.entity.SysRoleMenu;
import com.workflow.system.domain.entity.SysUser;
import com.workflow.system.domain.entity.SysUserRole;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.repository.SysRoleMenuRepository;
import com.workflow.system.repository.SysRoleRepository;
import com.workflow.system.repository.SysUserRepository;
import com.workflow.system.repository.SysUserRoleRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * LoginUser 端上下文单元测试（J4）。
 *
 * <p>权限集合按端过滤（沿用 PageAccessGuard 裁定）：仅非 portal 端隔离
 * ——只认本端菜单的权限码；portal(client=1) 全量查（存量零破坏）。
 */
class LoginUserServiceClientScopeTest {

    private SysUserRepository userRepository;
    private SysUserRoleRepository userRoleRepository;
    private SysRoleRepository roleRepository;
    private SysRoleMenuRepository roleMenuRepository;
    private SysMenuRepository menuRepository;
    private LoginUserService service;

    @BeforeEach
    void setUp() {
        userRepository = mock(SysUserRepository.class);
        userRoleRepository = mock(SysUserRoleRepository.class);
        roleRepository = mock(SysRoleRepository.class);
        roleMenuRepository = mock(SysRoleMenuRepository.class);
        menuRepository = mock(SysMenuRepository.class);
        service = new LoginUserService(userRepository, userRoleRepository, roleRepository,
                roleMenuRepository, menuRepository);

        SysUser user = new SysUser();
        user.setId(9L);
        user.setUsername("driver");
        user.setStatus(1);
        when(userRepository.findById(9L)).thenReturn(Optional.of(user));

        SysUserRole ur = new SysUserRole();
        ur.setUserId(9L);
        ur.setRoleId(5L);
        when(userRoleRepository.findByUserId(9L)).thenReturn(List.of(ur));

        SysRole role = new SysRole();
        role.setId(5L);
        role.setRoleCode("ROLE_DRIVER");
        // 角色挂端（V73 列）：driver 的角色属司机端(7)，与其本端菜单授权(61)一致
        role.setClientId(7L);
        when(roleRepository.findAllById(any())).thenReturn(List.of(role));

        SysRoleMenu rm1 = new SysRoleMenu();
        rm1.setRoleId(5L);
        rm1.setMenuId(61L);
        SysRoleMenu rm2 = new SysRoleMenu();
        rm2.setRoleId(5L);
        rm2.setMenuId(62L);
        when(roleMenuRepository.findByRoleIdIn(any())).thenReturn(List.of(rm1, rm2));

        // 61=司机端(7) 菜单，62=portal(1) 菜单——同一角色跨端授权时权限码只认本端
        when(menuRepository.findAllById(any())).thenReturn(List.of(
                menu(61L, "order:list", 7L),
                menu(62L, "sys:user:list", 1L)));
    }

    private SysMenu menu(Long id, String permission, Long clientId) {
        SysMenu m = new SysMenu();
        m.setId(id);
        m.setPermission(permission);
        m.setClientId(clientId);
        m.setStatus(1);
        return m;
    }

    @Test
    void nonPortalClient_permissionsScopedToOwnClientMenus() {
        LoginUser loginUser = service.buildLoginUser(9L, 7L, "MP");

        assertThat(loginUser.getPermissions()).containsExactly("order:list");
        assertThat(loginUser.getClientId()).isEqualTo(7L);
        assertThat(loginUser.getChannel()).isEqualTo("MP");
    }

    @Test
    void portalClient_keepsAllPermissions_zeroBreakage() {
        LoginUser loginUser = service.buildLoginUser(9L, 1L, "WEB");

        // client=1 全量查（PageAccessGuard 裁定）：存量行为零破坏
        assertThat(loginUser.getPermissions()).containsExactlyInAnyOrder("order:list", "sys:user:list");
        assertThat(loginUser.getClientId()).isEqualTo(1L);
    }

    @Test
    void disabledUser_returnsNull_regardlessOfClient() {
        SysUser disabled = new SysUser();
        disabled.setId(9L);
        disabled.setUsername("driver");
        disabled.setStatus(0);
        when(userRepository.findById(9L)).thenReturn(Optional.of(disabled));

        assertThat(service.buildLoginUser(9L, 7L, "MP")).isNull();
    }

    // ------------------------------------------------------------ B5 端空态安全（roles 同端过滤，封 admin 跨端绕过）

    /** 以「admin 画像」重布夹具：ROLE_ADMIN 挂 portal(1)，并持有一个司机端菜单授权 */
    private void asAdminWithPortalRole() {
        SysRole admin = new SysRole();
        admin.setId(1L);
        admin.setRoleCode("ROLE_ADMIN");
        admin.setClientId(1L);
        when(roleRepository.findAllById(any())).thenReturn(List.of(admin));
        SysUserRole urAdmin = new SysUserRole();
        urAdmin.setUserId(9L);
        urAdmin.setRoleId(1L);
        when(userRoleRepository.findByUserId(9L)).thenReturn(List.of(urAdmin));

        SysRoleMenu rm = new SysRoleMenu();
        rm.setRoleId(1L);
        rm.setMenuId(63L);
        // 真实 JPA 语义：空角色集合 → 空授权行（桩必须看参数，否则端过滤推导断言失真）
        when(roleMenuRepository.findByRoleIdIn(any())).thenAnswer(inv ->
                ((java.util.Collection<?>) inv.getArgument(0)).contains(1L) ? List.of(rm) : List.of());
        when(menuRepository.findAllById(any())).thenAnswer(inv ->
                ((java.util.Collection<?>) inv.getArgument(0)).contains(63L)
                        ? List.of(menu(63L, "order:list", 7L)) : List.of());
    }

    @Test
    void nonPortalClient_rolesScopedToOwnClient_adminBypassBlocked() {
        asAdminWithPortalRole();

        LoginUser loginUser = service.buildLoginUser(9L, 7L, "MP");

        // 空态裁定（对齐 Node J5 冒烟 roles=[]）：portal 角色不带入他端——
        // PermissionEvaluator 的 ROLE_ADMIN 绕过读的就是这个集合，必须为空
        assertThat(loginUser.getRoles()).isEmpty();
        // 权限码即使指向本端菜单，也随角色过滤一并失效（无本端角色=无授权来源）
        assertThat(loginUser.getPermissions()).isEmpty();
    }

    @Test
    void nonPortalClient_keepsOwnClientRoles() {
        // driver 的 ROLE_DRIVER 挂司机端(7)：本端登录照常携带（绕过/角色语义只在跨端时被剥）
        LoginUser loginUser = service.buildLoginUser(9L, 7L, "MP");

        assertThat(loginUser.getRoles()).containsExactly("ROLE_DRIVER");
    }

    @Test
    void portalClient_keepsAllRoles_zeroBreakage() {
        asAdminWithPortalRole();

        LoginUser loginUser = service.buildLoginUser(9L, 1L, "WEB");

        assertThat(loginUser.getRoles()).containsExactly("ROLE_ADMIN");
        assertThat(loginUser.getPermissions()).containsExactly("order:list");
    }
}
