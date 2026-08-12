package com.workflow.engine.form.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 表单定义实体。
 * 存储表单的 schema JSON、版本号和发布状态。
 * 支持多版本管理：每次保存创建新版本记录。
 */
@Entity
@Table(name = "wf_form_def")
public class FormDefinition {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "name", length = 255, nullable = false)
    private String name;

    @Column(name = "`key`", length = 255, nullable = false)
    private String key;

    /**
     * 表单类型：WORKFLOW（工作流表单）/ BUSINESS（业务表单/底表）。
     * 默认 WORKFLOW，兼容旧数据。
     */
    @Column(name = "type", length = 20, nullable = false)
    private String type = "WORKFLOW";

    /**
     * 列映射配置 JSON（仅 BUSINESS 类型使用，WORKFLOW 为 null）。
     * 定义表单字段到物理表列的映射：类型/长度/必填/唯一/索引。
     */
    @Lob
    @Column(name = "column_config", columnDefinition = "JSON")
    private String columnConfig;

    @Lob
    @Column(name = "`schema`", columnDefinition = "LONGTEXT")
    private String schema;

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "status", length = 32, nullable = false)
    private String status = "DRAFT";

    @Column(name = "published_version")
    private Integer publishedVersion;

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

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getColumnConfig() { return columnConfig; }
    public void setColumnConfig(String columnConfig) { this.columnConfig = columnConfig; }

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Integer getPublishedVersion() { return publishedVersion; }
    public void setPublishedVersion(Integer publishedVersion) { this.publishedVersion = publishedVersion; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
