package com.workflow.engine.task;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.process.entity.NodeConfig;
import com.workflow.engine.process.repository.NodeConfigRepository;
import org.flowable.bpmn.model.FlowElement;
import org.flowable.bpmn.model.FlowNode;
import org.flowable.engine.HistoryService;
import org.flowable.engine.delegate.DelegateExecution;
import org.flowable.engine.delegate.JavaDelegate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 多实例审批人列表设置 Listener。
 *
 * <p>在多实例 userTask 开始时执行，从 NodeConfig 的 approval 配置解析审批人 ID 列表，
 * 设置到流程变量 {@code approverList}，供 multiInstanceLoopCharacteristics.collection 使用。
 *
 * <p>Task 61 扩展（对齐 NodeJS 引擎 resolveAssignees）：
 * <ul>
 *   <li>类型化解析：userIds 优先，其次 initiator_self / initiator_select / role / expression /
 *       form_user 表单内用户 / external 业务系统注册选人函数</li>
 *   <li>去重：skipSameAsInitiator（过滤与发起人相同）、dedup.enabled（过滤本实例已办过的）</li>
 *   <li>找不到人策略：auto_pass/skip（列表留空 → MI 空集合自动跳过）、block（抛错拦截）、
 *       to_admin / to_user / supervisor（回填目标人）</li>
 * </ul>
 *
 * <p>需在 BPMN XML 中通过 flowable:executionListener 配置到多实例节点的 start 事件。
 */
@Component("multiInstanceApproverListener")
public class MultiInstanceApproverListener implements JavaDelegate {

    private static final Logger log = LoggerFactory.getLogger(MultiInstanceApproverListener.class);

    private static final Pattern EXPRESSION_PATTERN = Pattern.compile("\\$\\{([^{}]+)}");

    private final NodeConfigRepository nodeConfigRepository;
    private final RoleMembershipResolver roleMembershipResolver;
    private final HistoryService historyService;
    private final ObjectMapper objectMapper;
    /** Task 72：业务系统注册选人函数注册表（approval.type=external 时按名调用）。 */
    private final AssigneeResolverRegistry assigneeResolverRegistry;

    public MultiInstanceApproverListener(NodeConfigRepository nodeConfigRepository,
                                         RoleMembershipResolver roleMembershipResolver,
                                         HistoryService historyService,
                                         ObjectMapper objectMapper,
                                         AssigneeResolverRegistry assigneeResolverRegistry) {
        this.nodeConfigRepository = nodeConfigRepository;
        this.roleMembershipResolver = roleMembershipResolver;
        this.historyService = historyService;
        this.objectMapper = objectMapper;
        this.assigneeResolverRegistry = assigneeResolverRegistry;
    }

    @Override
    public void execute(DelegateExecution execution) {
        String processDefinitionId = execution.getProcessDefinitionId();
        String activityId = execution.getCurrentActivityId();

        // 精确匹配该部署版本的 NodeConfig 快照（部署时由当前配置复制生成）
        List<NodeConfig> configs = nodeConfigRepository.findByProcessDefinitionId(processDefinitionId);
        NodeConfig targetConfig = null;
        for (NodeConfig nc : configs) {
            if (activityId.equals(nc.getNodeId())) {
                targetConfig = nc;
                break;
            }
        }

        if (targetConfig == null) {
            log.warn("MultiInstanceApproverListener: 未找到 NodeConfig nodeId={} processDefinitionId={}",
                    activityId, processDefinitionId);
            return;
        }

        // 解析 approval 配置
        try {
            JsonNode root = objectMapper.readTree(targetConfig.getConfigJson());
            JsonNode approval = root.path("approval");
            JsonNode userIdsNode = approval.path("userIds");

            List<String> approverList = new ArrayList<>();
            if (userIdsNode.isArray()) {
                for (JsonNode idNode : userIdsNode) {
                    String id = idNode.asText();
                    if (id != null && !id.isBlank()) {
                        approverList.add(id.trim());
                    }
                }
            }

            // 类型化解析（userIds 为空时按 approval.type 解析）
            if (approverList.isEmpty()) {
                approverList.addAll(resolveTyped(approval, execution, activityId));
            }

            // 去重过滤
            String initiator = stringVariable(execution, "initiator");
            boolean filtered = false;
            if (!approverList.isEmpty() && boolAt(root.path("dedup"), "skipSameAsInitiator")
                    && initiator != null) {
                filtered |= approverList.removeIf(u -> u.equals(initiator));
            }
            if (!approverList.isEmpty() && boolAt(root.path("dedup"), "enabled")) {
                filtered |= approverList.removeIf(u -> alreadyCompleted(execution.getProcessInstanceId(), u));
            }
            // 去重导致的全过滤 → 留空列表（MI 空集合自动跳过 = 自动通过语义）
            if (filtered && approverList.isEmpty()) {
                log.info("MultiInstanceApproverListener: 去重后列表为空，节点跳过 nodeId={}", activityId);
                execution.setVariable("approverList", approverList);
                ensureRejectedVariable(execution);
                return;
            }

            // 找不到人策略
            if (approverList.isEmpty()) {
                String policy = textAt(root.path("assigneeOptions"), "noAssigneePolicy");
                approverList.addAll(applyNoAssigneePolicy(policy, root, execution, activityId));
            }

            if (approverList.isEmpty()) {
                log.warn("MultiInstanceApproverListener: 审批人列表为空 nodeId={}", activityId);
            }

            execution.setVariable("approverList", approverList);
            // 初始化 rejected=false，确保 completionCondition 表达式 ${rejected || ...} 不会因变量不存在而报错
            ensureRejectedVariable(execution);
            log.info("MultiInstanceApproverListener: 设置 approverList={} nodeId={}", approverList, activityId);

        } catch (Exception e) {
            log.error("MultiInstanceApproverListener: 解析 NodeConfig 失败 nodeId={}", activityId, e);
        }
    }

