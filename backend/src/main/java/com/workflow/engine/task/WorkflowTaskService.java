package com.workflow.engine.task;

import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.HistoryService;
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

    public WorkflowTaskService(org.flowable.engine.TaskService flowableTaskService,
                               HistoryService historyService,
                               TenantProvider tenantProvider) {
        this.flowableTaskService = flowableTaskService;
        this.historyService = historyService;
        this.tenantProvider = tenantProvider;
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

    @Transactional
    public void delegateTask(String taskId, String userId) {
        flowableTaskService.delegateTask(taskId, userId);
    }
}