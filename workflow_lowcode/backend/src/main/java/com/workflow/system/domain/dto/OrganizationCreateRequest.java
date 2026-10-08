package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record OrganizationCreateRequest(
        Long parentId,
        @NotBlank @Size(max = 100) String orgName,
        @NotBlank @Size(max = 50) String orgCode,
        Integer sortOrder,
        Integer status) {
}