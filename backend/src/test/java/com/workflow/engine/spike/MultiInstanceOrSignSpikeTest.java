package com.workflow.engine.spike;

import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Spike-2：验证 Flowable 8 MI 或签。
 *
 * <p>命题：completionCondition nrOfCompletedInstances>=1 时，任一完成即结束其余任务。
 */
@DisplayName("Spike-2: MI 或签")
class MultiInstanceOrSignSpikeTest extends AbstractFlowableSpikeTest {

    private static final String BPMN_OR_SIGN = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="spike">
              <process id="orSignSpike" name="或签Spike" isExecutable="true">
                <startEvent id="start" />
                <userTask id="approvalTask" name="或签审批"
                          flowable:assignee="${approver}">
                  <multiInstanceLoopCharacteristics isSequential="false"
                                                     flowable:collection="${approverList}"
                                                     flowable:elementVariable="approver">
                    <completionCondition>${nrOfCompletedInstances >= 1}</completionCondition>
                  </multiInstanceLoopCharacteristics>
                </userTask>
                <endEvent id="end" />
                <sequenceFlow id="f1" sourceRef="start" targetRef="approvalTask" />
                <sequenceFlow id="f2" sourceRef="approvalTask" targetRef="end" />
              </process>
            </definitions>
            """;

    @Test
    @DisplayName("或签：第一个完成后流程结束，其余任务自动清理")
    void orSign_firstCompleteRestAutoCancel() {
        deploy("orSignSpike", BPMN_OR_SIGN);

        List<String> approvers = List.of("alice", "bob", "carol");
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
                "orSignSpike",
                Map.of("approverList", approvers));

        // 初始 3 个任务
        List<Task> tasks = taskService.createTaskQuery()
                .processInstanceId(inst.getId())
                .orderByTaskAssignee().asc()
                .list();
        assertEquals(3, tasks.size(), "或签应展开 3 个任务");

        tasks.forEach(t -> System.out.println("  Task assignee=" + t.getAssignee()));

        // alice 完成（第一个完成）
        Task aliceTask = tasks.stream()
                .filter(t -> "alice".equals(t.getAssignee()))
                .findFirst().orElseThrow();
        taskService.complete(aliceTask.getId());

        // 断言：流程已结束
        assertTrue(isProcessEnded(inst.getId()),
                "或签：第一个完成后流程应结束");

        // 断言：其余 2 个任务已被引擎自动删除
        List<Task> remaining = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).list();
        assertEquals(0, remaining.size(),
                "或签完成后其余任务应被自动清理");
    }

    @Test
    @DisplayName("或签：记录 assignee 分配模式")
    void orSign_checkAssigneeDistribution() {
        deploy("orSignSpike", BPMN_OR_SIGN);
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
                "orSignSpike",
                Map.of("approverList", List.of("alice", "bob")));

        List<Task> tasks = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).list();

        // 确认 elementVariable + assignee 写法下每个实例 assignee 正确
        tasks.forEach(t -> {
            System.out.println("  Task " + t.getId()
                    + " assignee=" + t.getAssignee()
                    + " definitionKey=" + t.getTaskDefinitionKey());
            assertNotNull(t.getAssignee(), "assignee 不应为 null");
        });
    }

    private boolean isProcessEnded(String pid) {
        ProcessInstance inst = runtimeService.createProcessInstanceQuery()
                .processInstanceId(pid).singleResult();
        return inst == null || inst.isEnded();
    }
}
