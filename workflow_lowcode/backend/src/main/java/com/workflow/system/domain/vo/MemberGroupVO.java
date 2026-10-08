package com.workflow.system.domain.vo;

import java.time.LocalDateTime;

/**
 * 成员组列表/详情 VO（Task 142）。
 *
 * @param memberCount 有效成员数（成员均为手动添加，规则机制已移除）
 */
public record MemberGroupVO(
        Long id,
        String groupName,
        String description,
        Integer status,
        long memberCount,
        LocalDateTime createdAt) {
}
