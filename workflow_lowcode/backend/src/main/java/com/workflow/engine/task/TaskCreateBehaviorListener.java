package com.workflow.engine.task;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.history.entity.WfTaskComment;
import com.workflow.engine.history.repository.WfTaskCommentRepository;
import com.workflow.engine.process.bpmn.InitiatorNodeResolver;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.config.NodeOptions;
import com.workflow.engine.process.config.NodeOptionsService;
import com.workflow.engine.process.config.ProcessPolicy;
import com.workflow.engine.process.repository.NodeConfigRepository;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.FlowElement;
import org.flowable.bpmn.model.FlowNode;
import org.flowable.bpmn.model.SequenceFlow;
import org.flowable.bpmn.model.UserTask;
import org.flowable.engine.RepositoryService;
import org.flowable.engine.RuntimeService;
import org.flowable.engine.TaskService;
import org.flowable.engine.delegate.TaskListener;
import org.flowable.identitylink.api.IdentityLink;
import org.flowable.task.service.delegate.DelegateTask;
import org.flowable.task.api.history.HistoricTaskInstance;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
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
 *   <li>notify.sms=true → 写 SMS_NODE 通知记录（Task 69：流程级短信摘要开启时附【摘要】）</li>
 *   <li>approvalType=auto_pass / auto_reject → 自动通过 / 自动拒绝（终止实例）</li>
 *   <li>Task 69 退回免审（retakeSkipApproved）：__retakeApprovedNodes 命中 → 自动通过（「已审批，自动通过（退回重审免审）」）</li>
 *   <li>去重（节点显式配置优先 / 流程级默认；Task 69 三口径 CONSECUTIVE/FIRST/LAST）→ 过滤后为空自动通过</li>
 *   <li>未分配任务 → 类型化解析（initiator_self / initiator_select / role / expression /
 *       form_user 表单内用户 / external 业务系统注册选人函数）</li>
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

    /** __retakeApprovedNodes 的 JSON 字符串形态兼容解析用（RejectService 写 List，跨端为 JSON 数组）。 */
    private static final ObjectMapper JSON_MAPPER = new ObjectMapper();

    private final NodeOptionsService nodeOptionsService;
    private final RoleMembershipResolver roleMembershipResolver;
    private final EngineNotifyService engineNotifyService;
    private final TaskService flowableTaskService;
    private final RuntimeService runtimeService;
    private final org.flowable.engine.HistoryService historyService;
    private final WfTaskCommentRepository commentRepository;
    /** Task 69：读取 __PROCESS__ 流程级策略。 */
    private final NodeConfigRepository nodeConfigRepository;
    /** Task 69：发起节点判定（发起节点不参与去重/退回免审，对齐 NodeJS isInitiator 先行返回）。 */
    private final InitiatorNodeResolver initiatorNodeResolver;
    /** Task 69：LAST 去重的静态后续节点图遍历（BPMN 连线真源）。 */
    private final RepositoryService repositoryService;
    /** Task 72：业务系统注册选人函数注册表（approval.type=external 时按名调用）。 */
    private final AssigneeResolverRegistry assigneeResolverRegistry;

    public TaskCreateBehaviorListener(NodeOptionsService nodeOptionsService,
                                      RoleMembershipResolver roleMembershipResolver,
                                      EngineNotifyService engineNotifyService,
                                      TaskService flowableTaskService,
                                      RuntimeService runtimeService,
                                      org.flowable.engine.HistoryService historyService,
                                      WfTaskCommentRepository commentRepository,
                                      NodeConfigRepository nodeConfigRepository,
                                      InitiatorNodeResolver initiatorNodeResolver,
                                      RepositoryService repositoryService,
                                      AssigneeResolverRegistry assigneeResolverRegistry) {
        this.nodeOptionsService = nodeOptionsService;
        this.roleMembershipResolver = roleMembershipResolver;
        this.engineNotifyService = engineNotifyService;
        this.flowableTaskService = flowableTaskService;
        this.runtimeService = runtimeService;
        this.historyService = historyService;
        this.commentRepository = commentRepository;
        this.nodeConfigRepository = nodeConfigRepository;
        this.initiatorNodeResolver = initiatorNodeResolver;
        this.repositoryService = repositoryService;
        this.assigneeResolverRegistry = assigneeResolverRegistry;
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
        // Task 69：流程级策略（__PROCESS__ config_json；节点无配置块也参与合并口径）
        ProcessPolicy policy = loadProcessPolicy(processDefinitionId);

        // ⚠️ 发起节点不参与退回免审/去重/同人跳过（对齐 NodeJS handleUserTask：
        //    isInitiator 分支先行返回，start 时自动完成、驳回后建待办等重新提交）
        boolean initiatorNode;
        try {
            initiatorNode = nodeId.equals(initiatorNodeResolver.resolve(processDefinitionId));
        } catch (Exception e) {
            initiatorNode = false;
        }

        // ① 节点「发送短信给办理人」→ 通知记录（流程级短信摘要开启时附【摘要】）
        if (opts != null && Boolean.TRUE.equals(opts.getNotifySms())) {
            engineNotifyService.writeSmsNodeContent(tenantId, processInstanceId, task.getId(),
                    task.getAssignee(), buildSmsNodeContent(task, policy));
        }

        // ② 审批类型：自动通过 / 自动拒绝
        if (opts != null && "auto_pass".equals(opts.getApprovalType())) {
            writeComment(tenantId, task.getId(), processInstanceId, "system", "approve", "自动通过", null);
            completeQuietly(task.getId());
            return;
        }
        if (opts != null && "auto_reject".equals(opts.getApprovalType())) {
            writeComment(tenantId, task.getId(), processInstanceId, "system", "refuse", "自动拒绝", null);
            runtimeService.deleteProcessInstance(processInstanceId, "自动拒绝");
            return;
        }

        // ②' 退回免审（retakeSkipApproved）：__retakeApprovedNodes 命中当前节点 →
        //    自动通过（意见「已审批，自动通过（退回重审免审）」）并从集合移除该节点
        if (!initiatorNode && consumeRetakeSkip(task, tenantId, processInstanceId, nodeId, policy)) {
            return;
        }

        String initiator = stringVariable(processInstanceId, "initiator");
        // 召回重走忽略去重/同人跳过（NodeJS EngineProcessPolicy.skipDedupForRecall 的等价实现）：
        // 召回者需重新审批自己，若不去重会被 auto-pass 掉；⚠️ 一次性标记，消费即清除
        boolean skipDedupForRecall = !initiatorNode && consumeRecallSkipFlag(task);

        // ③ 过滤开关合并（对齐 NodeJS handleUserTask ③）：节点显式配置优先，否则落流程级默认
        boolean nodeDedupConfigured = opts != null && opts.getDedupEnabled() != null;
        boolean dedupActive = !initiatorNode && !skipDedupForRecall && (nodeDedupConfigured
                ? Boolean.TRUE.equals(opts.getDedupEnabled())
                : policy.isDedupEnabled());
        boolean nodeSkipConfigured = opts != null && opts.getSkipSameAsInitiator() != null;
        boolean skipSameAsInitiator = !initiatorNode && !skipDedupForRecall && (nodeSkipConfigured
                ? Boolean.TRUE.equals(opts.getSkipSameAsInitiator())
                : policy.isDedupSkipSameAsInitiator());
        String dedupMode = policy.getDedupMode() == null ? "FIRST" : policy.getDedupMode();

        boolean unassigned = isBlank(task.getAssignee()) && candidateUsers(task).isEmpty();

        if (!unassigned) {
            // ③a 静态分配（部署期改写器写入）的去重兜底
            if (skipSameAsInitiator
                    && task.getAssignee() != null && task.getAssignee().equals(initiator)) {
                autoApproveFiltered(tenantId, task, processInstanceId);
                return;
            }
            if (dedupActive && task.getAssignee() != null
                    && dedupHits(processDefinitionId, nodeId, processInstanceId,
                        task.getAssignee(), dedupMode)) {
                autoApproveFiltered(tenantId, task, processInstanceId);
                return;
            }
            return; // 正常人工任务
        }

        if (opts == null) {
            // 旧数据无节点配置块：无类型化解析依据 → 保持候选人任务兜底（既有行为）
            return;
        }

        // ④ 类型化解析（未分配任务）
        List<String> resolved = new ArrayList<>(resolveTyped(opts, task, initiator));
        boolean filtered = false;
        if (!resolved.isEmpty() && skipSameAsInitiator && initiator != null) {
            filtered |= resolved.removeIf(u -> u.equals(initiator));
        }
        if (!resolved.isEmpty() && dedupActive) {
            if ("LAST".equals(dedupMode)) {
                // 全流程仅最后需一次审批：已办过且后续静态可见节点还会出现 → 本次跳过；
                // 后续不可静态判定（role/expression 动态解析）时保守不跳
                filtered |= resolved.removeIf(u -> alreadyCompleted(processInstanceId, u)
                        && assigneeAppearsLater(processDefinitionId, nodeId, u));
            } else if ("CONSECUTIVE".equals(dedupMode)) {
                // 连续去重：仅与最近一个已完成任务的 assignee 比较
                String last = lastCompletedAssignee(processInstanceId);
                if (last != null) {
                    filtered |= resolved.removeIf(u -> u.equals(last));
                }
            } else {
                // FIRST（缺省）：实例内已完成 assignee 集合
                filtered |= resolved.removeIf(u -> alreadyCompleted(processInstanceId, u));
            }
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

    // ------------------------------------------------------------ Task 69 流程级策略辅助

    /** 流程级策略读取（__PROCESS__ config_json；未配置/失败返回全关默认）。 */
    private ProcessPolicy loadProcessPolicy(String processDefinitionId) {
        try {
            for (NodeConfig nc : nodeConfigRepository.findByProcessDefinitionId(processDefinitionId)) {
                if (ProcessPolicy.PROCESS_LEVEL_NODE_ID.equals(nc.getNodeId())) {
                    return ProcessPolicy.parseProcessPolicy(nc.getConfigJson());
                }
            }
            return ProcessPolicy.parseProcessPolicy(null);
        } catch (Exception e) {
            log.warn("读取流程级策略失败 defId={}: {}", processDefinitionId, e.getMessage());
            return ProcessPolicy.parseProcessPolicy(null);
        }
    }

    /**
     * 退回免审（retakeSkipApproved）消费（对齐 NodeJS handleUserTask ①'）：
     * {@code __retakeApprovedNodes} 命中当前节点 → 写意见「已审批，自动通过（退回重审免审）」
     * 并自动完成该任务，同时把节点从集合移除（同一节点再次被退回时可重新收集）。
     */
    private boolean consumeRetakeSkip(DelegateTask task, String tenantId, String processInstanceId,
                                      String nodeId, ProcessPolicy policy) {
        if (!policy.isRetakeSkipApproved()) {
            return false;
        }
        List<String> nodes =
                normalizeNodeIdList(task.getVariable(WorkflowTaskService.VAR_RETAKE_APPROVED_NODES));
        if (!nodes.remove(nodeId)) {
            return false;
        }
        task.setVariable(WorkflowTaskService.VAR_RETAKE_APPROVED_NODES, new ArrayList<>(nodes));
        writeComment(tenantId, task.getId(), processInstanceId, "system", "approve",
                "已审批，自动通过（退回重审免审）", null);
        completeQuietly(task.getId());
        return true;
    }

    /**
     * 召回重走免重去重标记消费（对齐 NodeJS EngineProcessPolicy.skipDedupForRecall）。
     * ⚠️ NodeJS 的 skipDedupForRecall 是请求级参数；Java 只能落在实例变量上，
     * 消费即清除，避免污染同实例后续节点的去重口径。
     */
    private boolean consumeRecallSkipFlag(DelegateTask task) {
        Object flag = task.getVariable(WorkflowTaskService.RETAKE_SKIP_DEDUP_VAR);
        if (Boolean.TRUE.equals(flag) || "true".equals(String.valueOf(flag))) {
            task.setVariable(WorkflowTaskService.RETAKE_SKIP_DEDUP_VAR, Boolean.FALSE);
            return true;
        }
        return false;
    }

    /** {@code __retakeApprovedNodes} 兼容读取：List 直取；JSON 字符串形态解析。 */
    private List<String> normalizeNodeIdList(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw == null) {
            return out;
        }
        if (raw instanceof java.util.Collection<?> collection) {
            for (Object item : collection) {
                if (item != null) {
                    out.add(String.valueOf(item));
                }
            }
            return out;
        }
        String text = String.valueOf(raw).trim();
        if (!text.startsWith("[")) {
            return out;
        }
        try {
            JsonNode arr = JSON_MAPPER.readTree(text);
            if (arr.isArray()) {
                for (JsonNode element : arr) {
                    if (element.isTextual() || element.isNumber()) {
                        out.add(element.asText());
                    }
                }
            }
        } catch (Exception ignored) {
            // 非法 JSON 按空集合处理
        }
        return out;
    }

    /** 静态分配路径的去重命中判定（CONSECUTIVE/FIRST/LAST 三口径）。 */
    private boolean dedupHits(String processDefinitionId, String nodeId,
                              String processInstanceId, String assignee, String mode) {
        String normalizedMode = mode == null ? "FIRST" : mode;
        if ("CONSECUTIVE".equals(normalizedMode)) {
            String last = lastCompletedAssignee(processInstanceId);
            return last != null && last.equals(assignee);
        }
        boolean done = alreadyCompleted(processInstanceId, assignee);
        if ("LAST".equals(normalizedMode)) {
            return done && assigneeAppearsLater(processDefinitionId, nodeId, assignee);
        }
        return done;
    }

    /**
     * 最近一个已完成任务的办理人（CONSECUTIVE 连续去重用；对齐 NodeJS lastCompletedAssignee）：
     * 仅看最后一个完成任务的 assignee——「连续出现同一审批人」只需与上一步比较。
     * ⚠️ 排除 deleteReason 非空的记录（被驳回/撤回撤销的任务不算已办理）。
     */
    private String lastCompletedAssignee(String processInstanceId) {
        try {
            List<HistoricTaskInstance> finished = historyService.createHistoricTaskInstanceQuery()
                    .processInstanceId(processInstanceId)
                    .finished()
                    .orderByHistoricTaskInstanceEndTime()
                    .desc()
                    .listPage(0, 10);
            for (HistoricTaskInstance t : finished) {
                if (t.getDeleteReason() != null) {
                    continue;
                }
                if (t.getAssignee() != null && !t.getAssignee().isBlank()) {
                    return t.getAssignee();
                }
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * 该审批人在后续路径的静态可见节点中是否还会出现（LAST 去重用）。
     * 仅检查 approval.userIds 静态列表（与 NodeJS assigneeAppearsLater 同口径——
     * NodeJS 查编译模型 approval.userIds，Java 侧对应 NodeConfig approval.userIds，
     * 图结构走 BPMN 连线真源）；role/expression 等动态解析返回 false（保守不跳）。
     */
    private boolean assigneeAppearsLater(String processDefinitionId, String fromNodeId, String user) {
        try {
            BpmnModel model = repositoryService.getBpmnModel(processDefinitionId);
            if (model == null || model.getProcesses().isEmpty()) {
                return false;
            }
            for (org.flowable.bpmn.model.Process process : model.getProcesses()) {
                FlowElement start = process.getFlowElement(fromNodeId);
                if (!(start instanceof FlowNode fromNode)) {
                    continue;
                }
                Set<String> visited = new HashSet<>();
                Deque<String> queue = new ArrayDeque<>();
                List<SequenceFlow> outgoing = fromNode.getOutgoingFlows();
                if (outgoing != null) {
                    for (SequenceFlow flow : outgoing) {
                        if (flow.getTargetRef() != null) {
                            queue.add(flow.getTargetRef());
                        }
                    }
                }
                while (!queue.isEmpty()) {
                    String id = queue.poll();
                    if (id == null || !visited.add(id)) {
                        continue;
                    }
                    FlowElement element = process.getFlowElement(id);
                    if (element instanceof UserTask) {
                        NodeOptions next = nodeOptionsService.find(processDefinitionId, id).orElse(null);
                        if (next != null && next.getUserIds() != null && next.getUserIds().contains(user)) {
                            return true;
                        }
                    }
                    if (element instanceof FlowNode flowNode && flowNode.getOutgoingFlows() != null) {
                        for (SequenceFlow flow : flowNode.getOutgoingFlows()) {
                            if (flow.getTargetRef() != null) {
                                queue.add(flow.getTargetRef());
                            }
                        }
                    }
                }
            }
            return false;
        } catch (Exception e) {
            // 静态判定失败 → 保守不跳（与 NodeJS 保守语义一致）
            return false;
        }
    }

    /**
     * SMS_NODE 文案：节点名 + 流程级摘要后缀（summaryShowInSms=true 时尾部附【摘要】，
     * 对齐 NodeJS 的 SMS_NODE 文案拼接）。
     * ⚠️ __instanceSummary 变量在 startProcessInstanceByKey 之后才由 ProcessInstanceService
     * 写入——启动即创建的任务读不到该变量，此时按当前变量现算摘要兜底。
     */
    private String buildSmsNodeContent(DelegateTask task, ProcessPolicy policy) {
        String label = task.getName() == null || task.getName().isBlank()
                ? task.getTaskDefinitionKey() : task.getName();
        String content = "您有新的办理任务：" + label;
        if (policy.isSummaryShowInSms() && !policy.getSummaryFields().isEmpty()) {
            Object summary = task.getVariable("__instanceSummary");
            String text = summary == null ? "" : String.valueOf(summary).trim();
            if (text.isEmpty()) {
                text = ProcessPolicy.renderSummary(policy.getSummaryFields(), task.getVariables());
            }
            if (!text.isBlank()) {
                content += "【" + text + "】";
            }
        }
        return content;
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
            case "form_user" -> {
                // 表单内用户：从流程变量取 approval.formUserField 字段值解析（单个/逗号分隔/数组均可）
                String field = opts.getFormUserField() == null ? "" : opts.getFormUserField().trim();
                if (field.isEmpty()) {
                    return List.of();
                }
                return normalizeUserList(variable(processInstanceId, field));
            }
            case "external" -> {
                // 业务系统注册选人函数：按 approval.external.resolver 查进程内注册表并调用
                // （节点配置的参数值表 approval.external.params 作为第二参传入，同一函数可按参数复用）
                String name = opts.getExternalResolver() == null ? "" : opts.getExternalResolver().trim();
                if (!name.isEmpty() && assigneeResolverRegistry != null) {
                    var resolver = assigneeResolverRegistry.find(name);
                    if (resolver.isPresent()) {
                        try {
                            Map<String, Object> extParams =
                                    opts.getExternalParams() == null ? Map.of() : opts.getExternalParams();
                            return normalizeUserList(
                                    resolver.get().resolve(buildResolveContext(task, initiator), extParams));
                        } catch (Exception e) {
                            // 选人函数抛错：视为本次解析不出，落到变量兑底
                        }
                    }
                }
                // 变量兑底（对齐 NodeJS）：外部系统集成通道（发起前/服务层预置 assignee_ext_<nodeId>）
                return normalizeUserList(
                        variable(processInstanceId, "assignee_ext_" + task.getTaskDefinitionKey()));
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

    /**
     * 组装 external 选人函数上下文（对齐 NodeJS AssigneeResolveContext）：
     * variables 取实例全部变量快照（读取失败按空集合，不因快照失败中断选人调用）；
     * nodeName 取任务名，缺省回退节点 ID。
     */
    private AssigneeResolveContext buildResolveContext(DelegateTask task, String initiator) {
        Map<String, Object> variables;
        try {
            variables = runtimeService.getVariables(task.getProcessInstanceId());
        } catch (Exception e) {
            variables = Map.of();
        }
        String label = task.getName() == null || task.getName().isBlank()
                ? task.getTaskDefinitionKey() : task.getName();
        return new AssigneeResolveContext(task.getTaskDefinitionKey(), label, initiator, variables);
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
