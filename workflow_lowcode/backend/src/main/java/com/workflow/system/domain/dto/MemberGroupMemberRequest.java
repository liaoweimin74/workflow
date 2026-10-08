package com.workflow.system.domain.dto;

import java.util.List;

/**
 * 成员组成员批量操作请求体（添加 / 移除共用）。
 */
public record MemberGroupMemberRequest(List<Long> userIds) {
}
