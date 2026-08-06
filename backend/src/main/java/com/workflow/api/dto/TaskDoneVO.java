package com.workflow.api.dto;

/**
 * 已办任务 VO。
 *
 * <p>继承 TaskTodoVO，增加结束时间和审批结果字段。
 * approveResult 取自 wf_task_comment.action（通过/驳回/转办/委派/加签/转签）。
 */
public class TaskDoneVO extends TaskTodoVO {

    private String endTime;
    private String approveResult;

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public String getApproveResult() { return approveResult; }
    public void setApproveResult(String approveResult) { this.approveResult = approveResult; }
}
