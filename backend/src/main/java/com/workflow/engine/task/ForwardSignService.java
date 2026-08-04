package com.workflow.engine.task;

import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

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

    public ForwardSignService(RuntimeService runtimeService, TaskService flowableTaskService) {
        this.runtimeService = runtimeService;
        this.flowableTaskService = flowableTaskService;
    }

    /**
     * 转签：当前审批人将审批权转给他人。
     *
     * @param taskId 当前任务 ID（必须属于 MI 节点）
     * @param toUser 新审批人
     */
    @Transactional
    public void forwardSign(String taskId, String toUser) {
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
    }
}
