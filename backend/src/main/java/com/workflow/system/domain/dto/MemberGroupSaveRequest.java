package com.workflow.system.domain.dto;

import jakarta.validation.constraints.Size;

/**
 * 成员组保存请求体（create 全量 / update 部分，null 字段不更新）。
 */
public record MemberGroupSaveRequest(
        @Size(max = 64, message = "成员组名称不能超过 64 个字符") String groupName,
        @Size(max = 255, message = "说明不能超过 255 个字符") String description,
        Integer status) {
}
