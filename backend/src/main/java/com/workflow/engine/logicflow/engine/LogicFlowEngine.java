package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.config.BackendLogicBeanConfig;
import com.workflow.engine.logic.config.BackendLogicHttpConfig;
import com.workflow.engine.logic.config.BackendLogicScriptConfig;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.parse.ParamMapping;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.logicflow.dsl.ConditionEvaluator;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 独立逻辑流编排解释执行引擎（普通类，由 FlowableEngineConfig 装配为 Bean）。
 *
 * <p>执行语义：
 * <ul>
 *   <li>从 START 节点出发沿出边行走，到达 END 结束；多个 START 取第一个，无 START → FAILED；</li>
 *   <li>CONDITION 节点按 branch=true/false 选出边（缺边 → FAILED）；非条件/结束节点缺出边 → FAILED「节点无出边」；</li>
 *   <li>maxSteps=200：步数超出 → FAILED「超出最大执行步数(疑似死循环)」；</li>
 *   <li>HTTP/BEAN/SCRIPT 三型复用既有执行器；结果经 resultVar 写回变量上下文；</li>
 *   <li>节点异常按 errorAction：FAIL_FLOW（默认）→ 整个流 FAILED 停止；
 *       IGNORE_CONTINUE → 该节点 trace 记 FAILED 后继续走边；</li>
 *   <li>输出 outputVars = 全部变量快照（容器结构深拷贝）。</li>
 * </ul>
 */
public class LogicFlowEngine {

    private static final Logger log = LoggerFactory.getLogger(LogicFlowEngine.class);

    /** 防环步数上限。 */
    public static final int MAX_STEPS = 200;

    /** 运行结果状态。 */
    public static final String STATUS_SUCCESS = "SUCCESS";
    public static final String STATUS_FAILED = "FAILED";

    /** 节点轨迹状态（SKIPPED 预留：并行/多路分支未走过的节点）。 */
    public static final String TRACE_SUCCESS = "SUCCESS";
    public static final String TRACE_FAILED = "FAILED";
    public static final String TRACE_SKIPPED = "SKIPPED";

    private static final String ACTION_IGNORE_CONTINUE = "IGNORE_CONTINUE";

    private final HttpLogicExecutor httpExecutor;
    private final GroovyScriptLogic groovyScriptLogic;
    private final BackendBeanRegistry backendBeanRegistry;
    private final VariableResolver variableResolver;
    private final ObjectMapper objectMapper;

    public LogicFlowEngine(HttpLogicExecutor httpExecutor,
                           GroovyScriptLogic groovyScriptLogic,
                           BackendBeanRegistry backendBeanRegistry,
                           VariableResolver variableResolver,
                           ObjectMapper objectMapper) {
        this.httpExecutor = httpExecutor;
        this.groovyScriptLogic = groovyScriptLogic;
        this.backendBeanRegistry = backendBeanRegistry;
        this.variableResolver = variableResolver;
        this.objectMapper = objectMapper;
    }

    /** 单节点执行轨迹（record，可被 Jackson 直接序列化）。 */
    public record NodeTrace(String nodeId, String nodeName, String type, String status,
                            Object result, String error, long durationMs) {
    }

    /** 一次编排执行的结果（outputVars 为变量快照深拷贝）。 */
    public record RunOutcome(String status, Map<String, Object> outputVars,
                             List<NodeTrace> traces, String errorMessage) {
    }

    /**
     * 执行编排。节点级失败/结构性问题（缺 START、缺出边、未知类型、死循环等）均不抛出，
     * 统一收敛为 {@code status=FAILED} 的 RunOutcome，保证运行历史完整留痕。
     */
    public RunOutcome run(LogicFlowDsl dsl, Map<String, Object> inputVars) {
        List<NodeTrace> traces = new ArrayList<>();
        Map<String, Object> vars = new LinkedHashMap<>();
        if (inputVars != null) {
            vars.putAll(inputVars);
        }
        if (dsl == null || dsl.getNodes() == null || dsl.getNodes().isEmpty()) {
            return fail(vars, traces, "DSL 为空：缺少节点定义");
        }

        Map<String, LogicFlowDsl.NodeDef> nodeById = new LinkedHashMap<>();
        for (LogicFlowDsl.NodeDef node : dsl.getNodes()) {
            nodeById.put(node.getId(), node);
        }
        Map<String, List<LogicFlowDsl.EdgeDef>> outEdges = new LinkedHashMap<>();
        for (LogicFlowDsl.EdgeDef edge : dsl.getEdges() != null ? dsl.getEdges() : List.<LogicFlowDsl.EdgeDef>of()) {
            outEdges.computeIfAbsent(edge.getSource(), k -> new ArrayList<>()).add(edge);
        }

        LogicFlowDsl.NodeDef start = dsl.getNodes().stream()
                .filter(n -> n.getType() == NodeType.START)
                .findFirst()
                .orElse(null);
        if (start == null) {
            return fail(vars, traces, "缺少 START 节点");
        }

        LogicFlowDsl.NodeDef current = start;
        int step = 0;
        try {
            return walk(current, step, nodeById, outEdges, vars, traces);
        } catch (FlowAbortedException e) {
            // 缺出边/边引用缺失节点/FAIL_FLOW 中断 → 统一收敛为 FAILED，引擎不向调用方抛异常
            return fail(vars, traces, e.getMessage());
        }
    }

