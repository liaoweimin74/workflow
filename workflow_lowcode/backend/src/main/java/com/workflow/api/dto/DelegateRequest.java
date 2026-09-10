package com.workflow.api.dto;

/**
 * 委派请求。
 *
 * <p>委派（delegate）：当前办理人将任务临时交给他人处理，
 * 被委派人 resolve 后任务回到原办理人。
 */
public class DelegateRequest {
    private String delegateTo;
    private String fromUser;
    private String comment;

    public String getDelegateTo() { return delegateTo; }
    public void setDelegateTo(String delegateTo) { this.delegateTo = delegateTo; }

    public String getFromUser() { return fromUser; }
    public void setFromUser(String fromUser) { this.fromUser = fromUser; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
