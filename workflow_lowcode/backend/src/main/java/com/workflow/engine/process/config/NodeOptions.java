package com.workflow.engine.process.config;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 节点配置解析模型（对齐 NodeJS 端 process-compiler 的 extractTaskOptions/extractInitiatorOptions 语义）。
 *
 * <p>从 wf_node_config.config_json 解析 Task 61/65 引入的节点级配置块：
 * taskRole / approvalType / approval{type,expression,formUserField,external.resolver} /
 * assigneeOptions / returnOptions / commentRequired / blockRecall / dedup / signature /
 * notify / initiator / timeout。
 *
 * <p>解析口径（与 NodeJS 一致）：仅显式给出的合法值覆盖；缺失或非法值一律保持 null，
 * 运行时按缺省语义处理（旧数据零行为变化）。 Boolean 字段用三态（null/true/false），
 * 其中 reInitiate 的语义是「显式 false 才拦截」。
 */
public class NodeOptions {

    public static final Set<String> TASK_ROLES = Set.of("approver", "handler", "initiator");
    public static final Set<String> APPROVAL_TYPES = Set.of("artificial", "auto_pass", "auto_reject");
    public static final Set<String> NO_ASSIGNEE_POLICIES =
            Set.of("", "auto_pass", "block", "to_admin", "to_user", "skip", "supervisor");
    public static final Set<String> TIMEOUT_ACTIONS = Set.of("remind", "escalate", "transfer", "pass", "refuse");
    public static final Set<String> URGE_UNITS = Set.of("minute", "hour", "day");

    /** 节点类别（config.taskRole；发起节点由 isInitiator 表达，不经此字段）。 */
    private String taskRole;
    /** 审批类型：artificial / auto_pass / auto_reject（审批节点）。 */
    private String approvalType;
    /** approval.type 原文（user / initiator_self / initiator_select / role / expression / ...）。 */
    private String approvalTypeRaw;
    /** approval.expression（type=expression 时的审批人来源）。 */
    private String approvalExpression;
    /** approval.userIds。 */
    private List<String> userIds;
    /** approval.roleCodes（type=role 时逐个查成员）。 */
    private List<String> roleCodes;
    /** approval.multiMode。 */
    private String multiMode;
    /** approval.formUserField（type=form_user 时从流程变量取该表单字段解析用户）。 */
    private String formUserField;
    /** approval.external.resolver（type=external 时业务系统注册的选人函数名）。 */
    private String externalResolver;
    /** approval.external.params（选人函数参数值表；运行时经 resolve(ctx, params) 第二参传入）。 */
    private Map<String, Object> externalParams;

    // ---- assigneeOptions ----
    private Boolean allowInitiatorAdjust;
    /** 找不到办理人策略：'' / auto_pass / block / to_admin / to_user / skip / supervisor。 */
    private String noAssigneePolicy;
    /** to_user 策略的目标用户。 */
    private String toUserId;

    // ---- returnOptions ----
    private Boolean restartFromHere;
    private Boolean chooseStartNode;
    /** 必须加签后才能通过。 */
    private Boolean mustAddSign;

    // ---- 标量开关 ----
    private Boolean commentRequired;
    private Boolean blockRecall;
    private Boolean dedupEnabled;
    private Boolean skipSameAsInitiator;
    private Boolean signatureEnabled;
    private Boolean signatureUseLast;
    private Boolean signatureAllowUpload;
    private Boolean signatureRequired;
    private Boolean notifySms;

    // ---- initiator（发起节点专用）----
    private Boolean disallowRecall;
    private Boolean urgeEnabled;
    private Integer urgeInterval;
    private String urgeUnit;
    /** 再次发起（三态：显式 false 拦截，null/true 放行）。 */
    private Boolean reInitiate;
    private Boolean smsOnEnd;

    // ---- timeout ----
    private Boolean timeoutEnabled;
    /** 超时阈值（小时）。 */
    private Integer timeoutDuration;
    private String timeoutAction;

