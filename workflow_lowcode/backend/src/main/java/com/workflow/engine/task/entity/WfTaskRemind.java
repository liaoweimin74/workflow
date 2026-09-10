package com.workflow.engine.task.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 任务催办记录实体。
 *
 * <p>对应 {@code wf_task_remind} 表（V16 迁移）。
 * 每次催办操作写入一条记录，配合频率限制逻辑（默认 24h 内不可重复催办）。
 */
@Entity
@Table(name = "wf_task_remind")
public class WfTaskRemind {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "task_id", length = 64, nullable = false)
    private String taskId;

    @Column(name = "process_instance_id", length = 64, nullable = false)
    private String processInstanceId;

    @Column(name = "remind_from", length = 64, nullable = false)
    private String remindFrom;

    @Column(name = "remind_to", length = 64, nullable = false)
    private String remindTo;

    @Column(name = "remind_time")
    private LocalDateTime remindTime;

    @PrePersist
    protected void onCreate() {
        if (remindTime == null) {
            remindTime = LocalDateTime.now();
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

    public String getRemindFrom() { return remindFrom; }
    public void setRemindFrom(String remindFrom) { this.remindFrom = remindFrom; }

    public String getRemindTo() { return remindTo; }
    public void setRemindTo(String remindTo) { this.remindTo = remindTo; }

    public LocalDateTime getRemindTime() { return remindTime; }
    public void setRemindTime(LocalDateTime remindTime) { this.remindTime = remindTime; }
}
