package com.workflow.engine.datasource.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 全局数据源定义实体。
 * 存储数据源（FORM 业务表单 / SYSTEM 系统结构 / API 外部接口）的注册配置与状态。
 * 状态机：DRAFT → ENABLED ⇄ DISABLED；仅 DRAFT 可删除。
 */
@Entity
@Table(name = "wf_data_source",
       uniqueConstraints = {
               @UniqueConstraint(name = "uk_ds_tenant_name", columnNames = {"tenant_id", "name"}),
               @UniqueConstraint(name = "uk_ds_tenant_source_key", columnNames = {"tenant_id", "source_key"})
       },
       indexes = @Index(name = "idx_ds_tenant_type", columnList = "tenant_id, `type`"))
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
     * 关联的业务表单ID（FORM类型数据源使用）。
     */
    @Column(name = "form_id", length = 64)
    private String formId;

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
        syncSourceKeyWithFormKey();
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        syncSourceKeyWithFormKey();
        updatedAt = LocalDateTime.now();
    }

    /**
     * FORM/WORKFLOW 数据源恒等约束兜底：保存时强制 formKey 与 sourceKey 相同。
     * 覆盖绕过 Service 直接 repository.save 的路径（表单事件自动创建、页面迁移），
     * 保证唯一索引 uk_ds_tenant_source_key 下 FORM/WORKFLOW 行的 source_key 始终非空且 = form_key。
     * formKey 为空而 sourceKey 非空时反向填充（兼容调用方只填其一的情形）。
     */
    private void syncSourceKeyWithFormKey() {
        if ("FORM".equals(type) || "WORKFLOW".equals(type)) {
            if (formKey == null || formKey.isBlank()) {
                if (sourceKey != null && !sourceKey.isBlank()) {
                    formKey = sourceKey;
                }
            } else if (sourceKey == null || sourceKey.isBlank()) {
                sourceKey = formKey;
            }
        }
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

    public String getFormId() { return formId; }
    public void setFormId(String formId) { this.formId = formId; }

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