package com.workflow.engine.history;

import com.workflow.engine.form.mapping.FormDataMerger;
import com.workflow.engine.form.mapping.VariableMappingWriter;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.task.RejectService;
import com.workflow.engine.task.TransferService;
import com.workflow.engine.task.WorkflowTaskService;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.TaskService;
import org.flowable.engine.runtime.ChangeActivityStateBuilder;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import com.workflow.system.service.UserService;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * 验证任务操作（complete/reject/transfer/delegate）成功后写入 wf_task_comment。
 */
@ExtendWith(MockitoExtension.class)
class TaskCommentWriteTest {

    // ==================== Complete ====================

    @ExtendWith(MockitoExtension.class)
    static class CompleteWritesComment {

        @Mock TaskService flowableTaskService;
        @Mock HistoryService historyService;
        @Mock com.workflow.engine.tenant.TenantProvider tenantProvider;
        @Mock RuntimeService runtimeService;
        @Mock RepositoryService repositoryService;
        @Mock UserService userService;
        @Mock WfTaskCommentRepository commentRepository;
        @Mock FormDataMerger formDataMerger;
        @Mock VariableMappingWriter variableMappingWriter;

        @InjectMocks WorkflowTaskService taskService;

        @Test
        void completeTaskWithResponse_writesComment() {
            Task currentTask = mock(Task.class);
            lenient().when(currentTask.getProcessInstanceId()).thenReturn("pi-001");
            lenient().when(currentTask.getId()).thenReturn("task-001");
            lenient().when(currentTask.getTaskDefinitionKey()).thenReturn("managerApproval");

            TaskQuery taskQuery = mock(TaskQuery.class);
            when(flowableTaskService.createTaskQuery()).thenReturn(taskQuery);
            when(taskQuery.taskId(anyString())).thenReturn(taskQuery);
            when(taskQuery.singleResult()).thenReturn(currentTask);

            TaskQuery nextQuery = mock(TaskQuery.class);
            when(flowableTaskService.createTaskQuery())
                    .thenReturn(taskQuery)
                    .thenReturn(nextQuery);
            lenient().when(nextQuery.processInstanceId("pi-001")).thenReturn(nextQuery);
            lenient().when(nextQuery.singleResult()).thenReturn(null);

            when(runtimeService.createProcessInstanceQuery())
                    .thenReturn(mock(org.flowable.engine.runtime.ProcessInstanceQuery.class, withSettings().lenient()));
            var piQuery = runtimeService.createProcessInstanceQuery();
            lenient().when(piQuery.processInstanceId("pi-001")).thenReturn(piQuery);
            lenient().when(piQuery.singleResult()).thenReturn(null);

            when(tenantProvider.getTenantId()).thenReturn("tenant-1");

            taskService.completeTaskWithResponse("task-001", Map.of(), "bob", "同意审批");

            ArgumentCaptor<WfTaskComment> captor = ArgumentCaptor.forClass(WfTaskComment.class);
            verify(commentRepository).save(captor.capture());

            WfTaskComment comment = captor.getValue();
            assertThat(comment.getTaskId()).isEqualTo("task-001");
            assertThat(comment.getProcessInstanceId()).isEqualTo("pi-001");
            assertThat(comment.getUserId()).isEqualTo("bob");
            assertThat(comment.getAction()).isEqualTo("complete");
            assertThat(comment.getComment()).isEqualTo("同意审批");
            assertThat(comment.getTenantId()).isEqualTo("tenant-1");
        }
    }

    // ==================== Reject ====================

    @ExtendWith(MockitoExtension.class)
    static class RejectWritesComment {

        @Mock TaskService flowableTaskService;
        @Mock RuntimeService runtimeService;
        @Mock InitiatorNodeResolver initiatorNodeResolver;
        @Mock TenantProvider tenantProvider;
        @Mock WfTaskCommentRepository commentRepository;
        @Mock VariableMappingWriter variableMappingWriter;

        @InjectMocks RejectService rejectService;

