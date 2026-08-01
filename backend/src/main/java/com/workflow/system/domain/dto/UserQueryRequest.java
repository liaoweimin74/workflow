package com.workflow.system.domain.dto;

public record UserQueryRequest(
        String username,
        Integer status,
        Long orgId,
        Integer page,
        Integer size) {
}