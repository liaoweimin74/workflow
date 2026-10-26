package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record MenuCreateRequest(
        Long parentId,
        @NotBlank @Size(max = 100) String menuName,
        @NotNull Integer menuType,
        @Size(max = 200) String path,
        @Size(max = 255) String component,
        @Size(max = 100) String permission,
        @Size(max = 50) String icon,
        Integer sortOrder,
        Integer status,
        /** 归属端（按端新建时显式携带）；null = portal 缺省（对齐 node createMenu client_id 透传） */
        Long clientId) {
}