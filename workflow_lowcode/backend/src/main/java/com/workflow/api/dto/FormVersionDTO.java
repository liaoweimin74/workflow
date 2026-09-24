package com.workflow.api.dto;

import java.time.LocalDateTime;

/**
 * 表单版本 DTO。
 */
public class FormVersionDTO {

    private String id;
    private Integer version;
    private String status;
    private String createdBy;
    private LocalDateTime createdAt;

    public FormVersionDTO() {}

    public FormVersionDTO(String id, Integer version, String status, String createdBy, LocalDateTime createdAt) {
        this.id = id;
        this.version = version;
        this.status = status;
        this.createdBy = createdBy;
        this.createdAt = createdAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }
}
