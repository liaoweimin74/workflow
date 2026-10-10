package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.workflow.engine.logic.config.BackendDataUpdateConfig;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 逻辑流 DSL 图结构校验器（发布时硬校验；保存草稿时不校验，允许半成品）。
 *
 * <p>仅产出<b>硬错误</b>（存在即禁止发布）：
 * <ul>
 *   <li>节点 id 重复；</li>
 *   <li>边引用不存在的节点（source/target）；</li>
 *   <li>CONDITION 节点缺 branch=true / branch=false 出边；</li>
 *   <li>HTTP 节点缺 url；BEAN 节点缺 beanName/methodName；SCRIPT 节点缺 source；</li>
 *   <li>SQL_SCRIPT 节点缺 sql / 语句解析失败 / 类型白名单外 / 别名重复 / 占位符语法错 / onError 或 maxRows 非法；</li>
 *   <li>DATA_UPDATE 节点：单表形态缺 table/setOps；多表形态（updates 非空）逐项校验
 *       （table 合法标识符 / setOps 非空 / alias 可选 \w+ 且唯一 / 条目数 ≤ MAX_UPDATES）；</li>
 *   <li>输出声明 results：全部执行型节点（HTTP/BEAN/SCRIPT/DATA_UPDATE/SUBFLOW/BATCH/SQL_SCRIPT）
 *       顶层与循环体均可配；变量名须 \\w+ 合法标识符、不重复、mode 必填且 ∈ WHOLE|KEY；
 *       resultVar 已全链路下线（引擎反序列化忽略该遗留键）；</li>
 *   <li>非 END/CONDITION 节点无出边（含 START）。</li>
 * </ul>
 *
 * <p>刻意<b>不</b>报错（WARN 级，忽略）：START 缺失、多 START、END 缺失、不可达节点——
 * 画布允许非完整图形态的草稿演进，运行期引擎自有语义兜底（无 START → FAILED 等）。
 */
@Component
public class LogicFlowDslValidator {

    public List<String> validate(LogicFlowDsl dsl) {
        List<String> errors = new ArrayList<>();
        if (dsl == null || dsl.getNodes() == null || dsl.getNodes().isEmpty()) {
            errors.add("缺少节点定义(nodes)");
            return errors;
        }

        // 1) 节点 id 唯一 + 建索引
        Map<String, NodeType> nodeTypes = new LinkedHashMap<>();
        Set<String> duplicated = new LinkedHashSet<>();
        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            if (node.getId() == null || node.getId().isBlank()) {
                errors.add("存在缺少 id 的节点");
                continue;
            }
            if (nodeTypes.containsKey(node.getId())) {
                duplicated.add(node.getId());
            }
            nodeTypes.put(node.getId(), node.getType());
        }
        for (String id : duplicated) {
            errors.add("节点 id 重复: " + id);
        }

        // 2) 出边索引 + 边端点存在性
        Map<String, List<String>> outBranches = new LinkedHashMap<>();
        List<LogicFlowDsl.EdgeDef> edges = dsl.getEdges() != null ? dsl.getEdges() : List.of();
        for (LogicFlowDsl.EdgeDef edge : edges) {
            String source = edge.getSource();
            String target = edge.getTarget();
            if (source == null || !nodeTypes.containsKey(source)) {
                errors.add("边 " + edge.getId() + " 引用不存在的源节点: " + source);
            } else {
                outBranches.computeIfAbsent(source, k -> new ArrayList<>())
                        .add(edge.getBranch() == null ? "" : edge.getBranch().trim());
            }
            if (target == null || !nodeTypes.containsKey(target)) {
                errors.add("边 " + edge.getId() + " 引用不存在的目标节点: " + target);
            }
        }

