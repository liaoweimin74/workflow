package com.workflow.api.dto;

public class ProcessInstanceResponse {

    private String id;
    private String processDefinitionId;
    private String processDefinitionKey;
    private String processDefinitionName;
    private String businessKey;
    private String tenantId;
    private boolean suspended;
    private boolean ended;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getProcessDefinitionId() { return processDefinitionId; }
    public void setProcessDefinitionId(String processDefinitionId) { this.processDefinitionId = processDefinitionId; }
    public String getProcessDefinitionKey() { return processDefinitionKey; }
    public void setProcessDefinitionKey(String processDefinitionKey) { this.processDefinitionKey = processDefinitionKey; }
    public String getProcessDefinitionName() { return processDefinitionName; }
    public void setProcessDefinitionName(String processDefinitionName) { this.processDefinitionName = processDefinitionName; }
    public String getBusinessKey() { return businessKey; }
    public void setBusinessKey(String businessKey) { this.businessKey = businessKey; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public boolean isSuspended() { return suspended; }
    public void setSuspended(boolean suspended) { this.suspended = suspended; }
    public boolean isEnded() { return ended; }
    public void setEnded(boolean ended) { this.ended = ended; }
}