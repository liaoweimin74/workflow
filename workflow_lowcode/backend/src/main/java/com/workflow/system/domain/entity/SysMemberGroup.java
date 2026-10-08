package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * 成员组实体（Task 142：成员组管理去业务表单化，回归专用数据表）。
 *
 * <p>成员关系见 {@link SysMemberGroupMember}（手动添加；自动规则机制已移除）。
 */
@Entity
@Table(name = "sys_member_group", indexes = {
        @Index(name = "uk_sys_member_group_name", columnList = "group_name", unique = true)
})
public class SysMemberGroup extends BaseEntity {

    @Column(name = "group_name", nullable = false, length = 64)
    private String groupName;

    @Column(length = 255)
    private String description;

    /** 状态：1 启用 0 停用。 */
    @Column(nullable = false)
    private Integer status = 1;

    public String getGroupName() { return groupName; }
    public void setGroupName(String groupName) { this.groupName = groupName; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
}
