package com.workflow.engine.task;

import com.workflow.api.dto.CompleteTaskResponse;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * WorkflowTaskService.completeTaskWithResponse 单元测试。
 *
 * <p>验证：complete 后返回下一个任务信息和流程结束标志。
 */
@ExtendWith(MockitoExtension.class)
class WorkflowTaskServiceCompleteTest {

    @Mock
    TaskService flowableTaskService;
    @Mock
    RuntimeService runtimeService;
    @Mock
    org.flowable.engine.HistoryService historyService;
    @Mock
    com.workflow.engine.tenant.TenantProvider tenantProvider;
    @Mock
    com.workflow.engine.form.mapping.FormDataMerger formDataMerger;
    @Mock
    com.workflow.engine.form.mapping.VariableMappingWriter variableMappingWriter;

    @InjectMocks
    WorkflowTaskService taskService;

    @Test
    void completeTaskWithResponse_returnsNextTask() {
        // 当前任务
        Task currentTask = mock(Task.class);
        lenient().when(currentTask.getProcessInstanceId()).thenReturn("pi-001");

        TaskQuery taskQuery = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(taskQuery);
        when(taskQuery.taskId(anyString())).thenReturn(taskQuery);
        when(taskQuery.singleResult()).thenReturn(currentTask);

        // complete 后的下一个任务
        Task nextTask = mock(Task.class);
        when(nextTask.getId()).thenReturn("task-002");
        when(nextTask.getName()).thenReturn("经理审批");
        when(nextTask.getAssignee()).thenReturn("bob");
        when(nextTask.getTaskDefinitionKey()).thenReturn("managerApproval");
        lenient().when(nextTask.getProcessInstanceId()).thenReturn("pi-001");

        TaskQuery nextQuery = mock(TaskQuery.class);
        // createTaskQuery called twice: first for current task, second for next task
        when(flowableTaskService.createTaskQuery())
                .thenReturn(taskQuery)   // first call: find current task
                .thenReturn(nextQuery);  // second call: find next task
        when(nextQuery.processInstanceId("pi-001")).thenReturn(nextQuery);
        when(nextQuery.singleResult()).thenReturn(nextTask);

        // 流程未结束
        ProcessInstance pi = mock(ProcessInstance.class);
        lenient().when(pi.getId()).thenReturn("pi-001");
        when(runtimeService.createProcessInstanceQuery()).thenReturn(mock(org.flowable.engine.runtime.ProcessInstanceQuery.class, RETURNS_SELF));
        org.flowable.engine.runtime.ProcessInstanceQuery piQuery = runtimeService.createProcessInstanceQuery();
        when(piQuery.processInstanceId("pi-001")).thenReturn(piQuery);
        when(piQuery.singleResult()).thenReturn(pi);

        CompleteTaskResponse response = taskService.completeTaskWithResponse("task-001", Map.of("amount", 1000));

        assertThat(response.getProcessInstanceId()).isEqualTo("pi-001");
        assertThat(response.isProcessFinished()).isFalse();
        assertThat(response.getNextTaskId()).isEqualTo("task-002");
        assertThat(response.getNextTaskName()).isEqualTo("经理审批");
        assertThat(response.getNextTaskAssignee()).isEqualTo("bob");
        assertThat(response.getNextTaskDefinitionKey()).isEqualTo("managerApproval");
    }

    @Test
    void completeTaskWithResponse_processFinished_noNextTask() {
        Task currentTask = mock(Task.class);
        when(currentTask.getProcessInstanceId()).thenReturn("pi-001");

        TaskQuery taskQuery = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(taskQuery);
        when(taskQuery.taskId(anyString())).thenReturn(taskQuery);
        when(taskQuery.singleResult()).thenReturn(currentTask);

        // complete 后无下一个任务
        TaskQuery nextQuery = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery())
                .thenReturn(taskQuery)
                .thenReturn(nextQuery);
        lenient().when(nextQuery.processInstanceId("pi-001")).thenReturn(nextQuery);
        lenient().when(nextQuery.singleResult()).thenReturn(null);

        // 流程已结束（ProcessInstanceQuery 返回 null）
        when(runtimeService.createProcessInstanceQuery()).thenReturn(mock(org.flowable.engine.runtime.ProcessInstanceQuery.class, RETURNS_SELF));
        org.flowable.engine.runtime.ProcessInstanceQuery piQuery = runtimeService.createProcessInstanceQuery();
        when(piQuery.processInstanceId("pi-001")).thenReturn(piQuery);
        when(piQuery.singleResult()).thenReturn(null);

        CompleteTaskResponse response = taskService.completeTaskWithResponse("task-001", Map.of());

        assertThat(response.getProcessInstanceId()).isEqualTo("pi-001");
        assertThat(response.isProcessFinished()).isTrue();
        assertThat(response.getNextTaskId()).isNull();
        assertThat(response.getNextTaskName()).isNull();
    }

    @Test
    void completeTaskWithResponse_taskNotFound_throwsException() {
        TaskQuery taskQuery = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(taskQuery);
        when(taskQuery.taskId(anyString())).thenReturn(taskQuery);
        when(taskQuery.singleResult()).thenReturn(null);

        org.junit.jupiter.api.Assertions.assertThrows(
                IllegalStateException.class,
                () -> taskService.completeTaskWithResponse("nonexistent", Map.of())
        );
    }
}
