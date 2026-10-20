package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;

public record MiniprogramLoginRequest(
        @NotBlank(message = "微信登录凭证不能为空") String code) {
}
