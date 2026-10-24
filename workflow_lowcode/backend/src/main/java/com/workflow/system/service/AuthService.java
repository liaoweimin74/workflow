package com.workflow.system.service;

import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.dto.ChangePasswordRequest;
import com.workflow.system.domain.dto.LoginRequest;
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

    LoginResponse getCurrentUser(Long userId);

    List<MenuTree> getCurrentUserMenus(Long userId);

    /**
     * 小程序静默登录：code 换 openid 后按绑定关系登录。
     * 未绑定时抛 401，调用方应引导用户走账号密码绑定。
     */
    LoginResponse loginByMiniprogram(String code);

    /**
     * 按 Client 凭证登录（Task 9.4）：
     * {@code clientId} 非空时用该小程序客户端的 appId/appSecret 换 code（多实例），
     * 为空时回落全局配置（单 appid 部署）。
     */
    LoginResponse loginByMiniprogram(String code, String clientId);

    /**
     * 首次绑定并登录：校验平台账号密码，把当前微信 openid 绑到该账号。
     * 当前微信已绑本账号时幂等返回登录态。
     */
    LoginResponse bindMiniprogram(String code, String username, String password);

    /**
     * 按 Client 凭证绑定并登录（Task 9.4）：
     * {@code clientId} 非空时用该小程序客户端的 appId/appSecret 换 code（多实例），
     * 绑定的 openid 归属该 Client 的 appId。
     */
    LoginResponse bindMiniprogram(String code, String username, String password, String clientId);

    /**
     * 按 userId 构造带角色与权限集合的 LoginUser（JWT 过滤器用）。
     * 角色为空（用户不存在）时返回 null。
     */
    LoginUser buildLoginUser(Long userId);
}