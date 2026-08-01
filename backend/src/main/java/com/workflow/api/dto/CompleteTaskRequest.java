package com.workflow.api.dto;

import java.util.Map;

public class CompleteTaskRequest {
    private Map<String, Object> variables;

    public Map<String, Object> getVariables() { return variables; }
    public void setVariables(Map<String, Object> variables) { this.variables = variables; }
}