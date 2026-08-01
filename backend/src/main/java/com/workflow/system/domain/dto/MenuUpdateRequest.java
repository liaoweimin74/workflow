package com.workflow.system.domain.dto;

import jakarta.validation.constraints.Size;

public record MenuUpdateRequest(
        @Size(max = 100) String menuName,
        Integer menuType,
        @Size(max = 200) String path,
        @Size(max = 255) String component,
        @Size(max = 100) String permission,
        @Size(max = 50) String icon,
        Integer sortOrder,
        Integer status) {
}