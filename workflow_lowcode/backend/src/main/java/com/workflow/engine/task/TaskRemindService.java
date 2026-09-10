package com.workflow.engine.task;

import com.workflow.engine.task.entity.WfTaskRemind;
import com.workflow.engine.task.repository.WfTaskRemindRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 任务催办服务。
 *
 * <p>发起人对当前待办审批人发起催办。频率限制：同一任务在 24h（可配置）内不可重复催办。
 * 催办记录写入 {@code wf_task_remind} 表，本期通知通过 log 输出，后续对接通知中心。
 */
@Service
public class TaskRemindService {

    private static final Logger log = LoggerFactory.getLogger(TaskRemindService.class);

    private final TaskService flowableTaskService;
    private final WfTaskRemindRepository remindRepository;
    private final TenantProvider tenantProvider;

    /** 催办频率限制（小时），可通过 workflow.remind.frequency-hours 配置覆盖。 */
    @Value("${workflow.remind.frequency-hours:24}")
    private int frequencyHours = 24;

    public TaskRemindService(TaskService flowableTaskService,
                             WfTaskRemindRepository remindRepository,
                             TenantProvider tenantProvider) {
        this.flowableTaskService = flowableTaskService;
        this.remindRepository = remindRepository;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 对指定任务发起催办。
     *
     * @param taskId     任务 ID
     * @param remindFrom 催办发起人
     * @throws IllegalStateException 如果任务不存在或 24h 内已催办过
     */
    @Transactional
    public void remind(String taskId, String remindFrom) {
        // 1. 查询任务获取 assignee + processInstanceId
        Task task = flowableTaskService.createTaskQuery()
                .taskId(taskId)
                .singleResult();

        if (task == null) {
            throw new IllegalStateException("Task not found: " + taskId);
        }

        // 2. 频率限制：查询最后一条催办记录
        List<WfTaskRemind> existing = remindRepository.findByTaskIdOrderByRemindTimeDesc(taskId);
        if (!existing.isEmpty()) {
            WfTaskRemind lastRemind = existing.get(0);
            LocalDateTime lastRemindTime = lastRemind.getRemindTime();
            if (lastRemindTime != null) {
                long hoursSinceLastRemind = Duration.between(lastRemindTime, LocalDateTime.now()).toHours();
                if (hoursSinceLastRemind < frequencyHours) {
                    throw new IllegalStateException(
                            "Task " + taskId + " was reminded " + hoursSinceLastRemind
                                    + "h ago, within the " + frequencyHours + "h frequency limit");
                }
            }
        }

        // 3. 插入催办记录
        String remindTo = task.getAssignee();
        if (remindTo == null || remindTo.isBlank()) {
            remindTo = task.getOwner();
        }
        if (remindTo == null || remindTo.isBlank()) {
            throw new IllegalStateException(
                    "Task " + taskId + " has no assignee or owner to remind");
        }
        WfTaskRemind record = new WfTaskRemind();
        record.setId(UUID.randomUUID().toString().replace("-", ""));
        record.setTenantId(tenantProvider.getTenantId());
        record.setTaskId(taskId);
        record.setProcessInstanceId(task.getProcessInstanceId());
        record.setRemindFrom(remindFrom);
        record.setRemindTo(remindTo);
        record.setRemindTime(LocalDateTime.now());
        remindRepository.save(record);

        // 4. 触发通知（本期 log，后续对接通知中心）
        log.info("催办通知 taskId={} processInstanceId={} from={} to={} remindTo={}",
                taskId, task.getProcessInstanceId(), remindFrom, remindTo, remindTo);
    }
}
