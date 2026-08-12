package com.workflow.api.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.PageResponse;
import com.workflow.api.dto.StartProcessRequest;
import com.workflow.common.domain.R;
import com.workflow.api.dto.ExecutionNodeVO;
import com.workflow.engine.form.FormDataService;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.runtime.ProcessHighlightService;
import com.workflow.engine.runtime.ProcessTaskPredictionService;
import com.workflow.framework.security.domain.LoginUser;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.runtime.ProcessInstance;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * ProcessInstanceController 单元测试。
 *
 * <p>验证：start() 方法从 SecurityContext 提取当前用户，注入 initiator 变量。
 */
class ProcessInstanceControllerTest {

    private ProcessInstanceService processInstanceService;
    private ProcessHighlightService highlightService;
    private ProcessTaskPredictionService predictionService;
    private FormDataService formDataService;
    private TaskService taskService;
    private ObjectMapper objectMapper;
    private ProcessInstanceController controller;
    private SecurityContext savedSecurityContext;

    @BeforeEach
    void setUp() {
        processInstanceService = mock(ProcessInstanceService.class);
        highlightService = mock(ProcessHighlightService.class);
        predictionService = mock(ProcessTaskPredictionService.class);
        formDataService = mock(FormDataService.class);
        taskService = mock(TaskService.class);
        objectMapper = new ObjectMapper();
        controller = new ProcessInstanceController(
                processInstanceService, highlightService, predictionService,
                formDataService, taskService, objectMapper);
        savedSecurityContext = SecurityContextHolder.getContext();
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.setContext(savedSecurityContext);
    }

    private void mockSecurityContext(Long userId) {
        LoginUser loginUser = new LoginUser(userId, "testuser", "password",
                List.of(), Set.of(), true);
        UsernamePasswordAuthenticationToken auth =
                new UsernamePasswordAuthenticationToken(loginUser, null, loginUser.getAuthorities());
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(auth);
        SecurityContextHolder.setContext(context);
    }

    private ProcessInstance mockProcessInstance() {
        ProcessInstance instance = mock(ProcessInstance.class);
        when(instance.getId()).thenReturn("inst-001");
        when(instance.getProcessDefinitionId()).thenReturn("proc-def-001");
        when(instance.getProcessDefinitionKey()).thenReturn("testProcess");
        when(instance.getBusinessKey()).thenReturn(null);
        when(instance.getTenantId()).thenReturn("default");
        return instance;
    }