        // 3) 逐节点硬校验
        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            if (node.getId() == null || node.getId().isBlank()) {
                continue;
            }
            NodeType type = node.getType();
            if (type == null) {
                errors.add("节点 " + node.getId() + " 类型未知或缺省");
                continue;
            }
            switch (type) {
                case CONDITION -> {
                    List<String> branches = outBranches.getOrDefault(node.getId(), List.of());
                    if (!branches.contains("true")) {
                        errors.add("CONDITION 节点 " + node.getId() + " 缺少 branch=true 出边");
                    }
                    if (!branches.contains("false")) {
                        errors.add("CONDITION 节点 " + node.getId() + " 缺少 branch=false 出边");
                    }
                }
                case END -> {
                    // 终点允许无出边
                }
                default -> {
                    if (!outBranches.containsKey(node.getId())) {
                        errors.add("节点无出边: " + node.getId() + " (" + type + ")");
                    }
                }
            }
            switch (type) {
                case HTTP -> {
                    JsonNode config = node.getConfig();
                    if (config == null || isBlankText(config, "url")) {
                        errors.add("HTTP 节点 " + node.getId() + " 缺少 url");
                    }
                }
                case BEAN -> {
                    JsonNode config = node.getConfig();
                    if (config == null || isBlankText(config, "beanName") || isBlankText(config, "methodName")) {
                        errors.add("BEAN 节点 " + node.getId() + " 缺少 beanName/methodName");
                    }
                }
                case SCRIPT -> {
                    JsonNode config = node.getConfig();
                    if (config == null || isBlankText(config, "source")) {
                        errors.add("SCRIPT 节点 " + node.getId() + " 缺少 source");
                    }
                }
                case BATCH -> validateBatch(node, errors);
                case SUBFLOW -> validateSubflow(node, errors);
                case DATA_UPDATE -> validateDataUpdate(node, errors);
                case SQL_SCRIPT -> validateSqlScript(node, errors);
                case DATA_QUERY -> validateDataQuery(node, errors);
                case DATA_INSERT -> validateDataInsert(node, errors);
                case DATA_DELETE -> validateDataDelete(node, errors);
                case NOTIFY -> validateNotify(node, errors);
                case DELAY -> validateDelay(node, errors);
                case TRANSFORM -> validateTransform(node, errors);
                case AGGREGATE -> validateAggregate(node, errors);
                case LLM -> validateLlm(node, errors);
                default -> {
                    // 其余类型无 config 硬要求
                }
            }
            // 输出声明校验：全部执行型节点统一 results 单表（WHOLE/KEY）；resultVar 已下线
            List<LogicFlowDsl.ResultVarDef> results = node.getResults();
            if (results != null && !results.isEmpty()) {
                validateResults(results, "节点 " + node.getId() + " (" + type + ")", errors);
            }
        }
        return errors;
    }

    /**
     * results 声明硬校验：非空/合法标识符（\\w+，与 VariableResolver 占位符同域）、
     * 不重复（单一命名空间，WHOLE/KEY 混排同表）、mode 必填且 ∈ WHOLE|KEY。
     * label 用于错误定位（如 "节点 s1 (HTTP)"）。
     */
    private void validateResults(List<LogicFlowDsl.ResultVarDef> results, String label, List<String> errors) {
        Set<String> seen = new LinkedHashSet<>();
        for (int i = 0; i < results.size(); i++) {
            LogicFlowDsl.ResultVarDef def = results.get(i);
            String name = def != null ? def.getName() : null;
            if (name == null || name.isBlank()) {
                errors.add(label + " 第 " + (i + 1) + " 个输出缺少 name");
                continue;
            }
            if (!name.matches("\\w+")) {
                errors.add(label + " 输出变量名非法（仅字母/数字/下划线）: " + name);
                continue;
            }
            if (!seen.add(name)) {
                errors.add(label + " 输出变量名重复: " + name);
                continue;
            }
            String mode = def.getMode() == null ? null : def.getMode().trim().toUpperCase();
            if (mode == null || mode.isBlank()) {
                errors.add(label + " 输出 '" + name + "' 缺少 mode（WHOLE=整体值 / KEY=按 key 取）");
            } else if (!Set.of("WHOLE", "KEY").contains(mode)) {
                errors.add(label + " 输出 '" + name + "' mode 非法(须 WHOLE/KEY): " + def.getMode());
            }
        }
    }

    /**
     * DATA_UPDATE 节点硬校验（两种形态二选一，updates 非空时为多表形态且优先）：
     * 单表形态 table 必填且为合法标识符；多表形态 updates 逐项校验（table 合法标识符 /
     * setOps 非空 / alias 可选 \w+ 且唯一 / 条目数 ≤ {@link BackendDataUpdateConfig#MAX_UPDATES}）。
     * setOps 逐项 column 非空 / mode ∈ SET,ADD,SUB / value 非空（ADD/SUB 须数字）；
     * where 逐项 column 非空 / op ∈ EQ,NE,GT,GTE,LT,LTE,IS_NULL,NOT_NULL / 非空判定类 op 须带 value。
     * 表/列存在性运行期校验（发布时目标表可能尚未由表单发布创建）。
     */
    private void validateDataUpdate(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("DATA_UPDATE 节点 " + node.getId() + " 缺少 config");
            return;
        }
        JsonNode updates = config.get("updates");
        if (updates != null && updates.isArray() && !updates.isEmpty()) {
            validateDataUpdateUpdates(node.getId(), updates, errors);
            return;
        }
        if (isBlankText(config, "table")) {
            errors.add("DATA_UPDATE 节点 " + node.getId() + " 缺少 table");
        } else if (!config.get("table").asText().trim().matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
            errors.add("DATA_UPDATE 节点 " + node.getId() + " 表名非法: " + config.get("table").asText());
        }
        JsonNode setOps = config.get("setOps");
        if (setOps == null || !setOps.isArray() || setOps.isEmpty()) {
            errors.add("DATA_UPDATE 节点 " + node.getId() + " 缺少 setOps");
        } else {
            validateDataUpdateSetOps(setOps, "DATA_UPDATE 节点 " + node.getId(), errors);
        }
        JsonNode where = config.get("where");
        if (where != null && where.isArray()) {
            validateDataUpdateWhere(where, "DATA_UPDATE 节点 " + node.getId(), errors);
        }
    }

    /** DATA_UPDATE 多表形态逐项硬校验：alias 可选 \w+ 唯一、table 合法、setOps/where 复用单表同款规则。 */
    private void validateDataUpdateUpdates(String nodeId, JsonNode updates, List<String> errors) {
        if (updates.size() > BackendDataUpdateConfig.MAX_UPDATES) {
            errors.add("DATA_UPDATE 节点 " + nodeId + " 多表更新数超出上限("
                    + BackendDataUpdateConfig.MAX_UPDATES + "): " + updates.size());
        }
        Set<String> aliases = new HashSet<>();
        for (int i = 0; i < updates.size(); i++) {
            JsonNode u = updates.get(i);
            String base = "DATA_UPDATE 节点 " + nodeId + " 多表更新第 " + (i + 1) + " 项";
            String alias = textOrNull(u, "alias");
            if (alias != null && !alias.isBlank()) {
                if (!alias.trim().matches("\\w+")) {
                    errors.add(base + " 别名非法（仅字母/数字/下划线）: " + alias);
                } else if (!aliases.add(alias.trim())) {
                    errors.add(base + " 别名重复: " + alias.trim());
                }
            }
            if (isBlankText(u, "table")) {
                errors.add(base + " 缺少 table");
            } else if (!u.get("table").asText().trim().matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
                errors.add(base + " 表名非法: " + u.get("table").asText());
            }
            JsonNode setOps = u.get("setOps");
            if (setOps == null || !setOps.isArray() || setOps.isEmpty()) {
                errors.add(base + " 缺少 setOps");
            } else {
                validateDataUpdateSetOps(setOps, base, errors);
            }
            JsonNode where = u.get("where");
            if (where != null && where.isArray()) {
                validateDataUpdateWhere(where, base, errors);
            }
        }
    }

    /** setOps 逐项硬校验（单表与多表共用；base 为错误定位前缀，如「DATA_UPDATE 节点 du_1」）。 */
    private void validateDataUpdateSetOps(JsonNode setOps, String base, List<String> errors) {
        for (int i = 0; i < setOps.size(); i++) {
            JsonNode setOp = setOps.get(i);
            String label = base + " SET 第 " + (i + 1) + " 项";
            if (isBlankText(setOp, "column")) {
                errors.add(label + "缺少 column");
            }
            String mode = textOrNull(setOp, "mode");
            String normalizedMode = mode == null || mode.isBlank() ? "SET" : mode.trim().toUpperCase();
            if (!Set.of("SET", "ADD", "SUB").contains(normalizedMode)) {
                errors.add(label + "mode 非法(须 SET/ADD/SUB): " + mode);
            } else if (isBlankText(setOp, "value")) {
                errors.add(label + "缺少 value");
            } else if (("ADD".equals(normalizedMode) || "SUB".equals(normalizedMode))
                    && !isNumericText(setOp.get("value").asText())) {
                errors.add(label + mode + " 模式 value 须为数字或 {{数值变量}}: " + setOp.get("value").asText());
            }
        }
    }

    /** where 逐项硬校验（单表与多表共用；base 为错误定位前缀）。 */
    private void validateDataUpdateWhere(JsonNode where, String base, List<String> errors) {
        for (int i = 0; i < where.size(); i++) {
            JsonNode cond = where.get(i);
            String label = base + " WHERE 第 " + (i + 1) + " 项";
            if (isBlankText(cond, "column")) {
                errors.add(label + "缺少 column");
            }
            String op = textOrNull(cond, "op");
            if (op == null || op.isBlank()) {
                errors.add(label + "缺少 op");
                continue;
            }
            String normalizedOp = op.trim().toUpperCase();
            if (!Set.of("EQ", "NE", "GT", "GTE", "LT", "LTE", "IS_NULL", "NOT_NULL").contains(normalizedOp)) {
                errors.add(label + "op 非法: " + op);
            } else if (Set.of("IS_NULL", "NOT_NULL").contains(normalizedOp)) {
                // 空判定无需 value
            } else if (isBlankText(cond, "value")) {
                errors.add(label + "缺少 value");
            }
        }
    }

    /** 数字或 {{数值变量}}（占位符内容运行期解析，此处放行）。 */
    private static boolean isNumericText(String text) {
        String trimmed = text == null ? "" : text.trim();
        if (trimmed.startsWith("{{")) {
            return true;
        }
        try {
            new java.math.BigDecimal(trimmed);
            return true;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /**
     * SUBFLOW 节点硬校验：flowId 必填；varsMapping（若填）逐项 source/target 均非空；
     * 目标流存在性与发布状态留待运行期（发布时目标可能尚未创建/发布）。
     */
    private void validateSubflow(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || isBlankText(config, "flowId")) {
            errors.add("SUBFLOW 节点 " + node.getId() + " 缺少 flowId");
        }
        JsonNode mapping = config == null ? null : config.get("varsMapping");
        if (mapping != null && mapping.isArray()) {
            for (int i = 0; i < mapping.size(); i++) {
                JsonNode pair = mapping.get(i);
                if (isBlankText(pair, "source") || isBlankText(pair, "target")) {
                    errors.add("SUBFLOW 节点 " + node.getId() + " varsMapping 第 " + (i + 1)
                            + " 项缺少 source/target");
                }
            }
        }
    }

    /**
     * SQL_SCRIPT 节点硬校验：sql 必填；语句切分成功且非空、数量不超上限；
     * 逐条类型白名单（kindOf）+ 占位符/引号语法（compile 空变量编译，配置错误尽早暴露）；
     * 语句别名（含默认 s{i} 键）不重复；onError ∈ abort|continue；maxRows（若填）1~1000。
     * 目标表/列存在性不做静态校验（运行期由数据库报错，错误进汇总条目）。
     */
    private void validateSqlScript(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("SQL_SCRIPT 节点 " + node.getId() + " 缺少 config");
            return;
        }
        String sql = textOrNull(config, "sql");
        if (sql == null || sql.isBlank()) {
            errors.add("SQL_SCRIPT 节点 " + node.getId() + " 缺少 sql");
            return;
        }
        List<String> statements;
        try {
            statements = SqlScriptSupport.splitStatements(sql);
        } catch (IllegalArgumentException e) {
            errors.add("SQL_SCRIPT 节点 " + node.getId() + " 语句解析失败: " + e.getMessage());
            return;
        }
        if (statements.isEmpty()) {
            errors.add("SQL_SCRIPT 节点 " + node.getId() + " sql 未包含可执行语句");
            return;
        }
        if (statements.size() > SqlScriptSupport.MAX_STATEMENTS) {
            errors.add("SQL_SCRIPT 节点 " + node.getId() + " 语句数超出上限("
                    + SqlScriptSupport.MAX_STATEMENTS + "): " + statements.size());
        }
        Set<String> keys = new LinkedHashSet<>();
        for (int i = 0; i < statements.size(); i++) {
            String label = "第 " + (i + 1) + " 条";
            String stmt = statements.get(i);
            try {
                SqlScriptSupport.kindOf(stmt);
            } catch (IllegalArgumentException e) {
                errors.add("SQL_SCRIPT 节点 " + node.getId() + " " + label + ": " + e.getMessage());
            }
            try {
                // 空变量编译 = 纯语法校验（占位符闭合/路径合法/引号闭合）；变量存在性运行期解析
                SqlScriptSupport.compile(stmt, Map.of(), null);
            } catch (Exception e) {
                errors.add("SQL_SCRIPT 节点 " + node.getId() + " " + label + " 语法错误: " + e.getMessage());
            }
            String name = SqlScriptSupport.extractName(stmt);
            String key = (name != null && !name.isBlank()) ? name.trim() : ("s" + i);
            if (!keys.add(key)) {
                errors.add("SQL_SCRIPT 节点 " + node.getId() + " " + label + " 语句别名重复: " + key);
            }
        }
        String onError = textOrNull(config, "onError");
        if (onError != null && !onError.isBlank()
                && !Set.of("abort", "continue").contains(onError.trim().toLowerCase())) {
            errors.add("SQL_SCRIPT 节点 " + node.getId() + " onError 非法(须 abort/continue): " + onError);
        }
        JsonNode maxRows = config.get("maxRows");
        if (maxRows != null && !maxRows.isNull()) {
            int v = maxRows.asInt(-1);
            if (v < 1 || v > 1000) {
                errors.add("SQL_SCRIPT 节点 " + node.getId() + " maxRows 须在 1~1000: " + v);
            }
        }
    }

    /** 批处理循环体允许的节点类型（业务执行多型 + SQL_SCRIPT + 新数据/通知/转换/聚合/LLM + BATCH 嵌套；DELAY 不可入循环体）。 */
    private static final Set<NodeType> BATCH_BODY_ALLOWED = Set.of(
            NodeType.HTTP, NodeType.BEAN, NodeType.SCRIPT, NodeType.DATA_UPDATE, NodeType.SUBFLOW,
            NodeType.SQL_SCRIPT, NodeType.BATCH,
            NodeType.DATA_QUERY, NodeType.DATA_INSERT, NodeType.DATA_DELETE, NodeType.NOTIFY,
            NodeType.TRANSFORM, NodeType.AGGREGATE, NodeType.LLM);

    /** BATCH 最大嵌套深度（发布校验限制，防无限自嵌套） */
    private static final int MAX_BATCH_NESTING_DEPTH = 3;

    /**
     * BATCH 节点硬校验（双模式）：
     * <ul>
     *   <li>body 模式（config.body 为数组）：循环体非空；逐步 type ∈ 允许集且对应 config 完整；
     *       DATA_UPDATE/SUBFLOW 复用主节点同款校验；</li>
     *   <li>legacy 模式（无 body）：actionType ∈ HTTP/SCRIPT/BEAN 且对应 actionConfig 完整。</li>
     * </ul>
     * collection 必填；maxItems（若填）须在 1~1000。
     */
    private void validateBatch(LogicFlowDsl.NodeDef node, List<String> errors) {
        validateBatch(node, errors, 0);
    }

    private void validateBatch(LogicFlowDsl.NodeDef node, List<String> errors, int depth) {
        if (depth > MAX_BATCH_NESTING_DEPTH) {
            errors.add("BATCH 节点 " + node.getId() + " 嵌套超过 " + MAX_BATCH_NESTING_DEPTH + " 层");
            return;
        }
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("BATCH 节点 " + node.getId() + " 缺少 config");
            return;
        }
        if (isBlankText(config, "collection")) {
            errors.add("BATCH 节点 " + node.getId() + " 缺少 collection");
        }
        JsonNode body = config.get("body");
        if (body != null && body.isArray()) {
            if (body.isEmpty()) {
                errors.add("BATCH 节点 " + node.getId()
                        + " 循环体为空（请把动作节点拖入批处理循环虚线，或回退 legacy 单动作配置）");
            }
            for (int i = 0; i < body.size(); i++) {
                validateBatchBodyStep(node, body.get(i), i, depth, errors);
            }
        } else {
            validateBatchLegacyAction(node, config, errors);
        }
        JsonNode maxItems = config.get("maxItems");
        if (maxItems != null && !maxItems.isNull()) {
            int value = maxItems.asInt(-1);
            if (value < 1 || value > 1000) {
                errors.add("BATCH 节点 " + node.getId() + " maxItems 须在 1~1000: " + value);
            }
        }
        JsonNode chunkSize = config.get("chunkSize");
        if (chunkSize != null && !chunkSize.isNull()) {
            int value = chunkSize.asInt(-1);
            if (value < 1 || value > 100) {
                errors.add("BATCH 节点 " + node.getId() + " chunkSize 须在 1~100: " + value);
            }
        }
        JsonNode intervalMs = config.get("intervalMs");
        if (intervalMs != null && !intervalMs.isNull()) {
            int value = intervalMs.asInt(-1);
            if (value < 0 || value > 5000) {
                errors.add("BATCH 节点 " + node.getId() + " intervalMs 须在 0~5000: " + value);
            }
        }
        JsonNode breakWhen = config.get("breakWhen");
        if (breakWhen != null && !breakWhen.isNull()) {
            if (!breakWhen.isObject()) {
                errors.add("BATCH 节点 " + node.getId() + " breakWhen 须为对象 {variable, operator, value?}");
            } else if (isBlankText(breakWhen, "variable")) {
                errors.add("BATCH 节点 " + node.getId() + " breakWhen 缺少 variable");
            } else {
                String op = textOrNull(breakWhen, "operator");
                if (op == null || !Set.of("EQ", "NE", "GT", "LT", "GTE", "LTE", "EMPTY", "NOT_EMPTY")
                        .contains(op.trim().toUpperCase())) {
                    errors.add("BATCH 节点 " + node.getId() + " breakWhen.operator 非法: " + op);
                }
            }
        }
    }

    /** 校验循环体单步：type 合法 + 对应 config 完整（复用主节点同款规则）；BATCH 步骤递归校验（嵌套）。 */
    private void validateBatchBodyStep(LogicFlowDsl.NodeDef batchNode, JsonNode step,
                                       int index, int depth, List<String> errors) {
        String label = "循环体第 " + (index + 1) + " 步";
        if (step == null || step.isNull() || !step.isObject()) {
            errors.add("BATCH 节点 " + batchNode.getId() + " " + label + "须为对象");
            return;
        }
        String typeName = textOrNull(step, "type");
        if (typeName == null || typeName.isBlank()) {
            errors.add("BATCH 节点 " + batchNode.getId() + " " + label + "缺少 type");
            return;
        }
        NodeType type;
        try {
            type = NodeType.fromJson(typeName);
        } catch (IllegalArgumentException e) {
            type = null;
        }
        if (type == null || !BATCH_BODY_ALLOWED.contains(type)) {
            errors.add("BATCH 节点 " + batchNode.getId() + " " + label
                    + "类型非法（仅支持 HTTP/BEAN/SCRIPT/DATA_UPDATE/SUBFLOW/SQL_SCRIPT/BATCH）: " + typeName);
            return;
        }
        JsonNode stepConfig = step.get("config");
        // results 全类型步骤均可配（WHOLE/KEY 单表）；resultVar 已下线
        JsonNode stepResults = step.get("results");
        boolean hasStepResults = stepResults != null && stepResults.isArray() && !stepResults.isEmpty();
        if (hasStepResults) {
            List<LogicFlowDsl.ResultVarDef> defs = new ArrayList<>();
            for (int i = 0; i < stepResults.size(); i++) {
                JsonNode item = stepResults.get(i);
                LogicFlowDsl.ResultVarDef def = item != null && item.isObject()
                        ? new LogicFlowDsl.ResultVarDef() : null;
                if (def != null) {
                    def.setName(textOrNull(item, "name"));
                    def.setMode(textOrNull(item, "mode"));
                }
                defs.add(def);
            }
            validateResults(defs, "BATCH 节点 " + batchNode.getId() + " " + label + "(" + type + ")", errors);
        }
        if (type == NodeType.BATCH) {
            // 嵌套批处理：递归校验子 config（深度限制防自嵌套）
            LogicFlowDsl.NodeDef stepNode = new LogicFlowDsl.NodeDef();
            stepNode.setId(batchNode.getId() + " " + label);
            stepNode.setType(NodeType.BATCH);
            stepNode.setConfig(stepConfig);
            validateBatch(stepNode, errors, depth + 1);
            return;
        }
        switch (type) {
            case HTTP -> {
                if (stepConfig == null || stepConfig.isNull() || isBlankText(stepConfig, "url")) {
                    errors.add("BATCH 节点 " + batchNode.getId() + " " + label + "(HTTP) 缺少 url");
                }
            }
            case BEAN -> {
                if (stepConfig == null || stepConfig.isNull()
                        || isBlankText(stepConfig, "beanName") || isBlankText(stepConfig, "methodName")) {
                    errors.add("BATCH 节点 " + batchNode.getId() + " " + label + "(BEAN) 缺少 beanName/methodName");
                }
            }
            case SCRIPT -> {
                if (stepConfig == null || stepConfig.isNull() || isBlankText(stepConfig, "source")) {
                    errors.add("BATCH 节点 " + batchNode.getId() + " " + label + "(SCRIPT) 缺少 source");
                }
            }
            case DATA_UPDATE -> {
                LogicFlowDsl.NodeDef stepNode = new LogicFlowDsl.NodeDef();
                stepNode.setId(batchNode.getId() + " " + label);
                stepNode.setType(NodeType.DATA_UPDATE);
                stepNode.setConfig(stepConfig);
                validateDataUpdate(stepNode, errors);
            }
            case SUBFLOW -> {
                LogicFlowDsl.NodeDef stepNode = new LogicFlowDsl.NodeDef();
                stepNode.setId(batchNode.getId() + " " + label);
                stepNode.setType(NodeType.SUBFLOW);
                stepNode.setConfig(stepConfig);
                validateSubflow(stepNode, errors);
            }
            case SQL_SCRIPT -> {
                LogicFlowDsl.NodeDef stepNode = new LogicFlowDsl.NodeDef();
                stepNode.setId(batchNode.getId() + " " + label);
                stepNode.setType(NodeType.SQL_SCRIPT);
                stepNode.setConfig(stepConfig);
                validateSqlScript(stepNode, errors);
            }
            case DATA_QUERY, DATA_INSERT, DATA_DELETE, NOTIFY, DELAY, TRANSFORM, AGGREGATE, LLM -> {
                LogicFlowDsl.NodeDef stepNode = new LogicFlowDsl.NodeDef();
                stepNode.setId(batchNode.getId() + " " + label);
                stepNode.setType(type);
                stepNode.setConfig(stepConfig);
                switch (type) {
                    case DATA_QUERY -> validateDataQuery(stepNode, errors);
                    case DATA_INSERT -> validateDataInsert(stepNode, errors);
                    case DATA_DELETE -> validateDataDelete(stepNode, errors);
                    case NOTIFY -> validateNotify(stepNode, errors);
                    case DELAY -> validateDelay(stepNode, errors);
                    case TRANSFORM -> validateTransform(stepNode, errors);
                    case AGGREGATE -> validateAggregate(stepNode, errors);
                    case LLM -> validateLlm(stepNode, errors);
                    default -> {
                        // 不可达
                    }
                }
            }
            default -> {
                // 不可达（上方类型白名单已过滤）
            }
        }
    }

    /** legacy 单动作校验（无 body 时）：actionType ∈ HTTP/SCRIPT/BEAN 且 actionConfig 完整。 */
    private void validateBatchLegacyAction(LogicFlowDsl.NodeDef node, JsonNode config, List<String> errors) {
        String actionType = textOrNull(config, "actionType");
        if (actionType == null || actionType.isBlank()) {
            errors.add("BATCH 节点 " + node.getId() + " 缺少循环体(body)或 actionType");
            return;
        }
        JsonNode actionConfig = config.get("actionConfig");
        switch (actionType.trim().toUpperCase()) {
            case "HTTP" -> {
                if (actionConfig == null || actionConfig.isNull() || isBlankText(actionConfig, "url")) {
                    errors.add("BATCH 节点 " + node.getId() + " 内嵌 HTTP 动作缺少 url");
                }
            }
            case "SCRIPT" -> {
                if (actionConfig == null || actionConfig.isNull() || isBlankText(actionConfig, "source")) {
                    errors.add("BATCH 节点 " + node.getId() + " 内嵌 SCRIPT 动作缺少 source");
                }
            }
            case "BEAN" -> {
                if (actionConfig == null || actionConfig.isNull()
                        || isBlankText(actionConfig, "beanName") || isBlankText(actionConfig, "methodName")) {
                    errors.add("BATCH 节点 " + node.getId() + " 内嵌 BEAN 动作缺少 beanName/methodName");
                }
            }
            default -> errors.add("BATCH 节点 " + node.getId() + " actionType 非法（仅支持 HTTP/SCRIPT/BEAN）: " + actionType);
        }
    }

    // ------------------------------------------------------------------
    // 新增节点硬校验（DATA_QUERY / DATA_INSERT / DATA_DELETE / NOTIFY / DELAY / TRANSFORM / AGGREGATE / LLM）
    // ------------------------------------------------------------------

    private static final Set<String> DML_OPS = Set.of("EQ", "NE", "GT", "GTE", "LT", "LTE", "IS_NULL", "NOT_NULL");

    /** DATA_QUERY：formKey 必填合法标识符；filter 逐项 column 非空；size 1~100。 */
    private void validateDataQuery(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("DATA_QUERY 节点 " + node.getId() + " 缺少 config");
            return;
        }
        String formKey = textOrNull(config, "formKey");
        if (formKey == null || formKey.isBlank()) {
            errors.add("DATA_QUERY 节点 " + node.getId() + " 缺少 formKey");
        } else if (!formKey.matches("[a-zA-Z][a-zA-Z0-9_]{0,63}")) {
            errors.add("DATA_QUERY 节点 " + node.getId() + " formKey 非法: " + formKey);
        }
        JsonNode filter = config.get("filter");
        if (filter != null && filter.isArray()) {
            for (int i = 0; i < filter.size(); i++) {
                JsonNode item = filter.get(i);
                if (item == null || item.isNull() || !item.isObject()) {
                    continue;
                }
                if (isBlankText(item, "column")) {
                    errors.add("DATA_QUERY 节点 " + node.getId() + " filter 第 " + (i + 1) + " 项缺少 column");
                }
            }
        }
        JsonNode size = config.get("size");
        if (size != null && !size.isNull()) {
            int v = size.asInt(-1);
            if (v < 1 || v > 100) {
                errors.add("DATA_QUERY 节点 " + node.getId() + " size 须在 1~100: " + v);
            }
        }
    }

    /** DATA_INSERT：formKey 必填合法标识符；data 非空且逐项 column 非空。 */
    private void validateDataInsert(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("DATA_INSERT 节点 " + node.getId() + " 缺少 config");
            return;
        }
        String formKey = textOrNull(config, "formKey");
        if (formKey == null || formKey.isBlank()) {
            errors.add("DATA_INSERT 节点 " + node.getId() + " 缺少 formKey");
        } else if (!formKey.matches("[a-zA-Z][a-zA-Z0-9_]{0,63}")) {
            errors.add("DATA_INSERT 节点 " + node.getId() + " formKey 非法: " + formKey);
        }
        JsonNode data = config.get("data");
        if (data == null || !data.isArray() || data.isEmpty()) {
            errors.add("DATA_INSERT 节点 " + node.getId() + " 缺少 data（列值对数组）");
            return;
        }
        for (int i = 0; i < data.size(); i++) {
            JsonNode item = data.get(i);
            if (item == null || item.isNull() || !item.isObject()) {
                errors.add("DATA_INSERT 节点 " + node.getId() + " data 第 " + (i + 1) + " 项须为对象");
                continue;
            }
            if (isBlankText(item, "column")) {
                errors.add("DATA_INSERT 节点 " + node.getId() + " data 第 " + (i + 1) + " 项缺少 column");
            }
        }
    }

    /** DATA_DELETE：formKey 必填；id 或至少一个有效 filter（防全表删）；filter op 枚举。 */
    private void validateDataDelete(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("DATA_DELETE 节点 " + node.getId() + " 缺少 config");
            return;
        }
        String formKey = textOrNull(config, "formKey");
        if (formKey == null || formKey.isBlank()) {
            errors.add("DATA_DELETE 节点 " + node.getId() + " 缺少 formKey");
        } else if (!formKey.matches("[a-zA-Z][a-zA-Z0-9_]{0,63}")) {
            errors.add("DATA_DELETE 节点 " + node.getId() + " formKey 非法: " + formKey);
        }
        boolean hasId = !isBlankText(config, "id");
        JsonNode filter = config.get("filter");
        boolean hasValidFilter = false;
        if (filter != null && filter.isArray()) {
            for (int i = 0; i < filter.size(); i++) {
                JsonNode item = filter.get(i);
                if (item == null || item.isNull() || !item.isObject()) {
                    continue;
                }
                if (isBlankText(item, "column")) {
                    errors.add("DATA_DELETE 节点 " + node.getId() + " filter 第 " + (i + 1) + " 项缺少 column");
                    continue;
                }
                String op = textOrNull(item, "op");
                if (op != null && !DML_OPS.contains(op.trim().toUpperCase())) {
                    errors.add("DATA_DELETE 节点 " + node.getId() + " filter 第 " + (i + 1)
                            + " 项 op 非法(须 EQ/NE/GT/GTE/LT/LTE/IS_NULL/NOT_NULL): " + op);
                    continue;
                }
                if (op == null || Set.of("EQ", "NE", "GT", "GTE", "LT", "LTE")
                        .contains(op.trim().toUpperCase())) {
                    hasValidFilter = true;
                }
            }
        }
        if (!hasId && !hasValidFilter) {
            errors.add("DATA_DELETE 节点 " + node.getId()
                    + " 须提供 id 或至少一个带值的 filter 条件（防全表删除）");
        }
    }

    /** NOTIFY：templateCode/recipientIds 必填；接收人 ≤20 且须可解析为数字（占位符形态放行运行期）；variables 名合法；messageType/channels 枚举。 */
    private void validateNotify(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("NOTIFY 节点 " + node.getId() + " 缺少 config");
            return;
        }
        if (isBlankText(config, "templateCode")) {
            errors.add("NOTIFY 节点 " + node.getId() + " 缺少 templateCode");
        }
        JsonNode recipientIds = config.get("recipientIds");
        if (recipientIds == null || !recipientIds.isArray() || recipientIds.isEmpty()) {
            errors.add("NOTIFY 节点 " + node.getId() + " 缺少 recipientIds（接收人 ID 列表）");
        } else if (recipientIds.size() > 20) {
            errors.add("NOTIFY 节点 " + node.getId() + " 接收人数超出上限(20): " + recipientIds.size());
        }
        JsonNode variables = config.get("variables");
        if (variables != null && variables.isArray()) {
            for (int i = 0; i < variables.size(); i++) {
                JsonNode item = variables.get(i);
                if (item == null || item.isNull() || !item.isObject() || isBlankText(item, "name")) {
                    errors.add("NOTIFY 节点 " + node.getId() + " variables 第 " + (i + 1) + " 项缺少 name");
                    continue;
                }
                String name = textOrNull(item, "name");
                if (name != null && !name.matches("\\w+")) {
                    errors.add("NOTIFY 节点 " + node.getId() + " 模板变量名非法: " + name);
                }
            }
        }
        String messageType = textOrNull(config, "messageType");
        if (messageType != null && !messageType.isBlank()
                && !Set.of("PRIVATE", "PUBLIC", "SYSTEM").contains(messageType.trim().toUpperCase())) {
            errors.add("NOTIFY 节点 " + node.getId() + " messageType 非法(须 PRIVATE/PUBLIC/SYSTEM): " + messageType);
        }
        JsonNode channels = config.get("channels");
        if (channels != null && channels.isArray()) {
            for (int i = 0; i < channels.size(); i++) {
                String channel = channels.get(i) != null ? channels.get(i).asText("") : "";
                if (!channel.isBlank() && !Set.of("IN_APP", "SMS").contains(channel.trim().toUpperCase())) {
                    errors.add("NOTIFY 节点 " + node.getId() + " 渠道非法(须 IN_APP/SMS): " + channel);
                }
            }
        }
    }

    /** DELAY：durationMs 必填且 1~60000（同步引擎硬上限）。 */
    private void validateDelay(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("DELAY 节点 " + node.getId() + " 缺少 config");
            return;
        }
        JsonNode durationMs = config.get("durationMs");
        if (durationMs == null || durationMs.isNull()) {
            errors.add("DELAY 节点 " + node.getId() + " 缺少 durationMs");
            return;
        }
        int v = durationMs.asInt(-1);
        if (v < 1 || v > 60000) {
            errors.add("DELAY 节点 " + node.getId() + " durationMs 须在 1~60000: " + v);
        }
    }

    /** TRANSFORM：template 必填；{{var}} 占位符语法校验（以数字 1 代入后须为合法 JSON 对象/数组）。 */
    private void validateTransform(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("TRANSFORM 节点 " + node.getId() + " 缺少 config");
            return;
        }
        String template = textOrNull(config, "template");
        if (template == null || template.isBlank()) {
            errors.add("TRANSFORM 节点 " + node.getId() + " 缺少 template");
            return;
        }
        String normalized = template.replaceAll("\\{\\{\\s*[\\w.]+\\s*}}", "1");
        try {
            JsonNode tree = new com.fasterxml.jackson.databind.ObjectMapper().readTree(normalized);
            if (tree == null || (!tree.isObject() && !tree.isArray())) {
                errors.add("TRANSFORM 节点 " + node.getId() + " 模板须为 JSON 对象或数组");
            }
        } catch (Exception e) {
            errors.add("TRANSFORM 节点 " + node.getId() + " 模板不是合法 JSON: " + e.getMessage());
        }
    }

    /** AGGREGATE：collection/ops 必填；ops ∈ SUM/AVG/COUNT/MIN/MAX；非纯 COUNT 须带 field。 */
    private void validateAggregate(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("AGGREGATE 节点 " + node.getId() + " 缺少 config");
            return;
        }
        if (isBlankText(config, "collection")) {
            errors.add("AGGREGATE 节点 " + node.getId() + " 缺少 collection");
        }
        JsonNode ops = config.get("ops");
        if (ops == null || !ops.isArray() || ops.isEmpty()) {
            errors.add("AGGREGATE 节点 " + node.getId() + " 缺少 ops（SUM/AVG/COUNT/MIN/MAX 子集）");
            return;
        }
        boolean countOnly = ops.size() == 1 && "COUNT".equalsIgnoreCase(ops.get(0).asText(""));
        for (int i = 0; i < ops.size(); i++) {
            String op = ops.get(i) != null ? ops.get(i).asText("") : "";
            if (!Set.of("SUM", "AVG", "COUNT", "MIN", "MAX").contains(op.trim().toUpperCase())) {
                errors.add("AGGREGATE 节点 " + node.getId() + " ops 第 " + (i + 1) + " 项非法: " + op);
            }
        }
        if (!countOnly && isBlankText(config, "field")) {
            errors.add("AGGREGATE 节点 " + node.getId() + " 缺少 field（纯 COUNT 可省）");
        }
    }

    /** LLM：prompt 必填；temperature 0~2。 */
    private void validateLlm(LogicFlowDsl.NodeDef node, List<String> errors) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            errors.add("LLM 节点 " + node.getId() + " 缺少 config");
            return;
        }
        if (isBlankText(config, "prompt")) {
            errors.add("LLM 节点 " + node.getId() + " 缺少 prompt");
        }
        JsonNode temperature = config.get("temperature");
        if (temperature != null && temperature.isNumber()) {
            double v = temperature.asDouble();
            if (v < 0 || v > 2) {
                errors.add("LLM 节点 " + node.getId() + " temperature 须在 0~2: " + v);
            }
        }
    }

    private static String textOrNull(JsonNode config, String field) {
        JsonNode node = config.get(field);
        return node == null || node.isNull() ? null : node.asText();
    }

    private static boolean isBlankText(JsonNode config, String field) {
        JsonNode node = config.get(field);
        return node == null || node.isNull() || node.asText().isBlank();
    }
}
