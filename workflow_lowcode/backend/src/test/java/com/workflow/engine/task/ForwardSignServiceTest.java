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

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * ForwardSignService 单元测试。
 *
 * <p>验证：转签 = 删除当前审批人的 MI 实例 + 添加新审批人的 MI 实例。
 */
@ExtendWith(MockitoExtension.class)
class ForwardSignServiceTest {

    @Mock
    RuntimeService runtimeService;
    @Mock
    TaskService flowableTaskService;

    @InjectMocks
    ForwardSignService forwardSignService;

    @Test
    void forwardSign_deletesOldInstance_andAddsNewInstance() {
        Task task = mock(Task.class);
        when(task.getProcessInstanceId()).thenReturn("pi-001");
        when(task.getTaskDefinitionKey()).thenReturn("approvalTask");
        when(task.getExecutionId()).thenReturn("exec-001");

        when(flowableTaskService.createTaskQuery())
                .thenReturn(mock(org.flowable.task.api.TaskQuery.class, RETURNS_SELF));
        org.flowable.task.api.TaskQuery query = flowableTaskService.createTaskQuery();
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);

        Execution exec = mock(Execution.class);
        when(runtimeService.addMultiInstanceExecution("approvalTask", "pi-001",
                Map.of("approver", "charlie")))
                .thenReturn(exec);

        forwardSignService.forwardSign("task-001", "charlie");

        verify(runtimeService).deleteMultiInstanceExecution("exec-001", false);
        verify(runtimeService).addMultiInstanceExecution("approvalTask", "pi-001",
                Map.of("approver", "charlie"));
    }

    @Test
    void forwardSign_taskNotFound_throwsException() {
        when(flowableTaskService.createTaskQuery())
                .thenReturn(mock(org.flowable.task.api.TaskQuery.class, RETURNS_SELF));
        org.flowable.task.api.TaskQuery query = flowableTaskService.createTaskQuery();
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(null);

        assertThatThrownBy(() -> forwardSignService.forwardSign("nonexistent", "charlie"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Task not found");
    }

    @Test
    void forwardSign_nullToUser_throwsException() {
        assertThatThrownBy(() -> forwardSignService.forwardSign("task-001", null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("toUser cannot be null");
    }

    @Test
    void forwardSign_emptyToUser_throwsException() {
        assertThatThrownBy(() -> forwardSignService.forwardSign("task-001", ""))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("toUser cannot be null");
    }
}
