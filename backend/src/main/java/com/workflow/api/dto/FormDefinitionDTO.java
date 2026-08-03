package com.workflow.api.dto;

import java.time.LocalDateTime;

/**
 * 表单定义 DTO（列表展示用）。
 */
public class FormDefinitionDTO {

    private String id;
    private String name;
    private String key;
    private Integer version;
    private String status;
    private Integer publishedVersion;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public FormDefinitionDTO() {}

    public FormDefinitionDTO(String id, String name, String key, Integer version,
                             String status, Integer publishedVersion,
                             String createdBy, LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.name = name;
        this.key = key;
        this.version = version;
        this.status = status;
        this.publishedVersion = publishedVersion;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

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