    private void ensureRejectedVariable(DelegateExecution execution) {
        if (!execution.hasVariable("rejected")) {
            execution.setVariable("rejected", false);
        }
    }

    /**
     * 找不到办理人策略（对齐 NodeJS noAssigneePolicy）。返回回填后的列表（可为空）。
     * block 策略抛出异常使流程启动/推进失败。
     */
    private List<String> applyNoAssigneePolicy(String policy, JsonNode root,
                                               DelegateExecution execution, String activityId) {
        String p = policy == null ? "" : policy;
        switch (p) {
            case "auto_pass", "skip" -> {
                // 留空列表：MI 空集合不产生实例，活动立即完成（= 自动通过/跳过语义）
                return List.of();
            }
            case "block" -> throw new IllegalStateException(
                    "节点「" + activityId + "」找不到办理人/审批人，已按配置禁止提交流程");
            case "to_admin" -> {
                String admin = roleMembershipResolver.findAdminUserId();
                return admin == null ? List.of() : List.of(admin);
            }
            case "to_user" -> {
                String toUser = textAt(root.path("assigneeOptions"), "toUserId");
                return toUser == null || toUser.isBlank() ? List.of() : List.of(toUser);
            }
            case "supervisor" -> {
                // v1 组织表无负责人字段：降级为空（与 NodeJS supervisor 策略降级一致）
                return List.of();
            }
            default -> {
                // 空/未配置 → 留空（候选人任务兼容旧语义；MI 空集合则跳过）
                return List.of();
            }
        }
    }

    /**
     * 类型化解析（approval.type）：
     * initiator_self → 发起人变量；initiator_select → 变量 assignee_&lt;nodeId&gt;；
     * role → roleCodes 并集；expression → 表达式求值；
     * form_user → 流程变量中 approval.formUserField 字段值；
     * external → 按 approval.external.resolver 查注册表调用选人；
     * 其余类型返回空（走策略）。
     */
    private List<String> resolveTyped(JsonNode approval, DelegateExecution execution, String activityId) {
        String type = textAt(approval, "type");
        if (type == null) {
            return List.of();
        }
        switch (type) {
            case "initiator_self" -> {
                String initiator = stringVariable(execution, "initiator");
                return initiator == null ? List.of() : List.of(initiator);
            }
            case "initiator_select" -> {
                return normalizeUserList(execution.getVariable("assignee_" + activityId));
            }
            case "role" -> {
                List<String> codes = new ArrayList<>();
                JsonNode roleCodes = approval.path("roleCodes");
                if (roleCodes.isArray()) {
                    for (JsonNode c : roleCodes) {
                        if (c.isTextual() && !c.asText().isBlank()) {
                            codes.add(c.asText().trim());
                        }
                    }
                }
                return roleMembershipResolver.membersOfRoles(codes);
            }
            case "expression" -> {
                return resolveExpression(textAt(approval, "expression"), execution);
            }
            case "form_user" -> {
                // 表单内用户：从流程变量取 approval.formUserField 字段值解析（单个/逗号分隔/数组均可）
                String field = textAt(approval, "formUserField");
                if (field == null || field.isBlank()) {
                    return List.of();
                }
                return normalizeUserList(execution.getVariable(field));
            }
            case "external" -> {
                // 业务系统注册选人函数：按 approval.external.resolver 查进程内注册表并调用
                // （节点配置的参数值表 approval.external.params 作为第二参传入，同一函数可按参数复用）
                String name = textAt(approval.path("external"), "resolver");
                if (name != null && !name.isBlank() && assigneeResolverRegistry != null) {
                    var resolver = assigneeResolverRegistry.find(name);
                    if (resolver.isPresent()) {
                        try {
                            return normalizeUserList(
                                    resolver.get().resolve(buildResolveContext(execution, activityId),
                                            primitiveParams(approval.path("external").path("params"))));
                        } catch (Exception e) {
                            // 选人函数抛错：视为本次解析不出，落到变量兜底
                        }
                    }
                }
                // 变量兜底（对齐 NodeJS）：外部系统集成通道（assignee_ext_<nodeId>）
                return normalizeUserList(execution.getVariable("assignee_ext_" + activityId));
            }
            default -> {
                return List.of();
            }
        }
    }

