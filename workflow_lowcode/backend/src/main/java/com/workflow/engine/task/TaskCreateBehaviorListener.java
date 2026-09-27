package com.workflow.engine.task;

import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.config.NodeOptions;
import com.workflow.engine.process.config.NodeOptionsService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.delegate.TaskListener;
import org.flowable.identitylink.api.IdentityLink;
import org.flowable.task.api.delegate.DelegateTask;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 任务创建行为监听器（对齐 NodeJS 引擎 Task 61 的任务创建期语义）。
 *
 * <p>由 MultiInstanceBpmnRewriter 注入到 userTask 的 create 事件
 * （{@code flowable:taskListener delegateExpression=${taskCreateBehaviorListener}}），
 * 按节点配置依次处理：
 * <ol>
 *   <li>notify.sms=true → 写 SMS_NODE 通知记录</li>
 *   <li>approvalType=auto_pass / auto_reject → 自动通过 / 自动拒绝（终止实例）</li>
 *   <li>去重（dedup.enabled / skipSameAsInitiator）→ 过滤后为空自动通过</li>
 *   <li>未分配任务 → 类型化解析（initiator_self / initiator_select / role / expression）</li>
 *   <li>解析为空 → noAssigneePolicy 策略（auto_pass/skip/block/to_admin/to_user/supervisor）</li>
 * </ol>
 *
 * <p>自动通过/跳过 = 写意见（system）后 complete 当前任务（Flowable 同命令上下文内完成）；
 * block = 抛出异常使实例启动/推进失败（对齐 NodeJS 的 400 拦截语义）。
 */
@Component("taskCreateBehaviorListener")
public class TaskCreateBehaviorListener implements TaskListener {

    private static final Logger log = LoggerFactory.getLogger(TaskCreateBehaviorListener.class);

    private static final Pattern EXPRESSION_PATTERN = Pattern.compile("\\$\\{([^{}]+)}");

    private final NodeOptionsService nodeOptionsService;
    private final RoleMembershipResolver roleMembershipResolver;
    private final EngineNotifyService engineNotifyService;
    private final TaskService flowableTaskService;
    private final RuntimeService runtimeService;
    private final org.flowable.engine.HistoryService historyService;
    private final com.workflow.system.repository.SysUserRepository sysUserRepository;
    private final WfTaskCommentRepository commentRepository;

    public TaskCreateBehaviorListener(NodeOptionsService nodeOptionsService,
                                      RoleMembershipResolver roleMembershipResolver,
                                      EngineNotifyService engineNotifyService,
                                      TaskService flowableTaskService,
                                      RuntimeService runtimeService,
                                      org.flowable.engine.HistoryService historyService,
                                      com.workflow.system.repository.SysUserRepository sysUserRepository,
                                      WfTaskCommentRepository commentRepository) {
        this.nodeOptionsService = nodeOptionsService;
        this.roleMembershipResolver = roleMembershipResolver;
        this.engineNotifyService = engineNotifyService;
        this.flowableTaskService = flowableTaskService;
        this.runtimeService = runtimeService;
        this.historyService = historyService;
        this.sysUserRepository = sysUserRepository;
        this.commentRepository = commentRepository;
    }

    @Override
    public void notify(DelegateTask delegateTask) {
        try {
            handle(delegateTask);
        } catch (Exception e) {
            // 业务拦截（block 策略）原样上抛使流程失败；其余异常降级为日志，保持任务可办理
            if (e instanceof RuntimeException && hasBlockMessage(e)) {
                throw (RuntimeException) e;
            }
            log.error("任务创建行为处理失败 taskId={} node={}", delegateTask.getId(),
                    delegateTask.getTaskDefinitionKey(), e);
        }
    }

    private boolean hasBlockMessage(Throwable e) {
        return e.getMessage() != null && e.getMessage().contains("找不到办理人/审批人");
    }

