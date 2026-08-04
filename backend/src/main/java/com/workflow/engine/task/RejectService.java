package com.workflow.engine.task;

import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 流程驳回服务。
 *
 * <p>使用 Flowable changeActivityState API 将当前任务节点移回发起人节点。
 * 支持 MI 节点整体回退（MI parallel 的 changeActivityState 会取消全部子实例）。
 */
@Service
public class RejectService {

    private static final Logger log = LoggerFactory.getLogger(RejectService.class);

    private final TaskService flowableTaskService;
    private final RuntimeService runtimeService;
    private final InitiatorNodeResolver initiatorNodeResolver;

    public RejectService(TaskService flowableTaskService,
                         RuntimeService runtimeService,
                         InitiatorNodeResolver initiatorNodeResolver) {
        this.flowableTaskService = flowableTaskService;
        this.runtimeService = runtimeService;
        this.initiatorNodeResolver = initiatorNodeResolver;
    }

    /**
     * 驳回任务到发起人节点。
     *
     * @param taskId      当前任务 ID
     * @param userId      操作人
     * @param reason      驳回原因
     */
    @Transactional
    public void reject(String taskId, String userId, String reason) {
        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (task == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        String processDefinitionId = task.getProcessDefinitionId();
        String currentActivityId = task.getTaskDefinitionKey();
        String initiatorNodeId = initiatorNodeResolver.resolve(processDefinitionId);

        if (initiatorNodeId == null) {
            throw new IllegalStateException(
                    "Initiator node not found for process definition: " + processDefinitionId);
        }

        if (currentActivityId.equals(initiatorNodeId)) {
            throw new IllegalStateException(
                    "Cannot reject: current node is already the initiator node");
        }

        log.info("驳回任务 taskId={} userId={} reason={} 从 {} → {}",
                taskId, userId, reason, currentActivityId, initiatorNodeId);

        runtimeService.createChangeActivityStateBuilder()
                .processInstanceId(task.getProcessInstanceId())
                .moveActivityIdTo(currentActivityId, initiatorNodeId)
                .changeState();
    }
}
