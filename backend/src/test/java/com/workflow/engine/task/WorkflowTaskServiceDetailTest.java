package com.workflow.engine.task;

import com.workflow.api.dto.TaskDetailVO;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.history.HistoricProcessInstanceQuery;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.repository.ProcessDefinitionQuery;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.engine.runtime.ProcessInstanceQuery;
import org.flowable.task.api.Task;
import org.flowable.task.api.TaskQuery;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.flowable.variable.api.history.HistoricVariableInstanceQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * WorkflowTaskService.getTaskDetail 测试。
 *
 * <p>验证：
 * 1. 返回 TaskDetailVO（包含任务字段 + processName + initiator + initiatorName + businessKey + formKey + variables）
 * 2. 关联字段正确填充
 * 3. 任务不存在时返回 Optional.empty()
 */
class WorkflowTaskServiceDetailTest {

    private TaskService flowableTaskService;
    private HistoryService historyService;
    private TenantProvider tenantProvider;
    private RuntimeService runtimeService;
    private RepositoryService repositoryService;
    private UserService userService;
    private WfTaskCommentRepository commentRepository;
    private WorkflowTaskService service;

    @BeforeEach
    void setUp() {
        flowableTaskService = mock(TaskService.class);
        historyService = mock(HistoryService.class);
        tenantProvider = mock(TenantProvider.class);
        runtimeService = mock(RuntimeService.class);
        repositoryService = mock(RepositoryService.class);
        userService = mock(UserService.class);
        commentRepository = mock(WfTaskCommentRepository.class);
        service = new WorkflowTaskService(flowableTaskService, historyService, tenantProvider,
                runtimeService, repositoryService, userService, commentRepository);
        when(tenantProvider.getTenantId()).thenReturn("default");
    }

