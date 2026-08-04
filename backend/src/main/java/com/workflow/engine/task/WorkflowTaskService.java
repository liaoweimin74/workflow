package com.workflow.engine.task;

import com.workflow.api.dto.CompleteTaskResponse;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class WorkflowTaskService {

    private final org.flowable.engine.TaskService flowableTaskService;
    private final HistoryService historyService;
    private final TenantProvider tenantProvider;
    private final RuntimeService runtimeService;

    public WorkflowTaskService(org.flowable.engine.TaskService flowableTaskService,
                               HistoryService historyService,
                               TenantProvider tenantProvider,
                               RuntimeService runtimeService) {
        this.flowableTaskService = flowableTaskService;
        this.historyService = historyService;
        this.tenantProvider = tenantProvider;
        this.runtimeService = runtimeService;
    }

    public Page<Task> listTodoTasks(String assignee, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = flowableTaskService.createTaskQuery()
                .taskTenantId(tenantId)
                .taskAssignee(assignee)
                .orderByTaskCreateTime()
                .desc();

        long total = query.count();
        List<Task> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Page<Task> listCandidateTasks(String userId, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = flowableTaskService.createTaskQuery()
                .taskTenantId(tenantId)
                .taskCandidateUser(userId)
                .orderByTaskCreateTime()
                .desc();

        long total = query.count();
        List<Task> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Page<HistoricTaskInstance> listHistoricTasks(String userId, Pageable pageable) {
        String tenantId = tenantProvider.getTenantId();
        var query = historyService.createHistoricTaskInstanceQuery()
                .taskTenantId(tenantId)
                .taskAssignee(userId)
                .finished()
                .orderByHistoricTaskInstanceEndTime()
                .desc();

        long total = query.count();
        List<HistoricTaskInstance> content = query
                .listPage((int) pageable.getOffset(), pageable.getPageSize());

        return new PageImpl<>(content, pageable, total);
    }

    public Optional<Task> getTask(String taskId) {
        String tenantId = tenantProvider.getTenantId();
        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .taskTenantId(tenantId)
                .singleResult();
        return Optional.ofNullable(task);
    }

    @Transactional
    public void claimTask(String taskId, String userId) {
        flowableTaskService.claim(taskId, userId);
    }

    @Transactional
    public void completeTask(String taskId, Map<String, Object> variables) {
        flowableTaskService.complete(taskId, variables);
    }

    /**
     * 完成任务并返回下一个任务信息。
     *
     * @param taskId    任务 ID
     * @param variables 流程变量
     * @return 包含下一个任务信息和流程结束标志的响应
     */
    @Transactional
    public CompleteTaskResponse completeTaskWithResponse(String taskId, Map<String, Object> variables) {
        // 1. 查当前任务获取 processInstanceId
        Task currentTask = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (currentTask == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        String processInstanceId = currentTask.getProcessInstanceId();

        // 2. 完成任务
        flowableTaskService.complete(taskId, variables);

        // 3. 查流程是否仍在运行
        ProcessInstance runningInstance = runtimeService.createProcessInstanceQuery()
                .processInstanceId(processInstanceId)
                .singleResult();

        boolean processFinished = (runningInstance == null);

        // 4. 如果流程未结束，查下一个任务
        String nextTaskId = null;
        String nextTaskName = null;
        String nextTaskAssignee = null;
        String nextTaskDefinitionKey = null;

        if (!processFinished) {
            Task nextTask = flowableTaskService.createTaskQuery()
                    .processInstanceId(processInstanceId)
                    .singleResult();

            if (nextTask != null) {
                nextTaskId = nextTask.getId();
                nextTaskName = nextTask.getName();
                nextTaskAssignee = nextTask.getAssignee();
                nextTaskDefinitionKey = nextTask.getTaskDefinitionKey();
            }
        }

        return CompleteTaskResponse.builder()
                .processInstanceId(processInstanceId)
                .processFinished(processFinished)
                .nextTaskId(nextTaskId)
                .nextTaskName(nextTaskName)
                .nextTaskAssignee(nextTaskAssignee)
                .nextTaskDefinitionKey(nextTaskDefinitionKey)
                .build();
    }

    @Transactional
    public void delegateTask(String taskId, String userId) {
        flowableTaskService.delegateTask(taskId, userId);
    }
}