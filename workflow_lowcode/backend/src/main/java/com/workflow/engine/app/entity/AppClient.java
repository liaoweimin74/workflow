package com.workflow.engine.app.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 应用客户端实例实体（交付渠道）。
 * 同一 App 下同一端类型允许多个 Client；小程序/H5/APP 的构建配置与导航差异收敛在本层。
 */
@Entity
@Table(name = "wf_app_client",
       uniqueConstraints = @UniqueConstraint(name = "uk_client",
               columnNames = {"tenant_id", "app_id", "client_type", "name"}),
       indexes = @Index(name = "idx_client_tenant_app", columnList = "tenant_id, app_id"))
public class AppClient {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    /**
     * 所属应用 ID（wf_app.id）。
     */
    @Column(name = "app_id", length = 80, nullable = false)
    private String appId;

    /**
     * 端类型：WEB / MP_WEIXIN / H5 / APP。
     */
    @Column(name = "client_type", length = 32, nullable = false)
    private String clientType;

    @Column(name = "name", length = 255, nullable = false)
    private String name;

    /**
     * 渲染模式：RUNTIME（Web 宿主动态渲染）/ CODEGEN（uni-app 出码）。
     * 创建时由端类型推导：WEB → RUNTIME，其余 → CODEGEN。
     */
    @Column(name = "render_mode", length = 16, nullable = false)
    private String renderMode = "CODEGEN";

    /**
     * 构建配置 JSON（小程序 appid / H5 域名 / APP 包名等）。
     */
    @Lob
    @Column(name = "build_config_json", columnDefinition = "LONGTEXT")
    private String buildConfigJson;

    /**
     * 导航配置 JSON（tabBar 样式等）。
     */
    @Lob
    @Column(name = "navigation_json", columnDefinition = "LONGTEXT")
    private String navigationJson;

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

    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }

    public String getClientType() { return clientType; }
    public void setClientType(String clientType) { this.clientType = clientType; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getRenderMode() { return renderMode; }
    public void setRenderMode(String renderMode) { this.renderMode = renderMode; }

    public String getBuildConfigJson() { return buildConfigJson; }
    public void setBuildConfigJson(String buildConfigJson) { this.buildConfigJson = buildConfigJson; }

    public String getNavigationJson() { return navigationJson; }
    public void setNavigationJson(String navigationJson) { this.navigationJson = navigationJson; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
