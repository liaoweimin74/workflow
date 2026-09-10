package com.workflow.api.dto;

/**
 * 待办任务 VO。
 *
 * <p>包含任务基本信息 + 关联的流程名称、发起人、发起人姓名、当前节点名。
 * 关联字段通过批量查询填充，避免 N+1。
 */
public class TaskTodoVO {

    private String taskId;
    private String processInstanceId;
    private String processDefinitionId;
    private String processName;
    private String businessKey;
    private String initiator;
    private String initiatorName;
    private String currentNodeName;
    private String assignee;
    private String createTime;
    private boolean reminded;

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }

    public String getProcessInstanceId() { return processInstanceId; }
    public void setProcessInstanceId(String processInstanceId) { this.processInstanceId = processInstanceId; }

    public String getProcessDefinitionId() { return processDefinitionId; }
    public void setProcessDefinitionId(String processDefinitionId) { this.processDefinitionId = processDefinitionId; }

    public String getProcessName() { return processName; }
    public void setProcessName(String processName) { this.processName = processName; }

    public String getBusinessKey() { return businessKey; }
    public void setBusinessKey(String businessKey) { this.businessKey = businessKey; }

    public String getInitiator() { return initiator; }
    public void setInitiator(String initiator) { this.initiator = initiator; }

    public String getInitiatorName() { return initiatorName; }
    public void setInitiatorName(String initiatorName) { this.initiatorName = initiatorName; }

    public String getCurrentNodeName() { return currentNodeName; }
    public void setCurrentNodeName(String currentNodeName) { this.currentNodeName = currentNodeName; }

    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }

    public String getCreateTime() { return createTime; }
    public void setCreateTime(String createTime) { this.createTime = createTime; }

    public boolean isReminded() { return reminded; }
    public void setReminded(boolean reminded) { this.reminded = reminded; }
}
