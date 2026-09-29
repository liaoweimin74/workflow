package com.workflow.engine.process.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 流程级策略（对齐 NodeJS 端 process/compiler/process-policy.ts 的 parseProcessPolicy）。
 *
 * <p>读的是 {@code wf_node_config} 中 {@code nodeId='__PROCESS__'} 行的 config_json：
 * <ul>
 *   <li>{@code approvalPolicy} 子树：deduplication / commentPolicy / signaturePolicy /
 *       comment / approveRecall / retakeSkipApproved</li>
 *   <li>顶层：timeoutRules / titleRule / summaryRule</li>
 * </ul>
 *
 * <p>解析口径（与 NodeJS 一致）：<strong>宽松解析、缺省全关</strong>——
 * 配置缺失或 JSON 非法时返回全关默认策略（不改变既有行为）；
 * Boolean 采用 strictTrue 口径（<strong>仅 JSON true 为真</strong>，字符串 "true"/1 都不算），
 * 与 operations 的宽松 asBoolean() 口径刻意区分。
 *
 * <p>⚠️ 独立成无依赖叶子类的理由（对齐 NodeJS process-policy.ts 独立文件的原因）：
 * WorkflowTaskService / TaskCreateBehaviorListener / TaskTimeoutScanner /
 * ProcessInstanceService 多方共用，解析逻辑只落一处，避免读取口径漂移。
 */
public class ProcessPolicy {

    /** 流程级总控配置的伪节点 ID（NodeJS {@code PROCESS_LEVEL_NODE_ID}）。 */
    public static final String PROCESS_LEVEL_NODE_ID = "__PROCESS__";

    private static final ObjectMapper JSON = new ObjectMapper();

    /** {{变量}} 模板占位符（\w + 中文字符，NodeJS 同款）。 */
    private static final Pattern TEMPLATE_PATTERN = Pattern.compile("\\{\\{\\s*([\\w\\u4e00-\\u9fa5]+)\\s*\\}\\}");

    // ---- 审批人去重（流程级；节点显式配置优先）----
    private boolean dedupEnabled;
    /** 命中口径：CONSECUTIVE（与上一步同人）/ FIRST（实例内已办过）/ LAST（后面还有节点时不跳）。 */
    private String dedupMode = "FIRST";
    private boolean dedupSkipSameAsInitiator;

    // ---- 审批处理意见必填 ----
    private boolean commentPolicyEnabled;
    /** REJECT_RETURN：拒绝/退回必填；ALL：全部操作必填。 */
    private String commentPolicyScope = "REJECT_RETURN";

    // ---- 手写签名（流程级默认值提供者；节点未显式配置时生效）----
    private boolean signatureEnabled;
    private boolean signatureUseLast;
    private boolean signatureAllowUpload;
    private boolean signatureRequired;

    // ---- 评论管理 ----
    private boolean commentDisabled;
    private boolean commentDisallowDelete;
    private boolean commentDisallowAttachment;

    /** 审批召回：审批人可在下个节点审批前召回自己已办的审批。 */
    private boolean approveRecall;
    /** 流程退回后重新审批时，已通过节点无需再审批（__retakeApprovedNodes）。 */
    private boolean retakeSkipApproved;

    /** 流程级超时规则组（节点未开启 timeout 时兜底）。 */
    private List<ProcessTimeoutRule> timeoutRules = new ArrayList<>();

    /** 可发起人员范围（start() 门禁）：ALL=不校验；SPECIFIED=发起人须命中用户/角色名单（管理员绕过）。 */
    private StarterScope starterScope = new StarterScope();

    /** 流程级审批管理员（用户 ID 列表）：超时转派/被提醒人优先取此名单，未配置回落全局 admin。 */
    private List<String> adminUserIds = new ArrayList<>();

    /** 自定义审批标题模板（titleRule.enabled && pattern 非空时非 null）。 */
    private String titlePattern;

    /** 自定义摘要字段（summaryRule.enabled 时非空；≤5 个）。 */
    private List<String> summaryFields = new ArrayList<>();
    private boolean summaryShowInSms;

