package com.workflow.api.dto;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 业务数据记录（行）。
 */
public class BizDataVO {

    private String id;
    /** 业务字段值（不含系统列） */
    private Map<String, Object> data;
    /** 乐观锁版本 */
    private Integer version;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public BizDataVO() {}

    public BizDataVO(String id, Map<String, Object> data, Integer version,
                     LocalDateTime createdAt, LocalDateTime updatedAt) {
        this.id = id;
        this.data = data;
        this.version = version;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Map<String, Object> getData() { return data; }
    public void setData(Map<String, Object> data) { this.data = data; }

    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }
}
