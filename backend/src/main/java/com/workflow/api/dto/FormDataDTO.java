package com.workflow.api.dto;

import java.time.LocalDateTime;

/**
 * 表单实例数据 DTO。
 */
public class FormDataDTO {

    private String id;
    private String formDefId;
    private Integer formVersion;
    private String processInstanceId;
    private String taskId;
    private String dataJson;
    private String createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private Boolean isSnapshot;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getFormDefId() { return formDefId; }
    public void setFormDefId(String formDefId) { this.formDefId = formDefId; }

    public Integer getFormVersion() { return formVersion; }
    public void setFormVersion(Integer formVersion) { this.formVersion = formVersion; }

    public String getProcessInstanceId() { return processInstanceId; }
    public void setProcessInstanceId(String processInstanceId) { this.processInstanceId = processInstanceId; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getDataJson() { return dataJson; }
    public void setDataJson(String dataJson) { this.dataJson = dataJson; }

    public String getCreatedBy() { return createdBy; }
    public void setCreatedBy(String createdBy) { this.createdBy = createdBy; }

    public LocalDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(LocalDateTime createdAt) { this.createdAt = createdAt; }

    public LocalDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(LocalDateTime updatedAt) { this.updatedAt = updatedAt; }

    public Boolean getIsSnapshot() { return isSnapshot; }
    public void setIsSnapshot(Boolean isSnapshot) { this.isSnapshot = isSnapshot; }
}
