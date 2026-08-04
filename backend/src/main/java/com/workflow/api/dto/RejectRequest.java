package com.workflow.api.dto;

public class RejectRequest {
    private String userId;
    private String reason;

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
