package com.workflow.engine.history.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 任务审批意见实体。
 *
 * <p>对应 {@code wf_task_comment} 表（V13 迁移）。
 * 在 complete/reject/transfer/delegate/add-sign/forward-sign 操作成功后写入，
 * 用于审批历史追溯。
 */
@Entity
@Table(name = "wf_task_comment")
public class WfTaskComment {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "task_id", length = 64, nullable = false)
    private String taskId;

    @Column(name = "process_instance_id", length = 64, nullable = false)
    private String processInstanceId;

    @Column(name = "user_id", length = 64, nullable = false)
    private String userId;

    @Column(name = "comment", columnDefinition = "TEXT")
    private String comment;

    @Column(name = "action", length = 32, nullable = false)
    private String action;

    /**
     * 动作目标人 ID（转办/委派/加签/转签的目标人，其他动作为 null）。
     */
    @Column(name = "target_user_id", length = 64)
    private String targetUserId;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        if (createdAt == null) {
            createdAt = LocalDateTime.now();
        }
    }

    // ==================== Getters / Setters ====================

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getProcessInstanceId() { return processInstanceId; }
    public void setProcessInstanceId(String processInstanceId) { this.processInstanceId = processInstanceId; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getTargetUserId() { return targetUserId; }
    public void setTargetUserId(String targetUserId) { this.targetUserId = targetUserId; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