    private void handle(DelegateTask task) {
        String processDefinitionId = task.getProcessDefinitionId();
        String nodeId = task.getTaskDefinitionKey();
        String processInstanceId = task.getProcessInstanceId();
        String tenantId = task.getTenantId();

        NodeOptions opts = nodeOptionsService.find(processDefinitionId, nodeId).orElse(null);

        // ① 节点「发送短信给办理人」→ 通知记录
        if (opts != null && Boolean.TRUE.equals(opts.getNotifySms())) {
            engineNotifyService.writeSmsNode(tenantId, processInstanceId, task.getId(),
                    task.getAssignee(), task.getName());
        }

        if (opts == null) {
            return; // 旧数据无新配置块 → 保持既有行为
        }

        // ② 审批类型：自动通过 / 自动拒绝
        if ("auto_pass".equals(opts.getApprovalType())) {
            writeComment(tenantId, task.getId(), processInstanceId, "system", "approve", "自动通过", null);
            completeQuietly(task.getId());
            return;
        }
        if ("auto_reject".equals(opts.getApprovalType())) {
            writeComment(tenantId, task.getId(), processInstanceId, "system", "refuse", "自动拒绝", null);
            runtimeService.deleteProcessInstance(processInstanceId, "自动拒绝");
            return;
        }

        String initiator = stringVariable(processInstanceId, "initiator");
        boolean unassigned = isBlank(task.getAssignee()) && candidateUsers(task).isEmpty();

        if (!unassigned) {
            // ③ 静态分配（部署期改写器写入）的去重兜底
            if (Boolean.TRUE.equals(opts.getSkipSameAsInitiator())
                    && task.getAssignee() != null && task.getAssignee().equals(initiator)) {
                autoApproveFiltered(tenantId, task, processInstanceId);
                return;
            }
            if (Boolean.TRUE.equals(opts.getDedupEnabled()) && task.getAssignee() != null
                    && alreadyCompleted(processInstanceId, task.getAssignee())) {
                autoApproveFiltered(tenantId, task, processInstanceId);
                return;
            }
            return; // 正常人工任务
        }

        // ④ 类型化解析（未分配任务）
        List<String> resolved = new ArrayList<>(resolveTyped(opts, task, initiator));
        boolean filtered = false;
        if (!resolved.isEmpty() && Boolean.TRUE.equals(opts.getSkipSameAsInitiator()) && initiator != null) {
            filtered |= resolved.removeIf(u -> u.equals(initiator));
        }
        if (!resolved.isEmpty() && Boolean.TRUE.equals(opts.getDedupEnabled())) {
            filtered |= resolved.removeIf(u -> alreadyCompleted(processInstanceId, u));
        }

        // ⑤ 过滤后为空 → 自动通过（对齐 NodeJS：去重导致的全过滤按通过处理）
        if (filtered && resolved.isEmpty()) {
            autoApproveFiltered(tenantId, task, processInstanceId);
            return;
        }

        // ⑥ 解析为空 → 「找不到办理人」策略
        if (resolved.isEmpty()) {
            applyNoAssigneePolicy(opts, task, tenantId, processInstanceId);
            return;
        }

        if (resolved.size() == 1) {
            task.setAssignee(resolved.get(0));
        } else {
            for (String userId : resolved) {
                task.addCandidateUser(userId);
            }
        }
    }

    // ------------------------------------------------------------ 策略

    private void applyNoAssigneePolicy(NodeOptions opts, DelegateTask task,
                                       String tenantId, String processInstanceId) {
        String policy = opts.getNoAssigneePolicy() == null ? "" : opts.getNoAssigneePolicy();
        String label = task.getName() == null || task.getName().isBlank()
                ? task.getTaskDefinitionKey() : task.getName();
        switch (policy) {
            case "auto_pass" -> {
                writeComment(tenantId, task.getId(), processInstanceId, "system", "approve", "自动通过", null);
                completeQuietly(task.getId());
            }
            case "skip" -> {
                writeComment(tenantId, task.getId(), processInstanceId, "system", "system",
                        "未找到办理人，自动跳过", null);
                completeQuietly(task.getId());
            }
            case "block" -> throw new IllegalStateException(
                    "节点「" + label + "」找不到办理人/审批人，已按配置禁止提交流程");
            case "to_admin" -> {
                String admin = roleMembershipResolver.findAdminUserId();
                if (admin != null) {
                    task.setAssignee(admin);
                }
                // 管理员缺失 → 落回候选人任务（旧语义兼容）
            }
            case "to_user" -> {
                if (!isBlank(opts.getToUserId())) {
                    task.setAssignee(opts.getToUserId());
                }
            }
            case "supervisor" -> {
                // v1 组织表无负责人字段：保持为空（候选人任务兜底），与 NodeJS 降级一致
            }
            default -> {
                // 空/未配置 → 建无 assignee 的候选人任务（与历史行为一致）
            }
        }
    }

    // ------------------------------------------------------------ 类型化解析

    private List<String> resolveTyped(NodeOptions opts, DelegateTask task, String initiator) {
        String type = opts.getApprovalTypeRaw() == null ? "user" : opts.getApprovalTypeRaw();
        String processInstanceId = task.getProcessInstanceId();
        switch (type) {
            case "initiator_self" -> {
                return initiator == null ? List.of() : List.of(initiator);
            }
            case "initiator_select" -> {
                return normalizeUserList(variable(processInstanceId, "assignee_" + task.getTaskDefinitionKey()));
            }
            case "role" -> {
                return roleMembershipResolver.membersOfRoles(opts.getRoleCodes());
            }
            case "expression" -> {
                return resolveExpression(opts.getApprovalExpression(), processInstanceId, initiator);
            }
            default -> {
                return List.of();
            }
        }
    }

