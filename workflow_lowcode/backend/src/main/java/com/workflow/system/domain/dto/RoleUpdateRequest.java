package com.workflow.system.domain.dto;

import jakarta.validation.constraints.Size;

public record RoleUpdateRequest(
        @Size(max = 100) String roleName,
        String description,
        Integer status) {
}