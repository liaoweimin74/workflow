package com.workflow.api.dto;

/**
 * 表单数据保存请求。
 */
public class FormDataSaveRequest {

    private String formDefId;
    private String processInstanceId;
    private String taskId;
    private String dataJson;

    public String getFormDefId() { return formDefId; }
    public void setFormDefId(String formDefId) { this.formDefId = formDefId; }

    public String getProcessInstanceId() { return processInstanceId; }
    public void setProcessInstanceId(String processInstanceId) { this.processInstanceId = processInstanceId; }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getDataJson() { return dataJson; }
    public void setDataJson(String dataJson) { this.dataJson = dataJson; }
}
