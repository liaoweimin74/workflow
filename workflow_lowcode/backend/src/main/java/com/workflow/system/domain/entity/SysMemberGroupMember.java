package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 成员组成员关系实体（Task 142）。
 *
 * <p>仅承载手动添加的成员（group_id + user_id 唯一）；历史自动规则机制
 * （按岗位/按组织）已随 V49/backend-node 侧改造移除，不再有规则匹配来源。
 */
@Entity
@Table(name = "sys_member_group_member", uniqueConstraints = {
        @UniqueConstraint(name = "uk_member_group_user", columnNames = {"group_id", "user_id"})
}, indexes = {
        @Index(name = "idx_member_group_user", columnList = "user_id")
})
public class SysMemberGroupMember extends BaseEntity {

    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    public Long getGroupId() { return groupId; }
    public void setGroupId(Long groupId) { this.groupId = groupId; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
}
