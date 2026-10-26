package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotBlank;

/** 客户端创建请求（对齐 node client.controller zod clientCreateSchema）。 */
public record ClientCreateRequest(
        @NotBlank String code,
        @NotBlank String name,
        String icon,
        Integer status,
        Long defaultRoleId,
        Long defaultMemberGroupId) {
}
