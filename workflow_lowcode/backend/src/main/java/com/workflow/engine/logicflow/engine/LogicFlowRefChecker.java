package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 逻辑流引用静态检查器（发布期硬校验，ADR-001 Phase A3；由 {@link LogicFlowDslValidator}
 * 在 validate 末尾调用）。按引擎逐字段取值语义，检查每个节点引用的变量是否在其
 * 「可达声明集合」内——未知引用在运行期必然解析为空/失败，发布期拦住比运行期报错早一步。
 *
 * <p>语义依据（与引擎一一对应）：
 * <ul>
 *   <li>上下文初始化：vars = inputVars（{@code runInternal}），平铺命名空间；</li>
 *   <li>祖先产出：节点沿入边可达的祖先 results 声明在执行时已写入 vars（图序执行）；</li>
 *   <li>占位符 {@code {{var}}}：{@link com.workflow.engine.logic.parse.VariableResolver}
 *       仅支持顶级变量名（\w+），<b>不支持点路径</b>（HTTP url/headers、CONDITION value、
 *       BATCH collection 非精确形态）；点路径仅 DATA_UPDATE 取值（resolvePath）支持；</li>
 *   <li>裸名字段（HTTP/BEAN 参数 source、CONDITION variable、SUBFLOW 映射 source）：
 *       {@code vars.get(字面量)}，点路径同样取不到值；</li>
 *   <li>循环体：childVars = vars 副本 + itemVar/indexVar（父上下文可见，BATCH 自身
 *       results 在循环执行期间尚未写入，不可见）；</li>
 *   <li>引擎注入（表单触发）：formData/formDataExisting/formKey 等——静态无法判定
 *       触发方式，统一视为可用以避免误报。</li>
 * </ul>
 *
 * <p>仅报<b>确定性错误</b>（未知引用 / 不支持点路径 / 裸名非法）。类型不符、重名声明、
 * 孤立声明由前端保存期软校验提示（引擎运行期对三者均有宽容语义，不宜硬拦）。
 * SCRIPT source 为 Groovy 代码，绑定集静态不可知，不扫描（已知盲区）。
 */
public final class LogicFlowRefChecker {