    @Test
    void getTaskDetailReturnsVOWithProcessNameInitiatorNameAndVariables() {
        // Given: a task with process instance and definition
        String taskId = "task-001";
        String processInstanceId = "pi-001";
        String processDefinitionId = "pd-001:1:42";

        Task task = mock(Task.class);
        when(task.getId()).thenReturn(taskId);
        when(task.getName()).thenReturn("部门审批");
        when(task.getDescription()).thenReturn("请审批");
        when(task.getAssignee()).thenReturn("user1");
        when(task.getProcessInstanceId()).thenReturn(processInstanceId);
        when(task.getProcessDefinitionId()).thenReturn(processDefinitionId);
        when(task.getCreateTime()).thenReturn(new Date());
        when(task.getTaskDefinitionKey()).thenReturn("deptApprove");

        TaskQuery taskQuery = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(taskQuery);
        when(taskQuery.taskId(anyString())).thenReturn(taskQuery);
        when(taskQuery.taskTenantId(anyString())).thenReturn(taskQuery);
        when(taskQuery.singleResult()).thenReturn(task);

        // ProcessInstance (batch query pattern: processInstanceIds(Set).list())
        ProcessInstance pi = mock(ProcessInstance.class);
        when(pi.getId()).thenReturn(processInstanceId);
        when(pi.getBusinessKey()).thenReturn("BIZ-001");
        ProcessInstanceQuery piQuery = mock(ProcessInstanceQuery.class);
        when(runtimeService.createProcessInstanceQuery()).thenReturn(piQuery);
        when(piQuery.processInstanceIds(any())).thenReturn(piQuery);
        when(piQuery.list()).thenReturn(List.of(pi));

        // initiator variable (batch query pattern: runtimeService.getVariable)
        when(runtimeService.getVariable(eq(processInstanceId), eq("initiator"))).thenReturn("42");

        // ProcessDefinition
        ProcessDefinition pd = mock(ProcessDefinition.class);
        when(pd.getId()).thenReturn(processDefinitionId);
        when(pd.getName()).thenReturn("请假流程");
        when(pd.getKey()).thenReturn("leave");
        ProcessDefinitionQuery pdQuery = mock(ProcessDefinitionQuery.class);
        when(repositoryService.createProcessDefinitionQuery()).thenReturn(pdQuery);
        when(pdQuery.processDefinitionIds(any())).thenReturn(pdQuery);
        when(pdQuery.list()).thenReturn(List.of(pd));

        // formKey via BpmnModel
        org.flowable.bpmn.model.BpmnModel bpmnModel = mock(org.flowable.bpmn.model.BpmnModel.class);
        org.flowable.bpmn.model.Process process = mock(org.flowable.bpmn.model.Process.class);
        org.flowable.bpmn.model.UserTask userTask = mock(org.flowable.bpmn.model.UserTask.class);
        when(userTask.getId()).thenReturn("deptApprove");
        when(userTask.getFormKey()).thenReturn("leaveForm");
        when(process.getFlowElements()).thenReturn(List.of(userTask));
        when(bpmnModel.getProcesses()).thenReturn(List.of(process));
        when(repositoryService.getBpmnModel(eq(processDefinitionId))).thenReturn(bpmnModel);

        // variables
        Map<String, Object> variables = Map.of("days", 3, "reason", "test");
        when(flowableTaskService.getVariables(eq(taskId))).thenReturn(variables);

        // UserService for initiatorName
        UserVO userVO = new UserVO(42L, "zhangsan", "张三", null, null, null,
                null, null, 1, LocalDateTime.now(), new Long[]{});
        when(userService.findByIds(eq(List.of(42L)))).thenReturn(List.of(userVO));

        // When
        Optional<TaskDetailVO> result = service.getTaskDetail(taskId);

        // Then
        assertThat(result).isPresent();
        TaskDetailVO vo = result.get();
        assertThat(vo.getTaskId()).isEqualTo(taskId);
        assertThat(vo.getName()).isEqualTo("部门审批");
        assertThat(vo.getDescription()).isEqualTo("请审批");
        assertThat(vo.getAssignee()).isEqualTo("user1");
        assertThat(vo.getProcessInstanceId()).isEqualTo(processInstanceId);
        assertThat(vo.getProcessDefinitionId()).isEqualTo(processDefinitionId);
        assertThat(vo.getProcessName()).isEqualTo("请假流程");
        assertThat(vo.getBusinessKey()).isEqualTo("BIZ-001");
        assertThat(vo.getInitiator()).isEqualTo("42");
        assertThat(vo.getInitiatorName()).isEqualTo("张三");
        assertThat(vo.getFormKey()).isEqualTo("leaveForm");
        assertThat(vo.getVariables()).containsEntry("days", 3);
        assertThat(vo.getVariables()).containsEntry("reason", "test");
        assertThat(vo.getCreateTime()).isNotNull();
    }

    @Test
    void getTaskDetailReturnsEmptyWhenTaskNotFound() {
        // Given
        TaskQuery taskQuery = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(taskQuery);
        when(taskQuery.taskId(anyString())).thenReturn(taskQuery);
        when(taskQuery.taskTenantId(anyString())).thenReturn(taskQuery);
        when(taskQuery.singleResult()).thenReturn(null);

        // When
        Optional<TaskDetailVO> result = service.getTaskDetail("nonexistent");

        // Then
        assertThat(result).isEmpty();
    }

