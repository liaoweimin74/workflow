package com.workflow.engine.process.bpmn;

import org.junit.jupiter.api.Test;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.UserTask;
import org.flowable.bpmn.model.Process;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * InitiatorNodeResolver 单元测试。
 *
 * <p>验证：从 BPMN 模型中找到第一个 userTask 作为发起人节点。
 */
class InitiatorNodeResolverTest {

    @Test
    void resolve_returnsFirstUserTaskId() {
        // BPMN: start → initiatorTask → managerApproval → end
        BpmnModel model = new BpmnModel();
        Process process = new Process();
        process.setId("testProcess");

        org.flowable.bpmn.model.StartEvent start = new org.flowable.bpmn.model.StartEvent();
        start.setId("start");

        UserTask initiatorTask = new UserTask();
        initiatorTask.setId("initiatorTask");

        UserTask managerTask = new UserTask();
        managerTask.setId("managerApproval");

        org.flowable.bpmn.model.EndEvent end = new org.flowable.bpmn.model.EndEvent();
        end.setId("end");

        process.addFlowElement(start);
        process.addFlowElement(initiatorTask);
        process.addFlowElement(managerTask);
        process.addFlowElement(end);

        model.addProcess(process);

        RepositoryService repoService = mock(RepositoryService.class);
        when(repoService.getBpmnModel(anyString())).thenReturn(model);

        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repoService);

        String result = resolver.resolve("proc-def-001");

        assertThat(result).isEqualTo("initiatorTask");
    }

    @Test
    void resolve_noUserTasks_returnsNull() {
        BpmnModel model = new BpmnModel();
        Process process = new Process();
        process.setId("testProcess");

        org.flowable.bpmn.model.StartEvent start = new org.flowable.bpmn.model.StartEvent();
        start.setId("start");
        org.flowable.bpmn.model.EndEvent end = new org.flowable.bpmn.model.EndEvent();
        end.setId("end");

        process.addFlowElement(start);
        process.addFlowElement(end);
        model.addProcess(process);

        RepositoryService repoService = mock(RepositoryService.class);
        when(repoService.getBpmnModel(anyString())).thenReturn(model);

        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repoService);

        String result = resolver.resolve("proc-def-001");

        assertThat(result).isNull();
    }

    @Test
    void resolve_nullModel_returnsNull() {
        RepositoryService repoService = mock(RepositoryService.class);
        when(repoService.getBpmnModel(anyString())).thenReturn(null);

        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repoService);

        String result = resolver.resolve("proc-def-001");

        assertThat(result).isNull();
    }
}
