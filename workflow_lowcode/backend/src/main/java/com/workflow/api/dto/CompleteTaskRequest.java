package com.workflow.api.dto;

import java.util.Map;

public class CompleteTaskRequest {
    private Map<String, Object> variables;
    private String userId;
    private String comment;

    public Map<String, Object> getVariables() { return variables; }
    public void setVariables(Map<String, Object> variables) { this.variables = variables; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}