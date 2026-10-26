package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * 端登录请求（J3 泛化：V64 miniprogram/login 的 clientId 维度版本）。
 *
 * <p>channel 传大写渠道类型（本期仅 MP 实现，其余渠道 400）；
 * 端身份与渠道凭据（appid/secret）由服务端按 sys_client_channel 解析，请求体不携带密钥。
 */
public record ClientLoginRequest(
        @NotNull(message = "客户端 id 不能为空") Long clientId,
        @NotBlank(message = "渠道类型不能为空") String channel,
        @NotBlank(message = "微信登录凭证不能为空") String code) {
}
