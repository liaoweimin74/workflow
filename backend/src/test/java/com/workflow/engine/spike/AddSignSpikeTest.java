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
 * Spike-6：验证 Flowable 8 运行时加签（addMultiInstanceExecution）。
 *
 * <p>命题：
 * 1. 会签任务运行中，调用 addMultiInstanceExecution 增加一个审批人
 * 2. 新增的审批人任务出现
 * 3. 原有审批人 + 新增审批人全部完成才前进
 */
@DisplayName("Spike-6: 运行时加签")
class AddSignSpikeTest extends AbstractFlowableSpikeTest {

    private static final String BPMN = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="spike">
              <process id="addSignSpike" name="加签Spike" isExecutable="true">
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
    @DisplayName("加签：运行中增加审批人，所有人完成才前进")
    void addSign_increasesApproverCount() {
        deploy("addSignSpike", BPMN);

        // 启动：2 个审批人
        ProcessInstance pi = runtimeService.startProcessInstanceByKey("addSignSpike",
                Map.of("approverList", List.of("alice", "bob")));

        // 2 个任务
        List<Task> tasks = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .orderByTaskAssignee()
                .asc()
                .list();
        assertEquals(2, tasks.size());

        // 加签：增加 charlie
        Execution exec = runtimeService.addMultiInstanceExecution(
                "approvalTask",
                pi.getId(),
                Map.of("approver", "charlie"));

        assertNotNull(exec, "addMultiInstanceExecution 应返回新增的 Execution");

        // 现在 3 个任务
        List<Task> tasksAfterAdd = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .orderByTaskAssignee()
                .asc()
                .list();
        assertEquals(3, tasksAfterAdd.size(), "加签后应有 3 个任务");

        // 验证新增的 charlie 任务
        assertTrue(tasksAfterAdd.stream().anyMatch(t -> "charlie".equals(t.getAssignee())),
                "应包含 charlie 的任务");

        // 完成 alice + bob，流程不应结束（charlie 未完成）
        taskService.complete(tasksAfterAdd.stream().filter(t -> "alice".equals(t.getAssignee())).findFirst().orElseThrow().getId());
        taskService.complete(tasksAfterAdd.stream().filter(t -> "bob".equals(t.getAssignee())).findFirst().orElseThrow().getId());

        ProcessInstance stillRunning = runtimeService.createProcessInstanceQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNotNull(stillRunning, "charlie 未完成，流程不应结束");

        // 完成 charlie，流程结束
        Task charlieTask = taskService.createTaskQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNotNull(charlieTask);
        assertEquals("charlie", charlieTask.getAssignee());
        taskService.complete(charlieTask.getId());

        ProcessInstance finished = runtimeService.createProcessInstanceQuery()
                .processInstanceId(pi.getId())
                .singleResult();
        assertNull(finished, "所有人完成后流程应结束");
    }
}
