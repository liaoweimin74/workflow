package com.workflow.engine.task;

import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.Execution;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * AddSignService 单元测试。
 *
 * <p>验证：加签（前加签/后加签）通过 addMultiInstanceExecution 实现。
 */
@ExtendWith(MockitoExtension.class)
class AddSignServiceTest {

    @Mock
    RuntimeService runtimeService;
    @Mock
    TaskService flowableTaskService;

    @InjectMocks
    AddSignService addSignService;

    @Test
    void addSign_singleUser_addsMultiInstanceExecution() {
        Task task = mock(Task.class);
        when(task.getProcessInstanceId()).thenReturn("pi-001");
        when(task.getTaskDefinitionKey()).thenReturn("approvalTask");

        when(flowableTaskService.createTaskQuery())
                .thenReturn(mock(org.flowable.task.api.TaskQuery.class, RETURNS_SELF));
        org.flowable.task.api.TaskQuery query = flowableTaskService.createTaskQuery();
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);

        Execution exec = mock(Execution.class);
        when(runtimeService.addMultiInstanceExecution("approvalTask", "pi-001",
                Map.of("approver", "charlie")))
                .thenReturn(exec);

        addSignService.addSign("task-001", List.of("charlie"));

        verify(runtimeService).addMultiInstanceExecution("approvalTask", "pi-001",
                Map.of("approver", "charlie"));
    }

    @Test
    void addSign_multipleUsers_addsEachAsMultiInstance() {
        Task task = mock(Task.class);
        when(task.getProcessInstanceId()).thenReturn("pi-001");
        when(task.getTaskDefinitionKey()).thenReturn("approvalTask");

        when(flowableTaskService.createTaskQuery())
                .thenReturn(mock(org.flowable.task.api.TaskQuery.class, RETURNS_SELF));
        org.flowable.task.api.TaskQuery query = flowableTaskService.createTaskQuery();
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);

        addSignService.addSign("task-001", List.of("charlie", "dave"));

        verify(runtimeService).addMultiInstanceExecution("approvalTask", "pi-001",
                Map.of("approver", "charlie"));
        verify(runtimeService).addMultiInstanceExecution("approvalTask", "pi-001",
                Map.of("approver", "dave"));
    }

    @Test
    void addSign_taskNotFound_throwsException() {
        when(flowableTaskService.createTaskQuery())
                .thenReturn(mock(org.flowable.task.api.TaskQuery.class, RETURNS_SELF));
        org.flowable.task.api.TaskQuery query = flowableTaskService.createTaskQuery();
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(null);

        assertThatThrownBy(() -> addSignService.addSign("nonexistent", List.of("charlie")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Task not found");
    }

    @Test
    void addSign_emptyUsers_throwsException() {
        assertThatThrownBy(() -> addSignService.addSign("task-001", List.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("users cannot be empty");
    }

    @Test
    void addSign_nullUsers_throwsException() {
        assertThatThrownBy(() -> addSignService.addSign("task-001", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("users cannot be empty");
    }

    @Test
    void addSign_taskNotMi_throwsException() {
        Task task = mock(Task.class);
        when(task.getProcessInstanceId()).thenReturn("pi-001");
        when(task.getTaskDefinitionKey()).thenReturn("approvalTask");

        when(flowableTaskService.createTaskQuery())
                .thenReturn(mock(org.flowable.task.api.TaskQuery.class, RETURNS_SELF));
        org.flowable.task.api.TaskQuery query = flowableTaskService.createTaskQuery();
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);

        // addMultiInstanceExecution throws → task not MI
        when(runtimeService.addMultiInstanceExecution(anyString(), anyString(), any()))
                .thenThrow(new org.flowable.common.engine.api.FlowableException("not a multi instance activity"));

        assertThatThrownBy(() -> addSignService.addSign("task-001", List.of("charlie")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("not a multi-instance");
    }
}
