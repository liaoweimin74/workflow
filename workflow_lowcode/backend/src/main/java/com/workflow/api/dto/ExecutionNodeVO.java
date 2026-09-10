package com.workflow.api.dto;

/**
 * 流程执行节点 VO。
 *
 * <p>由 {@code ProcessTaskPredictionService} 组装，将已执行节点、当前活跃节点
 * 和预测的后续节点统一为一个列表，供前端任务执行列表展示。
 *
 * <p>字段说明：
 * <ul>
 *   <li>{@code activityId} — BPMN 节点 ID（taskDefinitionKey）</li>
 *   <li>{@code activityName} — BPMN 节点名称</li>
 *   <li>{@code type} — 节点类型：userTask / endEvent / exclusiveGateway 等</li>
 *   <li>{@code status} — 执行状态：completed / active / predicted</li>
 *   <li>{@code assigneeName} — 办理人姓名（已执行和活跃节点为实际办理人，活跃节点多实例时为 owner）</li>
 *   <li>{@code candidateNames} — 候选人姓名列表（预测节点从 NodeConfig approval.userIds 解析）</li>
 *   <li>{@code endTime} — 完成时间（ISO LocalDateTime，进行中和待执行为 null）</li>
 *   <li>{@code action} — 审批动作（仅已执行节点：complete / reject / transfer / delegate）</li>
 *   <li>{@code comment} — 审批意见文本（仅已执行节点）</li>
 *   <li>{@code hasBranch} — 是否有分支（当前节点后有条件连线）</li>
 *   <li>{@code lineType} — 连线类型：solid（实线，已执行）/ dashed（虚线，预测）</li>
 * </ul>
 */
public class ExecutionNodeVO {

    private String activityId;
    private String activityName;
    private String type;
    private String status;
    private String assigneeName;
    private String candidateNames;
    private String multiMode;
    private String endTime;
    private String action;
    private String comment;
    private String targetUserName;
    private boolean hasBranch;
    private String lineType;

    public String getActivityId() { return activityId; }
    public void setActivityId(String activityId) { this.activityId = activityId; }

    public String getActivityName() { return activityName; }
    public void setActivityName(String activityName) { this.activityName = activityName; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getAssigneeName() { return assigneeName; }
    public void setAssigneeName(String assigneeName) { this.assigneeName = assigneeName; }

    public String getCandidateNames() { return candidateNames; }
    public void setCandidateNames(String candidateNames) { this.candidateNames = candidateNames; }

    public String getMultiMode() { return multiMode; }
    public void setMultiMode(String multiMode) { this.multiMode = multiMode; }

    public String getEndTime() { return endTime; }
    public void setEndTime(String endTime) { this.endTime = endTime; }

    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }

    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }

    public String getTargetUserName() { return targetUserName; }
    public void setTargetUserName(String targetUserName) { this.targetUserName = targetUserName; }

    public boolean isHasBranch() { return hasBranch; }
    public void setHasBranch(boolean hasBranch) { this.hasBranch = hasBranch; }

    public String getLineType() { return lineType; }
    public void setLineType(String lineType) { this.lineType = lineType; }
}
