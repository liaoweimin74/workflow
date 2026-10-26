package com.workflow.system.domain.dto;

/**
 * 客户端修改请求（node 侧 zod partial 的 Java 等价）。
 *
 * <p>语义差异说明：node 用 `!== undefined` 区分「字段未传」与「显式 null（清除）」；
 * Jackson 两者都是 null，无法区分。本变更的读出口（A1/A2 编辑表单）总是全量提交，
 * 故约定：code/name/status/defaultRoleId/defaultMemberGroupId 传 null = 不改；
 * icon 传 null = 清除（表单里图标清空即真清除，无「未传」场景）。
 */
public record ClientUpdateRequest(
        String code,
        String name,
        String icon,
        Integer status,
        Long defaultRoleId,
        Long defaultMemberGroupId) {
}
