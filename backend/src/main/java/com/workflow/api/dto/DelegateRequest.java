package com.workflow.api.dto;

/**
 * 委派请求。
 *
 * <p>委派（delegate）：当前办理人将任务临时交给他人处理，
 * 被委派人 resolve 后任务回到原办理人。
 */
public class DelegateRequest {
    private String delegateTo;

    public String getDelegateTo() { return delegateTo; }
    public void setDelegateTo(String delegateTo) { this.delegateTo = delegateTo; }
}
