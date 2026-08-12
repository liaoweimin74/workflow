package com.workflow.engine.process.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 流程节点配置实体。
 * 存储 BPMN 节点的自定义业务属性（审批人、表单权限、时限等）。
 * 与 BPMN XML 解耦，通过 process_def_id + node_id 关联。
 */
@Entity
@Table(name = "wf_node_config")
public class NodeConfig {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "process_def_id", length = 64, nullable = false)
    private String processDefId;

    /**
     * 部署版本 ID（Flowable processDefinitionId，格式 key:version:uuid）。
     * 非空=该部署版本的配置快照；空=当前编辑中的最新配置。
     */
    @Column(name = "process_definition_id", length = 64)
    private String processDefinitionId;

    @Column(name = "node_id", length = 255, nullable = false)
    private String nodeId;

    @Column(name = "node_type", length = 64, nullable = false)
    private String nodeType;

    @Column(name = "config_json", nullable = false, columnDefinition = "JSON")
    private String configJson;

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

    public String getProcessDefId() { return processDefId; }
    public void setProcessDefId(String processDefId) { this.processDefId = processDefId; }

    public String getProcessDefinitionId() { return processDefinitionId; }
    public void setProcessDefinitionId(String processDefinitionId) { this.processDefinitionId = processDefinitionId; }

    public String getNodeId() { return nodeId; }
    public void setNodeId(String nodeId) { this.nodeId = nodeId; }

    public String getNodeType() { return nodeType; }
    public void setNodeType(String nodeType) { this.nodeType = nodeType; }

    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
