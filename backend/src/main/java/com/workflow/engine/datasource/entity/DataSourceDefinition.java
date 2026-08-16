package com.workflow.engine.datasource.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 全局数据源定义实体。
 * 存储数据源（FORM 业务表单 / SYSTEM 系统结构 / API 外部接口）的注册配置与状态。
 * 状态机：DRAFT → ENABLED ⇄ DISABLED；仅 DRAFT 可删除。
 */
@Entity
@Table(name = "wf_data_source")
public class DataSourceDefinition {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "name", length = 255, nullable = false)
    private String name;

    /**
     * 数据源类型：FORM（业务表单）/ SYSTEM（系统结构）/ API（外部接口）。
     */
    @Column(name = "`type`", length = 32, nullable = false)
    private String type;

    /**
     * type=FORM 时绑定的业务表单 key（对应 wf_biz_<form_key> 物理表）。
     */
    @Column(name = "form_key", length = 255)
    private String formKey;

    /**
     * type=SYSTEM/API 时注册的 key（dept-tree / external-stock 等）。
     */
    @Column(name = "source_key", length = 255)
    private String sourceKey;

    /**
     * type=API 时的动态参数 JSON。
     */
    @Lob
    @Column(name = "`params`", columnDefinition = "LONGTEXT")
    private String params;

    /**
     * 状态：DRAFT / ENABLED / DISABLED。默认 DRAFT。
     */
    @Column(name = "status", length = 32, nullable = false)
    private String status = "DRAFT";

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

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getSourceKey() { return sourceKey; }
    public void setSourceKey(String sourceKey) { this.sourceKey = sourceKey; }

    public String getParams() { return params; }
    public void setParams(String params) { this.params = params; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}