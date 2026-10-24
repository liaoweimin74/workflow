package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;

public record MiniprogramLoginRequest(
        @NotBlank(message = "微信登录凭证不能为空") String code,
        /** 目标小程序客户端 ID（多实例，Task 9.4）；为空回落全局配置 */
        String clientId) {
}
