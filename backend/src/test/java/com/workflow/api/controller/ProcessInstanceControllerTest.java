package com.workflow.api.controller;

import com.workflow.api.dto.StartProcessRequest;
import com.workflow.common.domain.R;
import com.workflow.engine.process.ProcessInstanceService;
import com.workflow.engine.runtime.ProcessHighlightService;
import com.workflow.framework.security.domain.LoginUser;
import org.flowable.engine.runtime.ProcessInstance;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * ProcessInstanceController 单元测试。
 *
 * <p>验证：start() 方法从 SecurityContext 提取当前用户，注入 initiator 变量。
 */
class ProcessInstanceControllerTest {

    private ProcessInstanceService processInstanceService;
    private ProcessHighlightService highlightService;
    private ProcessInstanceController controller;
    private SecurityContext savedSecurityContext;

    @BeforeEach
    void setUp() {
        processInstanceService = mock(ProcessInstanceService.class);
        highlightService = mock(ProcessHighlightService.class);
        controller = new ProcessInstanceController(processInstanceService, highlightService);
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
}