    public static NodeOptions parse(JsonNode root) {
        if (root == null || !root.isObject()) {
            return null;
        }
        NodeOptions o = new NodeOptions();

        JsonNode tr = root.get("taskRole");
        if (tr != null && tr.isTextual()) {
            String v = tr.asText().trim();
            o.taskRole = TASK_ROLES.contains(v) ? v : "approver";
        }

        JsonNode at = root.get("approvalType");
        if (at != null && at.isTextual()) {
            String v = at.asText().trim();
            if (APPROVAL_TYPES.contains(v)) {
                o.approvalType = v;
            }
        }

        JsonNode ap = root.get("approval");
        if (ap != null && ap.isObject()) {
            JsonNode type = ap.get("type");
            if (type != null && type.isTextual() && !type.asText().isBlank()) {
                o.approvalTypeRaw = type.asText().trim();
            }
            JsonNode expr = ap.get("expression");
            if (expr != null && expr.isTextual() && !expr.asText().isBlank()) {
                o.approvalExpression = expr.asText().trim();
            }
            o.userIds = stringList(ap.get("userIds"));
            o.roleCodes = stringList(ap.get("roleCodes"));
            JsonNode mm = ap.get("multiMode");
            if (mm != null && mm.isTextual()) {
                String v = mm.asText().trim();
                if (Set.of("single", "countersign", "or_sign", "sequential").contains(v)) {
                    o.multiMode = v;
                }
            }
            // 表单内用户字段名（type=form_user 时的审批人来源：流程变量中的表单字段）
            JsonNode fuf = ap.get("formUserField");
            if (fuf != null && fuf.isTextual() && !fuf.asText().isBlank()) {
                o.formUserField = fuf.asText().trim();
            }
            // 自定义选人函数注册名（type=external 时的审批人来源：进程内 AssigneeResolverRegistry）
            JsonNode ext = ap.get("external");
            if (ext != null && ext.isObject()) {
                JsonNode resolver = ext.get("resolver");
                if (resolver != null && resolver.isTextual() && !resolver.asText().isBlank()) {
                    o.externalResolver = resolver.asText().trim();
                }
                // 选人函数参数值表（仅保留原始类型值，对齐 NodeJS 宽松消毒口径）
                JsonNode params = ext.get("params");
                if (params != null && params.isObject()) {
                    Map<String, Object> map = new LinkedHashMap<>();
                    for (Iterator<Map.Entry<String, JsonNode>> it = params.fields(); it.hasNext(); ) {
                        Map.Entry<String, JsonNode> e = it.next();
                        JsonNode v = e.getValue();
                        if (v.isTextual()) {
                            map.put(e.getKey(), v.asText());
                        } else if (v.isBoolean()) {
                            map.put(e.getKey(), v.asBoolean());
                        } else if (v.isIntegralNumber()) {
                            map.put(e.getKey(), v.asLong());
                        } else if (v.isFloatingPointNumber()) {
                            map.put(e.getKey(), v.asDouble());
                        }
                    }
                    if (!map.isEmpty()) {
                        o.externalParams = map;
                    }
                }
            }
        }

        JsonNode ao = root.get("assigneeOptions");
        if (ao != null && ao.isObject()) {
            o.allowInitiatorAdjust = boolOrNull(ao.get("allowInitiatorAdjust"));
            JsonNode p = ao.get("noAssigneePolicy");
            if (p != null && p.isTextual()) {
                String v = p.asText().trim();
                if (NO_ASSIGNEE_POLICIES.contains(v)) {
                    o.noAssigneePolicy = v;
                }
            }
            JsonNode tu = ao.get("toUserId");
            if (tu != null && tu.isTextual() && !tu.asText().isBlank()) {
                o.toUserId = tu.asText().trim();
            }
        }

        JsonNode ro = root.get("returnOptions");
        if (ro != null && ro.isObject()) {
            o.restartFromHere = boolOrNull(ro.get("restartFromHere"));
            o.chooseStartNode = boolOrNull(ro.get("chooseStartNode"));
            o.mustAddSign = boolOrNull(ro.get("mustAddSign"));
        }

        o.commentRequired = boolOrNull(root.get("commentRequired"));
        o.blockRecall = boolOrNull(root.get("blockRecall"));

        JsonNode dd = root.get("dedup");
        if (dd != null && dd.isObject()) {
            o.dedupEnabled = boolOrNull(dd.get("enabled"));
            o.skipSameAsInitiator = boolOrNull(dd.get("skipSameAsInitiator"));
        }

        JsonNode sg = root.get("signature");
        if (sg != null && sg.isObject()) {
            o.signatureEnabled = boolOrNull(sg.get("enabled"));
            o.signatureUseLast = boolOrNull(sg.get("useLast"));
            o.signatureAllowUpload = boolOrNull(sg.get("allowUpload"));
            o.signatureRequired = boolOrNull(sg.get("required"));
        }

        JsonNode nt = root.get("notify");
        if (nt != null && nt.isObject()) {
            o.notifySms = boolOrNull(nt.get("sms"));
        }

        JsonNode it = root.get("initiator");
        if (it != null && it.isObject()) {
            o.disallowRecall = boolOrNull(it.get("disallowRecall"));
            JsonNode ug = it.get("urge");
            if (ug != null && ug.isObject()) {
                o.urgeEnabled = boolOrNull(ug.get("enabled"));
                JsonNode iv = ug.get("interval");
                if (iv != null && iv.isNumber() && iv.asDouble() > 0) {
                    o.urgeInterval = (int) Math.round(iv.asDouble());
                }
                JsonNode un = ug.get("unit");
                if (un != null && un.isTextual()) {
                    String v = un.asText().trim();
                    if (URGE_UNITS.contains(v)) {
                        o.urgeUnit = v;
                    }
                }
            }
            o.reInitiate = boolOrNull(it.get("reInitiate"));
            o.smsOnEnd = boolOrNull(it.get("smsOnEnd"));
        }

        JsonNode to = root.get("timeout");
        if (to != null && to.isObject()) {
            o.timeoutEnabled = boolOrNull(to.get("enabled"));
            JsonNode du = to.get("duration");
            if (du != null && du.isNumber() && du.asDouble() > 0) {
                o.timeoutDuration = (int) Math.round(du.asDouble());
            }
            JsonNode ac = to.get("action");
            if (ac != null && ac.isTextual()) {
                String v = ac.asText().trim();
                if (TIMEOUT_ACTIONS.contains(v)) {
                    o.timeoutAction = v;
                }
            }
        }

        return o;
    }

