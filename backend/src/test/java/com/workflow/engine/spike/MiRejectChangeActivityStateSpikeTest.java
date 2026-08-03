package com.workflow.engine.spike;

import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Spike-4：验证 Flowable 8 changeActivityState 对 MI 节点的驳回。
 *
 * <p>命题：MI 会签节点驳回时整体回退，重新提交后 MI 重新展开全部实例。
 * 依赖 Spike-1 通过（MI 会签可用）。
 */
@DisplayName("Spike-4: MI 节点驳回整体回退")
class MiRejectChangeActivityStateSpikeTest extends AbstractFlowableSpikeTest {

    private static final String BPMN_MI_REJECT = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="spike">
              <process id="miRejectSpike" name="MI驳回Spike" isExecutable="true">
                <startEvent id="start" />
                <userTask id="initiatorTask" name="发起人填表"
                          flowable:assignee="${initiator}" />
                <userTask id="countersignTask" name="会签审批"
                          flowable:assignee="${approver}">
                  <multiInstanceLoopCharacteristics isSequential="false"
                                                     flowable:collection="${approverList}"
                                                     flowable:elementVariable="approver">
                    <completionCondition>${nrOfCompletedInstances == nrOfInstances}</completionCondition>
                  </multiInstanceLoopCharacteristics>
                </userTask>
                <endEvent id="end" />
                <sequenceFlow id="f1" sourceRef="start" targetRef="initiatorTask" />
                <sequenceFlow id="f2" sourceRef="initiatorTask" targetRef="countersignTask" />
                <sequenceFlow id="f3" sourceRef="countersignTask" targetRef="end" />
              </process>
            </definitions>
            """;

    @Test
    @DisplayName("MI驳回：会签节点整体回退，重新提交后重新展开全部实例")
    void miReject_moveCountersignBackToInitiator() {
        deploy("miRejectSpike", BPMN_MI_REJECT);

        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
                "miRejectSpike",
                Map.of("initiator", "alice",
                        "approverList", List.of("bob", "carol", "dave")));

        // 1. initiatorTask → alice 完成，流程到会签节点
        Task initiatorTask = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).singleResult();
        taskService.complete(initiatorTask.getId());

        // 2. 会签节点展开 3 个任务
        List<Task> countersignTasks = taskService.createTaskQuery()
                .processInstanceId(inst.getId())
                .orderByTaskAssignee().asc()
                .list();
        assertEquals(3, countersignTasks.size(), "会签应展开 3 个任务");

        // 3. bob 先完成（部分完成状态）
        Task bobTask = countersignTasks.stream()
                .filter(t -> "bob".equals(t.getAssignee()))
                .findFirst().orElseThrow();
        taskService.complete(bobTask.getId());

        assertEquals(2, taskService.createTaskQuery()
                        .processInstanceId(inst.getId()).count(),
                "bob 完成后应剩 2 个任务");

        // 4. carol 点"驳回"：整个 MI 节点回退到 initiatorTask
        runtimeService.createChangeActivityStateBuilder()
                .processInstanceId(inst.getId())
                .moveActivityIdTo("countersignTask", "initiatorTask")
                .changeState();

        // 5. MI 节点所有任务消失（含 carol、dave 的待办）
        List<Task> remainingMiTasks = taskService.createTaskQuery()
                .processInstanceId(inst.getId())
                .taskDefinitionKey("countersignTask").list();
        assertEquals(0, remainingMiTasks.size(),
                "MI 驳回后所有会签任务应消失");

        // 6. initiatorTask 重新出现，assignee=alice
        Task reopenedTask = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).singleResult();
        assertEquals("initiatorTask", reopenedTask.getTaskDefinitionKey());
        assertEquals("alice", reopenedTask.getAssignee());

        // 7. approverList 变量保留
        Map<String, Object> vars = runtimeService.getVariables(inst.getId());
        assertNotNull(vars.get("approverList"),
                "approverList 变量应保留，重新提交时 MI 需用它重新展开");

        // 8. 发起人重新提交 → MI 节点应重新展开 3 个实例
        taskService.complete(reopenedTask.getId());

        List<Task> reCountersignTasks = taskService.createTaskQuery()
                .processInstanceId(inst.getId())
                .orderByTaskAssignee().asc()
                .list();
        assertEquals(3, reCountersignTasks.size(),
                "重新提交后会签节点应重新展开 3 个实例");

        // 9. 重新展开包含原全部审批人（含已审过的 bob）
        List<String> reAssignees = reCountersignTasks.stream()
                .map(Task::getAssignee).toList();
        assertTrue(reAssignees.contains("bob"), "整体回退：bob 应需重新审批");
        assertTrue(reAssignees.contains("carol"), "整体回退：carol 应需重新审批");
        assertTrue(reAssignees.contains("dave"), "整体回退：dave 应需重新审批");

        System.out.println("  重新展开的 assignees: " + reAssignees);
    }
}
