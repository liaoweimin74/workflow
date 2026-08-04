package com.workflow.engine.task;

import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ChangeActivityStateBuilder;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

import org.mockito.Mockito;

/**
 * RejectService 单元测试。
 *
 * <p>验证：驳回操作使用 changeActivityState 将当前节点移回发起人节点。
 */
@ExtendWith(MockitoExtension.class)
class RejectServiceTest {

    @Mock
    TaskService flowableTaskService;
    @Mock
    RuntimeService runtimeService;
    @Mock
    InitiatorNodeResolver initiatorNodeResolver;

    @InjectMocks
    RejectService rejectService;

    private Task mockTask(String taskId, String piId, String pdId, String activityId) {
        Task task = mock(Task.class);
        lenient().when(task.getId()).thenReturn(taskId);
        lenient().when(task.getProcessInstanceId()).thenReturn(piId);
        lenient().when(task.getProcessDefinitionId()).thenReturn(pdId);
        lenient().when(task.getTaskDefinitionKey()).thenReturn(activityId);
        return task;
    }

    private void stubTaskQuery(Task task) {
        TaskQuery query = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);
    }

    @Test
    void reject_movesCurrentTaskToInitiatorNode() {
        Task task = mockTask("task-001", "pi-001", "pd-001", "managerApproval");
        stubTaskQuery(task);
        when(initiatorNodeResolver.resolve("pd-001")).thenReturn("initiatorTask");

        ChangeActivityStateBuilder builder = mock(ChangeActivityStateBuilder.class);
        when(runtimeService.createChangeActivityStateBuilder()).thenReturn(builder);
        when(builder.processInstanceId(anyString())).thenReturn(builder);
        when(builder.moveActivityIdTo(anyString(), anyString())).thenReturn(builder);

        rejectService.reject("task-001", "bob", "填写有误");

        verify(builder).processInstanceId("pi-001");
        verify(builder).moveActivityIdTo("managerApproval", "initiatorTask");
        verify(builder).changeState();
    }

    @Test
    void reject_taskNotFound_throwsException() {
        stubTaskQuery(null);

        assertThatThrownBy(() -> rejectService.reject("nonexistent", "bob", "reason"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Task not found");
    }

    @Test
    void reject_noInitiatorNode_throwsException() {
        Task task = mockTask("task-001", "pi-001", "pd-001", "managerApproval");
        stubTaskQuery(task);
        when(initiatorNodeResolver.resolve("pd-001")).thenReturn(null);

        assertThatThrownBy(() -> rejectService.reject("task-001", "bob", "reason"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Initiator node not found");
    }

    @Test
    void reject_sameNodeAsInitiator_throwsException() {
        Task task = mockTask("task-001", "pi-001", "pd-001", "initiatorTask");
        stubTaskQuery(task);
        when(initiatorNodeResolver.resolve("pd-001")).thenReturn("initiatorTask");

        assertThatThrownBy(() -> rejectService.reject("task-001", "alice", "reason"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Cannot reject");
    }
}
