package com.workflow.engine.runtime;

import com.workflow.api.dto.ExecutionNodeVO;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.system.domain.vo.UserVO;
import com.workflow.system.service.UserService;
import org.flowable.engine.HistoryService;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.history.HistoricActivityInstance;
import org.flowable.engine.history.HistoricActivityInstanceQuery;
import org.flowable.engine.history.HistoricProcessInstance;
import org.flowable.engine.history.HistoricProcessInstanceQuery;
import org.flowable.engine.runtime.ActivityInstance;
import org.flowable.engine.runtime.ActivityInstanceQuery;
import org.flowable.task.api.TaskQuery;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.EndEvent;
import org.flowable.bpmn.model.SequenceFlow;
import org.flowable.bpmn.model.UserTask;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * ProcessTaskPredictionService 单元测试。
 *
 * <p>验证：
 * <ul>
 *   <li>已执行节点正确返回 status=completed, lineType=solid</li>
 *   <li>活跃节点正确返回 status=active, lineType=solid</li>
 *   <li>预测节点正确返回 status=predicted, lineType=dashed</li>
 *   <li>无条件连线继续遍历，有条件连线停止</li>
 *   <li>已结束实例无预测节点</li>
 * </ul>
 */
@ExtendWith(MockitoExtension.class)
class ProcessTaskPredictionServiceTest {

    @Mock
    HistoryService historyService;
    @Mock
    RuntimeService runtimeService;
    @Mock
    RepositoryService repositoryService;
    @Mock
    TaskService taskService;
    @Mock
    WfTaskCommentRepository commentRepository;
    @Mock
    UserService userService;
    @Mock
    TenantProvider tenantProvider;
    @Mock
    ProcessDraftRepository processDraftRepository;
    @Mock
    NodeConfigRepository nodeConfigRepository;

    @InjectMocks
    ProcessTaskPredictionService predictionService;

    @BeforeEach
    void setUp() {
        lenient().when(userService.findByIds(any())).thenReturn(List.of());
        lenient().when(tenantProvider.getTenantId()).thenReturn("default");
        // 默认：无历史流程实例（避免 NPE）——部分测试会覆盖
        HistoricProcessInstanceQuery defaultPiQuery = buildPiQuery(null);
        lenient().when(historyService.createHistoricProcessInstanceQuery()).thenReturn(defaultPiQuery);
        TaskQuery defaultTaskQuery = buildTaskQuery();
        lenient().when(taskService.createTaskQuery()).thenReturn(defaultTaskQuery);
    }

    private HistoricProcessInstanceQuery buildPiQuery(HistoricProcessInstance processInstance) {
        HistoricProcessInstanceQuery piQuery = mock(HistoricProcessInstanceQuery.class);
        lenient().when(piQuery.processInstanceId(anyString())).thenReturn(piQuery);
        lenient().when(piQuery.singleResult()).thenReturn(processInstance);
        return piQuery;
    }

    private org.flowable.task.api.TaskQuery buildTaskQuery() {
        org.flowable.task.api.TaskQuery taskQuery = mock(org.flowable.task.api.TaskQuery.class);
        lenient().when(taskQuery.processInstanceId(anyString())).thenReturn(taskQuery);
        lenient().when(taskQuery.active()).thenReturn(taskQuery);
        lenient().when(taskQuery.list()).thenReturn(List.of());
        return taskQuery;
    }

