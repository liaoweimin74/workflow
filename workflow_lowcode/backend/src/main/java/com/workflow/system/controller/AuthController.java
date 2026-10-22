package com.workflow.system.controller;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.dto.ChangePasswordRequest;
import com.workflow.system.domain.dto.LoginRequest;
import com.workflow.system.domain.dto.MiniprogramBindRequest;
import com.workflow.system.domain.dto.MiniprogramLoginRequest;
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

    /** 小程序静默登录：code 换 openid 后按已绑定账号发 token。 */
    @PostMapping("/miniprogram/login")
    public R<LoginResponse> miniprogramLogin(@Valid @RequestBody MiniprogramLoginRequest request) {
        return R.ok(authService.loginByMiniprogram(request.code()));
    }

    /** 首次绑定：账号密码校验通过后把当前微信绑到该账号，并直接返回登录态。 */
    @PostMapping("/miniprogram/bind")
    public R<LoginResponse> miniprogramBind(@Valid @RequestBody MiniprogramBindRequest request) {
        return R.ok(authService.bindMiniprogram(request.code(), request.username(), request.password()));
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

    /** 改密对象只取 token 里的账号，不接受 userId 入参，否则任何人都能改别人的密码。 */
    @PutMapping("/password")
    public R<Void> changePassword(@AuthenticationPrincipal LoginUser loginUser,
                                  @Valid @RequestBody ChangePasswordRequest request) {
        authService.changePassword(loginUser.getUserId(), request);
        return R.ok();
    }

    @GetMapping("/menus")
    public R<List<MenuTree>> getMenus(@AuthenticationPrincipal LoginUser loginUser) {
        return R.ok(authService.getCurrentUserMenus(loginUser.getUserId()));
    }

    public record RefreshTokenRequest(String refreshToken) {}
}