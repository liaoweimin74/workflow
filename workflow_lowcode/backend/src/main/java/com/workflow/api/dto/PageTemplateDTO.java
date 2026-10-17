package com.workflow.api.dto;

import java.time.LocalDateTime;

/**
 * 页面模板 DTO（列表项，不含 schema 大字段）。
 */
public class PageTemplateDTO {

    private String id;
    private String name;
    private String key;
    private Integer schemaVersion;
    /** 模板形态：full / skeleton */
    private String kind;
    /** schema 数据源条目总数（绑定状态列用） */
    private Integer dsCount;
    /** 其中 refId 非空的条目数 */
    private Integer dsBound;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public Integer getSchemaVersion() { return schemaVersion; }
    public void setSchemaVersion(Integer schemaVersion) { this.schemaVersion = schemaVersion; }

    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }

    public Integer getDsCount() { return dsCount; }
    public void setDsCount(Integer dsCount) { this.dsCount = dsCount; }

    public Integer getDsBound() { return dsBound; }
    public void setDsBound(Integer dsBound) { this.dsBound = dsBound; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
