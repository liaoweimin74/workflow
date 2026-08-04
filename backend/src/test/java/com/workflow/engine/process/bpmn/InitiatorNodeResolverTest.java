package com.workflow.engine.process.bpmn;

import org.junit.jupiter.api.Test;
import org.flowable.engine.RepositoryService;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.ExtensionAttribute;
import org.flowable.bpmn.model.UserTask;
import org.flowable.bpmn.model.Process;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * InitiatorNodeResolver 单元测试。
 *
 * <p>验证：从 BPMN 模型中找到第一个 userTask 作为发起人节点。
 * 验证：优先匹配 wf:nodeRole=initiator 的 UserTask，找不到则回退到第一个 UserTask。
 */
class InitiatorNodeResolverTest {

    @Test
    void resolve_returnsFirstUserTaskId() {
        // BPMN: start → initiatorTask → managerApproval → end (no nodeRole)
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

    @Test
    void resolve_withNodeRoleInitiator_returnsThatTaskId() {
        // BPMN: start → fillForm(wf:nodeRole=initiator) → managerApproval → end
        BpmnModel model = new BpmnModel();
        Process process = new Process();
        process.setId("testProcess");

        org.flowable.bpmn.model.StartEvent start = new org.flowable.bpmn.model.StartEvent();
        start.setId("start");

        UserTask fillForm = new UserTask();
        fillForm.setId("fillForm");
        fillForm.addAttribute(createNodeRoleAttribute("initiator"));

        UserTask managerTask = new UserTask();
        managerTask.setId("managerApproval");

        org.flowable.bpmn.model.EndEvent end = new org.flowable.bpmn.model.EndEvent();
        end.setId("end");

        process.addFlowElement(start);
        process.addFlowElement(fillForm);
        process.addFlowElement(managerTask);
        process.addFlowElement(end);

        model.addProcess(process);

        RepositoryService repoService = mock(RepositoryService.class);
        when(repoService.getBpmnModel(anyString())).thenReturn(model);

        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repoService);

        String result = resolver.resolve("proc-def-001");

        assertThat(result).isEqualTo("fillForm");
    }

    @Test
    void resolve_withNodeRoleInitiatorNotFirst_returnsThatTaskId() {
        // BPMN: start → managerApproval → fillForm(wf:nodeRole=initiator) → end
        // nodeRole task is NOT the first UserTask — should still find it
        BpmnModel model = new BpmnModel();
        Process process = new Process();
        process.setId("testProcess");

        org.flowable.bpmn.model.StartEvent start = new org.flowable.bpmn.model.StartEvent();
        start.setId("start");

        UserTask managerTask = new UserTask();
        managerTask.setId("managerApproval");

        UserTask fillForm = new UserTask();
        fillForm.setId("fillForm");
        fillForm.addAttribute(createNodeRoleAttribute("initiator"));

        org.flowable.bpmn.model.EndEvent end = new org.flowable.bpmn.model.EndEvent();
        end.setId("end");

        process.addFlowElement(start);
        process.addFlowElement(managerTask);
        process.addFlowElement(fillForm);
        process.addFlowElement(end);

        model.addProcess(process);

        RepositoryService repoService = mock(RepositoryService.class);
        when(repoService.getBpmnModel(anyString())).thenReturn(model);

        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repoService);

        String result = resolver.resolve("proc-def-001");

        assertThat(result).isEqualTo("fillForm");
    }

    @Test
    void resolve_multipleNodeRoleInitiator_returnsFirstMatch() {
        // BPMN: start → task1(wf:nodeRole=initiator) → task2(wf:nodeRole=initiator) → end
        BpmnModel model = new BpmnModel();
        Process process = new Process();
        process.setId("testProcess");

        org.flowable.bpmn.model.StartEvent start = new org.flowable.bpmn.model.StartEvent();
        start.setId("start");

        UserTask task1 = new UserTask();
        task1.setId("task1");
        task1.addAttribute(createNodeRoleAttribute("initiator"));

        UserTask task2 = new UserTask();
        task2.setId("task2");
        task2.addAttribute(createNodeRoleAttribute("initiator"));

        org.flowable.bpmn.model.EndEvent end = new org.flowable.bpmn.model.EndEvent();
        end.setId("end");

        process.addFlowElement(start);
        process.addFlowElement(task1);
        process.addFlowElement(task2);
        process.addFlowElement(end);

        model.addProcess(process);

        RepositoryService repoService = mock(RepositoryService.class);
        when(repoService.getBpmnModel(anyString())).thenReturn(model);

        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repoService);

        String result = resolver.resolve("proc-def-001");

        assertThat(result).isEqualTo("task1");
    }

    @Test
    void resolve_nodeRoleNotInitiator_fallsBackToFirstUserTask() {
        // BPMN: start → task1(wf:nodeRole=approver) → task2 → end
        // nodeRole exists but is not "initiator" — should fall back to first UserTask
        BpmnModel model = new BpmnModel();
        Process process = new Process();
        process.setId("testProcess");

        org.flowable.bpmn.model.StartEvent start = new org.flowable.bpmn.model.StartEvent();
        start.setId("start");

        UserTask task1 = new UserTask();
        task1.setId("task1");
        task1.addAttribute(createNodeRoleAttribute("approver"));

        UserTask task2 = new UserTask();
        task2.setId("task2");

        org.flowable.bpmn.model.EndEvent end = new org.flowable.bpmn.model.EndEvent();
        end.setId("end");

        process.addFlowElement(start);
        process.addFlowElement(task1);
        process.addFlowElement(task2);
        process.addFlowElement(end);

        model.addProcess(process);

        RepositoryService repoService = mock(RepositoryService.class);
        when(repoService.getBpmnModel(anyString())).thenReturn(model);

        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repoService);

        String result = resolver.resolve("proc-def-001");

        assertThat(result).isEqualTo("task1");
    }

    /**
     * 创建 wf:nodeRole 扩展属性。
     * Flowable 中 ExtensionAttribute 需要 namespace + name + value。
     */
    private static ExtensionAttribute createNodeRoleAttribute(String value) {
        ExtensionAttribute attr = new ExtensionAttribute();
        attr.setNamespace("http://workflow.com/schema/bpmn/wf");
        attr.setName("nodeRole");
        attr.setValue(value);
        return attr;
    }
}
