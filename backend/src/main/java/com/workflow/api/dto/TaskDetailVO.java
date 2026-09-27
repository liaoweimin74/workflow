package com.workflow.api.dto;

import java.util.Map;

/**
 * 任务详情 VO。
 */
public class TaskDetailVO {

    private String taskId;
    private String name;
    private String description;
    private String assignee;
    private String assigneeName;
    private String processInstanceId;
    private String processDefinitionId;
    private String processName;

    private Integer processVersion;
    private String businessKey;
    private String initiator;
    private String initiatorName;
    private String formKey;
    private Map<String, String> fieldPermissions;
    private OperationsConfig operations;
    private Map<String, Object> variables;

    private Map<String, Object> mappedData;
    private String createTime;

    private Boolean isInitiatorTask;

    /** 节点类别：initiator / approver / handler（前端按钮区分；旧数据=approver）。 */
    private String taskRole;

    /** 节点级行为开关（前端按钮/表单渲染用；从节点配置解析，旧数据全 false）。 */
    private NodeFlags nodeFlags;

    /** 上次签名 dataURL（仅 signature.useLast=true 时回查该办理人最近一条 approve 签名回填）。 */
    private String lastSignature;

    /**
     * 节点行为标记（对齐 NodeJS TaskDetailVO.nodeFlags）。
     */
    public static class NodeFlags {
        /** 处理/审批意见必填。 */
        private boolean commentRequired;
        /** 手写签名开关。 */
        private boolean signatureEnabled;
        /** 手写签名必填。 */
        private boolean signatureRequired;
        /** 默认使用上次签名（signature.useLast）。 */
        private boolean signatureUseLast;
        /** 支持上传签名图片（signature.allowUpload）。 */
        private boolean signatureAllowUpload;

        public boolean isCommentRequired() { return commentRequired; }
        public void setCommentRequired(boolean commentRequired) { this.commentRequired = commentRequired; }
        public boolean isSignatureEnabled() { return signatureEnabled; }
        public void setSignatureEnabled(boolean signatureEnabled) { this.signatureEnabled = signatureEnabled; }
        public boolean isSignatureRequired() { return signatureRequired; }
        public void setSignatureRequired(boolean signatureRequired) { this.signatureRequired = signatureRequired; }
        public boolean isSignatureUseLast() { return signatureUseLast; }
        public void setSignatureUseLast(boolean signatureUseLast) { this.signatureUseLast = signatureUseLast; }
        public boolean isSignatureAllowUpload() { return signatureAllowUpload; }
        public void setSignatureAllowUpload(boolean signatureAllowUpload) { this.signatureAllowUpload = signatureAllowUpload; }
    }

    public String getTaskId() { return taskId; }
    public void setTaskId(String taskId) { this.taskId = taskId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getAssignee() { return assignee; }
    public void setAssignee(String assignee) { this.assignee = assignee; }
    public String getAssigneeName() { return assigneeName; }
    public void setAssigneeName(String assigneeName) { this.assigneeName = assigneeName; }
    public String getProcessInstanceId() { return processInstanceId; }
    public void setProcessInstanceId(String processInstanceId) { this.processInstanceId = processInstanceId; }
    public String getProcessDefinitionId() { return processDefinitionId; }
    public void setProcessDefinitionId(String processDefinitionId) { this.processDefinitionId = processDefinitionId; }
    public String getProcessName() { return processName; }
    public void setProcessName(String processName) { this.processName = processName; }
    public Integer getProcessVersion() { return processVersion; }
    public void setProcessVersion(Integer processVersion) { this.processVersion = processVersion; }
    public String getBusinessKey() { return businessKey; }
    public void setBusinessKey(String businessKey) { this.businessKey = businessKey; }
    public String getInitiator() { return initiator; }
    public void setInitiator(String initiator) { this.initiator = initiator; }
    public String getInitiatorName() { return initiatorName; }
    public void setInitiatorName(String initiatorName) { this.initiatorName = initiatorName; }
    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }
    public Map<String, String> getFieldPermissions() { return fieldPermissions; }
    public void setFieldPermissions(Map<String, String> fieldPermissions) { this.fieldPermissions = fieldPermissions; }
    public OperationsConfig getOperations() { return operations; }
    public void setOperations(OperationsConfig operations) { this.operations = operations; }
    public Map<String, Object> getVariables() { return variables; }
    public void setVariables(Map<String, Object> variables) { this.variables = variables; }
    public Map<String, Object> getMappedData() { return mappedData; }
    public void setMappedData(Map<String, Object> mappedData) { this.mappedData = mappedData; }
    public String getCreateTime() { return createTime; }
    public void setCreateTime(String createTime) { this.createTime = createTime; }
    public Boolean getIsInitiatorTask() { return isInitiatorTask; }
    public void setIsInitiatorTask(Boolean isInitiatorTask) { this.isInitiatorTask = isInitiatorTask; }
    public String getTaskRole() { return taskRole; }
    public void setTaskRole(String taskRole) { this.taskRole = taskRole; }
    public NodeFlags getNodeFlags() { return nodeFlags; }
    public void setNodeFlags(NodeFlags nodeFlags) { this.nodeFlags = nodeFlags; }
    public String getLastSignature() { return lastSignature; }
    public void setLastSignature(String lastSignature) { this.lastSignature = lastSignature; }
}
