package com.workflow.engine.task;

import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.common.engine.api.FlowableException;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 加签服务。
 *
 * <p>加签：在会签/或签任务运行中，临时增加审批人。
 * 基于 Flowable {@code addMultiInstanceExecution} 实现。
 *
 * <p>前加签和后加签在 MI 场景下行为一致——新增的审批人成为新的 MI 实例，
 * 需要其完成审批后流程才会前进（受 completionCondition 控制）。
 *
 * <p>注意：加签仅适用于 multi-instance 用户任务。对非 MI 任务调用会抛异常。
 */
@Service
public class AddSignService {

    private static final Logger log = LoggerFactory.getLogger(AddSignService.class);

    private final RuntimeService runtimeService;
    private final TaskService flowableTaskService;
    private final RepositoryService repositoryService;
    private final TenantProvider tenantProvider;
    private final WfTaskCommentRepository commentRepository;

    public AddSignService(RuntimeService runtimeService, TaskService flowableTaskService,
                          RepositoryService repositoryService,
                          TenantProvider tenantProvider, WfTaskCommentRepository commentRepository) {
        this.runtimeService = runtimeService;
        this.flowableTaskService = flowableTaskService;
        this.repositoryService = repositoryService;
        this.tenantProvider = tenantProvider;
        this.commentRepository = commentRepository;
    }

    /**
     * 加签：为当前任务增加审批人。
     *
     * @param taskId 当前任务 ID（必须属于 MI 节点）
     * @param users  要加签的用户列表
     */
    @Transactional
    public void addSign(String taskId, List<String> users) {
        addSign(taskId, users, null, null);
    }

    /**
     * 加签：为当前任务增加审批人，并写入审批意见。
     *
     * @param taskId  当前任务 ID（必须属于 MI 节点）
     * @param users   要加签的用户列表
     * @param userId  操作人 ID
     * @param comment 审批意见
     */
    @Transactional
    public void addSign(String taskId, List<String> users, String userId, String comment) {
        if (users == null || users.isEmpty()) {
            throw new IllegalArgumentException("AddSign users cannot be empty");
        }

        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (task == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        String activityId = task.getTaskDefinitionKey();
        String processInstanceId = task.getProcessInstanceId();

        log.info("加签 taskId={} activityId={} pi={} users={}", taskId, activityId, processInstanceId, users);

        // 判断是否 MI 节点
        boolean isMultiInstance = isMultiInstanceActivity(task.getProcessDefinitionId(), activityId);

        if (isMultiInstance) {
            // MI 节点：用 addMultiInstanceExecution 新增审批实例
            for (String user : users) {
                runtimeService.addMultiInstanceExecution(
                        activityId,
                        processInstanceId,
                        Map.of("approver", user));
            }
        } else {
            // 非 MI 节点：加为候选人，让加签人也能看到并处理任务
            for (String user : users) {
                flowableTaskService.addCandidateUser(taskId, user);
            }
        }

        // 写入审批意见
        if (userId != null) {
            WfTaskComment commentRecord = new WfTaskComment();
            commentRecord.setId(UUID.randomUUID().toString().replace("-", ""));
            commentRecord.setTenantId(tenantProvider.getTenantId());
            commentRecord.setTaskId(taskId);
            commentRecord.setProcessInstanceId(processInstanceId);
            commentRecord.setUserId(userId);
            commentRecord.setAction("add_sign");
            commentRecord.setComment(comment);
            commentRecord.setTargetUserId(String.join(",", users));
            commentRepository.save(commentRecord);
        }
    }

    private boolean isMultiInstanceActivity(String processDefinitionId, String activityId) {
        try {
            org.flowable.bpmn.model.BpmnModel model = repositoryService.getBpmnModel(processDefinitionId);
            if (model == null) return false;
            org.flowable.bpmn.model.FlowElement el = model.getMainProcess().getFlowElement(activityId);
            return el instanceof org.flowable.bpmn.model.Activity
                    && ((org.flowable.bpmn.model.Activity) el).getLoopCharacteristics() != null;
        } catch (Exception e) {
            log.warn("Failed to check MI for activity {}: {}", activityId, e.getMessage());
            return false;
        }
    }
}
