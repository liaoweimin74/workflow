package com.workflow.system.domain.vo;

import java.time.LocalDateTime;

public record RoleVO(
        Long id,
        String roleName,
        String roleCode,
        String description,
        Integer status,
        LocalDateTime createdAt) {
}