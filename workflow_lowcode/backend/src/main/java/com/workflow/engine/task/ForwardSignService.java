package com.workflow.engine.task;

import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.UUID;

/**
 * 转签服务。
 *
 * <p>转签：会签/或签任务中，当前审批人将自己的审批权转给他人。
 * 与转办（transfer）的区别：
 * - 转办：整个任务换人，适用于单实例任务
 * - 转签：MI 实例级别换人，当前审批人的 MI 实例被删除，新审批人的 MI 实例被添加
 *
 * <p>实现：{@code deleteMultiInstanceExecution}（删除当前实例）+
 * {@code addMultiInstanceExecution}（添加新实例）。
 * 删除时 {@code executionIsCompleted=false}，确保不影响 completionCondition 计数。
 *
 * <p>注意：转签仅适用于 multi-instance 用户任务。
 */
@Service
public class ForwardSignService {

    private static final Logger log = LoggerFactory.getLogger(ForwardSignService.class);

    private final RuntimeService runtimeService;
    private final TaskService flowableTaskService;
    private final TenantProvider tenantProvider;
    private final WfTaskCommentRepository commentRepository;

    public ForwardSignService(RuntimeService runtimeService, TaskService flowableTaskService,
                               TenantProvider tenantProvider, WfTaskCommentRepository commentRepository) {
        this.runtimeService = runtimeService;
        this.flowableTaskService = flowableTaskService;
        this.tenantProvider = tenantProvider;
        this.commentRepository = commentRepository;
    }

    /**
     * 转签：当前审批人将审批权转给他人。
     *
     * @param taskId 当前任务 ID（必须属于 MI 节点）
     * @param toUser 新审批人
     */
    @Transactional
    public void forwardSign(String taskId, String toUser) {
        forwardSign(taskId, toUser, null, null);
    }

    /**
     * 转签：当前审批人将审批权转给他人，并写入审批意见。
     *
     * @param taskId  当前任务 ID（必须属于 MI 节点）
     * @param toUser  新审批人
     * @param userId  操作人 ID
     * @param comment 审批意见
     */
    @Transactional
    public void forwardSign(String taskId, String toUser, String userId, String comment) {
        if (toUser == null || toUser.isBlank()) {
            throw new IllegalArgumentException("toUser cannot be null or blank");
        }

        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (task == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        String activityId = task.getTaskDefinitionKey();
        String processInstanceId = task.getProcessInstanceId();
        String executionId = task.getExecutionId();

        log.info("转签 taskId={} activityId={} pi={} exec={} toUser={}",
                taskId, activityId, processInstanceId, executionId, toUser);

        // 1. 删除当前审批人的 MI 实例（不计入已完成）
        runtimeService.deleteMultiInstanceExecution(executionId, false);

        // 2. 添加新审批人的 MI 实例
        runtimeService.addMultiInstanceExecution(
                activityId,
                processInstanceId,
                Map.of("approver", toUser));

        // 3. 写入审批意见
        if (userId != null) {
            WfTaskComment commentRecord = new WfTaskComment();
            commentRecord.setId(UUID.randomUUID().toString().replace("-", ""));
            commentRecord.setTenantId(tenantProvider.getTenantId());
            commentRecord.setTaskId(taskId);
            commentRecord.setProcessInstanceId(processInstanceId);
            commentRecord.setUserId(userId);
            commentRecord.setAction("forward_sign");
            commentRecord.setComment(comment);
            commentRecord.setTargetUserId(toUser);
            commentRepository.save(commentRecord);
        }
    }
}
