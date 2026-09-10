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
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 登录用户角色/权限加载服务。
 * 供 JWT 认证过滤器构造带完整角色与权限集合的 LoginUser（后端鉴权依赖）。
 * 仅依赖 repository，避免引入 SecurityConfig/AuthService 的循环依赖。
 */
@Service
public class LoginUserService {

    private final SysUserRepository userRepository;
    private final SysUserRoleRepository userRoleRepository;
    private final SysRoleRepository roleRepository;
    private final SysRoleMenuRepository roleMenuRepository;
    private final SysMenuRepository menuRepository;

    public LoginUserService(SysUserRepository userRepository,
                            SysUserRoleRepository userRoleRepository,
                            SysRoleRepository roleRepository,
                            SysRoleMenuRepository roleMenuRepository,
                            SysMenuRepository menuRepository) {
        this.userRepository = userRepository;
        this.userRoleRepository = userRoleRepository;
        this.roleRepository = roleRepository;
        this.roleMenuRepository = roleMenuRepository;
        this.menuRepository = menuRepository;
    }

    /**
     * 按 userId 构造带角色与权限集合的 LoginUser。
     * 用户不存在或被禁用 → null（调用方不设置认证上下文）。
     */
    public LoginUser buildLoginUser(Long userId) {
        SysUser user = userRepository.findById(userId).orElse(null);
        if (user == null || user.getStatus() == null || user.getStatus() != 1) {
            return null;
        }
        List<SysUserRole> userRoles = userRoleRepository.findByUserId(user.getId());
        Set<Long> roleIds = userRoles.stream().map(SysUserRole::getRoleId).collect(Collectors.toSet());
        List<String> roles = roleRepository.findAllById(roleIds).stream()
                .map(SysRole::getRoleCode)
                .collect(Collectors.toList());

        Set<Long> menuIds = roleMenuRepository.findByRoleIdIn(roleIds).stream()
                .map(SysRoleMenu::getMenuId)
                .collect(Collectors.toSet());
        Set<String> permissions = menuRepository.findAllById(menuIds).stream()
                .map(SysMenu::getPermission)
                .filter(p -> p != null && !p.isEmpty())
                .collect(Collectors.toSet());

        return new LoginUser(user.getId(), user.getUsername(), null, roles, permissions, true);
    }
}
