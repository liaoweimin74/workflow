package com.workflow.api.dto;

/**
 * 已办任务 VO。
 *
 * <p>继承 TaskTodoVO，增加结束时间、审批结果和当前节点字段。
 * approveResult 取自 wf_task_comment.action（通过/驳回/转办/委派/加签/转签）。
 * currentNode 为流程当前待办节点（不同于办理节点 currentNodeName）。
 */
public class TaskDoneVO extends TaskTodoVO {

    private String endTime;
    private String approveResult;
    /** 流程当前待办节点（非办理节点）。 */
    private String currentNode;

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public String getApproveResult() { return approveResult; }
    public void setApproveResult(String approveResult) { this.approveResult = approveResult; }

    public String getCurrentNode() { return currentNode; }
    public void setCurrentNode(String currentNode) { this.currentNode = currentNode; }
}
