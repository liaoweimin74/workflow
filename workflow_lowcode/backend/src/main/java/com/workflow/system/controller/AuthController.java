package com.workflow.system.controller;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.dto.LoginRequest;
import com.workflow.system.domain.dto.RefreshTokenRequest;
import com.workflow.system.domain.vo.LoginResponse;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.service.AuthService;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public R<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return R.ok(authService.login(request));
    }

    @PostMapping("/logout")
    public R<Void> logout(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader != null && authHeader.startsWith("Bearer ") ? authHeader.substring(7) : null;
        authService.logout(token);
        return R.ok();
    }

    @PostMapping("/refresh")
    public R<LoginResponse> refresh(@RequestBody RefreshTokenRequest request) {
        return R.ok(authService.refreshToken(request.refreshToken()));
    }

    @GetMapping("/userinfo")
    public R<LoginResponse> getCurrentUser(@AuthenticationPrincipal LoginUser loginUser) {
        return R.ok(authService.getCurrentUser(loginUser.getUserId()));
    }

    @GetMapping("/menus")
    public R<List<MenuTree>> getMenus(@AuthenticationPrincipal LoginUser loginUser) {
        return R.ok(authService.getCurrentUserMenus(loginUser.getUserId()));
    }

    public record RefreshTokenRequest(String refreshToken) {}
}