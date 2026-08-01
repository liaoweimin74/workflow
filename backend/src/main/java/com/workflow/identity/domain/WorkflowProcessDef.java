package com.workflow.identity.domain;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "wf_process_def", indexes = {
    @Index(name = "idx_tenant_proc", columnList = "tenantId")
}, uniqueConstraints = {
    @UniqueConstraint(name = "uk_tenant_key_version", columnNames = {"tenantId", "processKey", "version"})
})
public class WorkflowProcessDef {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(length = 255)
    private String name;

    @Column(name = "process_key", length = 255)
    private String processKey;

    @Column
    private Integer version = 1;

    @Column(name = "bpmn_xml", columnDefinition = "LONGTEXT")
    private String bpmnXml;

    @Column(length = 20)
    private String status = "DRAFT";

    @Column(name = "deploy_id", length = 64)
    private String deployId;

    @Column(name = "proc_def_id", length = 64)
    private String procDefId;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "created_by", length = 64)
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
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getProcessKey() { return processKey; }
    public void setProcessKey(String processKey) { this.processKey = processKey; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getBpmnXml() { return bpmnXml; }
    public void setBpmnXml(String bpmnXml) { this.bpmnXml = bpmnXml; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getDeployId() { return deployId; }
    public void setDeployId(String deployId) { this.deployId = deployId; }
    public String getProcDefId() { return procDefId; }
    public void setProcDefId(String procDefId) { this.procDefId = procDefId; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}