package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RoleCreateRequest(
        @NotBlank @Size(max = 100) String roleName,
        @NotBlank @Size(max = 50) String roleCode,
        String description,
        Integer status) {
}