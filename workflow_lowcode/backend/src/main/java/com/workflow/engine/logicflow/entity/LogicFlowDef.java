package com.workflow.engine.logicflow.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 独立逻辑流编排定义实体（独立于 BPMN 流程的后端业务编排）。
 *
 * <p>画布以 JSON DSL 描述节点/边（nodes[]/edges[]），运行时由
 * {@code LogicFlowEngine} 解释执行。status 走 DRAFT→PUBLISHED 两态，
 * publish 时做图结构校验并递增 version。
 */
@Entity
@Table(name = "wf_logic_flow",
       uniqueConstraints = @UniqueConstraint(name = "uk_logic_flow_key",
               columnNames = {"tenant_id", "flow_key"}),
       indexes = @Index(name = "idx_logic_flow_key", columnList = "flow_key"))
public class LogicFlowDef {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId = "default";

    /** 编排唯一键（同租户内唯一，字母开头 2-64 位 [a-zA-Z0-9_-]）。 */
    @Column(name = "flow_key", length = 64, nullable = false)
    private String flowKey;

    @Column(name = "name", length = 128, nullable = false)
    private String name;

    @Column(name = "description", length = 500)
    private String description;

    /** 状态：DRAFT（草稿）| PUBLISHED（已发布）。 */
    @Column(name = "status", length = 20, nullable = false)
    private String status = "DRAFT";

    /** 已发布次数（每次 publish +1，0 = 从未发布）。 */
    @Column(name = "version", nullable = false)
    private Integer version = 0;

    /** 画布 DSL JSON 原文（nodes/edges）。 */
    @Column(name = "dsl_json", nullable = false, columnDefinition = "JSON")
    private String dslJson;

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

    public String getFlowKey() { return flowKey; }
    public void setFlowKey(String flowKey) { this.flowKey = flowKey; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public String getDslJson() { return dslJson; }
    public void setDslJson(String dslJson) { this.dslJson = dslJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