    /** 流程级超时规则（对齐 NodeJS ProcessTimeoutRule / 设计器「添加超时规则」）。 */
    public static class ProcessTimeoutRule {
        private String id;
        /** remind / transfer / pass / refuse。 */
        private String action;
        private int duration;
        /** minute / hour / day。 */
        private String unit;
        /** 重复提醒（仅 remind；间隔 = duration）。 */
        private boolean repeat;
        /** 被提醒人：当前审批人（notifyAssignee 缺省 true，仅显式 false 关闭）。 */
        private boolean notifyAssignee = true;
        /** 被提醒人：审批管理员。 */
        private boolean notifyAdmin;
        /** 被提醒人：更多员工。 */
        private List<String> notifyUserIds = new ArrayList<>();
        /** 通知方式：短信（sms 缺省 true，仅显式 false 关闭）。 */
        private boolean sms = true;

        public String getId() { return id; }
        public String getAction() { return action; }
        public int getDuration() { return duration; }
        public String getUnit() { return unit; }
        public boolean isRepeat() { return repeat; }
        public boolean isNotifyAssignee() { return notifyAssignee; }
        public boolean isNotifyAdmin() { return notifyAdmin; }
        public List<String> getNotifyUserIds() { return notifyUserIds; }
        public boolean isSms() { return sms; }
    }

    /** 可发起人员范围（对齐 NodeJS starterScope；roleIds 为 sys_role.role_code）。 */
    public static class StarterScope {
        private String mode = "ALL";
        private List<String> userIds = new ArrayList<>();
        private List<String> roleIds = new ArrayList<>();

        public String getMode() { return mode; }
        public List<String> getUserIds() { return userIds; }
        public List<String> getRoleIds() { return roleIds; }
    }

    // ------------------------------------------------------------ 解析

