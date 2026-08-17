package com.workflow.engine.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.TaskDetailVO;
import com.workflow.engine.form.mapping.FormDataMerger;
import com.workflow.engine.form.mapping.VariableMappingWriter;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.task.repository.WfTaskRemindRepository;
import com.workflow.engine.tenant.TenantProvider;
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
import org.flowable.task.api.history.HistoricTaskInstance;
import org.flowable.task.api.history.HistoricTaskInstanceQuery;
import org.flowable.variable.api.history.HistoricVariableInstance;
import org.flowable.variable.api.history.HistoricVariableInstanceQuery;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Date;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * WorkflowTaskService.getTaskDetail 的 mappedData 填充测试。
 *
 * <p>验证：运行时任务与历史任务详情均包含 mappedData（由 FormDataMerger 聚合）。
 */
class WorkflowTaskServiceMappedDataTest {

    private TaskService flowableTaskService;
    private HistoryService historyService;
    private TenantProvider tenantProvider;
    private RuntimeService runtimeService;
    private RepositoryService repositoryService;
    private UserService userService;
    private WfTaskCommentRepository commentRepository;
    private WfTaskRemindRepository remindRepository;
    private NodeConfigRepository nodeConfigRepository;
    private InitiatorNodeResolver initiatorNodeResolver;
    private ObjectMapper objectMapper;
    private FormDataMerger formDataMerger;
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
        remindRepository = mock(WfTaskRemindRepository.class);
        nodeConfigRepository = mock(NodeConfigRepository.class);
        initiatorNodeResolver = mock(InitiatorNodeResolver.class);
        objectMapper = new ObjectMapper();
        formDataMerger = mock(FormDataMerger.class);
        VariableMappingWriter variableMappingWriter = mock(VariableMappingWriter.class);
        service = new WorkflowTaskService(flowableTaskService, historyService, tenantProvider,
                runtimeService, repositoryService, userService, commentRepository, remindRepository,
                nodeConfigRepository, initiatorNodeResolver, objectMapper, formDataMerger,
                variableMappingWriter);
        when(tenantProvider.getTenantId()).thenReturn("default");
    }

    @Test
    void taskDetailContainsMappedData() {
        // Given: 运行时任务，FormDataMerger.merge 返回 {"applicantName":"张三"}
        String taskId = "task-mapped-001";
        String processInstanceId = "pi-mapped-001";
        String processDefinitionId = "pd-mapped:1:1";

        Task task = mock(Task.class);
        when(task.getId()).thenReturn(taskId);
        when(task.getName()).thenReturn("审批");
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

        ProcessInstance pi = mock(ProcessInstance.class);
        when(pi.getId()).thenReturn(processInstanceId);
        ProcessInstanceQuery piQuery = mock(ProcessInstanceQuery.class);
        when(runtimeService.createProcessInstanceQuery()).thenReturn(piQuery);
        when(piQuery.processInstanceIds(any())).thenReturn(piQuery);
        when(piQuery.list()).thenReturn(List.of(pi));

        ProcessDefinition pd = mock(ProcessDefinition.class);
        when(pd.getId()).thenReturn(processDefinitionId);
        when(pd.getKey()).thenReturn("mapped");
        ProcessDefinitionQuery pdQuery = mock(ProcessDefinitionQuery.class);
        when(repositoryService.createProcessDefinitionQuery()).thenReturn(pdQuery);
        when(pdQuery.processDefinitionIds(any())).thenReturn(pdQuery);
        when(pdQuery.list()).thenReturn(List.of(pd));

        when(nodeConfigRepository.findByProcessDefinitionId(eq(processDefinitionId)))
                .thenReturn(List.of());
        when(flowableTaskService.getVariables(eq(taskId))).thenReturn(Map.of());

        when(formDataMerger.merge(eq(processDefinitionId), eq("deptApprove"), eq(processInstanceId)))
                .thenReturn(Map.of("applicantName", "张三"));

        // When
        Optional<TaskDetailVO> result = service.getTaskDetail(taskId);

        // Then
        assertThat(result).isPresent();
        assertThat(result.get().getMappedData()).containsEntry("applicantName", "张三");
    }

    @Test
    void historicTaskDetailContainsMappedData() {
        // Given: 运行时表无任务，走历史表；FormDataMerger.merge 返回映射数据
        String taskId = "hist-mapped-001";
        String processInstanceId = "pi-hist-mapped-001";
        String processDefinitionId = "pd-hist-mapped:1:2";

        TaskQuery taskQuery = mock(TaskQuery.class);
        when(flowableTaskService.createTaskQuery()).thenReturn(taskQuery);
        when(taskQuery.taskId(anyString())).thenReturn(taskQuery);
        when(taskQuery.taskTenantId(anyString())).thenReturn(taskQuery);
        when(taskQuery.singleResult()).thenReturn(null);

        HistoricTaskInstance histTask = mock(HistoricTaskInstance.class);
        when(histTask.getId()).thenReturn(taskId);
        when(histTask.getName()).thenReturn("历史审批");
        when(histTask.getAssignee()).thenReturn("user1");
        when(histTask.getProcessInstanceId()).thenReturn(processInstanceId);
        when(histTask.getProcessDefinitionId()).thenReturn(processDefinitionId);
        when(histTask.getStartTime()).thenReturn(new Date());
        when(histTask.getTaskDefinitionKey()).thenReturn("finalApprove");

        HistoricTaskInstanceQuery histQuery = mock(HistoricTaskInstanceQuery.class);
        when(historyService.createHistoricTaskInstanceQuery()).thenReturn(histQuery);
        when(histQuery.taskId(anyString())).thenReturn(histQuery);
        when(histQuery.taskTenantId(anyString())).thenReturn(histQuery);
        when(histQuery.singleResult()).thenReturn(histTask);

        // 流程已结束：runtime 查不到，history fallback
        ProcessInstanceQuery piQuery = mock(ProcessInstanceQuery.class);
        when(runtimeService.createProcessInstanceQuery()).thenReturn(piQuery);
        when(piQuery.processInstanceIds(any())).thenReturn(piQuery);
        when(piQuery.list()).thenReturn(List.of());

        HistoricProcessInstance hpi = mock(HistoricProcessInstance.class);
        when(hpi.getId()).thenReturn(processInstanceId);
        HistoricProcessInstanceQuery hpiQuery = mock(HistoricProcessInstanceQuery.class);
        when(historyService.createHistoricProcessInstanceQuery()).thenReturn(hpiQuery);
        when(hpiQuery.processInstanceId(eq(processInstanceId))).thenReturn(hpiQuery);
        when(hpiQuery.singleResult()).thenReturn(hpi);

        HistoricVariableInstanceQuery hvQuery = mock(HistoricVariableInstanceQuery.class);
        when(historyService.createHistoricVariableInstanceQuery()).thenReturn(hvQuery);
        when(hvQuery.processInstanceId(eq(processInstanceId))).thenReturn(hvQuery);
        when(hvQuery.list()).thenReturn(List.of());

        ProcessDefinition pd = mock(ProcessDefinition.class);
        when(pd.getId()).thenReturn(processDefinitionId);
        when(pd.getKey()).thenReturn("histMapped");
        ProcessDefinitionQuery pdQuery = mock(ProcessDefinitionQuery.class);
        when(repositoryService.createProcessDefinitionQuery()).thenReturn(pdQuery);
        when(pdQuery.processDefinitionIds(any())).thenReturn(pdQuery);
        when(pdQuery.list()).thenReturn(List.of(pd));

        when(nodeConfigRepository.findByProcessDefinitionId(eq(processDefinitionId)))
                .thenReturn(List.of());

        when(formDataMerger.merge(eq(processDefinitionId), eq("finalApprove"), eq(processInstanceId)))
                .thenReturn(Map.of("applicantName", "张三"));

        // When
        Optional<TaskDetailVO> result = service.getTaskDetail(taskId);

        // Then
        assertThat(result).isPresent();
        assertThat(result.get().getMappedData()).containsEntry("applicantName", "张三");
    }
}