    /**
     * 审批人表达式求值（v1 保守子集，对齐 NodeJS resolveExpression）：
     * ${initiator} → 发起人；${initiator.deptManager} → v1 恒空（组织表无负责人字段）；
     * ${变量名} → 流程变量；无 ${} 的纯文本按变量名兜底。多表达式取并集去重。
     */
    private List<String> resolveExpression(String raw, String processInstanceId, String initiator) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        String text = raw.trim();
        Matcher matcher = EXPRESSION_PATTERN.matcher(text);
        if (!matcher.find()) {
            return normalizeUserList(variable(processInstanceId, text));
        }
        matcher.reset();
        Set<String> out = new LinkedHashSet<>();
        while (matcher.find()) {
            String name = matcher.group(1).trim();
            if (name.isEmpty()) {
                continue;
            }
            if ("initiator".equals(name)) {
                if (initiator != null) {
                    out.add(initiator);
                }
                continue;
            }
            if ("initiator.deptManager".equals(name)) {
                continue; // v1 无组织负责人字段，降级为空
            }
            out.addAll(normalizeUserList(variable(processInstanceId, name)));
        }
        return new ArrayList<>(out);
    }

    // ------------------------------------------------------------ 辅助

    private void autoApproveFiltered(String tenantId, DelegateTask task, String processInstanceId) {
        writeComment(tenantId, task.getId(), processInstanceId, "system", "approve", "自动通过", null);
        completeQuietly(task.getId());
    }

    private void completeQuietly(String taskId) {
        try {
            flowableTaskService.complete(taskId);
        } catch (Exception e) {
            log.warn("任务自动完成失败（保留人工处理）taskId={}: {}", taskId, e.getMessage());
        }
    }

    private boolean alreadyCompleted(String processInstanceId, String userId) {
        try {
            return historyService.createHistoricTaskInstanceQuery()
                    .processInstanceId(processInstanceId)
                    .taskAssignee(userId)
                    .finished()
                    .count() > 0;
        } catch (Exception e) {
            return false;
        }
    }

    private List<String> candidateUsers(DelegateTask task) {
        List<String> out = new ArrayList<>();
        try {
            Set<IdentityLink> links = task.getCandidates();
            if (links != null) {
                for (IdentityLink link : links) {
                    if (link.getUserId() != null) {
                        out.add(link.getUserId());
                    }
                }
            }
        } catch (Exception e) {
            // 候选人读取失败按无候选人处理
        }
        return out;
    }

    private Object variable(String processInstanceId, String name) {
        try {
            return runtimeService.getVariable(processInstanceId, name);
        } catch (Exception e) {
            return null;
        }
    }

    private String stringVariable(String processInstanceId, String name) {
        Object raw = variable(processInstanceId, name);
        if (raw == null) {
            return null;
        }
        String s = String.valueOf(raw);
        return s.isBlank() ? null : s;
    }

    /**
     * 归一用户 ID 列表（发起页自选办理人变量 assignee_&lt;nodeId&gt; 可能是字符串/数字/集合，逗号分隔）。
     */
    private List<String> normalizeUserList(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        List<Object> parts = new ArrayList<>();
        if (raw instanceof java.util.Collection<?> collection) {
            parts.addAll(collection);
        } else {
            parts.add(raw);
        }
        for (Object part : parts) {
            if (part instanceof Number number) {
                out.add(String.valueOf(number.longValue()));
            } else if (part instanceof String s) {
                for (String piece : s.split(",")) {
                    String trimmed = piece.trim();
                    if (!trimmed.isEmpty()) {
                        out.add(trimmed);
                    }
                }
            }
        }
        return out;
    }

    private void writeComment(String tenantId, String taskId, String processInstanceId,
                              String userId, String action, String comment, String targetUserId) {
        try {
            WfTaskComment record = new WfTaskComment();
            record.setId(UUID.randomUUID().toString().replace("-", ""));
            record.setTenantId(tenantId == null || tenantId.isBlank() ? "default" : tenantId);
            record.setTaskId(taskId);
            record.setProcessInstanceId(processInstanceId);
            record.setUserId(userId);
            record.setAction(action);
            record.setComment(comment);
            record.setTargetUserId(targetUserId);
            record.setCreatedAt(LocalDateTime.now());
            commentRepository.save(record);
        } catch (Exception e) {
            log.warn("写入自动意见失败 taskId={}: {}", taskId, e.getMessage());
        }
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