    @Test
    void getPrediction_returnsCompletedNodesWithApprovalInfo() {
        // 安排：历史节点
        HistoricActivityInstance histActivity = mock(HistoricActivityInstance.class);
        when(histActivity.getActivityId()).thenReturn("task1");
        when(histActivity.getAssignee()).thenReturn("1");
        when(histActivity.getEndTime()).thenReturn(new Date());
        when(histActivity.getTaskId()).thenReturn("task-001");

        HistoricActivityInstanceQuery histQuery = mock(HistoricActivityInstanceQuery.class);
        when(historyService.createHistoricActivityInstanceQuery()).thenReturn(histQuery);
        when(histQuery.processInstanceId(anyString())).thenReturn(histQuery);
        when(histQuery.activityType("userTask")).thenReturn(histQuery);
        when(histQuery.orderByHistoricActivityInstanceStartTime()).thenReturn(histQuery);
        when(histQuery.asc()).thenReturn(histQuery);
        when(histQuery.list()).thenReturn(List.of(histActivity));

        // 审批意见
        WfTaskComment comment = new WfTaskComment();
        comment.setTaskId("task-001");
        comment.setUserId("1");
        comment.setAction("complete");
        comment.setComment("同意");
        when(commentRepository.findByProcessInstanceIdOrderByCreatedAtAsc(anyString()))
                .thenReturn(List.of(comment));

        // 用户查询
        UserVO user = new UserVO(1L, "zhangsan", "张三", null, null, null, null, null, null, null, null);
        when(userService.findByIds(any())).thenReturn(List.of(user));

        // BPMN 模型：提供 task1 节点名（服务从 BPMN model 加载 activityNameMap）
        BpmnModel bpmnModel = new BpmnModel();
        org.flowable.bpmn.model.Process process = new org.flowable.bpmn.model.Process();
        process.setId("process1");
        UserTask task1 = new UserTask();
        task1.setId("task1");
        task1.setName("发起申请");
        process.addFlowElement(task1);
        bpmnModel.addProcess(process);

        HistoricProcessInstance processInstance = mock(HistoricProcessInstance.class);
        when(processInstance.getProcessDefinitionId()).thenReturn("pd-001");
        when(repositoryService.getBpmnModel("pd-001")).thenReturn(bpmnModel);
        HistoricProcessInstanceQuery piQuery = mock(HistoricProcessInstanceQuery.class);
        when(historyService.createHistoricProcessInstanceQuery()).thenReturn(piQuery);
        when(piQuery.processInstanceId(anyString())).thenReturn(piQuery);
        when(piQuery.singleResult()).thenReturn(processInstance);

        // 活跃节点（空 = 已结束）
        ActivityInstanceQuery actQuery = mock(ActivityInstanceQuery.class);
        when(runtimeService.createActivityInstanceQuery()).thenReturn(actQuery);
        when(actQuery.processInstanceId(anyString())).thenReturn(actQuery);
        when(actQuery.list()).thenReturn(List.of());

        // 执行
        List<ExecutionNodeVO> result = predictionService.getPrediction("pi-001");

        // 验证
        assertThat(result).hasSize(1);
        ExecutionNodeVO node = result.get(0);
        assertThat(node.getActivityId()).isEqualTo("task1");
        assertThat(node.getActivityName()).isEqualTo("发起申请");
        assertThat(node.getStatus()).isEqualTo("completed");
        assertThat(node.getLineType()).isEqualTo("solid");
        assertThat(node.getAssigneeName()).isEqualTo("张三");
        assertThat(node.getAction()).isEqualTo("complete");
        assertThat(node.getComment()).isEqualTo("同意");
    }

