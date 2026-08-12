package com.workflow.engine.task;

import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.MultiInstanceLoopCharacteristics;
import org.flowable.bpmn.model.Process;
import org.flowable.bpmn.model.UserTask;
import org.flowable.engine.RepositoryService;
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
    @Mock
    RepositoryService repositoryService;
    @Mock
    TenantProvider tenantProvider;
    @Mock
    WfTaskCommentRepository commentRepository;

    @InjectMocks
    AddSignService addSignService;

    /** 构造一个含 MI loopCharacteristics 的 BPMN 模型（approvalTask 为 MI 节点）。 */
    private BpmnModel miBpmnModel() {
        BpmnModel bpmnModel = new BpmnModel();
        Process process = new Process();
        process.setId("process1");
        UserTask userTask = new UserTask();
        userTask.setId("approvalTask");
        userTask.setLoopCharacteristics(new MultiInstanceLoopCharacteristics());
        process.addFlowElement(userTask);
        bpmnModel.addProcess(process);
        return bpmnModel;
    }

    /** 构造一个无 loopCharacteristics 的 BPMN 模型（approvalTask 非 MI 节点）。 */
    private BpmnModel plainBpmnModel() {
        BpmnModel bpmnModel = new BpmnModel();
        Process process = new Process();
        process.setId("process1");
        UserTask userTask = new UserTask();
        userTask.setId("approvalTask");
        process.addFlowElement(userTask);
        bpmnModel.addProcess(process);
        return bpmnModel;
    }

    private org.flowable.task.api.TaskQuery taskQueryReturning(Task task) {
        org.flowable.task.api.TaskQuery query = mock(org.flowable.task.api.TaskQuery.class, RETURNS_SELF);
        when(query.taskId(anyString())).thenReturn(query);
        when(query.singleResult()).thenReturn(task);
        return query;
    }

    private Task taskStub() {
        Task task = mock(Task.class);
        when(task.getProcessInstanceId()).thenReturn("pi-001");
        when(task.getTaskDefinitionKey()).thenReturn("approvalTask");
        when(task.getProcessDefinitionId()).thenReturn("pd-001");
        return task;
    }

    @Test
    void addSign_singleUser_addsMultiInstanceExecution() {
        Task task = taskStub();
        org.flowable.task.api.TaskQuery query = taskQueryReturning(task);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(repositoryService.getBpmnModel("pd-001")).thenReturn(miBpmnModel());

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
        Task task = taskStub();
        org.flowable.task.api.TaskQuery query = taskQueryReturning(task);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(repositoryService.getBpmnModel("pd-001")).thenReturn(miBpmnModel());

        addSignService.addSign("task-001", List.of("charlie", "dave"));

        verify(runtimeService).addMultiInstanceExecution("approvalTask", "pi-001",
                Map.of("approver", "charlie"));
        verify(runtimeService).addMultiInstanceExecution("approvalTask", "pi-001",
                Map.of("approver", "dave"));
    }

    @Test
    void addSign_taskNotFound_throwsException() {
        org.flowable.task.api.TaskQuery query = taskQueryReturning(null);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);

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
    void addSign_taskNotMi_addsCandidateUser() {
        Task task = taskStub();
        org.flowable.task.api.TaskQuery query = taskQueryReturning(task);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(repositoryService.getBpmnModel("pd-001")).thenReturn(plainBpmnModel());

        addSignService.addSign("task-001", List.of("charlie"));

        verify(flowableTaskService).addCandidateUser("task-001", "charlie");
        verify(runtimeService, never()).addMultiInstanceExecution(anyString(), anyString(), any());
    }

    @Test
    void addSign_withUserId_writesComment() {
        Task task = taskStub();
        org.flowable.task.api.TaskQuery query = taskQueryReturning(task);
        when(flowableTaskService.createTaskQuery()).thenReturn(query);
        when(repositoryService.getBpmnModel("pd-001")).thenReturn(miBpmnModel());
        when(tenantProvider.getTenantId()).thenReturn("default");

        addSignService.addSign("task-001", List.of("charlie"), "u1", "请补充材料");

        verify(commentRepository).save(argThat(c ->
                "add_sign".equals(c.getAction())
                        && "u1".equals(c.getUserId())
                        && "charlie".equals(c.getTargetUserId())
                        && "pi-001".equals(c.getProcessInstanceId())));
    }
}
