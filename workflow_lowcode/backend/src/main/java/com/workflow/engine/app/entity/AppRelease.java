package com.workflow.engine.app.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 客户端发布快照实体。
 * 页面发布 → 按 Client 生成 Release 快照（启用页面+导航+构建配置），快照不可原地变更；
 * 页面更新发布后通过新建 Release 表达，保证产物可回溯。
 */
@Entity
@Table(name = "wf_app_release",
       uniqueConstraints = @UniqueConstraint(name = "uk_release", columnNames = {"client_id", "version"}),
       indexes = @Index(name = "idx_release_tenant", columnList = "tenant_id"))
public class AppRelease {

    @Id
    @Column(name = "id", length = 64, nullable = false)
    private String id;

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    /**
     * 客户端实例 ID（wf_app_client.id）。
     */
    @Column(name = "client_id", length = 64, nullable = false)
    private String clientId;

    /**
     * 发布版本号（Client 内递增）。
     */
    @Column(name = "version", nullable = false)
    private Integer version;

    /**
     * 发布快照 JSON（启用页面+导航+构建配置）。写入后不可变更。
     */
    @Lob
    @Column(name = "snapshot_json", columnDefinition = "LONGTEXT")
    private String snapshotJson;

    /**
     * 构建产物地址。
     */
    @Column(name = "artifact_url", length = 512)
    private String artifactUrl;

    /**
     * 最近一次构建/上传失败原因（FAILED 可追溯；成功构建后清空）。
     */
    @Column(name = "error", length = 1024)
    private String error;

    /**
     * 状态：CREATED / BUILDING / BUILT / UPLOADED / FAILED。
     */
    @Column(name = "status", length = 32, nullable = false)
    private String status = "CREATED";

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

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public String getSnapshotJson() { return snapshotJson; }
    public void setSnapshotJson(String snapshotJson) { this.snapshotJson = snapshotJson; }

    public String getArtifactUrl() { return artifactUrl; }
    public void setArtifactUrl(String artifactUrl) { this.artifactUrl = artifactUrl; }

    public String getError() { return error; }
    public void setError(String error) { this.error = error; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