    /**
     * 主行走循环：从 current 出发沿边执行，直到 END（返回 SUCCESS outcome）
     * 或因缺出边/FAIL_FLOW 等抛出 {@link FlowAbortedException} 中断。
     */
    private RunOutcome walk(LogicFlowDsl.NodeDef current, int step,
                            Map<String, LogicFlowDsl.NodeDef> nodeById,
                            Map<String, List<LogicFlowDsl.EdgeDef>> outEdges,
                            Map<String, Object> vars,
                            List<NodeTrace> traces) {
        while (current != null) {
            if (++step > MAX_STEPS) {
                return fail(vars, traces, "超出最大执行步数(疑似死循环)");
            }
            NodeType type = current.getType();
            if (type == null) {
                return fail(vars, traces, "UNKNOWN_NODE_TYPE: null (node " + current.getId() + ")");
            }
            switch (type) {
                case START -> {
                    traces.add(new NodeTrace(current.getId(), current.getName(), type.name(),
                            TRACE_SUCCESS, null, null, 0L));
                    current = requireNext(nodeById, outEdges, current.getId());
                }
                case END -> {
                    traces.add(new NodeTrace(current.getId(), current.getName(), type.name(),
                            TRACE_SUCCESS, null, null, 0L));
                    return new RunOutcome(STATUS_SUCCESS, snapshot(vars), List.copyOf(traces), null);
                }
                case CONDITION -> current = executeCondition(current, nodeById, outEdges, vars, traces);
                default -> current = executeLogicNode(current, nodeById, outEdges, vars, traces);
            }
        }
        // 不可达兜底（所有分支要么推进 current，要么已 return）
        return fail(vars, traces, "执行中断于未知位置");
    }

    // ------------------------------------------------------------------
    // 节点执行
    // ------------------------------------------------------------------

    /**
     * 执行 HTTP/BEAN/SCRIPT 三型逻辑节点，返回下一节点。
     * 失败按 errorAction：FAIL_FLOW → 抛 {@link FlowAbortedException}（run 顶层收敛为 FAILED）；
     * IGNORE_CONTINUE → trace 记 FAILED 后继续走边。
     */
    private LogicFlowDsl.NodeDef executeLogicNode(LogicFlowDsl.NodeDef node,
                                                  Map<String, LogicFlowDsl.NodeDef> nodeById,
                                                  Map<String, List<LogicFlowDsl.EdgeDef>> outEdges,
                                                  Map<String, Object> vars,
                                                  List<NodeTrace> traces) {
        long begin = System.currentTimeMillis();
        try {
            Object result = dispatch(node, vars);
            long duration = System.currentTimeMillis() - begin;
            String resultVar = node.getResultVar();
            if (resultVar != null && !resultVar.isBlank()) {
                vars.put(resultVar, result);
            }
            traces.add(new NodeTrace(node.getId(), node.getName(), node.getType().name(),
                    TRACE_SUCCESS, result, null, duration));
        } catch (Exception e) {
            long duration = System.currentTimeMillis() - begin;
            String error = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            traces.add(new NodeTrace(node.getId(), node.getName(), node.getType().name(),
                    TRACE_FAILED, null, error, duration));
            if (!ACTION_IGNORE_CONTINUE.equalsIgnoreCase(node.getErrorAction())) {
                throw new FlowAbortedException("节点执行失败: " + node.getId() + ": " + error);
            }
            log.debug("Logic flow node '{}' failed but continues (IGNORE_CONTINUE): {}", node.getId(), error);
        }
        return requireNext(nodeById, outEdges, node.getId());
    }

