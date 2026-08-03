package com.workflow.engine.form.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 表单实例数据实体。
 * 存储流程实例关联的表单数据 JSON，记录表单版本快照。
 */
@Entity
@Table(name = "wf_form_data")
public class FormData {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "form_def_id", length = 64, nullable = false)
    private String formDefId;

    @Column(name = "form_version", nullable = false)
    private Integer formVersion;

    @Column(name = "process_instance_id", length = 64)
    private String processInstanceId;

    @Column(name = "task_id", length = 64)
    private String taskId;

    @Lob
    @Column(name = "data_json", columnDefinition = "LONGTEXT")
    private String dataJson;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }

    public String getFormDefId() { return formDefId; }
    public void setFormDefId(String formDefId) { this.formDefId = formDefId; }

    public Integer getFormVersion() { return formVersion; }
    public void setFormVersion(Integer formVersion) { this.formVersion = formVersion; }

    public String getProcessInstanceId() { return processInstanceId; }
    public void setProcessInstanceId(String processInstanceId) { this.processInstanceId = processInstanceId; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getDataJson() { return dataJson; }
    public void setDataJson(String dataJson) { this.dataJson = dataJson; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
