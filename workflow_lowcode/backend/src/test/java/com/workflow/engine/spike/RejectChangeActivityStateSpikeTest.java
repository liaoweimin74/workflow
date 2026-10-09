package com.workflow.engine.spike;

import org.flowable.engine.runtime.ProcessInstance;
import org.flowable.task.api.Task;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Spike-3：验证 Flowable 8 changeActivityState 单实例驳回。
 *
 * <p>命题：moveActivityIdTo 能把当前节点移回发起人节点，变量保留，重新提交后流程继续。
 */
@DisplayName("Spike-3: 单实例驳回 changeActivityState")
class RejectChangeActivityStateSpikeTest extends AbstractFlowableSpikeTest {

    private static final String BPMN_REJECT = """
            <?xml version="1.0" encoding="UTF-8"?>
            <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL"
                         xmlns:flowable="http://flowable.org/bpmn"
                         targetNamespace="spike">
              <process id="rejectSpike" name="驳回Spike" isExecutable="true">
                <startEvent id="start" />
                <userTask id="initiatorTask" name="发起人填表"
                          flowable:assignee="${initiator}" />
                <userTask id="managerApproval" name="经理审批"
                          flowable:assignee="${manager}" />
                <endEvent id="end" />
                <sequenceFlow id="f1" sourceRef="start" targetRef="initiatorTask" />
                <sequenceFlow id="f2" sourceRef="initiatorTask" targetRef="managerApproval" />
                <sequenceFlow id="f3" sourceRef="managerApproval" targetRef="end" />
              </process>
            </definitions>
            """;

    @Test
    @DisplayName("驳回：经理审批 → 发起人节点，变量保留，重新提交后流程继续")
    void reject_moveFromManagerBackToInitiator() {
        deploy("rejectSpike", BPMN_REJECT);

        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
                "rejectSpike",
                Map.of("initiator", "alice", "manager", "bob"));

        // 1. initiatorTask，alice 完成 → 流程到 managerApproval
        Task initiatorTask = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).singleResult();
        assertEquals("initiatorTask", initiatorTask.getTaskDefinitionKey());
        assertEquals("alice", initiatorTask.getAssignee());

        taskService.complete(initiatorTask.getId(),
                Map.of("formData", "原始申请内容", "amount", 1000));

        // 2. 当前在 managerApproval
        Task managerTask = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).singleResult();
        assertEquals("managerApproval", managerTask.getTaskDefinitionKey());
        assertEquals("bob", managerTask.getAssignee());

        // 3. 驳回：moveActivityIdTo
        runtimeService.createChangeActivityStateBuilder()
                .processInstanceId(inst.getId())
                .moveActivityIdTo("managerApproval", "initiatorTask")
                .changeState();

        // 4. managerApproval 任务消失
        assertNull(taskService.createTaskQuery()
                        .processInstanceId(inst.getId())
                        .taskDefinitionKey("managerApproval").singleResult(),
                "驳回后经理任务应消失");

        // 5. initiatorTask 重新出现，assignee 仍是 alice
        Task reopenedTask = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).singleResult();
        assertEquals("initiatorTask", reopenedTask.getTaskDefinitionKey());
        assertEquals("alice", reopenedTask.getAssignee(),
                "驳回后任务应回到发起人 alice");

        // 6. 流程变量保留
        Map<String, Object> vars = runtimeService.getVariables(inst.getId());
        assertEquals("原始申请内容", vars.get("formData"));
        assertEquals(1000, vars.get("amount"));

        // 7. 发起人修改后重新提交 → 流程再次到 managerApproval
        taskService.complete(reopenedTask.getId(),
                Map.of("formData", "修改后申请内容", "amount", 2000));

        Task reManagerTask = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).singleResult();
        assertEquals("managerApproval", reManagerTask.getTaskDefinitionKey());

        // 变量已被覆盖为新值
        Map<String, Object> newVars = runtimeService.getVariables(inst.getId());
        assertEquals("修改后申请内容", newVars.get("formData"));
        assertEquals(2000, newVars.get("amount"));
    }

    @Test
    @DisplayName("驳回历史：经理审批记录保留在历史表")
    void reject_historyRecordsBothApprovals() {
        deploy("rejectSpike", BPMN_REJECT);
        ProcessInstance inst = runtimeService.startProcessInstanceByKey(
                "rejectSpike",
                Map.of("initiator", "alice", "manager", "bob"));

        // 走到经理审批
        Task initTask = taskService.createTaskQuery()
                .processInstanceId(inst.getId()).singleResult();
        taskService.complete(initTask.getId());

        // 驳回
        runtimeService.createChangeActivityStateBuilder()
                .processInstanceId(inst.getId())
                .moveActivityIdTo("managerApproval", "initiatorTask")
                .changeState();

        // 查历史：应有已完成的 managerApproval 记录
        List<HistoricTaskInstance> finishedManagerTasks = historyService
                .createHistoricTaskInstanceQuery()
                .processInstanceId(inst.getId())
                .taskDefinitionKey("managerApproval")
                .finished()
                .list();

        System.out.println("  Historic finished managerApproval count: "
                + finishedManagerTasks.size());
        finishedManagerTasks.forEach(t -> System.out.println("    id=" + t.getId()
                + " assignee=" + t.getAssignee()
                + " endTime=" + t.getEndTime()
                + " deleteReason=" + t.getDeleteReason()));

        assertFalse(finishedManagerTasks.isEmpty(),
                "驳回前的经理审批记录应在历史表");
    }
}
