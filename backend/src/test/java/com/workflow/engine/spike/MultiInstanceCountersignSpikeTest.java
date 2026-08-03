package com.workflow.engine.spike;

import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Spike-1：验证 Flowable 8 MI parallel 会签。
 *
 * <p>命题：N 个审批人全部 complete 才前进，部分完成时流程不结束。
 */
@DisplayName("Spike-1: MI parallel 会签")
class MultiInstanceCountersignSpikeTest extends AbstractFlowableSpikeTest {

    private static final String BPMN_COUNTERSIGN = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="spike">
              <process id="countersignSpike" name="会签Spike" isExecutable="true">
                <startEvent id="start" />
                <userTask id="approvalTask" name="会签审批"
                          flowable:assignee="${approver}">
                  <multiInstanceLoopCharacteristics isSequential="false"
                                                     flowable:collection="${approverList}"
                                                     flowable:elementVariable="approver">
                    <completionCondition>${nrOfCompletedInstances == nrOfInstances}</completionCondition>
                  </multiInstanceLoopCharacteristics>
                </userTask>
                <endEvent id="end" />
                <sequenceFlow id="f1" sourceRef="start" targetRef="approvalTask" />
                <sequenceFlow id="f2" sourceRef="approvalTask" targetRef="end" />
              </process>
            </definitions>
            """;

    @Test
    @DisplayName("3人会签：全部完成才前进")
    void countersign_allApproveThenAdvance() {
        deploy("countersignSpike", BPMN_COUNTERSIGN);

        List<String> approvers = List.of("alice", "bob", "carol");
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
                "countersignSpike",
                Map.of("approverList", approvers));

        // 断言：生成 3 个并发任务
        List<Task> tasks = taskService.createTaskQuery()
                .processInstanceId(inst.getId())
                .orderByTaskAssignee().asc()
                .list();
        assertEquals(3, tasks.size(), "应生成 3 个并发审批任务");

        // 记录 assignee 分配模式
        tasks.forEach(t -> System.out.println("  Task assignee=" + t.getAssignee()
                + " definitionKey=" + t.getTaskDefinitionKey()));

        // alice 完成
        taskService.complete(findTaskByAssignee(tasks, "alice").getId());
        assertTaskCount(inst.getId(), 2, "alice 完成后应剩 2 个");

        // bob 完成
        taskService.complete(findTaskByAssignee(tasks, "bob").getId());
        assertTaskCount(inst.getId(), 1, "bob 完成后应剩 1 个");

        // carol 完成 —— 全部完成，流程前进到 end
        taskService.complete(findTaskByAssignee(tasks, "carol").getId());
        assertProcessEnded(inst.getId());
    }

    @Test
    @DisplayName("会签部分完成时流程不结束")
    void countersign_partialComplete_notAdvance() {
        deploy("countersignSpike", BPMN_COUNTERSIGN);
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
                "countersignSpike",
                Map.of("approverList", List.of("alice", "bob")));

        List<Task> tasks = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).list();
        assertEquals(2, tasks.size());

        // 只完成 1 个
        taskService.complete(tasks.get(0).getId());

        assertFalse(isProcessEnded(inst.getId()),
                "会签未全部完成，流程不应结束");
    }

    // --- helpers ---

    private Task findTaskByAssignee(List<Task> tasks, String assignee) {
        return tasks.stream()
                .filter(t -> assignee.equals(t.getAssignee()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("找不到 assignee=" + assignee + " 的任务"));
    }

    private void assertTaskCount(String pid, int expected, String msg) {
        long count = taskService.createTaskQuery().processInstanceId(pid).count();
        assertEquals(expected, count, msg);
    }

    private void assertProcessEnded(String pid) {
        assertTrue(isProcessEnded(pid), "流程应已结束");
    }

    private boolean isProcessEnded(String pid) {
        ProcessInstance inst = runtimeService.createProcessInstanceQuery()
                .processInstanceId(pid).singleResult();
        return inst == null || inst.isEnded();
    }
}
