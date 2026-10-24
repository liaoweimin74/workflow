package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;

public record MiniprogramBindRequest(
        @NotBlank(message = "微信登录凭证不能为空") String code,
        @NotBlank(message = "用户名不能为空") String username,
        @NotBlank(message = "密码不能为空") String password,
        /** 目标小程序客户端 ID（多实例，Task 9.4）；为空回落全局配置 */
        String clientId) {
}
