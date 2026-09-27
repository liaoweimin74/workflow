package com.workflow.api.dto;

import java.util.Map;

public class CompleteTaskRequest {
    private Map<String, Object> variables;
    private String userId;
    private String comment;
    /** 手写签名图片 dataURL（节点开启手写签名时随 complete 提交，V41 落库） */
    private String signature;

    public Map<String, Object> getVariables() { return variables; }
    public void setVariables(Map<String, Object> variables) { this.variables = variables; }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public String getSignature() { return signature; }
    public void setSignature(String signature) { this.signature = signature; }
}