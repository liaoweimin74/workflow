package com.workflow.system.domain.vo;

public record LoginResponse(
        String accessToken,
        String refreshToken,
        UserInfo user) {
}