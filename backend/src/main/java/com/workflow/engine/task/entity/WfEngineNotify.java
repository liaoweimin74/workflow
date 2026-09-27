package com.workflow.engine.task.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;

/**
 * 引擎外发通知记录（V40 迁移创建；对齐 NodeJS 端 wf_engine_notify）。
 *
 * <p>短信/超时提醒等外发通知的落库占位，后续接入消息网关。
 * 触发源：节点 notify.sms=true（新待办 SMS_NODE）、发起节点 initiator.smsOnEnd=true
 * （实例结束 SMS_END）、超时调度提醒（TIMEOUT_REMIND，兼作幂等标记）。
 */
@Entity
@Table(name = "wf_engine_notify")
public class WfEngineNotify {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "instance_id", length = 64, nullable = false)
    private String instanceId;

    /** 关联任务 ID（实例级通知为 NULL）。 */
    @Column(name = "task_id", length = 64)
    private String taskId;

    /** 通知类型：SMS_NODE / SMS_END / TIMEOUT_REMIND。 */
    @Column(name = "notify_type", length = 32, nullable = false)
    private String notifyType;

    @Column(name = "target_user", length = 64, nullable = false)
    private String targetUser;

    @Column(name = "content", length = 500, nullable = false)
    private String content;

    /** 发送状态：PENDING / SENT / FAILED。 */
    @Column(name = "status", length = 16, nullable = false)
    private String status;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getInstanceId() { return instanceId; }
    public void setInstanceId(String instanceId) { this.instanceId = instanceId; }
    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }
    public String getNotifyType() { return notifyType; }
    public void setNotifyType(String notifyType) { this.notifyType = notifyType; }
    public String getTargetUser() { return targetUser; }
    public void setTargetUser(String targetUser) { this.targetUser = targetUser; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
