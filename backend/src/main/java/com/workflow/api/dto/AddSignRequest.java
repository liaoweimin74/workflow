package com.workflow.api.dto;

import java.util.List;

/**
 * 加签请求。
 *
 * <p>加签：在会签/或签任务运行中，临时增加审批人。
 * 新增的审批人需要完成审批后流程才会前进。
 */
public class AddSignRequest {
    /** 要加签的用户列表 */
    private List<String> users;

    public List<String> getUsers() { return users; }
    public void setUsers(List<String> users) { this.users = users; }
}
