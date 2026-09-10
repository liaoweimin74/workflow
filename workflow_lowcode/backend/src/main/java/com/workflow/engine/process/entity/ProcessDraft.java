package com.workflow.engine.process.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 流程定义草稿实体。
 * 存储设计器中未部署的 BPMN XML 草稿。
 * 部署后关联 Flowable 的 processDefinitionId。
 */
@Entity
@Table(name = "wf_process_draft")
public class ProcessDraft {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "name", length = 255, nullable = false)
    private String name;

    @Column(name = "process_key", length = 255, nullable = false)
    private String key;

    @Column(name = "category_id", length = 64)
    private String categoryId;

    @Lob
    @Column(name = "bpmn_xml", nullable = false, columnDefinition = "LONGTEXT")
    private String bpmnXml;

    /** 上次部署时的 BPMN XML，用于部署前校验是否有变化 */
    @Lob
    @Column(name = "deployed_xml", columnDefinition = "LONGTEXT")
    private String deployedXml;

    /** 上次部署时的配置 hash（XML + nodeConfig 整体指纹），用于部署变化检测 */
    @Column(name = "deployed_config_hash", length = 64)
    private String deployedConfigHash;

    @Column(name = "status", length = 32, nullable = false)
    private String status = "DRAFT";

    @Column(name = "process_definition_id", length = 64)
    private String processDefinitionId;

    @Column(name = "deploy_id", length = 64)
    private String deployId;

    @Column(name = "last_deployed_at")
    private LocalDateTime lastDeployedAt;

    @Column(name = "version", nullable = false)
    private Integer version = 0;

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

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getCategoryId() { return categoryId; }
    public void setCategoryId(String categoryId) { this.categoryId = categoryId; }

    public String getBpmnXml() { return bpmnXml; }
    public void setBpmnXml(String bpmnXml) { this.bpmnXml = bpmnXml; }

    public String getDeployedXml() { return deployedXml; }
    public void setDeployedXml(String deployedXml) { this.deployedXml = deployedXml; }

    public String getDeployedConfigHash() { return deployedConfigHash; }
    public void setDeployedConfigHash(String deployedConfigHash) { this.deployedConfigHash = deployedConfigHash; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getProcessDefinitionId() { return processDefinitionId; }
    public void setProcessDefinitionId(String processDefinitionId) { this.processDefinitionId = processDefinitionId; }

    public String getDeployId() { return deployId; }
    public void setDeployId(String deployId) { this.deployId = deployId; }

    public LocalDateTime getLastDeployedAt() { return lastDeployedAt; }
    public void setLastDeployedAt(LocalDateTime lastDeployedAt) { this.lastDeployedAt = lastDeployedAt; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
