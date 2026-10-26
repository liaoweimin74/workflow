package com.workflow.system.controller;

import com.workflow.common.domain.R;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.dto.BindCodeIssueRequest;
import com.workflow.system.domain.dto.ChangePasswordRequest;
import com.workflow.system.domain.dto.ClientBindRequest;
import com.workflow.system.domain.dto.ClientLoginRequest;
import com.workflow.system.domain.dto.ClientUnbindRequest;
import com.workflow.system.domain.dto.LoginRequest;
import com.workflow.system.domain.vo.BindCodeVO;
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

    /**
     * 端登录（J3 泛化）：clientId+channel 定端，openid 静默登录，按端身份（clientId+openid）发 token。
     * 未绑定 401，端内应引导走绑定流程。
     */
    @PostMapping("/client/login")
    public R<LoginResponse> clientLogin(@Valid @RequestBody ClientLoginRequest request) {
        return R.ok(authService.clientLogin(request));
    }

    /** 端首绑：账号密码 / 绑定码 双载体，绑定成功直接返回登录态。 */
    @PostMapping("/client/bind")
    public R<LoginResponse> clientBind(@Valid @RequestBody ClientBindRequest request) {
        return R.ok(authService.clientBind(request));
    }

    /** 本人解绑指定端的身份绑定（需登录态）。 */
    @PostMapping("/client/unbind")
    public R<Void> clientUnbind(@AuthenticationPrincipal LoginUser loginUser,
                                @Valid @RequestBody ClientUnbindRequest request) {
        authService.clientUnbind(loginUser.getUserId(), request);
        return R.ok();
    }

    /** 管理端为「账号 × 端」签发一次性绑定码（A4 端身份 Tab 调用，需登录态）。 */
    @PostMapping("/bind-code/issue")
    public R<BindCodeVO> issueBindCode(@Valid @RequestBody BindCodeIssueRequest request) {
        return R.ok(authService.issueBindCode(request));
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
        // J4：端上下文取自 token claim 灌入的 LoginUser（历史 token=平台端缺省）
        return R.ok(authService.getCurrentUser(loginUser.getUserId(), loginUser.getClientId()));
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
        return R.ok(authService.getCurrentUserMenus(loginUser.getUserId(), loginUser.getClientId()));
    }

    public record RefreshTokenRequest(String refreshToken) {}
}