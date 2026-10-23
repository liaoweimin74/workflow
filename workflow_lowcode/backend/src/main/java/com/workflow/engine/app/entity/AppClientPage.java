package com.workflow.engine.app.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

/**
 * 客户端页面启用清单实体。
 * Client 的交付内容由本清单决定：未分配的页面不出现在该 Client 的导航、预览与构建产物中。
 * 页面必须属于 Client 所属 App；同一 uniapp 页面可同时分配给小程序与 H5 客户端（同池跨端复用）。
 */
@Entity
@Table(name = "wf_app_client_page",
       uniqueConstraints = @UniqueConstraint(name = "uk_client_page", columnNames = {"client_id", "page_id"}),
       indexes = @Index(name = "idx_client_page_tenant", columnList = "tenant_id, client_id"))
public class AppClientPage {

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
     * 页面 ID（wf_page_def.id，须属同 App）。
     */
    @Column(name = "page_id", length = 64, nullable = false)
    private String pageId;

    /**
     * 导航顺序。
     */
    @Column(name = "sort", nullable = false)
    private Integer sort = 0;

    /**
     * 页面级导航配置 JSON。
     */
    @Lob
    @Column(name = "nav_config_json", columnDefinition = "LONGTEXT")
    private String navConfigJson;

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

    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }

    public Integer getSort() { return sort; }
    public void setSort(Integer sort) { this.sort = sort; }

    public String getNavConfigJson() { return navConfigJson; }
    public void setNavConfigJson(String navConfigJson) { this.navConfigJson = navConfigJson; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
