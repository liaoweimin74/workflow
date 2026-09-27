package com.workflow.engine.task;

import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.config.NodeOptions;
import com.workflow.engine.process.config.NodeOptionsService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 任务超时扫描器（Task 61；对齐 NodeJS TimeoutScannerService）。
 *
 * <p>实现说明：
 * <ul>
 *   <li>60s 轮询；扫描所有开放任务（Flowable active 查询天然排除挂起实例/挂起任务）</li>
 *   <li>任务到达超时阈值（create_time + duration 小时，缺省 24h）且未处理过
 *       —— 本调度器只认 wf_engine_notify 里 TIMEOUT_REMIND 记录作为幂等标记，
 *       避免每轮重复动作</li>
 *   <li>5 动作：remind/escalate 仅落提醒意见；transfer 转派审批管理员（admin，
 *       查不到降级提醒）；pass 自动通过（引擎 complete + 变量映射写入）；refuse 终止实例</li>
 *   <li>无请求上下文：租户取自 Task.tenantId，意见/通知记录显式携带租户写入</li>
 * </ul>
 */
@Component
public class TaskTimeoutScanner {

    private static final Logger log = LoggerFactory.getLogger(TaskTimeoutScanner.class);

    private static final String ACTION_REMIND = "remind";
    private static final String ACTION_ESCALATE = "escalate";
    private static final String ACTION_TRANSFER = "transfer";
    private static final String ACTION_PASS = "pass";
    private static final String ACTION_REFUSE = "refuse";

    private final TaskService flowableTaskService;
    private final RuntimeService runtimeService;
    private final NodeOptionsService nodeOptionsService;
    private final EngineNotifyService engineNotifyService;
    private final RoleMembershipResolver roleMembershipResolver;
    private final WfTaskCommentRepository commentRepository;
    private final com.workflow.engine.form.mapping.VariableMappingWriter variableMappingWriter;

    /** 单轮扫描中标志（防止上一轮未结束时重叠执行；@Scheduled 默认单线程亦不重叠，双保险）。 */
    private volatile boolean running = false;

    public TaskTimeoutScanner(TaskService flowableTaskService,
                              RuntimeService runtimeService,
                              NodeOptionsService nodeOptionsService,
                              EngineNotifyService engineNotifyService,
                              RoleMembershipResolver roleMembershipResolver,
                              WfTaskCommentRepository commentRepository,
                              com.workflow.engine.form.mapping.VariableMappingWriter variableMappingWriter) {
        this.flowableTaskService = flowableTaskService;
        this.runtimeService = runtimeService;
        this.nodeOptionsService = nodeOptionsService;
        this.engineNotifyService = engineNotifyService;
        this.roleMembershipResolver = roleMembershipResolver;
        this.commentRepository = commentRepository;
        this.variableMappingWriter = variableMappingWriter;
    }

    /**
     * 60s 轮询（超时粒度是小时级，间隔足够；initialDelay 给应用启动留缓冲）。
     */
    @Scheduled(fixedDelay = 60_000, initialDelay = 20_000)
    public void scan() {
        if (running) {
            return;
        }
        running = true;
        try {
            scanOnce();
        } catch (Exception e) {
            // 调度器永不抛错（无请求上下文可接）；异常留日志
            log.error("[TimeoutScanner] 扫描失败: {}", e.getMessage(), e);
        } finally {
            running = false;
        }
    }

    /** 单轮扫描（公开便于测试手动触发）。 */
    public void scanOnce() {
        List<Task> tasks = flowableTaskService.createTaskQuery().active().list();
        if (tasks.isEmpty()) {
            return;
        }
        // 模型缓存：同一轮内 defId+nodeId → NodeOptions
        Map<String, NodeOptions> optionCache = new HashMap<>();
        for (Task task : tasks) {
            try {
                scanTask(task, optionCache);
            } catch (Exception e) {
                log.warn("[TimeoutScanner] 任务超时处理失败 taskId={}: {}", task.getId(), e.getMessage());
            }
        }
    }

