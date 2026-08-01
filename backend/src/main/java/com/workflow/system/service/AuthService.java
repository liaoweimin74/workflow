package com.workflow.system.service;

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
}