    /**
     * 审批人表达式求值（v1 保守子集，对齐 NodeJS resolveExpression）。
     */
    private List<String> resolveExpression(String raw, DelegateExecution execution) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        String text = raw.trim();
        Matcher matcher = EXPRESSION_PATTERN.matcher(text);
        if (!matcher.find()) {
            return normalizeUserList(execution.getVariable(text));
        }
        matcher.reset();
        Set<String> out = new LinkedHashSet<>();
        while (matcher.find()) {
            String name = matcher.group(1).trim();
            if (name.isEmpty()) {
                continue;
            }
            if ("initiator".equals(name)) {
                String initiator = stringVariable(execution, "initiator");
                if (initiator != null) {
                    out.add(initiator);
                }
                continue;
            }
            if ("initiator.deptManager".equals(name)) {
                continue; // v1 无组织负责人字段
            }
            out.addAll(normalizeUserList(execution.getVariable(name)));
        }
        return new ArrayList<>(out);
    }

    /**
     * 组装 external 选人函数上下文（对齐 NodeJS AssigneeResolveContext）：
     * variables 取执行级全部变量快照（读取失败按空集合，不因快照失败中断选人调用）；
     * nodeName 取 BPMN 节点名，读取失败回退节点 ID。
     */
    private AssigneeResolveContext buildResolveContext(DelegateExecution execution, String activityId) {
        Map<String, Object> variables;
        try {
            variables = execution.getVariables();
        } catch (Exception e) {
            variables = Map.of();
        }
        String nodeName = activityId;
        try {
            FlowElement element = execution.getCurrentFlowElement();
            if (element instanceof FlowNode node && node.getName() != null && !node.getName().isBlank()) {
                nodeName = node.getName().trim();
            }
        } catch (Exception ignored) {
            // 节点名读取失败回退节点 ID
        }
        return new AssigneeResolveContext(activityId, nodeName,
                stringVariable(execution, "initiator"), variables);
    }

    /**
     * external.params JSON → 参数值表（仅保留原始类型值，对齐 NodeJS 宽松消毒口径）。
     */
    private Map<String, Object> primitiveParams(JsonNode params) {
        if (params == null || !params.isObject()) {
            return Map.of();
        }
        Map<String, Object> out = new java.util.LinkedHashMap<>();
        for (java.util.Iterator<Map.Entry<String, JsonNode>> it = params.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            JsonNode v = e.getValue();
            if (v.isTextual()) {
                out.put(e.getKey(), v.asText());
            } else if (v.isBoolean()) {
                out.put(e.getKey(), v.asBoolean());
            } else if (v.isIntegralNumber()) {
                out.put(e.getKey(), v.asLong());
            } else if (v.isFloatingPointNumber()) {
                out.put(e.getKey(), v.asDouble());
            }
        }
        return out;
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

    private String stringVariable(DelegateExecution execution, String name) {
        Object raw = execution.getVariable(name);
        if (raw == null) {
            return null;
        }
        String s = String.valueOf(raw);
        return s.isBlank() ? null : s;
    }

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

    private String textAt(JsonNode node, String field) {
        JsonNode v = node.get(field);
        if (v == null || !v.isTextual() || v.asText().isBlank()) {
            return null;
        }
        return v.asText().trim();
    }

    private boolean boolAt(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && v.isBoolean() && v.asBoolean();
    }
}
