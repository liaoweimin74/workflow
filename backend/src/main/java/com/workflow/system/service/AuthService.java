package com.workflow.system.service;

import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.dto.LoginRequest;
import com.workflow.system.domain.vo.LoginResponse;
import com.workflow.system.domain.vo.MenuTree;

import java.util.List;

public interface AuthService {
    LoginResponse login(LoginRequest request);

    void logout(String token);

    LoginResponse refreshToken(String refreshToken);

    LoginResponse getCurrentUser(Long userId);

    List<MenuTree> getCurrentUserMenus(Long userId);

    /**
     * 按 userId 构造带角色与权限集合的 LoginUser（JWT 过滤器用）。
     * 角色为空（用户不存在）时返回 null。
     */
    LoginUser buildLoginUser(Long userId);
}