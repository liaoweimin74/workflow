package com.workflow.engine.task;

import com.workflow.api.dto.OperationsConfig;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.task.entity.WfTaskTransfer;
import com.workflow.engine.task.repository.WfTaskTransferRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * TransferService 单元测试。
 *
 * <p>验证：转办操作设置新 assignee 并记录审计日志。
 * 区别于 delegate（委派）：transfer 直接更换 assignee，原办理人不再持有任务。
 * 转办前校验操作权限（流程级 AND 节点级 allowTransfer）。
 */
@ExtendWith(MockitoExtension.class)
class TransferServiceTest {

    @Mock
    TaskService flowableTaskService;
    @Mock
    WfTaskTransferRepository transferRepository;
    @Mock
    TenantProvider tenantProvider;
    @Mock
    WfTaskCommentRepository commentRepository;
    @Mock
    WorkflowTaskService workflowTaskService;

    @InjectMocks
    TransferService transferService;

    @BeforeEach
    void setUp() {
        // 默认允许转办（流程级 AND 节点级解析结果）
        lenient().when(workflowTaskService.extractOperations(anyString(), anyString()))
                .thenReturn(new OperationsConfig());
    }

    private Task mockTask(String taskId, String piId, String assignee) {
        Task task = mock(Task.class);
        lenient().when(task.getId()).thenReturn(taskId);
        lenient().when(task.getProcessInstanceId()).thenReturn(piId);
        lenient().when(task.getAssignee()).thenReturn(assignee);
        lenient().when(task.getProcessDefinitionId()).thenReturn("procdef-1");
        lenient().when(task.getTaskDefinitionKey()).thenReturn("task1");
        return task;
    }

    private void stubTaskQuery(Task task) {
        TaskQuery query = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);
    }

    @Test
    void transfer_setsNewAssigneeAndRecordsAudit() {
        Task task = mockTask("task-001", "pi-001", "alice");
        stubTaskQuery(task);
        when(tenantProvider.getTenantId()).thenReturn("tenant-1");

        transferService.transfer("task-001", "alice", "bob", "出差代办");

        // 验证 setAssignee 被调用
        verify(flowableTaskService).setAssignee("task-001", "bob");

        // 验证审计记录保存
        ArgumentCaptor<WfTaskTransfer> captor = ArgumentCaptor.forClass(WfTaskTransfer.class);
        verify(transferRepository).save(captor.capture());

        WfTaskTransfer record = captor.getValue();
        assertThat(record.getTaskId()).isEqualTo("task-001");
        assertThat(record.getProcessInstanceId()).isEqualTo("pi-001");
        assertThat(record.getFromUser()).isEqualTo("alice");
        assertThat(record.getToUser()).isEqualTo("bob");
        assertThat(record.getReason()).isEqualTo("出差代办");
        assertThat(record.getTenantId()).isEqualTo("tenant-1");
    }

    @Test
    void transfer_taskNotFound_throwsException() {
        stubTaskQuery(null);

        assertThatThrownBy(() -> transferService.transfer("nonexistent", "alice", "bob", "reason"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("Task not found");
    }

    @Test
    void transfer_sameUser_throwsException() {
        assertThatThrownBy(() -> transferService.transfer("task-001", "alice", "alice", "reason"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("same user");
    }

    @Test
    void transfer_nullReason_savedAsNull() {
        Task task = mockTask("task-001", "pi-001", "alice");
        stubTaskQuery(task);
        when(tenantProvider.getTenantId()).thenReturn("tenant-1");

        transferService.transfer("task-001", "alice", "bob", null);

        verify(flowableTaskService).setAssignee("task-001", "bob");

        ArgumentCaptor<WfTaskTransfer> captor = ArgumentCaptor.forClass(WfTaskTransfer.class);
        verify(transferRepository).save(captor.capture());
        assertThat(captor.getValue().getReason()).isNull();
    }

    @Test
    void transfer_operationDisallowed_throws400AndDoesNotChangeAssignee() {
        Task task = mockTask("task-001", "pi-001", "alice");
        stubTaskQuery(task);
        // 权限解析：该节点不允许转办（流程级或节点级 allowTransfer=false）
        OperationsConfig disallowed = new OperationsConfig();
        disallowed.setAllowTransfer(false);
        when(workflowTaskService.extractOperations("procdef-1", "task1")).thenReturn(disallowed);

        assertThatThrownBy(() -> transferService.transfer("task-001", "alice", "bob", "reason"))
                .isInstanceOf(BusinessException.class)
                .hasMessage("该节点不允许转办");

        verify(flowableTaskService, never()).setAssignee(anyString(), anyString());
        verify(transferRepository, never()).save(any());
    }

    @Test
    void transfer_onMultiInstanceTask_setAssigneeAndAudit() {
        // 多实例（会签/或签）节点上的转办：setAssignee 天然等价于转签语义
        // （原办理人待办消失、目标用户待办出现，其他实例不受影响）
        Task task = mockTask("task-001", "pi-001", "alice");
        stubTaskQuery(task);
        when(tenantProvider.getTenantId()).thenReturn("tenant-1");

        transferService.transfer("task-001", "alice", "bob", "会签节点转签");

        verify(flowableTaskService).setAssignee("task-001", "bob");
        ArgumentCaptor<WfTaskTransfer> captor = ArgumentCaptor.forClass(WfTaskTransfer.class);
        verify(transferRepository).save(captor.capture());
        assertThat(captor.getValue().getToUser()).isEqualTo("bob");
        assertThat(captor.getValue().getFromUser()).isEqualTo("alice");
    }
}
