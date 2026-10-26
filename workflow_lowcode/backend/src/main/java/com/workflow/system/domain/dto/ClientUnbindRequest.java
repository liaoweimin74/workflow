package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotNull;

/** 端解绑请求：解除当前登录账号在指定端的 openid 绑定（需登录态）。 */
public record ClientUnbindRequest(
        @NotNull(message = "客户端 id 不能为空") Long clientId) {
}