    /**
     * 宽松解析 {@code __PROCESS__} config_json；configJson 为 null 或 JSON 非法时返回全关默认策略。
     */
    public static ProcessPolicy parseProcessPolicy(String configJson) {
        ProcessPolicy out = new ProcessPolicy();
        if (configJson == null || configJson.isBlank()) {
            return out;
        }
        JsonNode root;
        try {
            root = JSON.readTree(configJson);
        } catch (Exception e) {
            return out;
        }
        if (root == null || !root.isObject()) {
            return out;
        }

        JsonNode policy = root.get("approvalPolicy");
        if (policy != null && policy.isObject()) {
            JsonNode dedup = policy.get("deduplication");
            if (dedup != null && dedup.isObject()) {
                out.dedupEnabled = strictTrue(dedup.get("enabled"));
                JsonNode mode = dedup.get("mode");
                if (mode != null && mode.isTextual()) {
                    String v = mode.asText().trim();
                    if ("CONSECUTIVE".equals(v) || "FIRST".equals(v) || "LAST".equals(v)) {
                        out.dedupMode = v;
                    }
                }
                out.dedupSkipSameAsInitiator = strictTrue(dedup.get("skipSameAsInitiator"));
            }

            JsonNode commentPolicy = policy.get("commentPolicy");
            if (commentPolicy != null && commentPolicy.isObject()) {
                out.commentPolicyEnabled = strictTrue(commentPolicy.get("enabled"));
                JsonNode scope = commentPolicy.get("scope");
                if (scope != null && scope.isTextual()) {
                    String v = scope.asText().trim();
                    if ("REJECT_RETURN".equals(v) || "ALL".equals(v)) {
                        out.commentPolicyScope = v;
                    }
                }
            }

            JsonNode signaturePolicy = policy.get("signaturePolicy");
            if (signaturePolicy != null && signaturePolicy.isObject()) {
                out.signatureEnabled = strictTrue(signaturePolicy.get("enabled"));
                out.signatureUseLast = strictTrue(signaturePolicy.get("useLast"));
                out.signatureAllowUpload = strictTrue(signaturePolicy.get("allowUpload"));
                out.signatureRequired = strictTrue(signaturePolicy.get("required"));
            }

            JsonNode comment = policy.get("comment");
            if (comment != null && comment.isObject()) {
                out.commentDisabled = strictTrue(comment.get("disabled"));
                out.commentDisallowDelete = strictTrue(comment.get("disallowDelete"));
                out.commentDisallowAttachment = strictTrue(comment.get("disallowAttachment"));
            }

            out.approveRecall = strictTrue(policy.get("approveRecall"));
            out.retakeSkipApproved = strictTrue(policy.get("retakeSkipApproved"));
        }

        // 流程级超时规则组（顶层）：仅保留合法 action/duration 的规则
        JsonNode rules = root.get("timeoutRules");
        if (rules != null && rules.isArray()) {
            int index = 0;
            for (JsonNode raw : rules) {
                if (raw == null || !raw.isObject()) {
                    continue;
                }
                String action = raw.path("action").asText(null);
                if (!"remind".equals(action) && !"transfer".equals(action)
                        && !"pass".equals(action) && !"refuse".equals(action)) {
                    continue;
                }
                JsonNode durationNode = raw.get("duration");
                if (durationNode == null || !durationNode.isNumber() || durationNode.asDouble() <= 0) {
                    continue;
                }
                ProcessTimeoutRule rule = new ProcessTimeoutRule();
                JsonNode id = raw.get("id");
                rule.id = id != null && id.isTextual() && !id.asText().isBlank()
                        ? id.asText() : "rule-" + index;
                rule.action = action;
                rule.duration = (int) Math.floor(durationNode.asDouble());
                String unit = raw.path("unit").asText("hour");
                rule.unit = "minute".equals(unit) || "day".equals(unit) ? unit : "hour";
                rule.repeat = strictTrue(raw.get("repeat"));
                // notifyAssignee / sms 缺省 true，仅显式 false 关闭（NodeJS r.x !== false 口径）
                JsonNode notifyAssignee = raw.get("notifyAssignee");
                rule.notifyAssignee = notifyAssignee == null || !notifyAssignee.isBoolean()
                        || notifyAssignee.asBoolean();
                rule.notifyAdmin = strictTrue(raw.get("notifyAdmin"));
                rule.notifyUserIds = stringList(raw.get("notifyUserIds"));
                JsonNode sms = raw.get("sms");
                rule.sms = sms == null || !sms.isBoolean() || sms.asBoolean();
                out.timeoutRules.add(rule);
                index++;
            }
        }

        // 自定义标题模板（顶层 titleRule）
        JsonNode titleRule = root.get("titleRule");
        if (titleRule != null && titleRule.isObject()) {
            if (strictTrue(titleRule.get("enabled"))) {
                JsonNode pattern = titleRule.get("pattern");
                if (pattern != null && pattern.isTextual() && !pattern.asText().isBlank()) {
                    out.titlePattern = pattern.asText().trim();
                }
            }
        }

        // 自定义摘要（顶层 summaryRule）：字段 ≤5；showInSms 仅在摘要启用时有意义
        JsonNode summaryRule = root.get("summaryRule");
        if (summaryRule != null && summaryRule.isObject()) {
            JsonNode fields = summaryRule.get("fields");
            if (strictTrue(summaryRule.get("enabled")) && fields != null && fields.isArray()) {
                List<String> picked = new ArrayList<>();
                for (JsonNode f : fields) {
                    if (picked.size() >= 5) {
                        break;
                    }
                    if (f != null && f.isTextual() && !f.asText().isBlank()) {
                        picked.add(f.asText().trim());
                    }
                }
                out.summaryFields = picked;
                out.summaryShowInSms = strictTrue(summaryRule.get("showInSms"));
            }
        }

        // 可发起人员范围（顶层 starterScope）：mode 非 SPECIFIED 一律 ALL（宽松）；名单上限防脏数据
        JsonNode starterScope = root.get("starterScope");
        if (starterScope != null && starterScope.isObject()
                && "SPECIFIED".equals(starterScope.path("mode").asText(""))) {
            out.starterScope.mode = "SPECIFIED";
            out.starterScope.userIds = stringList(starterScope.get("userIds"), 200);
            out.starterScope.roleIds = stringList(starterScope.get("roleIds"), 50);
        }

        // 流程级审批管理员（顶层 adminUserIds）：用户 ID 字符串列表，上限 50
        out.adminUserIds = stringList(root.get("adminUserIds"), 50);

        return out;
    }

    /** 宽松布尔（仅 JSON true 为真；策略默认全关，与 operations 的 asBoolean() 口径区分）。 */
    private static boolean strictTrue(JsonNode node) {
        return node != null && node.isBoolean() && node.asBoolean();
    }

    private static List<String> stringList(JsonNode node) {
        return stringList(node, Integer.MAX_VALUE);
    }

