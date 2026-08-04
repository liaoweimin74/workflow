package com.workflow.engine.task;

import org.flowable.common.engine.api.FlowableException;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

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

    public AddSignService(RuntimeService runtimeService, TaskService flowableTaskService) {
        this.runtimeService = runtimeService;
        this.flowableTaskService = flowableTaskService;
    }

    /**
     * 加签：为当前任务增加审批人。
     *
     * @param taskId 当前任务 ID（必须属于 MI 节点）
     * @param users  要加签的用户列表
     */
    @Transactional
    public void addSign(String taskId, List<String> users) {
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

        for (String user : users) {
            try {
                runtimeService.addMultiInstanceExecution(
                        activityId,
                        processInstanceId,
                        Map.of("approver", user));
            } catch (FlowableException e) {
                throw new IllegalStateException(
                        "Task is not a multi-instance activity, cannot add sign: " + activityId, e);
            }
        }
    }
}
