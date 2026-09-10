package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record UserCreateRequest(
        @NotBlank @Size(min = 2, max = 50) String username,
        @NotBlank @Size(max = 50) String nickname,
        String email,
        String phone,
        Long orgId,
        Long[] roleIds,
        Integer status) {
}