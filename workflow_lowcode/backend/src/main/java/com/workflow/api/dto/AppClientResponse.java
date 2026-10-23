package com.workflow.api.dto;

import java.time.LocalDateTime;

/**
 * 客户端实例响应 VO。
 */
public class AppClientResponse {

    private String id;
    private String appId;
    private String clientType;
    private String name;
    private String renderMode;
    private String buildConfigJson;
    private String navigationJson;
    private String status;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

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

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
