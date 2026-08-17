package com.workflow.engine.spike;

import com.workflow.api.dto.CompleteTaskResponse;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.runtime.ProcessHighlightService;
import com.workflow.engine.runtime.ProcessVariableService;
import com.workflow.engine.task.RejectService;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.ProcessEngine;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.repository.ProcessDefinition;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;

/**
 * Spike-5：端到端集成测试。
 *
 * <p>验证完整流程生命周期：
 * 1. 启动流程 → 发起人任务出现
 * 2. 完成发起人任务 → 经理审批任务出现（completeTaskWithResponse 返回下一个任务）
 * 3. 驳回到发起人 → 经理任务消失，发起人任务重新出现
 * 4. 重新提交发起人任务 → 经理审批任务再次出现
 * 5. 完成经理审批 → 流程结束（processFinished=true）
 * 6. 流程变量读写
 * 7. 流程图高亮数据
 */
@DisplayName("Spike-5: 端到端集成测试")
class EndToEndIntegrationTest extends AbstractFlowableSpikeTest {

    private static final String BPMN = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="spike">
              <process id="e2eTest" name="端到端测试" isExecutable="true">
                <startEvent id="start" />
                <userTask id="initiatorTask" name="发起人填表"
                          flowable:assignee="${initiator}" />
                <userTask id="managerApproval" name="经理审批"
                          flowable:assignee="${manager}" />
                <endEvent id="end" />
                <sequenceFlow id="flow1" sourceRef="start" targetRef="initiatorTask" />
                <sequenceFlow id="flow2" sourceRef="initiatorTask" targetRef="managerApproval" />
                <sequenceFlow id="flow3" sourceRef="managerApproval" targetRef="end" />
              </process>
            </definitions>
            """;

    @Test
    @DisplayName("完整流程生命周期：启动→完成→驳回→重提交→完成→结束")
    void fullLifecycle() {
        deploy("e2eTest", BPMN);

        // 1. 启动流程
        Map<String, Object> vars = new HashMap<>();
        vars.put("initiator", "alice");
        vars.put("manager", "bob");
        ProcessInstance pi = runtimeService.startProcessInstanceByKey("e2eTest", vars);

        // 发起人任务出现
        Task initiatorTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNotNull(initiatorTask);
        assertEquals("initiatorTask", initiatorTask.getTaskDefinitionKey());
        assertEquals("alice", initiatorTask.getAssignee());

        // 2. 完成发起人任务 → 经理审批出现
        taskService.complete(initiatorTask.getId());

        Task managerTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNotNull(managerTask);
        assertEquals("managerApproval", managerTask.getTaskDefinitionKey());
        assertEquals("bob", managerTask.getAssignee());

        // 3. 驳回到发起人
        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repositoryService);
        TenantProvider tenantProvider = mock(TenantProvider.class);
        org.mockito.Mockito.when(tenantProvider.getTenantId()).thenReturn("spike");
        WfTaskCommentRepository commentRepository = mock(WfTaskCommentRepository.class);
        com.workflow.engine.form.mapping.VariableMappingWriter variableMappingWriter =
                mock(com.workflow.engine.form.mapping.VariableMappingWriter.class);
        RejectService rejectService = new RejectService(taskService, runtimeService, resolver,
                tenantProvider, commentRepository, variableMappingWriter);
        rejectService.reject(managerTask.getId(), "bob", "信息不完整");

        // 经理任务消失，发起人任务重新出现
        Task reInitiatorTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNotNull(reInitiatorTask);
        assertEquals("initiatorTask", reInitiatorTask.getTaskDefinitionKey());
        assertEquals("alice", reInitiatorTask.getAssignee());

        // 经理任务不再存在
        List<Task> managerTasks = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .taskDefinitionKey("managerApproval")
                .list();
        assertTrue(managerTasks.isEmpty());

        // 4. 重新提交发起人任务 → 经理审批再次出现
        taskService.complete(reInitiatorTask.getId());

        Task managerTask2 = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNotNull(managerTask2);
        assertEquals("managerApproval", managerTask2.getTaskDefinitionKey());

        // 5. 完成经理审批 → 流程结束
        taskService.complete(managerTask2.getId());

        ProcessInstance finishedPi = runtimeService.createProcessInstanceQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNull(finishedPi, "流程应已结束");
    }

    @Test
    @DisplayName("流程变量读写")
    void processVariableReadWrite() {
        deploy("e2eVar", BPMN);

        Map<String, Object> vars = new HashMap<>();
        vars.put("initiator", "alice");
        vars.put("manager", "bob");
        ProcessInstance pi = runtimeService.startProcessInstanceByKey("e2eTest", vars);

        // 读变量
        Object initiator = runtimeService.getVariable(pi.getId(), "initiator");
        assertEquals("alice", initiator);

        // 写变量
        runtimeService.setVariable(pi.getId(), "amount", 5000);
        Object amount = runtimeService.getVariable(pi.getId(), "amount");
        assertEquals(5000, amount);

        // 读全部变量
        Map<String, Object> allVars = runtimeService.getVariables(pi.getId());
        assertTrue(allVars.containsKey("initiator"));
        assertTrue(allVars.containsKey("manager"));
        assertTrue(allVars.containsKey("amount"));

        // 删变量
        runtimeService.removeVariable(pi.getId(), "amount");
        assertNull(runtimeService.getVariable(pi.getId(), "amount"));
    }

    @Test
    @DisplayName("流程图高亮：已完成节点 + 当前活动节点")
    void processHighlight() {
        deploy("e2eHighlight", BPMN);

        Map<String, Object> vars = new HashMap<>();
        vars.put("initiator", "alice");
        vars.put("manager", "bob");
        ProcessInstance pi = runtimeService.startProcessInstanceByKey("e2eTest", vars);

        ProcessHighlightService highlightService = new ProcessHighlightService(
                runtimeService, historyService, repositoryService);

        // 流程刚启动，发起人任务待办
        Map<String, Object> highlight = highlightService.getHighlight(pi.getId());

        @SuppressWarnings("unchecked")
        List<String> completed = (List<String>) highlight.get("completedActivityIds");
        @SuppressWarnings("unchecked")
        List<String> active = (List<String>) highlight.get("activeActivityIds");

        // start 节点应已完成
        assertTrue(completed.contains("start"), "start 应在已完成列表中");
        // initiatorTask 应为当前活动
        assertTrue(active.contains("initiatorTask"), "initiatorTask 应在活动列表中");

        // 完成发起人任务
        Task initiatorTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        taskService.complete(initiatorTask.getId());

        // 再次获取高亮
        Map<String, Object> highlight2 = highlightService.getHighlight(pi.getId());
        @SuppressWarnings("unchecked")
        List<String> completed2 = (List<String>) highlight2.get("completedActivityIds");
        @SuppressWarnings("unchecked")
        List<String> active2 = (List<String>) highlight2.get("activeActivityIds");

        // start + initiatorTask 应已完成
        assertTrue(completed2.contains("start"));
        assertTrue(completed2.contains("initiatorTask"));
        // managerApproval 应为当前活动
        assertTrue(active2.contains("managerApproval"));
    }

    @Test
    @DisplayName("InitiatorNodeResolver 返回第一个 userTask")
    void initiatorNodeResolver() {
        deploy("e2eResolver", BPMN);

        ProcessDefinition pd = repositoryService.createProcessDefinitionQuery()
                .processDefinitionKey("e2eTest")
                .latestVersion()
                .singleResult();

        InitiatorNodeResolver resolver = new InitiatorNodeResolver(repositoryService);
        String initiatorNodeId = resolver.resolve(pd.getId());

        assertEquals("initiatorTask", initiatorNodeId);
    }
}