    @Test
    void getPrediction_returnsActiveNodesWithActiveStatus() {
        // 历史节点（已完成）
        HistoricActivityInstance histActivity = mock(HistoricActivityInstance.class);
        when(histActivity.getActivityId()).thenReturn("task1");
        when(histActivity.getAssignee()).thenReturn("1");
        when(histActivity.getEndTime()).thenReturn(new Date());
        when(histActivity.getTaskId()).thenReturn("task-001");

        HistoricActivityInstanceQuery histQuery = mock(HistoricActivityInstanceQuery.class);
        when(historyService.createHistoricActivityInstanceQuery()).thenReturn(histQuery);
        when(histQuery.processInstanceId(anyString())).thenReturn(histQuery);
        when(histQuery.activityType("userTask")).thenReturn(histQuery);
        when(histQuery.orderByHistoricActivityInstanceStartTime()).thenReturn(histQuery);
        when(histQuery.asc()).thenReturn(histQuery);
        when(histQuery.list()).thenReturn(List.of(histActivity));

        // 历史节点 comment（task-001 已完成 → task1）
        WfTaskComment histComment = new WfTaskComment();
        histComment.setTaskId("task-001");
        histComment.setUserId("1");
        histComment.setAction("complete");
        when(commentRepository.findByProcessInstanceIdOrderByCreatedAtAsc(anyString()))
                .thenReturn(List.of(histComment));
        when(userService.findByIds(any())).thenReturn(List.of());

        // 活跃节点
        ActivityInstance activeActivity = mock(ActivityInstance.class);
        when(activeActivity.getActivityId()).thenReturn("task2");
        when(activeActivity.getActivityType()).thenReturn("userTask");
        when(activeActivity.getAssignee()).thenReturn("2");

        ActivityInstanceQuery actQuery = mock(ActivityInstanceQuery.class);
        when(runtimeService.createActivityInstanceQuery()).thenReturn(actQuery);
        when(actQuery.processInstanceId(anyString())).thenReturn(actQuery);
        when(actQuery.list()).thenReturn(List.of(activeActivity));

        // 历史流程实例查询（预测需要）
        HistoricProcessInstance processInstance = mock(HistoricProcessInstance.class);
        when(processInstance.getProcessDefinitionId()).thenReturn("pd-001");
        when(processInstance.getProcessDefinitionKey()).thenReturn("process1");
        HistoricProcessInstanceQuery piQuery = mock(HistoricProcessInstanceQuery.class);
        when(historyService.createHistoricProcessInstanceQuery()).thenReturn(piQuery);
        when(piQuery.processInstanceId(anyString())).thenReturn(piQuery);
        when(piQuery.singleResult()).thenReturn(processInstance);

        // BPMN 模型 — task2 有条件出线 → 停止预测
        BpmnModel bpmnModel = new BpmnModel();
        org.flowable.bpmn.model.Process process = new org.flowable.bpmn.model.Process();
        process.setId("process1");
        UserTask task2 = new UserTask();
        task2.setId("task2");
        task2.setName("部门审批");
        SequenceFlow flow = new SequenceFlow();
        flow.setId("flow1");
        flow.setSourceRef("task2");
        flow.setTargetRef("task3");
        flow.setConditionExpression("${amount > 1000}");
        task2.setOutgoingFlows(List.of(flow));
        process.addFlowElement(task2);
        bpmnModel.addProcess(process);
        when(repositoryService.getBpmnModel("pd-001")).thenReturn(bpmnModel);

        // 执行
        List<ExecutionNodeVO> result = predictionService.getPrediction("pi-001");

        // 验证：1 历史 + 1 活跃，无预测（有条件连线停止）
        assertThat(result).hasSize(2);
        assertThat(result.get(0).getStatus()).isEqualTo("completed");
        assertThat(result.get(1).getStatus()).isEqualTo("active");
        assertThat(result.get(1).getActivityId()).isEqualTo("task2");
    }

