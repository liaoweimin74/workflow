package com.workflow.engine.task;

import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.task.entity.WfTaskTransfer;
import com.workflow.engine.task.repository.WfTaskTransferRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
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

    @InjectMocks
    TransferService transferService;

    private Task mockTask(String taskId, String piId, String assignee) {
        Task task = mock(Task.class);
        lenient().when(task.getId()).thenReturn(taskId);
        lenient().when(task.getProcessInstanceId()).thenReturn(piId);
        lenient().when(task.getAssignee()).thenReturn(assignee);
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
}
