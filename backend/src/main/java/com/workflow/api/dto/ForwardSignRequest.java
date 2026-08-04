package com.workflow.api.dto;

/**
 * 转签请求。
 *
 * <p>转签：会签/或签任务中，当前审批人将审批权转给他人。
 * 当前审批人的 MI 实例被删除，新审批人的 MI 实例被添加。
 */
public class ForwardSignRequest {
    /** 新审批人 */
    private String toUser;

    public String getToUser() { return toUser; }
    public void setToUser(String toUser) { this.toUser = toUser; }
}