    /**
     * 已结束流程场景：runtimeService 查不到 ProcessInstance，
     * fallback 查 historyService 获取 businessKey + historic initiator 变量。
     */
    @Test
    void getTaskDetailFallsBackToHistoryWhenProcessEnded() {
        // Given: a task whose process instance has already ended
        String taskId = "task-ended-001";
        String processInstanceId = "pi-ended-001";
        String processDefinitionId = "pd-ended:1:99";

        Task task = mock(Task.class);
        when(task.getId()).thenReturn(taskId);
        when(task.getName()).thenReturn("最终审批");
        when(task.getDescription()).thenReturn("已结束流程的遗留任务");
        when(task.getAssignee()).thenReturn("user2");
        when(task.getProcessInstanceId()).thenReturn(processInstanceId);
        when(task.getProcessDefinitionId()).thenReturn(processDefinitionId);
        when(task.getCreateTime()).thenReturn(new Date());
        when(task.getTaskDefinitionKey()).thenReturn("finalApprove");

        TaskQuery taskQuery = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(taskQuery);
        when(taskQuery.taskId(anyString())).thenReturn(taskQuery);
        when(taskQuery.taskTenantId(anyString())).thenReturn(taskQuery);
        when(taskQuery.singleResult()).thenReturn(task);

        // runtimeService 返回空列表 → 流程已结束
        ProcessInstanceQuery piQuery = mock(ProcessInstanceQuery.class);
        when(runtimeService.createProcessInstanceQuery()).thenReturn(piQuery);
        when(piQuery.processInstanceIds(any())).thenReturn(piQuery);
        when(piQuery.list()).thenReturn(List.of());

        // historyService fallback: HistoricProcessInstance 带 businessKey
        HistoricProcessInstance hpi = mock(HistoricProcessInstance.class);
        when(hpi.getId()).thenReturn(processInstanceId);
        when(hpi.getBusinessKey()).thenReturn("BIZ-ENDED-001");
        HistoricProcessInstanceQuery hpiQuery = mock(HistoricProcessInstanceQuery.class);
        when(historyService.createHistoricProcessInstanceQuery()).thenReturn(hpiQuery);
        when(hpiQuery.processInstanceId(eq(processInstanceId))).thenReturn(hpiQuery);
        when(hpiQuery.singleResult()).thenReturn(hpi);

        // historic initiator 变量
        HistoricVariableInstance hv = mock(HistoricVariableInstance.class);
        when(hv.getValue()).thenReturn("88");
        HistoricVariableInstanceQuery hvQuery = mock(HistoricVariableInstanceQuery.class);
        when(historyService.createHistoricVariableInstanceQuery()).thenReturn(hvQuery);
        when(hvQuery.processInstanceId(eq(processInstanceId))).thenReturn(hvQuery);
        when(hvQuery.variableName(eq("initiator"))).thenReturn(hvQuery);
        when(hvQuery.singleResult()).thenReturn(hv);

        // ProcessDefinition
        ProcessDefinition pd = mock(ProcessDefinition.class);
        when(pd.getId()).thenReturn(processDefinitionId);
        when(pd.getName()).thenReturn("报销流程");
        when(pd.getKey()).thenReturn("expense");
        ProcessDefinitionQuery pdQuery = mock(ProcessDefinitionQuery.class);
        when(repositoryService.createProcessDefinitionQuery()).thenReturn(pdQuery);
        when(pdQuery.processDefinitionIds(any())).thenReturn(pdQuery);
        when(pdQuery.list()).thenReturn(List.of(pd));

        // formKey
        org.flowable.bpmn.model.BpmnModel bpmnModel = mock(org.flowable.bpmn.model.BpmnModel.class);
        org.flowable.bpmn.model.Process process = mock(org.flowable.bpmn.model.Process.class);
        org.flowable.bpmn.model.UserTask userTask = mock(org.flowable.bpmn.model.UserTask.class);
        when(userTask.getId()).thenReturn("finalApprove");
        when(userTask.getFormKey()).thenReturn("expenseForm");
        when(process.getFlowElements()).thenReturn(List.of(userTask));
        when(bpmnModel.getProcesses()).thenReturn(List.of(process));
        when(repositoryService.getBpmnModel(eq(processDefinitionId))).thenReturn(bpmnModel);

        // variables
        when(flowableTaskService.getVariables(eq(taskId))).thenReturn(Map.of("amount", 500));

        // UserService
        UserVO userVO = new UserVO(88L, "lisi", "李四", null, null, null,
                null, null, 1, LocalDateTime.now(), new Long[]{});
        when(userService.findByIds(eq(List.of(88L)))).thenReturn(List.of(userVO));

        // When
        Optional<TaskDetailVO> result = service.getTaskDetail(taskId);

        // Then: businessKey 从历史获取，initiator 从历史变量获取
        assertThat(result).isPresent();
        TaskDetailVO vo = result.get();
        assertThat(vo.getTaskId()).isEqualTo(taskId);
        assertThat(vo.getBusinessKey()).isEqualTo("BIZ-ENDED-001");
        assertThat(vo.getInitiator()).isEqualTo("88");
        assertThat(vo.getInitiatorName()).isEqualTo("李四");
        assertThat(vo.getProcessName()).isEqualTo("报销流程");
        assertThat(vo.getFormKey()).isEqualTo("expenseForm");
    }
}
