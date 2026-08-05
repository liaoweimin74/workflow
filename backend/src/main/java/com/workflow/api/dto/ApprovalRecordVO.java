package com.workflow.api.dto;

/**
 * 审批记录 VO。
 *
 * <p>由 {@code ProcessHistoryService} 组装，将 Flowable 历史活动节点与
 * {@code wf_task_comment} 审批意见聚合为时间线视图。
 *
 * <p>字段说明：
 * <ul>
 *   <li>{@code activityId} — BPMN 节点 ID（taskDefinitionKey）</li>
 *   <li>{@code activityName} — BPMN 节点名称</li>
 *   <li>{@code assignee} — 办理人 ID</li>
 *   <li>{@code assigneeName} — 办理人姓名（来自 UserService）</li>
 *   <li>{@code startTime} — 活动开始时间（ISO LocalDateTime）</li>
 *   <li>{@code endTime} — 活动结束时间（ISO LocalDateTime，进行中为 null）</li>
 *   <li>{@code action} — 审批动作：complete / reject / transfer / delegate / add_sign / forward_sign</li>
 *   <li>{@code comment} — 审批意见文本</li>
 * </ul>
 */
public class ApprovalRecordVO {

    private String activityId;
    private String activityName;
    private String assignee;
    private String assigneeName;
    private String startTime;
    private String endTime;
    private String action;
    private String comment;

    public String getActivityId() { return activityId; }
    public void setActivityId(String activityId) { this.activityId = activityId; }

    public String getActivityName() { return activityName; }
    public void setActivityName(String activityName) { this.activityName = activityName; }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getAssigneeName() { return assigneeName; }
    public void setAssigneeName(String assigneeName) { this.assigneeName = assigneeName; }

    public String getStartTime() { return startTime; }
    public void setStartTime(String startTime) { this.startTime = startTime; }

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
}
