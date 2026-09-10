package com.workflow.engine.task;

import com.workflow.engine.form.mapping.VariableMappingWriter;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 流程驳回服务。
 *
 * <p>使用 Flowable changeActivityState API 将当前任务节点移回发起人节点。
 * 支持 MI 节点整体回退（MI parallel 的 changeActivityState 会取消全部子实例）。
 *
 * <p>驳回时设置流程变量 rejected=true，触发 multi-instance 节点的
 * completionCondition 终止多实例活动（三种模式：会签/或签/依次审批）。
 */
@Service
public class RejectService {

    private static final Logger log = LoggerFactory.getLogger(RejectService.class);

    private final TaskService flowableTaskService;
    private final RuntimeService runtimeService;
    private final InitiatorNodeResolver initiatorNodeResolver;
    private final TenantProvider tenantProvider;
    private final WfTaskCommentRepository commentRepository;
    private final VariableMappingWriter variableMappingWriter;

    public RejectService(TaskService flowableTaskService,
                         RuntimeService runtimeService,
                         InitiatorNodeResolver initiatorNodeResolver,
                         TenantProvider tenantProvider,
                         WfTaskCommentRepository commentRepository,
                         VariableMappingWriter variableMappingWriter) {
        this.flowableTaskService = flowableTaskService;
        this.runtimeService = runtimeService;
        this.initiatorNodeResolver = initiatorNodeResolver;
        this.tenantProvider = tenantProvider;
        this.commentRepository = commentRepository;
        this.variableMappingWriter = variableMappingWriter;
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

        // 设置拒绝标记，触发 multi-instance completionCondition 终止多实例
        runtimeService.setVariable(task.getProcessInstanceId(), "rejected", true);

        runtimeService.createChangeActivityStateBuilder()
                .processInstanceId(task.getProcessInstanceId())
                .moveActivityIdTo(currentActivityId, initiatorNodeId)
                .changeState();

        // 写入审批意见
        if (userId != null) {
            WfTaskComment comment = new WfTaskComment();
            comment.setId(UUID.randomUUID().toString().replace("-", ""));
            comment.setTenantId(tenantProvider.getTenantId());
            comment.setTaskId(taskId);
            comment.setProcessInstanceId(task.getProcessInstanceId());
            comment.setUserId(userId);
            comment.setAction("reject");
            comment.setComment(reason);
            commentRepository.save(comment);
        }

        // 流程变量映射写入（驳回后发起人重新填报，变量随新表单数据刷新）
        try {
            variableMappingWriter.write(processDefinitionId, task.getProcessInstanceId());
        } catch (Exception e) {
            log.warn("Failed to write variable mappings after reject task [{}]: {}", taskId, e.getMessage());
        }
    }
}
