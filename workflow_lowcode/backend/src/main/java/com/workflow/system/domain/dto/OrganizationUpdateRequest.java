package com.workflow.system.domain.dto;

import jakarta.validation.constraints.Size;

public record OrganizationUpdateRequest(
        Long parentId,
        @Size(max = 100) String orgName,
        @Size(max = 50) String orgCode,
        Integer sortOrder,
        Integer status) {
}