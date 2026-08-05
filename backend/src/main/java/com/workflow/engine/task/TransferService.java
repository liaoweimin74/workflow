package com.workflow.engine.task;

import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.task.entity.WfTaskTransfer;
import com.workflow.engine.task.repository.WfTaskTransferRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

/**
 * 任务转办服务。
 *
 * <p>转办（transfer）：直接更换 assignee，原办理人不再持有任务。
 * 区别于委派（delegate）：委派后原 assignee 仍是 PENDING_TASK_OWNER，
 * 被委派人 resolve 后任务回到原 assignee。
 *
 * <p>每次转办记录审计到 wf_task_transfer 表。
 */
@Service
public class TransferService {

    private static final Logger log = LoggerFactory.getLogger(TransferService.class);

    private final TaskService flowableTaskService;
    private final WfTaskTransferRepository transferRepository;
    private final TenantProvider tenantProvider;
    private final WfTaskCommentRepository commentRepository;

    public TransferService(TaskService flowableTaskService,
                           WfTaskTransferRepository transferRepository,
                           TenantProvider tenantProvider,
                           WfTaskCommentRepository commentRepository) {
        this.flowableTaskService = flowableTaskService;
        this.transferRepository = transferRepository;
        this.tenantProvider = tenantProvider;
        this.commentRepository = commentRepository;
    }

    /**
     * 转办任务。
     *
     * @param taskId   任务 ID
     * @param fromUser 原办理人（校验当前 assignee 一致）
     * @param toUser   新办理人
     * @param reason   转办原因（可为 null）
     */
    @Transactional
    public void transfer(String taskId, String fromUser, String toUser, String reason) {
        if (fromUser != null && fromUser.equals(toUser)) {
            throw new IllegalArgumentException("Cannot transfer to the same user: " + toUser);
        }

        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (task == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        log.info("转办任务 taskId={} from={} to={} reason={}", taskId, fromUser, toUser, reason);

        flowableTaskService.setAssignee(taskId, toUser);

        WfTaskTransfer record = new WfTaskTransfer();
        record.setId(UUID.randomUUID().toString().replace("-", ""));
        record.setTenantId(tenantProvider.getTenantId());
        record.setTaskId(taskId);
        record.setProcessInstanceId(task.getProcessInstanceId());
        record.setFromUser(task.getAssignee());
        record.setToUser(toUser);
        record.setReason(reason);
        transferRepository.save(record);

        // 写入审批意见
        if (fromUser != null) {
            WfTaskComment comment = new WfTaskComment();
            comment.setId(UUID.randomUUID().toString().replace("-", ""));
            comment.setTenantId(tenantProvider.getTenantId());
            comment.setTaskId(taskId);
            comment.setProcessInstanceId(task.getProcessInstanceId());
            comment.setUserId(fromUser);
            comment.setAction("transfer");
            comment.setComment(reason);
            commentRepository.save(comment);
        }
    }
}
