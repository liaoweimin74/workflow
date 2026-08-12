package com.workflow.engine.spike;

import com.workflow.api.dto.ExecutionNodeVO;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import com.workflow.engine.runtime.ProcessTaskPredictionService;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.service.UserService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Spike：流程执行预测端到端集成测试。
 *
 * <p>基于真实 Flowable 内存引擎，验证 ProcessTaskPredictionService：
 * <ul>
 *   <li>5.1 流程进行中：活跃节点 status=active，无条件出线的后续节点 status=predicted</li>
 *   <li>5.2 已结束实例：无活跃节点、无预测节点</li>
 * </ul>
 */
@DisplayName("Spike: 流程执行预测端到端")
class PredictionEndToEndSpikeTest extends AbstractFlowableSpikeTest {

    private static final String BPMN = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="spike">
              <process id="predTest" name="预测测试" isExecutable="true">
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

    /** 构建服务：真实引擎服务 + mock JPA 依赖（comment 为空 → 无历史节点）。 */
    private ProcessTaskPredictionService buildService() {
        WfTaskCommentRepository commentRepository = mock(WfTaskCommentRepository.class);
        when(commentRepository.findByProcessInstanceIdOrderByCreatedAtAsc(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(List.of());
        UserService userService = mock(UserService.class);
        TenantProvider tenantProvider = mock(TenantProvider.class);
        ProcessDraftRepository processDraftRepository = mock(ProcessDraftRepository.class);
        NodeConfigRepository nodeConfigRepository = mock(NodeConfigRepository.class);
        when(nodeConfigRepository.findByProcessDefinitionId(org.mockito.ArgumentMatchers.anyString()))
                .thenReturn(List.of());
        return new ProcessTaskPredictionService(historyService, runtimeService, repositoryService,
                taskService, commentRepository, userService, tenantProvider,
                processDraftRepository, nodeConfigRepository, new ObjectMapper());
    }

    @Test
    @DisplayName("5.1 进行中：活跃节点 + 无条件后续预测节点")
    void prediction_whileRunning_returnsActiveAndPredicted() {
        deploy("predRunning", BPMN);

        Map<String, Object> vars = new HashMap<>();
        vars.put("initiator", "alice");
        vars.put("manager", "bob");
        ProcessInstance pi = runtimeService.startProcessInstanceByKey("predTest", vars);

        ProcessTaskPredictionService service = buildService();
        List<ExecutionNodeVO> result = service.getPrediction(pi.getId());

        // 1 活跃（initiatorTask）+ 2 预测（managerApproval + end）
        assertFalse(result.isEmpty(), "预测结果不应为空");
        assertTrue(result.size() >= 3, "应有活跃 + 2 个预测节点，实际: " + result.size());

        // 活跃节点
        ExecutionNodeVO active = result.stream()
                .filter(vo -> "active".equals(vo.getStatus()))
                .findFirst().orElse(null);
        assertNotNull(active, "应存在活跃节点");
        assertEquals("initiatorTask", active.getActivityId());
        assertEquals("发起人填表", active.getActivityName());
        assertEquals("solid", active.getLineType());

        // 预测节点：无条件连线 → managerApproval + end
        List<ExecutionNodeVO> predicted = result.stream()
                .filter(vo -> "predicted".equals(vo.getStatus()))
                .toList();
        assertEquals(2, predicted.size(), "应为 managerApproval + end 两个预测节点");
        assertTrue(predicted.stream().anyMatch(vo -> "managerApproval".equals(vo.getActivityId())),
                "应预测 managerApproval");
        assertTrue(predicted.stream().anyMatch(vo -> "end".equals(vo.getActivityId())),
                "应预测 end");
        assertTrue(predicted.stream().allMatch(vo -> "dashed".equals(vo.getLineType())),
                "预测节点连线应为虚线");
    }

    @Test
    @DisplayName("5.1 完成一步后：initiatorTask 变为已完成，managerApproval 活跃")
    void prediction_afterOneComplete_movesActiveForward() {
        deploy("predStep", BPMN);

        Map<String, Object> vars = new HashMap<>();
        vars.put("initiator", "alice");
        vars.put("manager", "bob");
        ProcessInstance pi = runtimeService.startProcessInstanceByKey("predTest", vars);

        // 完成发起人任务
        Task initiatorTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNotNull(initiatorTask);
        taskService.complete(initiatorTask.getId());

        ProcessTaskPredictionService service = buildService();
        List<ExecutionNodeVO> result = service.getPrediction(pi.getId());

        // 活跃节点应变为 managerApproval
        ExecutionNodeVO active = result.stream()
                .filter(vo -> "active".equals(vo.getStatus()))
                .findFirst().orElse(null);
        assertNotNull(active, "应存在活跃节点");
        assertEquals("managerApproval", active.getActivityId());
        assertEquals("经理审批", active.getActivityName());

        // 预测：end
        List<ExecutionNodeVO> predicted = result.stream()
                .filter(vo -> "predicted".equals(vo.getStatus()))
                .toList();
        assertEquals(1, predicted.size(), "应只剩 end 一个预测节点");
        assertEquals("end", predicted.get(0).getActivityId());
    }

    @Test
    @DisplayName("5.2 已结束实例：无活跃节点、无预测节点")
    void prediction_finishedInstance_returnsNoPredictions() {
        deploy("predFinished", BPMN);

        Map<String, Object> vars = new HashMap<>();
        vars.put("initiator", "alice");
        vars.put("manager", "bob");
        ProcessInstance pi = runtimeService.startProcessInstanceByKey("predTest", vars);

        // 跑完整个流程
        Task initiatorTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        taskService.complete(initiatorTask.getId());

        Task managerTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNotNull(managerTask, "经理审批任务应存在");
        taskService.complete(managerTask.getId());

        // 流程应已结束
        assertNull(runtimeService.createProcessInstanceQuery()
                .processInstanceId(pi.getId())
                .singleResult(), "流程应已结束");

        ProcessTaskPredictionService service = buildService();
        List<ExecutionNodeVO> result = service.getPrediction(pi.getId());

        // 已结束实例：无活跃、无预测（comment mock 为空 → 无历史节点）
        assertTrue(result.stream().noneMatch(vo -> "active".equals(vo.getStatus())),
                "已结束实例不应有活跃节点");
        assertTrue(result.stream().noneMatch(vo -> "predicted".equals(vo.getStatus())),
                "已结束实例不应有预测节点");
    }
}