    /** 执行 CONDITION 节点：求值 → 按 branch=true/false 选边；返回下一节点。 */
    private LogicFlowDsl.NodeDef executeCondition(LogicFlowDsl.NodeDef node,
                                                  Map<String, LogicFlowDsl.NodeDef> nodeById,
                                                  Map<String, List<LogicFlowDsl.EdgeDef>> outEdges,
                                                  Map<String, Object> vars,
                                                  List<NodeTrace> traces) {
        long begin = System.currentTimeMillis();
        boolean branch;
        try {
            JsonNode config = node.getConfig();
            if (config == null || config.isNull()) {
                throw new IllegalArgumentException("CONDITION 节点缺少 config: " + node.getId());
            }
            String variable = textOrNull(config, "variable");
            String operator = textOrNull(config, "operator");
            String value = textOrNull(config, "value");
            branch = ConditionEvaluator.evaluate(variable, operator, value, vars, variableResolver);
        } catch (Exception e) {
            long duration = System.currentTimeMillis() - begin;
            String error = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            traces.add(new NodeTrace(node.getId(), node.getName(), NodeType.CONDITION.name(),
                    TRACE_FAILED, null, error, duration));
            if (!ACTION_IGNORE_CONTINUE.equalsIgnoreCase(node.getErrorAction())) {
                throw new FlowAbortedException("条件评估失败: " + node.getId() + ": " + error);
            }
            // 容错继续：条件失败默认走 false 分支
            branch = false;
        }
        long duration = System.currentTimeMillis() - begin;
        if (node.getResultVar() != null && !node.getResultVar().isBlank()) {
            vars.put(node.getResultVar(), branch);
        }
        traces.add(new NodeTrace(node.getId(), node.getName(), NodeType.CONDITION.name(),
                TRACE_SUCCESS, String.valueOf(branch), null, duration));
        return resolveBranchTarget(node, nodeById, outEdges.get(node.getId()), branch);
    }

    /** 三型逻辑分发。 */
    private Object dispatch(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        return switch (node.getType()) {
            case HTTP -> executeHttp(node, vars);
            case BEAN -> executeBean(node, vars);
            case SCRIPT -> executeScript(node, vars);
            default -> throw new IllegalArgumentException("节点 " + node.getId() + " 不支持执行: " + node.getType());
        };
    }

    private Object executeHttp(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendLogicHttpConfig config = readConfig(node, BackendLogicHttpConfig.class);
        if (config == null || config.getUrl() == null || config.getUrl().isBlank()) {
            throw new IllegalArgumentException("HTTP 节点缺少 url 配置: " + node.getId());
        }
        String method = config.getMethod() == null || config.getMethod().isBlank()
                ? "GET" : config.getMethod();
        Map<String, String> headers = config.getHeaders() != null ? config.getHeaders() : Map.of();
        List<ParamMapping> query = config.getQueryParams() != null ? config.getQueryParams() : List.of();
        List<ParamMapping> body = config.getBodyParams() != null ? config.getBodyParams() : List.of();
        // url/headers 的 {{var}} 展开由 HttpLogicExecutor 内部完成（占位符替换后、发请求前做白名单校验）
        return httpExecutor.execute(config.getUrl(), method, headers, query, body, vars,
                config.getConnTimeoutMs(), config.getReadTimeoutMs(), Math.max(0, config.getRetryCount()));
    }

    private Object executeBean(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendLogicBeanConfig config = readConfig(node, BackendLogicBeanConfig.class);
        if (config == null || isBlank(config.getBeanName()) || isBlank(config.getMethodName())) {
            throw new IllegalArgumentException("BEAN 节点缺少 beanName/methodName 配置: " + node.getId());
        }
        List<ParamMapping> params = config.getParams() != null ? config.getParams() : List.of();
        Object[] args = params.stream()
                .map(pm -> vars.get(pm.source()))
                .toArray();
        // 未注册的 bean 方法由 BackendBeanRegistry 抛出 IllegalArgumentException → 走 errorAction
        return backendBeanRegistry.invoke(config.getBeanName(), config.getMethodName(), args);
    }

    private Object executeScript(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendLogicScriptConfig config = readConfig(node, BackendLogicScriptConfig.class);
        if (config == null) {
            throw new IllegalArgumentException("SCRIPT 节点缺少 config: " + node.getId());
        }
        if (!"groovy".equalsIgnoreCase(config.getLanguage())) {
            throw new IllegalArgumentException("UNSUPPORTED_LANGUAGE: " + config.getLanguage());
        }
        return groovyScriptLogic.execute(config.getSource(), null, vars);
    }