    @Test
    @SuppressWarnings("unchecked")
    void start_injectsInitiatorFromSecurityContext() {
        // Given: authenticated user with userId=42
        mockSecurityContext(42L);
        ProcessInstance instance = mockProcessInstance();

        StartProcessRequest request = new StartProcessRequest();
        request.setProcessKey("testProcess");
        request.setVariables(new HashMap<>());

        when(processInstanceService.startProcess(anyString(), any(Map.class)))
                .thenReturn(instance);

        // When
        R<Map<String, Object>> result = controller.start(request);

        // Then: variables passed to service must contain initiator="42"
        assertThat(result.getCode()).isEqualTo(200);

        verify(processInstanceService).startProcess(
                eq("testProcess"),
                argThat(vars -> "42".equals(vars.get("initiator"))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void start_overwritesFrontendInitiatorWithRealUserId() {
        // Given: frontend passes initiator="fakeUser"
        mockSecurityContext(99L);
        ProcessInstance instance = mockProcessInstance();

        Map<String, Object> variables = new HashMap<>();
        variables.put("initiator", "fakeUser");

        StartProcessRequest request = new StartProcessRequest();
        request.setProcessKey("testProcess");
        request.setVariables(variables);

        when(processInstanceService.startProcess(anyString(), any(Map.class)))
                .thenReturn(instance);

        // When
        controller.start(request);

        // Then: backend overwrites with real userId
        verify(processInstanceService).startProcess(
                eq("testProcess"),
                argThat(vars -> "99".equals(vars.get("initiator"))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void start_injectsInitiatorWhenVariablesNull() {
        // Given: no variables at all
        mockSecurityContext(7L);
        ProcessInstance instance = mockProcessInstance();

        StartProcessRequest request = new StartProcessRequest();
        request.setProcessKey("testProcess");
        request.setVariables(null);

        when(processInstanceService.startProcess(anyString(), any(Map.class)))
                .thenReturn(instance);

        // When
        controller.start(request);

        // Then: backend creates variables map and injects initiator
        verify(processInstanceService).startProcess(
                eq("testProcess"),
                argThat(vars -> "7".equals(vars.get("initiator"))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void start_injectsInitiatorWhenBusinessKeyPresent() {
        // Given: business key present (uses overloaded startProcess)
        mockSecurityContext(15L);
        ProcessInstance instance = mockProcessInstance();

        StartProcessRequest request = new StartProcessRequest();
        request.setProcessKey("testProcess");
        request.setBusinessKey("BK-001");
        request.setVariables(new HashMap<>());

        when(processInstanceService.startProcess(anyString(), anyString(), any(Map.class)))
                .thenReturn(instance);

        // When
        controller.start(request);

        // Then: variables passed to service must contain initiator="15"
        verify(processInstanceService).startProcess(
                eq("testProcess"),
                eq("BK-001"),
                argThat(vars -> "15".equals(vars.get("initiator"))));
    }

    // ==================== get() 流程跟踪接口 ====================

    @Test
    void get_runningInstance_returnsRuntimeMap() {
        ProcessInstance inst = mockProcessInstance();
        when(processInstanceService.getProcessInstance("inst-001"))
                .thenReturn(Optional.of(inst));

        R<Map<String, Object>> result = controller.get("inst-001");

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().get("id")).isEqualTo("inst-001");
        verify(processInstanceService, never()).getHistoricProcessInstance(anyString());
    }

    @Test
    void get_endedInstance_fallsBackToHistoricMap() {
        // Given: runtime 查不到（已结束实例），历史表有记录
        HistoricProcessInstance hist = mock(HistoricProcessInstance.class);
        when(hist.getId()).thenReturn("inst-ended");
        when(hist.getProcessDefinitionId()).thenReturn("pd-001");
        when(hist.getProcessDefinitionKey()).thenReturn("testProcess");
        when(hist.getProcessDefinitionName()).thenReturn("测试流程");
        when(hist.getBusinessKey()).thenReturn(null);
        when(hist.getTenantId()).thenReturn("default");
        when(hist.getStartTime()).thenReturn(new Date());
        when(hist.getEndTime()).thenReturn(new Date());
        when(hist.getName()).thenReturn(null);

        when(processInstanceService.getProcessInstance("inst-ended"))
                .thenReturn(Optional.empty());
        when(processInstanceService.getHistoricProcessInstance("inst-ended"))
                .thenReturn(Optional.of(hist));

        // When
        R<Map<String, Object>> result = controller.get("inst-ended");

        // Then: 返回历史数据，status=completed
        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().get("id")).isEqualTo("inst-ended");
        assertThat(result.getData().get("processDefinitionName")).isEqualTo("测试流程");
        assertThat(result.getData().get("status")).isEqualTo("completed");
        assertThat(result.getData().get("ended")).isEqualTo(true);
    }

    @Test
    void get_notFoundInRuntimeAndHistory_returns404() {
        when(processInstanceService.getProcessInstance("nope"))
                .thenReturn(Optional.empty());
        when(processInstanceService.getHistoricProcessInstance("nope"))
                .thenReturn(Optional.empty());

        R<Map<String, Object>> result = controller.get("nope");

        assertThat(result.getCode()).isEqualTo(404);
    }

    // ==================== prediction() 执行预测测试 ====================

    @Test
    @SuppressWarnings("unchecked")
    void prediction_returnsExecutionNodeList() {
        ExecutionNodeVO node = new ExecutionNodeVO();
        node.setActivityId("task2");
        node.setActivityName("部门审批");
        node.setStatus("active");
        when(predictionService.getPrediction("inst-001"))
                .thenReturn(List.of(node));

        R<List<ExecutionNodeVO>> result = controller.prediction("inst-001");

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData()).hasSize(1);
        assertThat(result.getData().get(0).getActivityId()).isEqualTo("task2");
        assertThat(result.getData().get(0).getStatus()).isEqualTo("active");
        verify(predictionService).getPrediction("inst-001");
    }

    // ==================== list() 筛选参数测试 ====================

    @Test
    @SuppressWarnings("unchecked")
    void list_noFilters_passesNullsToService() {
        ProcessInstance inst = mockProcessInstance();
        Page<ProcessInstance> page = new PageImpl<>(List.of(inst), PageRequest.of(0, 20), 1);
        when(processInstanceService.listProcessInstances(any(), isNull(), isNull(), isNull()))
                .thenReturn(page);

        R<PageResponse<Map<String, Object>>> result = controller.list(0, 20, null, null, null);

        assertThat(result.getCode()).isEqualTo(200);
        assertThat(result.getData().getContent()).hasSize(1);
        verify(processInstanceService).listProcessInstances(
                any(), isNull(), isNull(), isNull());
    }

    @Test
    @SuppressWarnings("unchecked")
    void list_withInitiator_passesToService() {
        Page<ProcessInstance> page = new PageImpl<>(List.of(), PageRequest.of(0, 20), 0);
        when(processInstanceService.listProcessInstances(any(), eq("user-1"), isNull(), isNull()))
                .thenReturn(page);

        controller.list(0, 20, "user-1", null, null);

        verify(processInstanceService).listProcessInstances(any(), eq("user-1"), isNull(), isNull());
    }

    @Test
    @SuppressWarnings("unchecked")
    void list_withStatus_passesToService() {
        Page<ProcessInstance> page = new PageImpl<>(List.of(), PageRequest.of(0, 20), 0);
        when(processInstanceService.listProcessInstances(any(), isNull(), eq("running"), isNull()))
                .thenReturn(page);

        controller.list(0, 20, null, "running", null);

        verify(processInstanceService).listProcessInstances(any(), isNull(), eq("running"), isNull());
    }

    @Test
    @SuppressWarnings("unchecked")
    void list_withProcessName_passesToService() {
        Page<ProcessInstance> page = new PageImpl<>(List.of(), PageRequest.of(0, 20), 0);
        when(processInstanceService.listProcessInstances(any(), isNull(), isNull(), eq("leave")))
                .thenReturn(page);

        controller.list(0, 20, null, null, "leave");

        verify(processInstanceService).listProcessInstances(any(), isNull(), isNull(), eq("leave"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void list_allFilters_passesToService() {
        Page<ProcessInstance> page = new PageImpl<>(List.of(), PageRequest.of(0, 20), 0);
        when(processInstanceService.listProcessInstances(any(), eq("user-1"), eq("running"), eq("leave")))
                .thenReturn(page);

        controller.list(0, 20, "user-1", "running", "leave");

        verify(processInstanceService).listProcessInstances(
                any(), eq("user-1"), eq("running"), eq("leave"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void list_vo_containsCurrentNodeAndStatus() {
        ProcessInstance inst = mock(ProcessInstance.class);
        when(inst.getId()).thenReturn("inst-001");
        when(inst.getProcessDefinitionId()).thenReturn("pd-001");
        when(inst.getProcessDefinitionKey()).thenReturn("testProcess");
        when(inst.getProcessDefinitionName()).thenReturn("测试流程");
        when(inst.getBusinessKey()).thenReturn(null);
        when(inst.getTenantId()).thenReturn("default");
        when(inst.isSuspended()).thenReturn(false);
        when(inst.isEnded()).thenReturn(false);

        Page<ProcessInstance> page = new PageImpl<>(List.of(inst), PageRequest.of(0, 20), 1);
        when(processInstanceService.listProcessInstances(any(), isNull(), isNull(), isNull()))
                .thenReturn(page);

        R<PageResponse<Map<String, Object>>> result = controller.list(0, 20, null, null, null);

        Map<String, Object> vo = result.getData().getContent().get(0);
        assertThat(vo).containsKey("currentNode");
        assertThat(vo).containsKey("status");
        assertThat(vo.get("status")).isEqualTo("running");
    }
}
