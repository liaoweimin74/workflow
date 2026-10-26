package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 端首绑请求（J3 泛化：账号密码 / 绑定码 双载体）。
 *
 * <p>username+password 非空 = 账号密码绑定（门禁 OPENID_SILENT）；
 * bindCode 非空 = 绑定码绑定（门禁 BIND_CODE，码由管理端 issue）；两者都缺 = 400。
 */
public record ClientBindRequest(
        @NotNull(message = "客户端 id 不能为空") Long clientId,
        @NotBlank(message = "渠道类型不能为空") String channel,
        @NotBlank(message = "微信登录凭证不能为空") String code,
        String username,
        String password,
        String bindCode) {
}
