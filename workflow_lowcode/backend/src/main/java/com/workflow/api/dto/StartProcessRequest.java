package com.workflow.api.dto;

import java.util.Map;

public class StartProcessRequest {
    private String processKey;
    private String businessKey;
    private String formDefId;
    private Map<String, Object> variables;

    public String getProcessKey() { return processKey; }
    public void setProcessKey(String processKey) { this.processKey = processKey; }
    public String getBusinessKey() { return businessKey; }
    public void setBusinessKey(String businessKey) { this.businessKey = businessKey; }
    public String getFormDefId() { return formDefId; }
    public void setFormDefId(String formDefId) { this.formDefId = formDefId; }
    public Map<String, Object> getVariables() { return variables; }
    public void setVariables(Map<String, Object> variables) { this.variables = variables; }
}