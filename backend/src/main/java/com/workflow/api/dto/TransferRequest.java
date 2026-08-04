package com.workflow.api.dto;

public class TransferRequest {
    private String fromUser;
    private String toUser;
    private String reason;

    public String getFromUser() { return fromUser; }
    public void setFromUser(String fromUser) { this.fromUser = fromUser; }

    public String getToUser() { return toUser; }
    public void setToUser(String toUser) { this.toUser = toUser; }

    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
}