    private void scanTask(Task task, Map<String, NodeOptions> optionCache) {
        String defId = task.getProcessDefinitionId();
        String nodeKey = task.getTaskDefinitionKey();
        String cacheKey = defId + ":" + nodeKey;
        NodeOptions opts = optionCache.computeIfAbsent(cacheKey,
                k -> nodeOptionsService.find(defId, nodeKey).orElse(null));
        if (opts == null || !Boolean.TRUE.equals(opts.getTimeoutEnabled())) {
            return;
        }

        int durationHours = opts.getTimeoutDuration() == null ? 24 : opts.getTimeoutDuration();
        Date createTime = task.getCreateTime();
        if (createTime == null) {
            return;
        }
        long deadline = createTime.getTime() + durationHours * 3_600_000L;
        if (System.currentTimeMillis() < deadline) {
            return;
        }

        // 幂等：该任务已做过超时处理则跳过
        if (engineNotifyService.hasTimeoutRecord(task.getId())) {
            return;
        }

        String action = opts.getTimeoutAction() == null ? ACTION_REMIND : opts.getTimeoutAction();
        applyTimeoutAction(task, opts, action);
    }

    private void applyTimeoutAction(Task task, NodeOptions opts, String action) {
        String tenantId = task.getTenantId() == null || task.getTenantId().isBlank()
                ? "default" : task.getTenantId();
        String instanceId = task.getProcessInstanceId();
        String taskId = task.getId();

        // 幂等标记（remind/escalate/transfer 落通知；pass/refuse 靠任务状态自然幂等）
        engineNotifyService.writeTimeoutMark(tenantId, instanceId, taskId, action);

        switch (action) {
            case ACTION_REMIND, ACTION_ESCALATE -> insertComment(tenantId, taskId, instanceId,
                    "remind",
                    ACTION_ESCALATE.equals(action) ? "任务超时，升级提醒" : "任务超时，自动提醒",
                    null);
            case ACTION_TRANSFER -> {
                // 转派给审批管理员（sys_user admin）；查不到降级为提醒
                String admin = roleMembershipResolver.findAdminUserId();
                if (admin != null && !admin.isBlank()) {
                    flowableTaskService.setAssignee(taskId, admin);
                    insertComment(tenantId, taskId, instanceId,
                            "transfer", "任务超时，自动转派审批管理员", admin);
                } else {
                    insertComment(tenantId, taskId, instanceId,
                            "remind", "任务超时（转派失败：未找到审批管理员）", null);
                }
            }
            case ACTION_PASS -> {
                try {
                    flowableTaskService.complete(taskId);
                    insertComment(tenantId, taskId, instanceId,
                            "approve", "超时自动通过", null);
                    try {
                        variableMappingWriter.write(task.getProcessDefinitionId(), instanceId);
                    } catch (Exception e) {
                        log.warn("[TimeoutScanner] 自动通过后变量映射写入失败 taskId={}: {}",
                                taskId, e.getMessage());
                    }
                } catch (Exception e) {
                    log.warn("[TimeoutScanner] 超时自动通过失败 taskId={}: {}", taskId, e.getMessage());
                }
            }
            case ACTION_REFUSE -> {
                insertComment(tenantId, taskId, instanceId,
                        "refuse", "任务超时，自动拒绝", null);
                try {
                    runtimeService.deleteProcessInstance(instanceId, "任务超时，自动拒绝");
                } catch (Exception e) {
                    log.warn("[TimeoutScanner] 超时自动拒绝终止实例失败 instance={}: {}",
                            instanceId, e.getMessage());
                }
            }
            default -> insertComment(tenantId, taskId, instanceId,
                    "remind", "任务超时，自动提醒", null);
        }
    }

    /** 意见写入（无请求上下文：租户显式携带；结构对齐 TaskCreateBehaviorListener.writeComment）。 */
    private void insertComment(String tenantId, String taskId, String instanceId,
                               String action, String comment, String targetUserId) {
        try {
            WfTaskComment record = new WfTaskComment();
            record.setId(UUID.randomUUID().toString().replace("-", ""));
            record.setTenantId(tenantId);
            record.setTaskId(taskId);
            record.setProcessInstanceId(instanceId);
            record.setUserId("system");
            record.setAction(action);
            record.setComment(comment);
            record.setTargetUserId(targetUserId);
            record.setCreatedAt(LocalDateTime.now());
            commentRepository.save(record);
        } catch (Exception e) {
            log.warn("[TimeoutScanner] 写入超时意见失败 taskId={}: {}", taskId, e.getMessage());
        }
    }
}
