package com.workflow.system.domain.vo;

import java.time.LocalDateTime;

/**
 * 成员组成员行 VO（Task 142）。
 *
 * <p>source 保留固定值 manual（历史契约兼容）；自动规则来源已移除。
 */
public record GroupMemberVO(
        Long userId,
        String username,
        String nickname,
        String orgName,
        String postName,
        String source,
        String sourceLabel,
        LocalDateTime joinedAt) {

    public static final String SOURCE_MANUAL = "manual";
    public static final String SOURCE_MANUAL_LABEL = "直接添加";
}
