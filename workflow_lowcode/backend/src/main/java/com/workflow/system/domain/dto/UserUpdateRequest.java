package com.workflow.system.domain.dto;

import jakarta.validation.constraints.Size;

public record UserUpdateRequest(
        @Size(max = 50) String nickname,
        String email,
        String phone,
        Long orgId,
        Long[] roleIds,
        Integer status) {
}