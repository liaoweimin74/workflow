package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.exception.BusinessException;
import com.workflow.framework.security.jwt.JwtTokenProvider;
import com.workflow.framework.redis.RedisCache;
import com.workflow.system.domain.dto.LoginRequest;
import com.workflow.system.domain.entity.*;
import com.workflow.system.domain.vo.LoginResponse;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.domain.vo.UserInfo;
import com.workflow.system.repository.*;
import com.workflow.system.service.AuthService;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

@Service
public class AuthServiceImpl implements AuthService {
    private final SysUserRepository userRepository;
    private final SysRoleRepository roleRepository;
    private final SysMenuRepository menuRepository;
    private final SysUserRoleRepository userRoleRepository;
    private final SysRoleMenuRepository roleMenuRepository;
    private final SysOrganizationRepository orgRepository;
    private final JwtTokenProvider jwtTokenProvider;
    private final PasswordEncoder passwordEncoder;

    public AuthServiceImpl(SysUserRepository userRepository, SysRoleRepository roleRepository,
                           SysMenuRepository menuRepository, SysUserRoleRepository userRoleRepository,
                           SysRoleMenuRepository roleMenuRepository, SysOrganizationRepository orgRepository,
                           JwtTokenProvider jwtTokenProvider, PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.menuRepository = menuRepository;
        this.userRoleRepository = userRoleRepository;
        this.roleMenuRepository = roleMenuRepository;
        this.orgRepository = orgRepository;
        this.jwtTokenProvider = jwtTokenProvider;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public LoginResponse login(LoginRequest request) {
        SysUser user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new BusinessException("用户名或密码错误"));
        if (!passwordEncoder.matches(request.password(), user.getPassword())) {
            throw new BusinessException("用户名或密码错误");
        }
        if (user.getStatus() != 1) {
            throw new BusinessException("账号已被禁用");
        }

        String accessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getUsername());
        String refreshToken = jwtTokenProvider.createRefreshToken(user.getId(), user.getUsername());

