package com.workflow.engine.spike;

import org.flowable.engine.runtime.Execution;
import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Spike-7：验证转签（forward-sign）。
 *
 * <p>命题：会签任务中，某个审批人将自己的审批权转给他人。
 * 实现：删除当前审批人的 MI 实例 + 添加新审批人的 MI 实例。
 * 转签后原审批人任务消失，新审批人任务出现，总审批人数不变。
 */
@DisplayName("Spike-7: 转签")
class ForwardSignSpikeTest extends AbstractFlowableSpikeTest {

    private static final String BPMN = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="spike">
              <process id="forwardSignSpike" name="转签Spike" isExecutable="true">
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
    @DisplayName("转签：alice 将审批权转给 charlie")
    void forwardSign_transfersApprovalToAnotherUser() {
        deploy("forwardSignSpike", BPMN);

        ProcessInstance pi = runtimeService.startProcessInstanceByKey("forwardSignSpike",
                Map.of("approverList", List.of("alice", "bob")));

        // 2 个任务：alice + bob
        List<Task> tasks = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .orderByTaskAssignee().asc()
                .list();
        assertEquals(2, tasks.size());

        Task aliceTask = tasks.stream().filter(t -> "alice".equals(t.getAssignee())).findFirst().orElseThrow();

        // 转签：alice → charlie
        // 1. 删除 alice 的 MI 实例（标记为已完成，不算通过）
        // 2. 添加 charlie 的 MI 实例
        runtimeService.deleteMultiInstanceExecution(aliceTask.getExecutionId(), false);
        runtimeService.addMultiInstanceExecution("approvalTask", pi.getId(),
                Map.of("approver", "charlie"));

        // 现在：bob + charlie（alice 消失）
        List<Task> tasksAfter = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .orderByTaskAssignee().asc()
                .list();
        assertEquals(2, tasksAfter.size(), "转签后仍应有 2 个任务");
        assertTrue(tasksAfter.stream().noneMatch(t -> "alice".equals(t.getAssignee())),
                "alice 的任务应消失");
        assertTrue(tasksAfter.stream().anyMatch(t -> "charlie".equals(t.getAssignee())),
                "charlie 的任务应出现");
        assertTrue(tasksAfter.stream().anyMatch(t -> "bob".equals(t.getAssignee())),
                "bob 的任务应保留");

        // bob + charlie 完成后流程结束
        for (Task t : tasksAfter) {
            taskService.complete(t.getId());
        }

        ProcessInstance finished = runtimeService.createProcessInstanceQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNull(finished, "所有人完成后流程应结束");
    }
}