    @Test
    void getPrediction_returnsPredictedNodesForUnconditionalFlow() {
        // 无历史节点
        HistoricActivityInstanceQuery histQuery = mock(HistoricActivityInstanceQuery.class);
        when(historyService.createHistoricActivityInstanceQuery()).thenReturn(histQuery);
        when(histQuery.processInstanceId(anyString())).thenReturn(histQuery);
        when(histQuery.activityType("userTask")).thenReturn(histQuery);
        when(histQuery.orderByHistoricActivityInstanceStartTime()).thenReturn(histQuery);
        when(histQuery.asc()).thenReturn(histQuery);
        when(histQuery.list()).thenReturn(List.of());

        when(commentRepository.findByProcessInstanceIdOrderByCreatedAtAsc(anyString()))
                .thenReturn(List.of());

        // 活跃节点
        ActivityInstance activeActivity = mock(ActivityInstance.class);
        when(activeActivity.getActivityId()).thenReturn("task1");
        when(activeActivity.getActivityType()).thenReturn("userTask");
        when(activeActivity.getAssignee()).thenReturn(null);

        ActivityInstanceQuery actQuery = mock(ActivityInstanceQuery.class);
        when(runtimeService.createActivityInstanceQuery()).thenReturn(actQuery);
        when(actQuery.processInstanceId(anyString())).thenReturn(actQuery);
        when(actQuery.list()).thenReturn(List.of(activeActivity));

        // 历史流程实例
        HistoricProcessInstance processInstance = mock(HistoricProcessInstance.class);
        when(processInstance.getProcessDefinitionId()).thenReturn("pd-001");
        when(processInstance.getProcessDefinitionKey()).thenReturn("process1");
        HistoricProcessInstanceQuery piQuery = mock(HistoricProcessInstanceQuery.class);
        when(historyService.createHistoricProcessInstanceQuery()).thenReturn(piQuery);
        when(piQuery.processInstanceId(anyString())).thenReturn(piQuery);
        when(piQuery.singleResult()).thenReturn(processInstance);

        // BPMN 模型 — task1 无条件出线 → task2 → endEvent
        BpmnModel bpmnModel = new BpmnModel();
        org.flowable.bpmn.model.Process process = new org.flowable.bpmn.model.Process();
        process.setId("process1");

        UserTask task1 = new UserTask();
        task1.setId("task1");
        task1.setName("发起申请");

        UserTask task2 = new UserTask();
        task2.setId("task2");
        task2.setName("部门审批");

        EndEvent endEvent = new EndEvent();
        endEvent.setId("end1");
        endEvent.setName("结束");

        SequenceFlow flow1 = new SequenceFlow();
        flow1.setId("f1");
        flow1.setSourceRef("task1");
        flow1.setTargetRef("task2");
        // 无 conditionExpression

        SequenceFlow flow2 = new SequenceFlow();
        flow2.setId("f2");
        flow2.setSourceRef("task2");
        flow2.setTargetRef("end1");

        task1.setOutgoingFlows(List.of(flow1));
        task2.setOutgoingFlows(List.of(flow2));

        process.addFlowElement(task1);
        process.addFlowElement(task2);
        process.addFlowElement(endEvent);
        process.addFlowElement(flow1);
        process.addFlowElement(flow2);
        bpmnModel.addProcess(process);
        when(repositoryService.getBpmnModel("pd-001")).thenReturn(bpmnModel);

        // 执行
        List<ExecutionNodeVO> result = predictionService.getPrediction("pi-001");

        // 验证：1 活跃 + 2 预测（task2 + endEvent）
        assertThat(result).hasSize(3);
        assertThat(result.get(0).getStatus()).isEqualTo("active");

        ExecutionNodeVO predicted1 = result.get(1);
        assertThat(predicted1.getStatus()).isEqualTo("predicted");
        assertThat(predicted1.getActivityId()).isEqualTo("task2");
        assertThat(predicted1.getLineType()).isEqualTo("dashed");

        ExecutionNodeVO predicted2 = result.get(2);
        assertThat(predicted2.getStatus()).isEqualTo("predicted");
        assertThat(predicted2.getActivityId()).isEqualTo("end1");
        assertThat(predicted2.getType()).isEqualTo("endEvent");
    }

    @Test
    void getPrediction_finishedInstanceReturnsNoPredictions() {
        // 历史节点
        HistoricActivityInstance histActivity = mock(HistoricActivityInstance.class);
        when(histActivity.getActivityId()).thenReturn("task1");
        when(histActivity.getAssignee()).thenReturn("1");
        when(histActivity.getEndTime()).thenReturn(new Date());
        when(histActivity.getTaskId()).thenReturn("task-001");

        HistoricActivityInstanceQuery histQuery = mock(HistoricActivityInstanceQuery.class);
        when(historyService.createHistoricActivityInstanceQuery()).thenReturn(histQuery);
        when(histQuery.processInstanceId(anyString())).thenReturn(histQuery);
        when(histQuery.activityType("userTask")).thenReturn(histQuery);
        when(histQuery.orderByHistoricActivityInstanceStartTime()).thenReturn(histQuery);
        when(histQuery.asc()).thenReturn(histQuery);
        when(histQuery.list()).thenReturn(List.of(histActivity));

        // 历史节点 comment
        WfTaskComment histComment = new WfTaskComment();
        histComment.setTaskId("task-001");
        histComment.setUserId("1");
        histComment.setAction("complete");
        when(commentRepository.findByProcessInstanceIdOrderByCreatedAtAsc(anyString()))
                .thenReturn(List.of(histComment));
        when(userService.findByIds(any())).thenReturn(List.of());

        // 无活跃节点（已结束）
        ActivityInstanceQuery actQuery = mock(ActivityInstanceQuery.class);
        when(runtimeService.createActivityInstanceQuery()).thenReturn(actQuery);
        when(actQuery.processInstanceId(anyString())).thenReturn(actQuery);
        when(actQuery.list()).thenReturn(List.of());

        // 执行
        List<ExecutionNodeVO> result = predictionService.getPrediction("pi-001");

        // 验证：只有 1 个已完成节点，无预测
        assertThat(result).hasSize(1);
        assertThat(result.get(0).getStatus()).isEqualTo("completed");
    }
}
