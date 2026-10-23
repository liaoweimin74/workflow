package com.workflow.engine.app.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 多端应用实体（受众产品，如 商户端/买家端）。
 * 应用数量与命名不限定业务角色；数据边界仍在租户层，应用不构成隔离。
 */
@Entity
@Table(name = "wf_app",
       uniqueConstraints = @UniqueConstraint(name = "uk_app_tenant_code", columnNames = {"tenant_id", "code"}),
       indexes = @Index(name = "idx_app_tenant_status", columnList = "tenant_id, status"))
public class AppDefinition {

    @Id
    @Column(name = "id", length = 80, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    /**
     * 应用编码（租户内唯一）。存量迁移回填固定为 default（默认应用）。
     */
    @Column(name = "code", length = 64, nullable = false)
    private String code;

    @Column(name = "name", length = 255, nullable = false)
    private String name;

    /**
     * 主题配置 JSON（设计令牌覆盖）。
     */
    @Lob
    @Column(name = "theme_json", columnDefinition = "LONGTEXT")
    private String themeJson;

    @Column(name = "status", length = 32, nullable = false)
    private String status = "ACTIVE";

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

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getThemeJson() { return themeJson; }
    public void setThemeJson(String themeJson) { this.themeJson = themeJson; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