    private static List<String> stringList(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode e : node) {
                if (e.isTextual() || e.isNumber()) {
                    String v = e.asText();
                    if (v != null && !v.isBlank()) {
                        out.add(v.trim());
                    }
                }
            }
        }
        return out;
    }

    private static Boolean boolOrNull(JsonNode node) {
        if (node == null || node.isNull() || !node.isBoolean()) {
            return null;
        }
        return node.asBoolean();
    }

    public String getTaskRole() { return taskRole; }
    public String getApprovalType() { return approvalType; }
    public String getApprovalTypeRaw() { return approvalTypeRaw; }
    public String getApprovalExpression() { return approvalExpression; }
    public List<String> getUserIds() { return userIds; }
    public List<String> getRoleCodes() { return roleCodes; }
    public String getMultiMode() { return multiMode; }
    public String getFormUserField() { return formUserField; }
    public String getExternalResolver() { return externalResolver; }
    public Map<String, Object> getExternalParams() { return externalParams; }
    public Boolean getAllowInitiatorAdjust() { return allowInitiatorAdjust; }
    public String getNoAssigneePolicy() { return noAssigneePolicy; }
    public String getToUserId() { return toUserId; }
    public Boolean getRestartFromHere() { return restartFromHere; }
    public Boolean getChooseStartNode() { return chooseStartNode; }
    public Boolean getMustAddSign() { return mustAddSign; }
    public Boolean getCommentRequired() { return commentRequired; }
    public Boolean getBlockRecall() { return blockRecall; }
    public Boolean getDedupEnabled() { return dedupEnabled; }
    public Boolean getSkipSameAsInitiator() { return skipSameAsInitiator; }
    public Boolean getSignatureEnabled() { return signatureEnabled; }
    public Boolean getSignatureUseLast() { return signatureUseLast; }
    public Boolean getSignatureAllowUpload() { return signatureAllowUpload; }
    public Boolean getSignatureRequired() { return signatureRequired; }
    public Boolean getNotifySms() { return notifySms; }
    public Boolean getDisallowRecall() { return disallowRecall; }
    public Boolean getUrgeEnabled() { return urgeEnabled; }
    public Integer getUrgeInterval() { return urgeInterval; }
    public String getUrgeUnit() { return urgeUnit; }
    public Boolean getReInitiate() { return reInitiate; }
    public Boolean getSmsOnEnd() { return smsOnEnd; }
    public Boolean getTimeoutEnabled() { return timeoutEnabled; }
    public Integer getTimeoutDuration() { return timeoutDuration; }
    public String getTimeoutAction() { return timeoutAction; }
}