        @Test
        void reject_writesComment() {
            Task task = mock(Task.class);
            lenient().when(task.getId()).thenReturn("task-001");
            lenient().when(task.getProcessInstanceId()).thenReturn("pi-001");
            lenient().when(task.getProcessDefinitionId()).thenReturn("pd-001");
            lenient().when(task.getTaskDefinitionKey()).thenReturn("managerApproval");

            TaskQuery query = mock(TaskQuery.class);
            when(flowableTaskService.createTaskQuery()).thenReturn(query);
            when(query.taskId(anyString())).thenReturn(query);
            when(query.singleResult()).thenReturn(task);

            when(initiatorNodeResolver.resolve("pd-001")).thenReturn("initiatorTask");

            ChangeActivityStateBuilder builder = mock(ChangeActivityStateBuilder.class);
            when(runtimeService.createChangeActivityStateBuilder()).thenReturn(builder);
            lenient().when(builder.processInstanceId(anyString())).thenReturn(builder);
            lenient().when(builder.moveActivityIdTo(anyString(), anyString())).thenReturn(builder);

            when(tenantProvider.getTenantId()).thenReturn("tenant-1");

            rejectService.reject("task-001", "bob", "信息不完整");

            ArgumentCaptor<WfTaskComment> captor = ArgumentCaptor.forClass(WfTaskComment.class);
            verify(commentRepository).save(captor.capture());

            WfTaskComment comment = captor.getValue();
            assertThat(comment.getTaskId()).isEqualTo("task-001");
            assertThat(comment.getProcessInstanceId()).isEqualTo("pi-001");
            assertThat(comment.getUserId()).isEqualTo("bob");
            assertThat(comment.getAction()).isEqualTo("reject");
            assertThat(comment.getComment()).isEqualTo("信息不完整");
            assertThat(comment.getTenantId()).isEqualTo("tenant-1");
        }
    }

    // ==================== Transfer ====================

    @ExtendWith(MockitoExtension.class)
    static class TransferWritesComment {

        @Mock TaskService flowableTaskService;
        @Mock com.workflow.engine.task.repository.WfTaskTransferRepository transferRepository;
        @Mock TenantProvider tenantProvider;
        @Mock WfTaskCommentRepository commentRepository;

        @InjectMocks TransferService transferService;

        @Test
        void transfer_writesComment() {
            Task task = mock(Task.class);
            lenient().when(task.getId()).thenReturn("task-001");
            lenient().when(task.getProcessInstanceId()).thenReturn("pi-001");
            lenient().when(task.getAssignee()).thenReturn("alice");

            TaskQuery query = mock(TaskQuery.class);
            when(flowableTaskService.createTaskQuery()).thenReturn(query);
            when(query.taskId(anyString())).thenReturn(query);
            when(query.singleResult()).thenReturn(task);

            when(tenantProvider.getTenantId()).thenReturn("tenant-1");

            transferService.transfer("task-001", "alice", "bob", "出差代办");

            ArgumentCaptor<WfTaskComment> captor = ArgumentCaptor.forClass(WfTaskComment.class);
            verify(commentRepository).save(captor.capture());

            WfTaskComment comment = captor.getValue();
            assertThat(comment.getTaskId()).isEqualTo("task-001");
            assertThat(comment.getProcessInstanceId()).isEqualTo("pi-001");
            assertThat(comment.getUserId()).isEqualTo("alice");
            assertThat(comment.getAction()).isEqualTo("transfer");
            assertThat(comment.getComment()).isEqualTo("出差代办");
            assertThat(comment.getTenantId()).isEqualTo("tenant-1");
        }
    }

    // ==================== Delegate ====================

    @ExtendWith(MockitoExtension.class)
    static class DelegateWritesComment {

        @Mock TaskService flowableTaskService;
        @Mock HistoryService historyService;
        @Mock TenantProvider tenantProvider;
        @Mock RuntimeService runtimeService;
        @Mock RepositoryService repositoryService;
        @Mock UserService userService;
        @Mock WfTaskCommentRepository commentRepository;
        @Mock FormDataMerger formDataMerger;
        @Mock VariableMappingWriter variableMappingWriter;

        @InjectMocks WorkflowTaskService taskService;

        @Test
        void delegateTask_writesComment() {
            Task task = mock(Task.class);
            lenient().when(task.getId()).thenReturn("task-001");
            lenient().when(task.getProcessInstanceId()).thenReturn("pi-001");
            lenient().when(task.getTaskDefinitionKey()).thenReturn("managerApproval");

            TaskQuery query = mock(TaskQuery.class);
            when(flowableTaskService.createTaskQuery()).thenReturn(query);
            when(query.taskId(anyString())).thenReturn(query);
            when(query.singleResult()).thenReturn(task);

            when(tenantProvider.getTenantId()).thenReturn("tenant-1");

            taskService.delegateTaskWithComment("task-001", "bob", "alice", "委派处理");

            verify(flowableTaskService).delegateTask("task-001", "bob");

            ArgumentCaptor<WfTaskComment> captor = ArgumentCaptor.forClass(WfTaskComment.class);
            verify(commentRepository).save(captor.capture());

            WfTaskComment comment = captor.getValue();
            assertThat(comment.getTaskId()).isEqualTo("task-001");
            assertThat(comment.getProcessInstanceId()).isEqualTo("pi-001");
            assertThat(comment.getUserId()).isEqualTo("alice");
            assertThat(comment.getAction()).isEqualTo("delegate");
            assertThat(comment.getComment()).isEqualTo("委派处理");
            assertThat(comment.getTenantId()).isEqualTo("tenant-1");
        }
    }
}
