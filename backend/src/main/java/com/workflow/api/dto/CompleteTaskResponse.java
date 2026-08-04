package com.workflow.api.dto;

/**
 * complete task 返回值。
 *
 * <p>包含下一个任务信息、流程是否结束、流程实例 ID。
 * 供前端判断：流程是否继续、下一个办理人是谁。
 */
public class CompleteTaskResponse {

    private String processInstanceId;
    private boolean processFinished;
    private String nextTaskId;
    private String nextTaskName;
    private String nextTaskAssignee;
    private String nextTaskDefinitionKey;

    // No-arg constructor for Jackson
    public CompleteTaskResponse() {}

    private CompleteTaskResponse(Builder b) {
        this.processInstanceId = b.processInstanceId;
        this.processFinished = b.processFinished;
        this.nextTaskId = b.nextTaskId;
        this.nextTaskName = b.nextTaskName;
        this.nextTaskAssignee = b.nextTaskAssignee;
        this.nextTaskDefinitionKey = b.nextTaskDefinitionKey;
    }

    public String getProcessInstanceId() { return processInstanceId; }
    public void setProcessInstanceId(String processInstanceId) { this.processInstanceId = processInstanceId; }

    public boolean isProcessFinished() { return processFinished; }
    public void setProcessFinished(boolean processFinished) { this.processFinished = processFinished; }

    public String getNextTaskId() { return nextTaskId; }
    public void setNextTaskId(String nextTaskId) { this.nextTaskId = nextTaskId; }

    public String getNextTaskName() { return nextTaskName; }
    public void setNextTaskName(String nextTaskName) { this.nextTaskName = nextTaskName; }

    public String getNextTaskAssignee() { return nextTaskAssignee; }
    public void setNextTaskAssignee(String nextTaskAssignee) { this.nextTaskAssignee = nextTaskAssignee; }

    public String getNextTaskDefinitionKey() { return nextTaskDefinitionKey; }
    public void setNextTaskDefinitionKey(String nextTaskDefinitionKey) { this.nextTaskDefinitionKey = nextTaskDefinitionKey; }

    public static Builder builder() {
        return new Builder();
    }

    public static class Builder {
        private String processInstanceId;
        private boolean processFinished;
        private String nextTaskId;
        private String nextTaskName;
        private String nextTaskAssignee;
        private String nextTaskDefinitionKey;

        public Builder processInstanceId(String v) { this.processInstanceId = v; return this; }
        public Builder processFinished(boolean v) { this.processFinished = v; return this; }
        public Builder nextTaskId(String v) { this.nextTaskId = v; return this; }
        public Builder nextTaskName(String v) { this.nextTaskName = v; return this; }
        public Builder nextTaskAssignee(String v) { this.nextTaskAssignee = v; return this; }
        public Builder nextTaskDefinitionKey(String v) { this.nextTaskDefinitionKey = v; return this; }

        public CompleteTaskResponse build() { return new CompleteTaskResponse(this); }
    }
}
