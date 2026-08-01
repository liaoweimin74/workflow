package com.workflow.system.domain.dto;

public record RoleQueryRequest(
        String roleName,
        String roleCode,
        Integer status,
        Integer page,
        Integer size) {
}