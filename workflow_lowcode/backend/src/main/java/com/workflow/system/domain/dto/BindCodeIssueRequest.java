package com.workflow.system.domain.dto;

import jakarta.validation.constraints.NotNull;

/** 绑定码生成请求（A4 端身份 Tab 管理动作：为指定账号在指定端生成一次性绑定码）。 */
public record BindCodeIssueRequest(
        @NotNull(message = "用户 id 不能为空") Long userId,
        @NotNull(message = "客户端 id 不能为空") Long clientId) {
}