        UserInfo userInfo = buildUserInfo(user);
        return new LoginResponse(accessToken, refreshToken, userInfo);
    }

    @Override
    public void logout(String token) {
        // No-op: Redis disabled
    }

    @Override
    public LoginResponse refreshToken(String refreshToken) {
        if (!jwtTokenProvider.validateToken(refreshToken)) {
            throw new BusinessException("Refresh Token 无效或已过期");
        }
        Long userId = jwtTokenProvider.getUserIdFromToken(refreshToken);
        SysUser user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        String newAccessToken = jwtTokenProvider.createAccessToken(user.getId(), user.getUsername());
        String newRefreshToken = jwtTokenProvider.createRefreshToken(user.getId(), user.getUsername());

        UserInfo userInfo = buildUserInfo(user);
        return new LoginResponse(newAccessToken, newRefreshToken, userInfo);
    }

    @Override
    public LoginResponse getCurrentUser(Long userId) {
        SysUser user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException("用户不存在"));
        UserInfo userInfo = buildUserInfo(user);
        return new LoginResponse(null, null, userInfo);
    }

    @Override
    public List<MenuTree> getCurrentUserMenus(Long userId) {
        List<SysUserRole> userRoles = userRoleRepository.findByUserId(userId);
        Set<Long> roleIds = userRoles.stream().map(SysUserRole::getRoleId).collect(Collectors.toSet());

        // Admin gets all menus
        boolean isAdmin = roleRepository.findAllById(roleIds).stream()
                .anyMatch(r -> "ROLE_ADMIN".equals(r.getRoleCode()));

        List<SysMenu> allMenus;
        Set<Long> authorizedMenuIds = null;
        Map<Long, SysMenu> menuCache = new HashMap<>();
        if (isAdmin) {
            allMenus = menuRepository.findByParentIdIsNullOrderBySortOrder();
        } else {
            Set<Long> menuIds = roleMenuRepository.findByRoleIdIn(roleIds).stream()
                    .map(SysRoleMenu::getMenuId)
                    .collect(Collectors.toSet());

            // 回溯所有祖先菜单，确保父级目录也在列表中
            Set<Long> rootMenuIds = new LinkedHashSet<>();
            for (Long menuId : menuIds) {
                SysMenu menu = menuRepository.findById(menuId).orElse(null);
                if (menu == null) {
                    continue;
                }
                menuCache.put(menu.getId(), menu);
                // 向上回溯祖先
                SysMenu current = menu;
                while (current.getParentId() != null) {
                    if (menuCache.containsKey(current.getParentId())) {
                        break; // 祖先已在缓存中，无需重复
                    }
                    SysMenu parent = menuRepository.findById(current.getParentId()).orElse(null);
                    if (parent == null) {
                        break;
                    }
                    menuCache.put(parent.getId(), parent);
                    current = parent;
                }
                // 收集顶级祖先
                if (current.getParentId() == null) {
                    rootMenuIds.add(current.getId());
                }
            }

            allMenus = rootMenuIds.stream()
                    .map(menuCache::get)
                    .filter(Objects::nonNull)
                    .sorted(Comparator.comparingInt(SysMenu::getSortOrder))
                    .collect(Collectors.toList());
        }

        // 收集所有有权限的菜单 ID（原始授权 + 祖先目录）
        authorizedMenuIds = isAdmin ? null : menuCache.keySet();

        return buildMenuTree(allMenus, authorizedMenuIds);
    }

    private UserInfo buildUserInfo(SysUser user) {
        List<SysUserRole> userRoles = userRoleRepository.findByUserId(user.getId());
        Set<Long> roleIds = userRoles.stream().map(SysUserRole::getRoleId).collect(Collectors.toSet());
        List<SysRole> roles = roleRepository.findAllById(roleIds);

        Set<Long> menuIds = roleMenuRepository.findByRoleIdIn(roleIds).stream()
                .map(SysRoleMenu::getMenuId)
                .collect(Collectors.toSet());
        Set<String> permissions = menuRepository.findAllById(menuIds).stream()
                .map(SysMenu::getPermission)
                .filter(p -> p != null && !p.isEmpty())
                .collect(Collectors.toSet());

        String orgName = null;
        if (user.getOrgId() != null) {
            orgName = orgRepository.findById(user.getOrgId())
                    .map(SysOrganization::getOrgName).orElse(null);
        }

        return new UserInfo(
                user.getId(), user.getUsername(), user.getNickname(),
                user.getEmail(), user.getPhone(), user.getAvatar(),
                user.getOrgId(), orgName,
                roles.stream().map(SysRole::getRoleCode).collect(Collectors.toList()),
                permissions);
    }

    private List<MenuTree> buildMenuTree(List<SysMenu> menus, Set<Long> authorizedMenuIds) {
        return menus.stream()
                .filter(m -> m.getIsDeleted() == 0)
                .filter(m -> m.getStatus() == 1)
                .filter(m -> authorizedMenuIds == null || authorizedMenuIds.contains(m.getId()))
                .map(m -> toMenuTree(m, authorizedMenuIds))
                .collect(Collectors.toList());
    }

    private MenuTree toMenuTree(SysMenu menu, Set<Long> authorizedMenuIds) {
        List<SysMenu> children = menuRepository.findByParentIdOrderBySortOrder(menu.getId());
        List<MenuTree> childTrees = children.stream()
                .filter(c -> c.getIsDeleted() == 0)
                .filter(c -> c.getStatus() == 1)
                .filter(c -> authorizedMenuIds == null || authorizedMenuIds.contains(c.getId()))
                .map(c -> toMenuTree(c, authorizedMenuIds))
                .collect(Collectors.toList());

        return new MenuTree(
                menu.getId(), menu.getParentId(), menu.getMenuName(),
                menu.getMenuType(), menu.getPath(), menu.getComponent(),
                menu.getPermission(), menu.getIcon(), menu.getSortOrder(),
                childTrees.isEmpty() ? null : childTrees);
    }
}