    /** 宽松字符串列表：仅保留非空字符串（trim），截断到上限（对齐 NodeJS stringList）。 */
    private static List<String> stringList(JsonNode node, int cap) {
        List<String> out = new ArrayList<>();
        if (node != null && node.isArray()) {
            for (JsonNode e : node) {
                if (out.size() >= cap) {
                    break;
                }
                if (e != null && e.isTextual() && !e.asText().isBlank()) {
                    out.add(e.asText().trim());
                }
            }
        }
        return out;
    }

    // ------------------------------------------------------------ 模板渲染

    /**
     * 渲染流程模板（自定义审批标题）：{{processName}}/{{initiator}}/{{date}}/{{表单字段}}。
     * 未知变量渲染为空串；日期格式 yyyy-MM-dd。对齐 NodeJS renderProcessTemplate。
     */
    public static String renderProcessTemplate(String pattern, String processName,
                                               String initiator, Map<String, Object> variables) {
        String date = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE);
        Matcher matcher = TEMPLATE_PATTERN.matcher(pattern == null ? "" : pattern);
        StringBuilder out = new StringBuilder();
        while (matcher.find()) {
            String key = matcher.group(1);
            String replacement;
            if ("processName".equals(key)) {
                replacement = processName == null ? "" : processName;
            } else if ("initiator".equals(key)) {
                replacement = initiator == null ? "" : initiator;
            } else if ("date".equals(key)) {
                replacement = date;
            } else {
                Object value = variables == null ? null : variables.get(key);
                replacement = renderValue(value);
            }
            // ⚠️ 值里可能带 $/\（审批意见、ID 等自由文本），必须 quoteReplacement 防止被当正则组引用
            matcher.appendReplacement(out, Matcher.quoteReplacement(replacement));
        }
        matcher.appendTail(out);
        return out.toString();
    }

    /**
     * 渲染自定义摘要：按「字段名:值」空格连接（对齐 NodeJS start() 的 __instanceSummary）。
     * 值为 null/对象时渲染空串（NodeJS 口径）。
     */
    public static String renderSummary(List<String> fields, Map<String, Object> variables) {
        if (fields == null || fields.isEmpty()) {
            return "";
        }
        List<String> parts = new ArrayList<>();
        for (String field : fields) {
            Object value = variables == null ? null : variables.get(field);
            parts.add(field + ":" + renderSummaryValue(value));
        }
        return String.join(" ", parts);
    }

    private static String renderSummaryValue(Object value) {
        if (value == null || value instanceof Map || value instanceof Iterable) {
            return "";
        }
        return String.valueOf(value);
    }

    private static String renderValue(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof Map || value instanceof Iterable) {
            try {
                return JSON.writeValueAsString(value);
            } catch (Exception e) {
                return "";
            }
        }
        return String.valueOf(value);
    }

    // ------------------------------------------------------------ getters

    public boolean isDedupEnabled() { return dedupEnabled; }
    public String getDedupMode() { return dedupMode; }
    public boolean isDedupSkipSameAsInitiator() { return dedupSkipSameAsInitiator; }
    public boolean isCommentPolicyEnabled() { return commentPolicyEnabled; }
    public String getCommentPolicyScope() { return commentPolicyScope; }
    public boolean isSignatureEnabled() { return signatureEnabled; }
    public boolean isSignatureUseLast() { return signatureUseLast; }
    public boolean isSignatureAllowUpload() { return signatureAllowUpload; }
    public boolean isSignatureRequired() { return signatureRequired; }
    public boolean isCommentDisabled() { return commentDisabled; }
    public boolean isCommentDisallowDelete() { return commentDisallowDelete; }
    public boolean isCommentDisallowAttachment() { return commentDisallowAttachment; }
    public boolean isApproveRecall() { return approveRecall; }
    public boolean isRetakeSkipApproved() { return retakeSkipApproved; }
    public List<ProcessTimeoutRule> getTimeoutRules() { return timeoutRules; }
    public StarterScope getStarterScope() { return starterScope; }
    public List<String> getAdminUserIds() { return adminUserIds; }
    public String getTitlePattern() { return titlePattern; }
    public List<String> getSummaryFields() { return summaryFields; }
    public boolean isSummaryShowInSms() { return summaryShowInSms; }
}
