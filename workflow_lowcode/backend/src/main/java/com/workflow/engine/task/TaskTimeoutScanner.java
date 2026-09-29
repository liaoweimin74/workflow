package com.workflow.engine.task;

import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.config.NodeConfig;
import com.workflow.engine.process.config.NodeOptions;
import com.workflow.engine.process.config.NodeOptionsService;
import com.workflow.engine.process.config.ProcessPolicy;
import com.workflow.engine.process.config.ProcessPolicy.ProcessTimeoutRule;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.repository.NodeConfigRepository;
import com.workflow.engine.task.entity.WfEngineNotify;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.task.api.Task;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
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

    /** 流程级 remind 规则的提醒文案（对齐 NodeJS「任务超时，自动提醒（流程级规则）」）。 */
    private static final String PROCESS_RULE_REMIND_CONTENT = "任务超时，自动提醒（流程级规则）";

    private final TaskService flowableTaskService;
    private final RuntimeService runtimeService;
    private final NodeOptionsService nodeOptionsService;
    private final EngineNotifyService engineNotifyService;
    private final RoleMembershipResolver roleMembershipResolver;
    private final WfTaskCommentRepository commentRepository;
    private final com.workflow.engine.form.mapping.VariableMappingWriter variableMappingWriter;
    /** Task 69：读取 __PROCESS__ 流程级策略（规则组兕底）。 */
    private final NodeConfigRepository nodeConfigRepository;
    private final InitiatorNodeResolver initiatorNodeResolver;

    /** 单轮扫描中标志（防止上一轮未结束时重叠执行；@Scheduled 默认单线程亦不重叠，双保险）。 */
    private volatile boolean running = false;

    public TaskTimeoutScanner(TaskService flowableTaskService,
                              RuntimeService runtimeService,
                              NodeOptionsService nodeOptionsService,
                              EngineNotifyService engineNotifyService,
                              RoleMembershipResolver roleMembershipResolver,
                              WfTaskCommentRepository commentRepository,
                              com.workflow.engine.form.mapping.VariableMappingWriter variableMappingWriter,
                              NodeConfigRepository nodeConfigRepository,
                              InitiatorNodeResolver initiatorNodeResolver) {
        this.flowableTaskService = flowableTaskService;
        this.runtimeService = runtimeService;
        this.nodeOptionsService = nodeOptionsService;
        this.engineNotifyService = engineNotifyService;
        this.roleMembershipResolver = roleMembershipResolver;
        this.commentRepository = commentRepository;
        this.variableMappingWriter = variableMappingWriter;
        this.nodeConfigRepository = nodeConfigRepository;
        this.initiatorNodeResolver = initiatorNodeResolver;
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
        // 模型缓存：同一轮内 defId+nodeId → NodeOptions / defId → 流程级策略
        Map<String, NodeOptions> optionCache = new HashMap<>();
        Map<String, ProcessPolicy> policyCache = new HashMap<>();
        for (Task task : tasks) {
            try {
                scanTask(task, optionCache, policyCache);
            } catch (Exception e) {
                log.warn("[TimeoutScanner] 任务超时处理失败 taskId={}: {}", task.getId(), e.getMessage());
            }
        }
    }

    private void scanTask(Task task, Map<String, NodeOptions> optionCache,
                          Map<String, ProcessPolicy> policyCache) {
        String defId = task.getProcessDefinitionId();
        String nodeKey = task.getTaskDefinitionKey();
        String cacheKey = defId + ":" + nodeKey;
        NodeOptions opts = optionCache.computeIfAbsent(cacheKey,
                k -> nodeOptionsService.find(defId, nodeKey).orElse(null));
        // Task 76：流程级审批管理员名单随策略一次读出，节点级/流程级两条路径共用
        ProcessPolicy policy = policyCache.computeIfAbsent(defId, this::loadProcessPolicy);
        if (opts != null && Boolean.TRUE.equals(opts.getTimeoutEnabled())) {
            applyNodeLevelTimeout(task, opts, policy.getAdminUserIds());
            return;
        }

        // Task 69：节点未开启 timeout（含无节点配置块）→ 流程级规则组兕底
        //（对齐设计器「此配置不对已经开启了超时处理的节点生效」）
        if (policy.getTimeoutRules().isEmpty()) {
            return;
        }
        applyProcessTimeoutRules(task, resolveTaskRoleQuietly(defId, nodeKey),
                policy.getTimeoutRules(), policy.getAdminUserIds());
    }

    /** 节点级超时（Task 61 原有路径；Task 76 起转派/提醒管理员解析优先流程级名单）。 */
    private void applyNodeLevelTimeout(Task task, NodeOptions opts, List<String> processAdminUserIds) {
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
        applyTimeoutAction(task, action, processAdminUserIds);
    }

    /** 节点类别（handler 节点跳过 pass/refuse 规则用）；解析失败按 approver 处理。 */
    private String resolveTaskRoleQuietly(String defId, String nodeKey) {
        try {
            String initiatorNodeId;
            try {
                initiatorNodeId = initiatorNodeResolver.resolve(defId);
            } catch (Exception e) {
                initiatorNodeId = null;
            }
            boolean isInitiator = nodeKey.equals(initiatorNodeId);
            return nodeOptionsService.resolveTaskRole(defId, nodeKey, isInitiator);
        } catch (Exception e) {
            return "approver";
        }
    }

    /** 读部署版本的流程级策略（__PROCESS__ config_json；未配置/失败返回全关默认）。 */
    private ProcessPolicy loadProcessPolicy(String defId) {
        try {
            for (NodeConfig nc : nodeConfigRepository.findByProcessDefinitionId(defId)) {
                if (ProcessPolicy.PROCESS_LEVEL_NODE_ID.equals(nc.getNodeId())) {
                    return ProcessPolicy.parseProcessPolicy(nc.getConfigJson());
                }
            }
            return ProcessPolicy.parseProcessPolicy(null);
        } catch (Exception e) {
            log.warn("[TimeoutScanner] 读取流程级策略失败 defId={}: {}", defId, e.getMessage());
            return ProcessPolicy.parseProcessPolicy(null);
        }
    }

    /** 单条规则的时长（毫秒）。 */
    private static long ruleDurationMs(ProcessTimeoutRule rule) {
        long unitMinutes = switch (rule.getUnit() == null ? "hour" : rule.getUnit()) {
            case "minute" -> 1L;
            case "day" -> 1_440L;
            default -> 60L;
        };
        return rule.getDuration() * unitMinutes * 60_000L;
    }

    /**
     * 流程级规则组处理（Task 69，对齐 NodeJS applyProcessTimeoutRules）：
     * 对每条规则独立计算 deadline 与幂等标记。
     * 幂等：动作类（transfer/pass/refuse）靠 TIMEOUT_{ACTION} 通知记录；
     * remind 非重复靠 TIMEOUT_REMIND，重复提醒需距上次提醒 ≥ 规则时长。
     */
    private void applyProcessTimeoutRules(Task task, String taskRole, List<ProcessTimeoutRule> rules,
                                          List<String> processAdminUserIds) {
        String tenantId = task.getTenantId() == null || task.getTenantId().isBlank()
                ? "default" : task.getTenantId();
        Date createTime = task.getCreateTime();
        if (createTime == null) {
            return;
        }
        long now = System.currentTimeMillis();
        boolean handlerNode = "handler".equals(taskRole);
        for (ProcessTimeoutRule rule : rules) {
            // 办理节点没有通过/拒绝语义：跳过 pass/refuse 规则
            if (handlerNode && (ACTION_PASS.equals(rule.getAction()) || ACTION_REFUSE.equals(rule.getAction()))) {
                continue;
            }
            long durationMs = ruleDurationMs(rule);
            if (now < createTime.getTime() + durationMs) {
                continue;
            }

            if (ACTION_REMIND.equals(rule.getAction())) {
                WfEngineNotify last = engineNotifyService.findLatestNotify(task.getId(),
                        EngineNotifyService.TYPE_TIMEOUT_REMIND);
                if (last != null) {
                    if (!rule.isRepeat()) {
                        continue;
                    }
                    if (last.getCreatedAt() != null
                            && now - last.getCreatedAt().atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()
                                    < durationMs) {
                        continue;
                    }
                }
                // 幂等标记（与节点级同类型）+ 被提醒人：当前审批人/审批管理员/更多员工
                engineNotifyService.writeNotifyRecord(tenantId, task.getProcessInstanceId(), task.getId(),
                        EngineNotifyService.TYPE_TIMEOUT_REMIND, "",
                        PROCESS_RULE_REMIND_CONTENT);
                if (rule.isSms()) {
                    for (String target : resolveNotifyTargets(task, rule, processAdminUserIds)) {
                        engineNotifyService.writeNotifyRecord(tenantId, task.getProcessInstanceId(), task.getId(),
                                EngineNotifyService.TYPE_SMS_TIMEOUT, target, PROCESS_RULE_REMIND_CONTENT);
                    }
                }
                insertComment(tenantId, task.getId(), task.getProcessInstanceId(),
                        "remind", PROCESS_RULE_REMIND_CONTENT, null);
                continue;
            }

            // 动作类：幂等 = 已有 TIMEOUT_{ACTION} 记录
            String notifyType = "TIMEOUT_" + rule.getAction().toUpperCase(Locale.ROOT);
            if (engineNotifyService.hasNotifyRecord(task.getId(), notifyType)) {
                continue;
            }
            applyProcessRuleAction(task, tenantId, rule.getAction(), notifyType, processAdminUserIds);
        }
    }

    /**
     * 转派目标解析：流程级审批管理员（adminUserIds[0]）优先，未配置回落全局 admin（Task 76）。
     */
    private String transferTarget(List<String> processAdminUserIds) {
        if (processAdminUserIds != null && !processAdminUserIds.isEmpty()) {
            return processAdminUserIds.get(0);
        }
        return roleMembershipResolver.findAdminUserId();
    }

    /**
     * 被提醒人集合（当前审批人/审批管理员/更多员工；对齐 NodeJS resolveNotifyTargets）。
     * 审批管理员：流程级 adminUserIds 优先（全量提醒），未配置回落全局 admin（Task 76）。
     */
    private List<String> resolveNotifyTargets(Task task, ProcessTimeoutRule rule,
                                              List<String> processAdminUserIds) {
        List<String> targets = new ArrayList<>();
        if (rule.isNotifyAssignee() && task.getAssignee() != null && !task.getAssignee().isBlank()) {
            targets.add(task.getAssignee());
        }
        if (rule.isNotifyAdmin()) {
            if (processAdminUserIds != null && !processAdminUserIds.isEmpty()) {
                for (String adminId : processAdminUserIds) {
                    if (!targets.contains(adminId)) {
                        targets.add(adminId);
                    }
                }
            } else {
                String admin = roleMembershipResolver.findAdminUserId();
                if (admin != null) {
                    targets.add(admin);
                }
            }
        }
        for (String extra : rule.getNotifyUserIds()) {
            if (!targets.contains(extra)) {
                targets.add(extra);
            }
        }
        return targets;
    }

    /**
     * 流程级规则动作执行（transfer/pass/refuse；动作语义与节点级 applyTimeoutAction 一致，
     * 幂等标记由调用方按 TIMEOUT_{ACTION} 类型写入）。
     */
    private void applyProcessRuleAction(Task task, String tenantId, String action, String notifyType,
                                        List<String> processAdminUserIds) {
        String instanceId = task.getProcessInstanceId();
        String taskId = task.getId();

        engineNotifyService.writeNotifyRecord(tenantId, instanceId, taskId, notifyType, "",
                "任务超时（" + action + "）");

        switch (action) {
            case ACTION_TRANSFER -> {
                // 转派目标：流程级审批管理员（adminUserIds[0]）优先，未配置回落全局 admin；
                // 查不到时降级为提醒
                String admin = transferTarget(processAdminUserIds);
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
                        "refuse", "超时自动拒绝", null);
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

    /** 节点级动作执行（Task 61 原有路径；opts 仅承载节点配置，动作本身只依赖 task+action）。 */
    private void applyTimeoutAction(Task task, String action, List<String> processAdminUserIds) {
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
                // 转派目标：流程级审批管理员优先，未配置回落全局 admin；查不到降级为提醒（Task 76）
                String admin = transferTarget(processAdminUserIds);
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
