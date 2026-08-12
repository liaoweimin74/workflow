package com.workflow.api.controller;

import com.workflow.api.dto.PageResponse;
import com.workflow.api.dto.TaskDoneVO;
import com.workflow.api.dto.TaskTodoVO;
import com.workflow.common.domain.R;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.task.AddSignService;
import com.workflow.engine.task.ForwardSignService;
import com.workflow.engine.task.RejectService;
import com.workflow.engine.task.TransferService;
import com.workflow.engine.task.WorkflowTaskService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.TaskService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.task.api.history.HistoricTaskInstanceQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.util.Date;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * TaskController VO 测试。
 *
 * <p>验证：
 * 1. listTodo 返回 PageResponse<TaskTodoVO>，包含 processName/initiatorName 关联字段
 * 2. listHistoric 返回 PageResponse<TaskDoneVO>，包含 endTime/approveResult
 * 3. 过滤参数正确传递
 */
class TaskControllerVOTest {

    private WorkflowTaskService taskService;
    private RejectService rejectService;
    private TransferService transferService;
    private AddSignService addSignService;
    private ForwardSignService forwardSignService;
    private ProcessInstanceService processInstanceService;
    private TaskService flowableTaskService;
    private TaskController controller;

    @BeforeEach
    void setUp() {
        taskService = mock(WorkflowTaskService.class);
        rejectService = mock(RejectService.class);
        transferService = mock(TransferService.class);
        addSignService = mock(AddSignService.class);
        forwardSignService = mock(ForwardSignService.class);
        processInstanceService = mock(ProcessInstanceService.class);
        flowableTaskService = mock(TaskService.class);
        controller = new TaskController(taskService, rejectService, transferService,
                addSignService, forwardSignService, processInstanceService, flowableTaskService);
    }

    @Test
    void listTodoReturnsVOWithProcessNameAndInitiatorName() {
        // Given: a TaskTodoVO with related fields populated
        TaskTodoVO vo = new TaskTodoVO();
        vo.setTaskId("task-001");
        vo.setProcessInstanceId("pi-001");
        vo.setProcessDefinitionId("pd-001");
        vo.setProcessName("请假流程");
        vo.setInitiator("42");
        vo.setInitiatorName("张三");
        vo.setCurrentNodeName("部门审批");
        vo.setAssignee("user1");
        vo.setCreateTime("2025-01-01T10:00:00");

        Page<TaskTodoVO> page = new PageImpl<>(List.of(vo), PageRequest.of(0, 20), 1);
        when(taskService.listTodoTasksVO(eq("user1"), any(), any()))
                .thenReturn(page);

        // When
        R<PageResponse<TaskTodoVO>> result = controller.listTodo(
                "user1", 0, 20, "请假", "42", null, null);

        // Then
        assertThat(result.getCode()).isEqualTo(200);
        PageResponse<TaskTodoVO> data = result.getData();
        assertThat(data.getContent()).hasSize(1);
        TaskTodoVO returned = data.getContent().get(0);
        assertThat(returned.getProcessName()).isEqualTo("请假流程");
        assertThat(returned.getInitiatorName()).isEqualTo("张三");
        assertThat(returned.getTaskId()).isEqualTo("task-001");
        assertThat(returned.getCurrentNodeName()).isEqualTo("部门审批");
    }

    @Test
    void listTodoPassesFilterParams() {
        // Given
        Page<TaskTodoVO> emptyPage = new PageImpl<>(List.of(), PageRequest.of(0, 20), 0);
        when(taskService.listTodoTasksVO(anyString(), any(), any()))
                .thenReturn(emptyPage);

        // When
        controller.listTodo("user1", 0, 10, "请假流程", "42",
                "2025-01-01T00:00:00", "2025-12-31T23:59:59");

        // Then: verify filter params passed to service
        verify(taskService).listTodoTasksVO(eq("user1"), any(), argThat(filters ->
                "请假流程".equals(filters.processName()) &&
                "42".equals(filters.initiator()) &&
                "2025-01-01T00:00:00".equals(filters.createTimeStart()) &&
                "2025-12-31T23:59:59".equals(filters.createTimeEnd())));
    }

    @Test
    void listHistoricReturnsDoneVOWithEndTimeAndApproveResult() {
        // Given
        TaskDoneVO vo = new TaskDoneVO();
        vo.setTaskId("task-002");
        vo.setProcessName("报销流程");
        vo.setInitiatorName("李四");
        vo.setEndTime("2025-06-15T14:30:00");
        vo.setApproveResult("通过");

        Page<TaskDoneVO> page = new PageImpl<>(List.of(vo), PageRequest.of(0, 20), 1);
        when(taskService.listHistoricTasksVO(eq("user1"), any(), any()))
                .thenReturn(page);

        // When
        R<PageResponse<TaskDoneVO>> result = controller.listHistoric(
                "user1", 0, 20, null, null, null, null, null);

        // Then
        assertThat(result.getCode()).isEqualTo(200);
        PageResponse<TaskDoneVO> data = result.getData();
        assertThat(data.getContent()).hasSize(1);
        TaskDoneVO returned = data.getContent().get(0);
        assertThat(returned.getProcessName()).isEqualTo("报销流程");
        assertThat(returned.getEndTime()).isEqualTo("2025-06-15T14:30:00");
        assertThat(returned.getApproveResult()).isEqualTo("通过");
    }

    @Test
    void listHistoricPassesFilterParams() {
        // Given
        Page<TaskDoneVO> emptyPage = new PageImpl<>(List.of(), PageRequest.of(0, 20), 0);
        when(taskService.listHistoricTasksVO(anyString(), any(), any()))
                .thenReturn(emptyPage);

        // When
        controller.listHistoric("user1", 0, 20, "报销", "99",
                "2025-01-01T00:00:00", "2025-12-31T23:59:59", "通过");

        // Then: verify filter params passed to service
        verify(taskService).listHistoricTasksVO(eq("user1"), any(), argThat(filters ->
                "报销".equals(filters.processName()) &&
                "99".equals(filters.initiator()) &&
                "通过".equals(filters.approveResult()) &&
                "2025-01-01T00:00:00".equals(filters.endTimeStart()) &&
                "2025-12-31T23:59:59".equals(filters.endTimeEnd())));
    }
}
