package com.workflow.engine.page.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 页面定义实体。
 * 存储视图（VIEW）/ 自定义页面（PAGE）的 schema JSON、版本号和发布状态。
 * 发布不建表，仅绑定已发布的业务表单物理表。
 */
@Entity
@Table(name = "wf_page_def")
public class PageDefinition {

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
     * 页面类型：VIEW（视图）/ PAGE（自定义页面）。默认 VIEW。
     */
    @Column(name = "type", length = 32, nullable = false)
    private String type = "VIEW";

    /**
     * 绑定的业务表单 key → wf_biz_<form_key>（VIEW 用）。
     */
    @Column(name = "form_key", length = 255)
    private String formKey;

    /**
     * 视图绑定的数据源 ID（新协议）；formKey 为遗留字段仅保留兼容。
     */
    @Column(name = "data_source_id", length = 64)
    private String dataSourceId;

    /**
     * VIEW=视图配置JSON / PAGE=form-create {rule,option,dataSources,actions}。
     */
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

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }

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