    /** VariableResolver 同款占位符域（仅顶级 \w+，不含点路径） */
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*(\\w+)\\s*}}");

    /** DATA_UPDATE 取值域（resolvePath：var 或 var.sub.sub） */
    private static final Pattern PATH_PLACEHOLDER = Pattern.compile("\\{\\{\\s*(\\w+(?:\\.\\w+)*)\\s*}}");

    private static final Pattern BARE_IDENT = Pattern.compile("^\\w+$");
    private static final Pattern DOTTED = Pattern.compile("^\\w+(\\.\\w+)+$");
    private static final Pattern COLLECTION_EXACT = Pattern.compile("^\\{\\{\\s*(\\w+)\\s*}}$");

    /** 错误策略：忽略继续（与 LogicFlowEngine.ACTION_IGNORE_CONTINUE 同值，独立声明保持解耦） */
    private static final String IGNORE_CONTINUE = "IGNORE_CONTINUE";

    /**
     * Phase C 错误作用域键（与 LogicFlowEngine.writeErrorScope 写入键一字不差，修改须同步）：
     * IGNORE_CONTINUE 失败后写入本层上下文，下游节点可用。
     */
    static final List<String> ERROR_SCOPE_NAMES = List.of("errorMessage", "errorNodeId", "errorNodeName");

    /** 引擎注入上下文（FormLogicBindingService 语义），静态视为可用 */
    private static final Set<String> ENGINE_INJECTED = new HashSet<>(Arrays.asList(
            "formData", "formDataExisting", "formKey", "formType", "dataId",
            "opType", "operator", "comment", "processInstanceId", "taskId", "__trigger"));

    private LogicFlowRefChecker() {
    }

    /** 返回确定性引用错误列表（空 = 通过）。仅检查，不改 DSL。 */
    public static List<String> check(LogicFlowDsl dsl) {
        List<String> errors = new ArrayList<>();
        if (dsl == null || dsl.getNodes() == null || dsl.getNodes().isEmpty()) {
            return errors;
        }

        // 节点索引 + 入边表（DSL 中边只连顶层节点；循环体编在 BATCH config.body 内）
        Map<String, LogicFlowDsl.NodeDef> nodeById = new LinkedHashMap<>();
        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            if (node.getId() != null && !node.getId().isBlank()) {
                nodeById.put(node.getId(), node);
            }
        }
        Map<String, List<String>> incoming = new LinkedHashMap<>();
        List<LogicFlowDsl.EdgeDef> edges = dsl.getEdges() != null ? dsl.getEdges() : List.of();
        for (LogicFlowDsl.EdgeDef edge : edges) {
            if (edge.getSource() == null || edge.getTarget() == null) continue;
            incoming.computeIfAbsent(edge.getTarget(), k -> new ArrayList<>()).add(edge.getSource());
        }

        // 入参名（全局可用）
        Set<String> inputNames = new LinkedHashSet<>();
        if (dsl.getInputVars() != null) {
            for (LogicFlowDsl.InputVarDef v : dsl.getInputVars()) {
                if (v != null && v.getName() != null && !v.getName().isBlank()) {
                    inputNames.add(v.getName().trim());
                }
            }
        }

        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            if (node.getId() == null || node.getId().isBlank() || node.getType() == null) continue;
            Set<String> available = availableFor(node.getId(), nodeById, incoming, inputNames);
            Ctx ctx = new Ctx(node, labelOf(node), available, errors);
            switch (node.getType()) {
                case HTTP -> checkHttp(ctx, node.getConfig());
                case BEAN -> checkBean(ctx, node.getConfig());
                case CONDITION -> checkCondition(ctx, node.getConfig());
                case BATCH -> checkBatch(ctx, node.getConfig(), available, nodeById, incoming, inputNames, 0);
                case SUBFLOW -> checkSubflow(ctx, node.getConfig());
                case DATA_UPDATE -> checkDataUpdate(ctx, node.getConfig());
                default -> {
                    // START/END 无 config 引用
                }
            }
        }
        return errors;
    }

    // ------------------------------------------------------------------
    // 可达声明集合
    // ------------------------------------------------------------------

    /**
     * 节点可用名 = 入参 ∪ 引擎注入 ∪ 全部祖先（沿入边传递闭包）的声明名。
     * 祖先为 BATCH 时，其循环体步骤（含嵌套）的 results 声明一并计入——
     * 引擎循环体输出经 vars.putAll(childVars) 在循环结束后并入父上下文。
     */
    private static Set<String> availableFor(String nodeId,
                                            Map<String, LogicFlowDsl.NodeDef> nodeById,
                                            Map<String, List<String>> incoming,
                                            Set<String> inputNames) {
        Set<String> names = new LinkedHashSet<>(inputNames);
        names.addAll(ENGINE_INJECTED);
        Set<String> visited = new HashSet<>();
        ArrayDeque<String> queue = new ArrayDeque<>();
        queue.push(nodeId);
        visited.add(nodeId);
        while (!queue.isEmpty()) {
            String cur = queue.pop();
            List<String> parents = incoming.get(cur);
            if (parents == null) continue;
            for (String parentId : parents) {
                if (!visited.add(parentId)) continue;
                LogicFlowDsl.NodeDef parent = nodeById.get(parentId);
                if (parent != null) {
                    addNodeDeclared(parent, names);
                    // Phase C 错误作用域放行：IGNORE_CONTINUE 祖先失败后写
                    // errorMessage/errorNodeId/errorNodeName（覆盖式，最近一次为准），下游可见
                    if (parent.getType() != NodeType.START && parent.getType() != NodeType.END
                            && IGNORE_CONTINUE.equalsIgnoreCase(parent.getErrorAction())) {
                        names.addAll(ERROR_SCOPE_NAMES);
                    }
                }
                queue.push(parentId);
            }
        }
        return names;
    }

    /** 节点声明名（含 BATCH 循环体步骤递归）并入 set */
    private static void addNodeDeclared(LogicFlowDsl.NodeDef node, Set<String> set) {
        if (node.getResults() != null) {
            for (LogicFlowDsl.ResultVarDef r : node.getResults()) {
                if (r != null && r.getName() != null && !r.getName().isBlank()) {
                    set.add(r.getName().trim());
                }
            }
        }
        if (node.getType() == NodeType.BATCH && node.getConfig() != null) {
            JsonNode body = node.getConfig().get("body");
            if (body != null && body.isArray()) {
                for (int i = 0; i < body.size(); i++) {
                    addStepDeclared(body.get(i), set);
                }
            }
        }
    }

    /** 循环体步骤声明名（嵌套 BATCH 递归下钻）并入 set */
    private static void addStepDeclared(JsonNode step, Set<String> set) {
        if (step == null || step.isNull() || !step.isObject()) return;
        JsonNode results = step.get("results");
        if (results != null && results.isArray()) {
            for (int i = 0; i < results.size(); i++) {
                JsonNode r = results.get(i);
                String name = r == null || r.isNull() ? null : text(r, "name");
                if (name != null && !name.isBlank()) set.add(name.trim());
            }
        }
        if ("BATCH".equalsIgnoreCase(text(step, "type"))) {
            JsonNode cfg = step.get("config");
            JsonNode body = cfg == null ? null : cfg.get("body");
            if (body != null && body.isArray()) {
                for (int i = 0; i < body.size(); i++) {
                    addStepDeclared(body.get(i), set);
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // 逐类型字段检查
    // ------------------------------------------------------------------

    private static void checkHttp(Ctx ctx, JsonNode config) {
        if (config == null || config.isNull()) return;
        placeholders(ctx, text(config, "url"), "URL");
        JsonNode headers = config.get("headers");
        if (headers != null && headers.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = headers.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> entry = it.next();
                placeholders(ctx, text(entry.getValue()), "请求头 " + entry.getKey());
            }
        }
        barePairs(ctx, config.get("queryParams"), "Query 参数");
        barePairs(ctx, config.get("bodyParams"), "Body 参数");
    }

    private static void checkBean(Ctx ctx, JsonNode config) {
        if (config == null || config.isNull()) return;
        barePairs(ctx, config.get("params"), "方法参数");
    }

    private static void checkCondition(Ctx ctx, JsonNode config) {
        if (config == null || config.isNull()) return;
        String variable = text(config, "variable");
        if (variable != null && !variable.isBlank()) {
            bare(ctx, variable.replaceAll("^\\{\\{\\s*|\\s*}}$", "").trim(), "判断变量");
        }
        String op = text(config, "operator");
        boolean noValue = op != null && (op.trim().equalsIgnoreCase("EMPTY") || op.trim().equalsIgnoreCase("NOT_EMPTY"));
        if (!noValue) {
            placeholders(ctx, text(config, "value"), "比较值");
        }
    }

    private static void checkBatch(Ctx ctx, JsonNode config, Set<String> available,
                                   Map<String, LogicFlowDsl.NodeDef> nodeById,
                                   Map<String, List<String>> incoming,
                                   Set<String> inputNames, int depth) {
        if (config == null || config.isNull() || depth > 3) return;
        String collection = text(config, "collection");
        if (collection != null && !collection.isBlank()) {
            String trimmed = collection.trim();
            Matcher exact = COLLECTION_EXACT.matcher(trimmed);
            if (exact.matches()) {
                bare(ctx, exact.group(1), "集合 collection");
            } else if (trimmed.contains("{{")) {
                placeholders(ctx, trimmed, "集合 collection");
            }
        }
        JsonNode legacyConfig = config.get("actionConfig");
        if (text(config, "actionType") != null && legacyConfig != null && !legacyConfig.isNull()) {
            deepPlaceholders(ctx, legacyConfig, "legacy 动作配置");
        }
        JsonNode body = config.get("body");
        if (body == null || !body.isArray()) return;
        String itemVar = orDefault(text(config, "itemVar"), "item");
        String indexVar = orDefault(text(config, "indexVar"), "index");
        // 循环体基础作用域：批处理自身可达集合 + 迭代变量（BATCH 自身 results 执行期不可见，不含）
        Set<String> bodyAvailable = new LinkedHashSet<>(available);
        bodyAvailable.add(itemVar);
        bodyAvailable.add(indexVar);
        for (int i = 0; i < body.size(); i++) {
            JsonNode step = body.get(i);
            checkBodyStep(ctx.node, step, i + 1, bodyAvailable, nodeById, incoming, inputNames, depth, ctx.errors);
            // 前序步骤输出写入同一 childVars 累积，对本链后续步骤可见
            addStepDeclared(step, bodyAvailable);
            // Phase C 镜像引擎 executeBatchBodyStep：被忽略的体步骤失败写错误作用域（childVars），
            // 本迭代后续体步骤可见（迭代成功后随 vars.putAll 并回主上下文）
            if (IGNORE_CONTINUE.equalsIgnoreCase(text(step, "errorAction"))) {
                bodyAvailable.addAll(ERROR_SCOPE_NAMES);
            }
        }
    }

    /** 循环体单步：复用主节点同款字段检查，错误定位带「循环体第 N 步(TYPE)」 */
    private static void checkBodyStep(LogicFlowDsl.NodeDef batchNode, JsonNode step, int index,
                                      Set<String> bodyAvailable,
                                      Map<String, LogicFlowDsl.NodeDef> nodeById,
                                      Map<String, List<String>> incoming,
                                      Set<String> inputNames, int depth, List<String> errors) {
        if (step == null || step.isNull() || !step.isObject()) return;
        String typeName = text(step, "type");
        NodeType type;
        try {
            type = typeName == null ? null : NodeType.valueOf(typeName.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            type = null;
        }
        if (type == null) return;
        String label = "循环体第 " + index + " 步(" + type + ")";
        JsonNode config = step.get("config");
        Ctx ctx = new Ctx(batchNode, batchNode.getName() + " " + label, bodyAvailable, errors);
        switch (type) {
            case HTTP -> checkHttp(ctx, config);
            case BEAN -> checkBean(ctx, config);
            case CONDITION -> {
                // CONDITION 不可入循环体（validator 已拦），防御性跳过
            }
            case BATCH -> checkBatch(ctx, config, bodyAvailable, nodeById, incoming, inputNames, depth + 1);
            case SUBFLOW -> checkSubflow(ctx, config);
            case DATA_UPDATE -> checkDataUpdate(ctx, config);
            default -> {
                // START/END 不可入循环体（validator 已拦）
            }
        }
        // results 声明本身不产生引用（供下游，下一节点作用域不在此展开——静态按画布顶层链传导）
    }

    private static void checkSubflow(Ctx ctx, JsonNode config) {
        if (config == null || config.isNull()) return;
        barePairs(ctx, config.get("varsMapping"), "变量映射");
    }

    private static void checkDataUpdate(Ctx ctx, JsonNode config) {
        if (config == null || config.isNull()) return;
        pathValues(ctx, config.get("setOps"), "column", "value", "写入列");
        pathValues(ctx, config.get("where"), "column", "value", "条件列");
    }

    /** DATA_UPDATE setOps/where：点路径受支持（resolvePath），仅查根名可达 */
    private static void pathValues(Ctx ctx, JsonNode array, String columnField, String valueField, String label) {
        if (array == null || !array.isArray()) return;
        for (int i = 0; i < array.size(); i++) {
            JsonNode item = array.get(i);
            if (item == null || item.isNull() || !item.isObject()) continue;
            String column = text(item, columnField);
            String field = (column == null || column.isBlank() ? "#" + (i + 1) : column) + "（" + label + "）";
            String value = text(item, valueField);
            if (value == null || value.isBlank() || !value.contains("{{")) continue;
            Matcher matcher = PATH_PLACEHOLDER.matcher(value);
            while (matcher.find()) {
                String path = matcher.group(1);
                String root = path.split("\\.")[0];
                if (!ctx.available.contains(root)) {
                    ctx.errors.add(ctx.label + " " + field + " 引用未定义变量: " + root);
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // 提取原语
    // ------------------------------------------------------------------

    /** 占位符引用（VariableResolver 域：仅顶级 \w+，点路径报错） */
    private static void placeholders(Ctx ctx, String text, String field) {
        if (text == null || text.isBlank() || !text.contains("{{")) return;
        Matcher matcher = PLACEHOLDER.matcher(text);
        while (matcher.find()) {
            String root = matcher.group(1);
            if (!ctx.available.contains(root)) {
                ctx.errors.add(ctx.label + " " + field + " 引用未定义变量: " + root);
            }
        }
        // 点路径检测：PATH_PLACEHOLDER 抓到含点路径 → 报不支持
        Matcher pathMatcher = PATH_PLACEHOLDER.matcher(text);
        while (pathMatcher.find()) {
            String path = pathMatcher.group(1);
            if (path.contains(".")) {
                ctx.errors.add(ctx.label + " " + field + " 占位符 {{" + path
                        + "}} 使用了点路径：该字段仅支持顶级变量名（点路径仅数据更新取值支持），运行期将解析为空");
            }
        }
    }

    /** 裸名引用（vars.get(字面量) 语义） */
    private static void bare(Ctx ctx, String raw, String field) {
        if (raw == null) return;
        String name = raw.trim();
        if (name.isEmpty()) return;
        if (DOTTED.matcher(name).matches()) {
            ctx.errors.add(ctx.label + " " + field + " 使用了点路径 \"" + name
                    + "\"：该字段仅支持顶级变量名（点路径取值为空）");
            return;
        }
        if (!BARE_IDENT.matcher(name).matches()) {
            ctx.errors.add(ctx.label + " " + field + " 含非法变量名（仅字母/数字/下划线）: " + name);
            return;
        }
        if (!ctx.available.contains(name)) {
            ctx.errors.add(ctx.label + " " + field + " 引用未定义变量: " + name);
        }
    }

    /** ParamPair 数组（queryParams/bodyParams/params/varsMapping）逐项 source 裸名检查 */
    private static void barePairs(Ctx ctx, JsonNode array, String label) {
        if (array == null || !array.isArray()) return;
        for (int i = 0; i < array.size(); i++) {
            JsonNode pair = array.get(i);
            if (pair == null || pair.isNull() || !pair.isObject()) continue;
            bare(ctx, text(pair, "source"), label + " 第 " + (i + 1) + " 项");
        }
    }

    /** legacy actionConfig 深遍历：字符串值里的占位符（点路径报错） */
    private static void deepPlaceholders(Ctx ctx, JsonNode value, String field) {
        if (value == null || value.isNull()) return;
        if (value.isTextual()) {
            placeholders(ctx, value.asText(), field);
        } else if (value.isArray()) {
            for (int i = 0; i < value.size(); i++) {
                deepPlaceholders(ctx, value.get(i), field + "[" + (i + 1) + "]");
            }
        } else if (value.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = value.fields();
            while (it.hasNext()) {
                Map.Entry<String, JsonNode> entry = it.next();
                deepPlaceholders(ctx, entry.getValue(), field + "." + entry.getKey());
            }
        }
    }

    // ------------------------------------------------------------------
    // Phase D：引用名收集（上下文按需物化的运行期引用闭包，只收集不校验）
    // ------------------------------------------------------------------

    /**
     * 收集全 DSL 引用的变量根名集合（ADR-001 Phase D 上下文按需物化）。
     * 与 {@link #check} 相同的逐类型字段遍历与提取原语（PLACEHOLDER/PATH_PLACEHOLDER/
     * BARE_IDENT/COLLECTION_EXACT 同源 Pattern，不复制正则防漂移），但只收集引用根名、
     * 不做可用性报错：
     * <ul>
     *   <li>HTTP url/headers 值、CONDITION value：占位符根名（点路径取根段，保守多收）；</li>
     *   <li>HTTP queryParams/bodyParams source、BEAN params source、SUBFLOW varsMapping source、
     *       CONDITION variable(strip)：裸名（vars.get(字面量) 语义）；</li>
     *   <li>BATCH collection（精确形态 + 模板形态）、legacy actionConfig 深遍历、
     *       循环体步骤递归（体步骤输出经 vars.putAll 并回，引用同属全图引用集）；</li>
     *   <li>DATA_UPDATE setOps/where value：PATH_PLACEHOLDER 根段；</li>
     *   <li>SCRIPT 不产引用（Groovy 绑定静态不可知，与 check 同盲区；引擎侧以
     *       hasScriptAnywhere 对含 SCRIPT 流程整体停用裁剪兜底）。</li>
     * </ul>
     */
    public static Set<String> collectReferencedNames(LogicFlowDsl dsl) {
        Set<String> names = new LinkedHashSet<>();
        if (dsl == null || dsl.getNodes() == null) return names;
        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            if (node == null || node.getType() == null) continue;
            switch (node.getType()) {
                case HTTP -> collectHttp(node.getConfig(), names);
                case BEAN -> collectBarePairs(node.getConfig() == null ? null : node.getConfig().get("params"), names);
                case CONDITION -> collectCondition(node.getConfig(), names);
                case BATCH -> collectBatch(node.getConfig(), names, 0);
                case SUBFLOW -> collectBarePairs(node.getConfig() == null ? null : node.getConfig().get("varsMapping"), names);
                case DATA_UPDATE -> collectDataUpdate(node.getConfig(), names);
                default -> {
                    // START/END 无引用；SCRIPT 不产引用（盲区同 check）
                }
            }
        }
        return names;
    }

    /** HTTP 引用收集：url/headers 占位符 + query/body 参数 source 裸名（与 checkHttp 同构） */
    private static void collectHttp(JsonNode config, Set<String> names) {
        if (config == null || config.isNull()) return;
        collectPlaceholders(text(config, "url"), names);
        JsonNode headers = config.get("headers");
        if (headers != null && headers.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = headers.fields();
            while (it.hasNext()) {
                collectPlaceholders(text(it.next().getValue()), names);
            }
        }
        collectBarePairs(config.get("queryParams"), names);
        collectBarePairs(config.get("bodyParams"), names);
    }

    /** CONDITION 引用收集：variable(strip) 裸名 + value 占位符（EMPTY/NOT_EMPTY 无 value，与 checkCondition 同构） */
    private static void collectCondition(JsonNode config, Set<String> names) {
        if (config == null || config.isNull()) return;
        String variable = text(config, "variable");
        if (variable != null && !variable.isBlank()) {
            collectBare(variable.replaceAll("^\\{\\{\\s*|\\s*}}$", "").trim(), names);
        }
        String op = text(config, "operator");
        boolean noValue = op != null && (op.trim().equalsIgnoreCase("EMPTY") || op.trim().equalsIgnoreCase("NOT_EMPTY"));
        if (!noValue) {
            collectPlaceholders(text(config, "value"), names);
        }
    }

    /** BATCH 引用收集：collection/legacy actionConfig/循环体递归（与 checkBatch 同构，depth 上限一致） */
    private static void collectBatch(JsonNode config, Set<String> names, int depth) {
        if (config == null || config.isNull() || depth > 3) return;
        String collection = text(config, "collection");
        if (collection != null && !collection.isBlank()) {
            String trimmed = collection.trim();
            Matcher exact = COLLECTION_EXACT.matcher(trimmed);
            if (exact.matches()) {
                collectBare(exact.group(1), names);
            } else if (trimmed.contains("{{")) {
                collectPlaceholders(trimmed, names);
            }
        }
        JsonNode legacyConfig = config.get("actionConfig");
        if (text(config, "actionType") != null && legacyConfig != null && !legacyConfig.isNull()) {
            collectDeepPlaceholders(legacyConfig, names);
        }
        JsonNode body = config.get("body");
        if (body == null || !body.isArray()) return;
        for (int i = 0; i < body.size(); i++) {
            collectBodyStep(body.get(i), names, depth);
        }
    }

    /** 循环体单步引用收集（类型分派与 checkBodyStep 同构；嵌套 BATCH 递归下钻） */
    private static void collectBodyStep(JsonNode step, Set<String> names, int depth) {
        if (step == null || step.isNull() || !step.isObject()) return;
        String typeName = text(step, "type");
        NodeType type;
        try {
            type = typeName == null ? null : NodeType.valueOf(typeName.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            type = null;
        }
        if (type == null) return;
        JsonNode config = step.get("config");
        switch (type) {
            case HTTP -> collectHttp(config, names);
            case BEAN -> collectBarePairs(config == null ? null : config.get("params"), names);
            case CONDITION -> {
                // CONDITION 不可入循环体（validator 已拦），防御性跳过
            }
            case BATCH -> collectBatch(config, names, depth + 1);
            case SUBFLOW -> collectBarePairs(config == null ? null : config.get("varsMapping"), names);
            case DATA_UPDATE -> collectDataUpdate(config, names);
            default -> {
                // SCRIPT 不产引用
            }
        }
    }

    /** DATA_UPDATE 引用收集：setOps/where value 的 PATH_PLACEHOLDER 根段（resolvePath 语义） */
    private static void collectDataUpdate(JsonNode config, Set<String> names) {
        if (config == null || config.isNull()) return;
        collectPathValues(config.get("setOps"), "value", names);
        collectPathValues(config.get("where"), "value", names);
    }

    /** setOps/where 数组逐项 value 根段收集（与 pathValues 同构，只收根名） */
    private static void collectPathValues(JsonNode array, String valueField, Set<String> names) {
        if (array == null || !array.isArray()) return;
        for (int i = 0; i < array.size(); i++) {
            JsonNode item = array.get(i);
            if (item == null || item.isNull() || !item.isObject()) continue;
            String value = text(item, valueField);
            if (value == null || value.isBlank() || !value.contains("{{")) continue;
            Matcher matcher = PATH_PLACEHOLDER.matcher(value);
            while (matcher.find()) {
                names.add(matcher.group(1).split("\\.")[0]);
            }
        }
    }

    /** 占位符引用根名收集（与 placeholders 同 Pattern；点路径取根段——裁剪保守多收不漏收） */
    private static void collectPlaceholders(String text, Set<String> names) {
        if (text == null || text.isBlank() || !text.contains("{{")) return;
        Matcher matcher = PLACEHOLDER.matcher(text);
        while (matcher.find()) {
            names.add(matcher.group(1));
        }
        Matcher pathMatcher = PATH_PLACEHOLDER.matcher(text);
        while (pathMatcher.find()) {
            String path = pathMatcher.group(1);
            if (path.contains(".")) {
                names.add(path.split("\\.")[0]);
            }
        }
    }

    /** 裸名引用收集（vars.get(字面量) 语义；非法形态取根段保守多收） */
    private static void collectBare(String raw, Set<String> names) {
        if (raw == null) return;
        String name = raw.trim();
        if (name.isEmpty()) return;
        if (name.contains(".")) {
            names.add(name.split("\\.")[0]);
            return;
        }
        if (BARE_IDENT.matcher(name).matches()) {
            names.add(name);
        }
    }

    /** ParamPair 数组（queryParams/bodyParams/params/varsMapping）逐项 source 裸名收集 */
    private static void collectBarePairs(JsonNode array, Set<String> names) {
        if (array == null || !array.isArray()) return;
        for (int i = 0; i < array.size(); i++) {
            JsonNode pair = array.get(i);
            if (pair == null || pair.isNull() || !pair.isObject()) continue;
            collectBare(text(pair, "source"), names);
        }
    }

    /** legacy actionConfig 深遍历：字符串值里的占位符根名收集（与 deepPlaceholders 同构） */
    private static void collectDeepPlaceholders(JsonNode value, Set<String> names) {
        if (value == null || value.isNull()) return;
        if (value.isTextual()) {
            collectPlaceholders(value.asText(), names);
        } else if (value.isArray()) {
            for (int i = 0; i < value.size(); i++) {
                collectDeepPlaceholders(value.get(i), names);
            }
        } else if (value.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> it = value.fields();
            while (it.hasNext()) {
                collectDeepPlaceholders(it.next().getValue(), names);
            }
        }
    }

    // ------------------------------------------------------------------
    // 工具
    // ------------------------------------------------------------------

    private static String labelOf(LogicFlowDsl.NodeDef node) {
        String type = node.getType() != null ? node.getType().name() : "UNKNOWN";
        return type + " 节点 " + node.getId();
    }

    private static String text(JsonNode config, String field) {
        JsonNode node = config.get(field);
        return node == null || node.isNull() ? null : node.asText();
    }

    private static String text(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText();
    }

    private static String orDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    /** 检查上下文：归属节点 + 错误定位标签 + 可用名集合 + 错误收集器 */
    private record Ctx(LogicFlowDsl.NodeDef node, String label, Set<String> available, List<String> errors) {
    }
}