    /** config JsonNode → 三型强类型配置（复用 engine/logic/config 既有类）。 */
    private <T> T readConfig(LogicFlowDsl.NodeDef node, Class<T> type) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            return null;
        }
        try {
            return objectMapper.treeToValue(config, type);
        } catch (Exception e) {
            throw new IllegalArgumentException("节点 " + node.getId() + " config 反序列化失败: "
                    + (e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName()), e);
        }
    }

    // ------------------------------------------------------------------
    // 图行走
    // ------------------------------------------------------------------

    /** 非 CONDITION 节点的后继：取首条出边；缺出边/边引用缺失节点 → FAILED（经 FlowAbortedException 收敛）。 */
    private LogicFlowDsl.NodeDef requireNext(Map<String, LogicFlowDsl.NodeDef> nodeById,
                                             Map<String, List<LogicFlowDsl.EdgeDef>> outEdges,
                                             String nodeId) {
        List<LogicFlowDsl.EdgeDef> edges = outEdges.get(nodeId);
        if (edges == null || edges.isEmpty()) {
            throw new FlowAbortedException("节点无出边: " + nodeId);
        }
        String target = edges.get(0).getTarget();
        LogicFlowDsl.NodeDef next = target != null ? nodeById.get(target) : null;
        if (next == null) {
            throw new FlowAbortedException("边引用不存在的节点: " + target);
        }
        return next;
    }

    /** CONDITION 节点的后继：按 branch=true/false 选边；缺边 → FAILED。 */
    private LogicFlowDsl.NodeDef resolveBranchTarget(LogicFlowDsl.NodeDef node,
                                                     Map<String, LogicFlowDsl.NodeDef> nodeById,
                                                     List<LogicFlowDsl.EdgeDef> edges,
                                                     boolean branch) {
        String want = String.valueOf(branch);
        if (edges != null) {
            for (LogicFlowDsl.EdgeDef edge : edges) {
                if (want.equalsIgnoreCase(edge.getBranch() == null ? "" : edge.getBranch().trim())) {
                    LogicFlowDsl.NodeDef next = edge.getTarget() != null
                            ? nodeById.get(edge.getTarget()) : null;
                    if (next == null) {
                        throw new FlowAbortedException("边引用不存在的节点: " + edge.getTarget());
                    }
                    return next;
                }
            }
        }
        throw new FlowAbortedException("CONDITION 节点 " + node.getId() + " 缺少 branch=" + want + " 出边");
    }

    // ------------------------------------------------------------------
    // 结果收敛
    // ------------------------------------------------------------------

    private RunOutcome fail(Map<String, Object> vars, List<NodeTrace> traces, String errorMessage) {
        log.debug("Logic flow run failed: {}", errorMessage);
        return new RunOutcome(STATUS_FAILED, snapshot(vars), List.copyOf(traces), errorMessage);
    }

    /** 变量快照：容器结构深拷贝（Map/List 递归复制），标量与不可变对象原样引用。 */
    private Map<String, Object> snapshot(Map<String, Object> vars) {
        Map<String, Object> copy = new LinkedHashMap<>();
        vars.forEach((key, value) -> copy.put(key, deepCopyValue(value)));
        return copy;
    }

    private Object deepCopyValue(Object value) {
        if (value instanceof Map<?, ?> map) {
            Map<Object, Object> copy = new LinkedHashMap<>();
            map.forEach((k, v) -> copy.put(k, deepCopyValue(v)));
            return copy;
        }
        if (value instanceof List<?> list) {
            List<Object> copy = new ArrayList<>(list.size());
            for (Object item : list) {
                copy.add(deepCopyValue(item));
            }
            return copy;
        }
        return value;
    }

    private static boolean isBlank(String text) {
        return text == null || text.isBlank();
    }

    private static String textOrNull(JsonNode config, String field) {
        JsonNode node = config.get(field);
        return node == null || node.isNull() ? null : node.asText();
    }

    /** 流程中断信号（内部控制流）：图行走/节点执行处抛出，由 {@link #run} 捕获收敛为 FAILED。 */
    private static final class FlowAbortedException extends RuntimeException {
        FlowAbortedException(String message) {
            super(message);
        }
    }
}
