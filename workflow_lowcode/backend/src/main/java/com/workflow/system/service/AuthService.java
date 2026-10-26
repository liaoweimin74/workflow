package com.workflow.system.service;

import com.workflow.system.domain.dto.BindCodeIssueRequest;
import com.workflow.system.domain.dto.ChangePasswordRequest;
import com.workflow.system.domain.dto.ClientBindRequest;
import com.workflow.system.domain.dto.ClientLoginRequest;
import com.workflow.system.domain.dto.ClientUnbindRequest;
import com.workflow.system.domain.dto.LoginRequest;
import com.workflow.system.domain.vo.BindCodeVO;
import com.workflow.system.domain.vo.LoginResponse;
import com.workflow.system.domain.vo.MenuTree;

import java.util.List;

public interface AuthService {
    LoginResponse login(LoginRequest request);

    void logout(String token);

    LoginResponse refreshToken(String refreshToken);

    /**
     * 本人改密：先验旧密码，再写入新密码。
     * 旧密码不匹配或新旧相同抛业务异常。
     */
    void changePassword(Long userId, ChangePasswordRequest request);

    /**
     * 当前用户信息（J4）：权限集合按 token 端上下文过滤——仅非 portal 端隔离（沿用 PageAccessGuard 裁定）。
     */
    LoginResponse getCurrentUser(Long userId, Long clientId);

    /**
     * 当前用户菜单树（J4）：统一按端取根（spec「菜单接口依 token 端声明返回该端树」）；
     * 历史 token 缺声明 → 平台端，存量树零破坏。
     */
    List<MenuTree> getCurrentUserMenus(Long userId, Long clientId);

    /**
     * 端登录（J3 泛化，替代 V64 loginByMiniprogram）：按 clientId+channel 门禁登录方式后，
     * 用端渠道配置的 appid/secret 换 openid，按 <b>端身份</b>（clientId+openid）查绑定发 token。
     * 未绑定时抛 401，调用方应引导用户走绑定流程（账号密码或绑定码）。
     */
    LoginResponse clientLogin(ClientLoginRequest request);

    /**
     * 端首绑（J3 泛化，替代 V64 bindMiniprogram）：双载体——
     * username/password（门禁 OPENID_SILENT）或 bindCode（门禁 BIND_CODE，管理端 issue）。
     * 当前微信已绑本账号时幂等返回登录态。
     */
    LoginResponse clientBind(ClientBindRequest request);

    /** 本人解绑指定端的身份绑定（软删）。无绑定时 400。 */
    void clientUnbind(Long userId, ClientUnbindRequest request);

    /** 管理端为「账号 × 端」签发一次性绑定码（A4 端身份 Tab 调用）。 */
    BindCodeVO issueBindCode(BindCodeIssueRequest request);
}
