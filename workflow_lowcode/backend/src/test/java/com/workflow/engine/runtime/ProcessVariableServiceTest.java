package com.workflow.engine.runtime;

import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * ProcessVariableService 单元测试。
 *
 * <p>验证：流程变量的读取、设置（运行时实例级 + 任务级）。
 */
@ExtendWith(MockitoExtension.class)
class ProcessVariableServiceTest {

    @Mock
    RuntimeService runtimeService;
    @Mock
    TaskService flowableTaskService;

    @InjectMocks
    ProcessVariableService processVariableService;

    @Test
    void getVariables_returnsRuntimeVariables() {
        Map<String, Object> vars = new HashMap<>();
        vars.put("amount", 1000);
        vars.put("approver", "bob");
        when(runtimeService.getVariables("pi-001")).thenReturn(vars);

        Map<String, Object> result = processVariableService.getVariables("pi-001");

        assertThat(result).containsEntry("amount", 1000).containsEntry("approver", "bob");
    }

    @Test
    void getVariable_singleValue_returnsValue() {
        when(runtimeService.getVariable("pi-001", "amount")).thenReturn(1000);

        Object result = processVariableService.getVariable("pi-001", "amount");

        assertThat(result).isEqualTo(1000);
    }

    @Test
    void setVariables_runtimeInstance_setsVariables() {
        Map<String, Object> vars = Map.of("amount", 2000, "status", "approved");

        processVariableService.setVariables("pi-001", vars);

        verify(runtimeService).setVariables("pi-001", vars);
    }

    @Test
    void setVariable_singleValue_setsVariable() {
        processVariableService.setVariable("pi-001", "status", "approved");

        verify(runtimeService).setVariable("pi-001", "status", "approved");
    }

    @Test
    void setTaskVariables_setsVariablesOnTask() {
        Task task = mock(Task.class);
        when(task.getProcessInstanceId()).thenReturn("pi-001");
        TaskQuery query = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);

        Map<String, Object> vars = Map.of("formData", "表单数据");
        processVariableService.setTaskVariables("task-001", vars);

        verify(runtimeService).setVariables("pi-001", vars);
    }

    @Test
    void setTaskVariables_taskNotFound_throwsException() {
        TaskQuery query = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(null);

        assertThatThrownBy(() -> processVariableService.setTaskVariables("nonexistent", Map.of("k", "v")))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Task not found");
    }

    @Test
    void removeVariable_removesFromRuntime() {
        processVariableService.removeVariable("pi-001", "amount");

        verify(runtimeService).removeVariable("pi-001", "amount");
    }
}
