package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.form.column.ColumnInfo;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.config.BackendDataUpdateConfig;
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
import com.workflow.engine.logicflow.entity.LogicFlowDef;
import com.workflow.engine.logicflow.repository.LogicFlowDefRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 独立逻辑流编排解释执行引擎（普通类，由 FlowableEngineConfig 装配为 Bean）。
 *
 * <p>执行语义：
 * <ul>
 *   <li>从 START 节点出发沿出边行走，到达 END 结束；多个 START 取第一个，无 START → FAILED；</li>
 *   <li>CONDITION 节点按 branch=true/false 选出边（缺边 → FAILED）；非条件/结束节点缺出边 → FAILED「节点无出边」；</li>
 *   <li>maxSteps=200：步数超出 → FAILED「超出最大执行步数(疑似死循环)」；</li>
 *   <li>HTTP/BEAN/SCRIPT 三型复用既有执行器；结果经 resultVar 写回变量上下文；
 *       BATCH 遍历集合并按循环体链（config.body[]，逐项顺序执行链上各节点）执行，
 *       聚合结果列表写入 resultVar；legacy 单动作（actionType+actionConfig）仍兼容；
 *       SUBFLOW 调用另一条已发布逻辑流（环检测 + 深度限制），其 outputVars 写 resultVar；</li>
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
    /** 子流程目标查询（仅读已发布流；可为 null → SUBFLOW 节点报「引擎未装配子流程仓库」）。 */
    private final LogicFlowDefRepository defRepository;
    /** 数据更新节点执行依赖（可为 null → DATA_UPDATE 节点报「引擎未装配数据更新能力」）。 */
    private final JdbcTemplate jdbcTemplate;
    /** 动态表元数据（表/列存在性校验；可为 null，同上）。 */
    private final DynamicTableManager tableManager;

    public LogicFlowEngine(HttpLogicExecutor httpExecutor,
                           GroovyScriptLogic groovyScriptLogic,
                           BackendBeanRegistry backendBeanRegistry,
                           VariableResolver variableResolver,
                           ObjectMapper objectMapper) {
        this(httpExecutor, groovyScriptLogic, backendBeanRegistry, variableResolver, objectMapper, null);
    }

    public LogicFlowEngine(HttpLogicExecutor httpExecutor,
                           GroovyScriptLogic groovyScriptLogic,
                           BackendBeanRegistry backendBeanRegistry,
                           VariableResolver variableResolver,
                           ObjectMapper objectMapper,
                           LogicFlowDefRepository defRepository) {
        this(httpExecutor, groovyScriptLogic, backendBeanRegistry, variableResolver, objectMapper,
                defRepository, null, null);
    }

    public LogicFlowEngine(HttpLogicExecutor httpExecutor,
                           GroovyScriptLogic groovyScriptLogic,
                           BackendBeanRegistry backendBeanRegistry,
                           VariableResolver variableResolver,
                           ObjectMapper objectMapper,
                           LogicFlowDefRepository defRepository,
                           JdbcTemplate jdbcTemplate,
                           DynamicTableManager tableManager) {
        this.httpExecutor = httpExecutor;
        this.groovyScriptLogic = groovyScriptLogic;
        this.backendBeanRegistry = backendBeanRegistry;
        this.variableResolver = variableResolver;
        this.objectMapper = objectMapper;
        this.defRepository = defRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.tableManager = tableManager;
    }

    /** 单节点执行轨迹（record，可被 Jackson 直接序列化）。 */
    public record NodeTrace(String nodeId, String nodeName, String type, String status,
                            Object result, String error, long durationMs) {
    }

    /** 一次编排执行的结果（outputVars 为变量快照深拷贝）。 */
    public record RunOutcome(String status, Map<String, Object> outputVars,
                             List<NodeTrace> traces, String errorMessage) {
    }

    /** 子流程最大嵌套深度（防递归失控）。 */
    public static final int MAX_SUBFLOW_DEPTH = 5;

    /** 子流程调用链栈（同一线程内递归执行共享；run 入口初始化，finally 清理）。 */
    private final ThreadLocal<Deque<String>> subflowStack = new ThreadLocal<>();

    /**
     * 执行编排（无调用链起点，子流程环检测从空栈开始）。节点级失败/结构性问题
     * （缺 START、缺出边、未知类型、死循环等）均不抛出，统一收敛为
     * {@code status=FAILED} 的 RunOutcome，保证运行历史完整留痕。
     */
    public RunOutcome run(LogicFlowDsl dsl, Map<String, Object> inputVars) {
        return run(dsl, inputVars, null);
    }

    /**
     * 执行编排（带所属流 id，用于子流程自引用/环检测：ownerFlowId 即在调用链上，
     * 子流程若调回自身所属流将被拒绝）。
     */
    public RunOutcome run(LogicFlowDsl dsl, Map<String, Object> inputVars, String ownerFlowId) {
        subflowStack.set(new ArrayDeque<>());
        if (ownerFlowId != null && !ownerFlowId.isBlank()) {
            subflowStack.get().push(ownerFlowId);
        }
        try {
            return runInternal(dsl, inputVars);
        } finally {
            subflowStack.remove();
        }
    }

    private RunOutcome runInternal(LogicFlowDsl dsl, Map<String, Object> inputVars) {
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
            Object result = dispatch(node, vars, traces);
            long duration = System.currentTimeMillis() - begin;
            String resultVar = node.getResultVar();
            if (resultVar != null && !resultVar.isBlank()) {
                vars.put(resultVar, result);
            }
            if (node.getType() == NodeType.SCRIPT) {
                expandScriptOutputs(node, result, vars);
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

    /** 四型逻辑 + 批处理/子流程分发。 */
    private Object dispatch(LogicFlowDsl.NodeDef node, Map<String, Object> vars, List<NodeTrace> traces) {
        return switch (node.getType()) {
            case HTTP -> executeHttp(node, vars);
            case BEAN -> executeBean(node, vars);
            case SCRIPT -> executeScript(node, vars);
            case BATCH -> executeBatch(node, vars, traces);
            case SUBFLOW -> executeSubflow(node, vars);
            case DATA_UPDATE -> executeDataUpdate(node, vars);
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

    /**
     * SCRIPT 节点多输出展开（outputs 声明式，与 resultVar 双轨并存）：
     * <ul>
     *   <li>脚本返回 Map：按声明逐 key 拆包写入扁平上下文；声明 key 缺失 → 跳过不写（防 null 覆盖上游变量）；</li>
     *   <li>声明名与上游同名变量冲突 → log.warn 警告后放行（首版宽容策略）；</li>
     *   <li>声明名与 resultVar 同名 → 跳过展开并警告（发布校验已拦截，运行期纵深防御）；</li>
     *   <li>返回非 Map 而声明了 outputs → 抛 IllegalArgumentException（节点 FAILED，配置错误尽早暴露）。</li>
     * </ul>
     * 调用点须在 resultVar 写回之后、trace 记 SUCCESS 之前（失败归入节点异常路径）。
     */
    private void expandScriptOutputs(LogicFlowDsl.NodeDef node, Object result, Map<String, Object> vars) {
        List<LogicFlowDsl.OutputVarDef> outputs = node.getOutputs();
        if (outputs == null || outputs.isEmpty()) {
            return;
        }
        if (!(result instanceof Map)) {
            throw new IllegalArgumentException("SCRIPT 节点 " + node.getId()
                    + " 配置了 outputs 但脚本未返回 Map（实际 " + (result == null ? "null" : result.getClass().getSimpleName())
                    + "）：outputs 需脚本以 [key: value, ...] 形式返回");
        }
        Map<?, ?> map = (Map<?, ?>) result;
        String resultVar = node.getResultVar();
        for (LogicFlowDsl.OutputVarDef def : outputs) {
            String name = def != null ? def.getName() : null;
            if (name == null || name.isBlank()) {
                continue;
            }
            if (name.equals(resultVar)) {
                log.warn("SCRIPT 节点 '{}' 输出变量 '{}' 与 resultVar 同名，跳过展开（双轨不重叠）",
                        node.getName() != null ? node.getName() : node.getId(), name);
                continue;
            }
            if (!map.containsKey(name)) {
                continue;
            }
            if (vars.containsKey(name)) {
                log.warn("SCRIPT 节点 '{}' 输出变量 '{}' 覆盖上游同名变量（outputs 冲突警告放行）",
                        node.getName() != null ? node.getName() : node.getId(), name);
            }
            vars.put(name, map.get(name));
        }
    }

    // ------------------------------------------------------------------
    // 数据更新（DATA_UPDATE）节点
    // ------------------------------------------------------------------

    /** 数据更新节点允许操作的动态表名前缀（业务表单动态表 / 审批表单数据表）。 */
    private static final List<String> DATA_UPDATE_TABLE_PREFIXES = List.of("wf_biz_", "wf_form_data");
    /** 数据更新节点 SET 禁改列（租户隔离列，防止跨租户污染）。 */
    private static final String DATA_UPDATE_FORBIDDEN_COLUMN = "tenant_id";

    /**
     * 执行数据更新节点：纯配置 UPDATE 动态表。
     * 表名/列名经元数据校验，值经参数绑定执行（防注入）；受影响行数返回写回 resultVar。
     */
    private Object executeDataUpdate(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendDataUpdateConfig config = readConfig(node, BackendDataUpdateConfig.class);
        if (config == null || isBlank(config.getTable())) {
            throw new IllegalArgumentException("DATA_UPDATE 节点缺少 table 配置: " + node.getId());
        }
        if (config.getSetOps() == null || config.getSetOps().isEmpty()) {
            throw new IllegalArgumentException("DATA_UPDATE 节点缺少 setOps 配置: " + node.getId());
        }
        if (jdbcTemplate == null || tableManager == null) {
            throw new IllegalStateException("引擎未装配数据更新能力(JdbcTemplate/DynamicTableManager): " + node.getId());
        }

        String table = config.getTable().trim();
        validateDataUpdateTable(table);
        Map<String, ColumnInfo> columns = columnsOf(table);

        StringBuilder sql = new StringBuilder("UPDATE ").append(table).append(" SET ");
        List<Object> params = new ArrayList<>();
        List<String> setParts = new ArrayList<>();
        for (BackendDataUpdateConfig.SetOp setOp : config.getSetOps()) {
            String column = requireColumn(columns, table, setOp.getColumn(), "SET");
            if (DATA_UPDATE_FORBIDDEN_COLUMN.equalsIgnoreCase(column)) {
                throw new IllegalArgumentException("DATA_UPDATE 节点禁止修改列 tenant_id: " + node.getId());
            }
            String mode = setOp.getMode() == null || setOp.getMode().isBlank()
                    ? BackendDataUpdateConfig.MODE_SET : setOp.getMode().trim().toUpperCase(Locale.ROOT);
            Object value = resolveDataUpdateValue(setOp.getValue(), vars);
            switch (mode) {
                case BackendDataUpdateConfig.MODE_SET -> setParts.add(column + " = ?");
                case BackendDataUpdateConfig.MODE_ADD -> {
                    setParts.add(column + " = " + column + " + ?");
                    value = requireNumeric(value, node.getId(), column, "ADD");
                }
                case BackendDataUpdateConfig.MODE_SUB -> {
                    setParts.add(column + " = " + column + " - ?");
                    value = requireNumeric(value, node.getId(), column, "SUB");
                }
                default -> throw new IllegalArgumentException(
                        "DATA_UPDATE 节点 setOp.mode 非法(须 SET/ADD/SUB): " + setOp.getMode());
            }
            params.add(value);
        }
        sql.append(String.join(", ", setParts));

        List<BackendDataUpdateConfig.WhereCond> where = config.getWhere() != null
                ? config.getWhere() : List.of();
        if (!where.isEmpty()) {
            sql.append(" WHERE ");
            List<String> whereParts = new ArrayList<>();
            for (BackendDataUpdateConfig.WhereCond cond : where) {
                String column = requireColumn(columns, table, cond.getColumn(), "WHERE");
                String op = cond.getOp() == null ? "" : cond.getOp().trim().toUpperCase(Locale.ROOT);
                switch (op) {
                    case "IS_NULL" -> whereParts.add(column + " IS NULL");
                    case "NOT_NULL" -> whereParts.add(column + " IS NOT NULL");
                    case "EQ", "NE", "GT", "GTE", "LT", "LTE" -> {
                        String symbol = switch (op) {
                            case "EQ" -> "=";
                            case "NE" -> "<>";
                            case "GT" -> ">";
                            case "GTE" -> ">=";
                            case "LT" -> "<";
                            default -> "<=";
                        };
                        whereParts.add(column + " " + symbol + " ?");
                        params.add(resolveDataUpdateValue(cond.getValue(), vars));
                    }
                    default -> throw new IllegalArgumentException(
                            "DATA_UPDATE 节点 where.op 非法(须 EQ/NE/GT/GTE/LT/LTE/IS_NULL/NOT_NULL): " + cond.getOp());
                }
            }
            if (whereParts.isEmpty()) {
                throw new IllegalArgumentException("DATA_UPDATE 节点 WHERE 条件为空: " + node.getId());
            }
            sql.append(String.join(" AND ", whereParts));
        }

        int affected = jdbcTemplate.update(sql.toString(), params.toArray());
        if (log.isDebugEnabled()) {
            log.debug("DATA_UPDATE node '{}' -> {} rows: {}", node.getId(), affected, sql);
        }
        return affected;
    }

    /** 表名校验：合法标识符 + 存在 + 前缀白名单（仅平台动态数据表）。 */
    private void validateDataUpdateTable(String table) {
        if (!table.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
            throw new IllegalArgumentException("DATA_UPDATE 表名非法: " + table);
        }
        boolean allowed = DATA_UPDATE_TABLE_PREFIXES.stream().anyMatch(table::startsWith);
        if (!allowed) {
            throw new IllegalArgumentException(
                    "DATA_UPDATE 仅允许平台动态数据表(wf_biz_*/wf_form_data*): " + table);
        }
        if (!tableManager.tableExists(table)) {
            throw new IllegalArgumentException("DATA_UPDATE 目标表不存在: " + table);
        }
    }

    private Map<String, ColumnInfo> columnsOf(String table) {
        Map<String, ColumnInfo> columns = new LinkedHashMap<>();
        for (ColumnInfo info : tableManager.findTableColumns(table)) {
            columns.put(info.getKey().toLowerCase(Locale.ROOT), info);
        }
        return columns;
    }

    /** 列存在性校验（大小写不敏感），返回规范化列名。 */
    private String requireColumn(Map<String, ColumnInfo> columns, String table, String column, String clause) {
        if (column == null || column.isBlank()) {
            throw new IllegalArgumentException("DATA_UPDATE " + clause + " 列名为空: " + table);
        }
        String name = column.trim();
        if (!columns.containsKey(name.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("DATA_UPDATE 目标表缺少列: " + table + "." + name);
        }
        return name;
    }

    /**
     * 取值解析：纯单占位符 {@code {{path}}} 返回变量原始对象（保留数值类型）；
     * 含占位符的混合模板做字符串插值；其余按字面量返回。
     * path 支持 {@code var} 与 {@code var.sub.sub}（逐层 Map 取值）。
     */
    private Object resolveDataUpdateValue(String expr, Map<String, Object> vars) {
        if (expr == null) {
            return null;
        }
        String trimmed = expr.trim();
        java.util.regex.Matcher pure = java.util.regex.Pattern
                .compile("\\{\\{\\s*([\\w]+(?:\\.[\\w]+)*)\\s*}}").matcher(trimmed);
        if (pure.matches()) {
            return resolvePath(pure.group(1), vars);
        }
        if (trimmed.contains("{{")) {
            java.util.regex.Matcher matcher = java.util.regex.Pattern
                    .compile("\\{\\{\\s*([\\w]+(?:\\.[\\w]+)*)\\s*}}").matcher(trimmed);
            StringBuilder sb = new StringBuilder();
            int last = 0;
            while (matcher.find()) {
                sb.append(trimmed, last, matcher.start());
                Object value = resolvePath(matcher.group(1), vars);
                sb.append(value != null ? value.toString() : "");
                last = matcher.end();
            }
            sb.append(trimmed.substring(last));
            return sb.toString();
        }
        return trimmed;
    }

    /** 点路径取值：首段为变量名，后续逐层 Map 取值；任一层缺失返回 null。 */
    private Object resolvePath(String path, Map<String, Object> vars) {
        String[] parts = path.split("\\.");
        Object current = vars.get(parts[0]);
        for (int i = 1; i < parts.length && current != null; i++) {
            if (current instanceof Map<?, ?> map) {
                current = map.get(parts[i]);
            } else {
                throw new IllegalArgumentException(
                        "DATA_UPDATE 取值路径中间层非对象: " + path + " (于 " + parts[i - 1] + ")");
            }
        }
        return current;
    }

    /** ADD/SUB 模式数值校验：Number 直通，字符串须可解析为 BigDecimal。 */
    private Object requireNumeric(Object value, String nodeId, String column, String mode) {
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        if (value == null || value.toString().isBlank()) {
            throw new IllegalArgumentException("DATA_UPDATE 节点 " + mode + " 模式列 " + column + " 值不能为空");
        }
        try {
            return new BigDecimal(value.toString().trim());
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException(
                    "DATA_UPDATE 节点 " + mode + " 模式列 " + column + " 值须为数字: " + value);
        }
    }

    // ------------------------------------------------------------------
    // 子流程（SUBFLOW）节点
    // ------------------------------------------------------------------

    /**
     * 执行子流程节点：查目标已发布流 → 构建子入参 → 递归执行 → outputVars 作为节点结果。
     *
     * <p>config 形态：{@code {flowId, passAllVars=true, varsMapping:[{source,target}]}}。
     *
     * <p>语义：passAllVars=true（默认）时全量继承当前上下文，varsMapping 在此基础上
     * 逐项覆盖/改名（后写胜出）；passAllVars=false 时仅传映射后的变量。
     * 环检测：目标 flowId 已在调用链（含当前流自身）→ 拒绝；嵌套深度上限
     * {@link #MAX_SUBFLOW_DEPTH}。子流程未发布/不存在 → 节点异常（走 errorAction）。
     * 子流程自身轨迹不并入父轨迹；节点 result = 子流程 outputVars（写 resultVar 可选）。
     */
    private Object executeSubflow(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            throw new IllegalArgumentException("SUBFLOW 节点缺少 config: " + node.getId());
        }
        if (defRepository == null) {
            throw new IllegalStateException("引擎未装配子流程仓库，无法执行 SUBFLOW: " + node.getId());
        }
        String targetId = textOrNull(config, "flowId");
        if (targetId == null || targetId.isBlank()) {
            throw new IllegalArgumentException("SUBFLOW 节点缺少 flowId 配置: " + node.getId());
        }
        Deque<String> stack = subflowStack.get();
        if (stack == null) {
            // 防御：run 内部必已初始化；直接调用 runInternal 时才可能到达
            stack = new ArrayDeque<>();
            subflowStack.set(stack);
        }
        if (stack.contains(targetId)) {
            throw new IllegalArgumentException("检测到子流程循环调用: " + targetId);
        }
        if (stack.size() >= MAX_SUBFLOW_DEPTH) {
            throw new IllegalArgumentException("超出子流程最大嵌套深度(" + MAX_SUBFLOW_DEPTH + "): " + targetId);
        }
        LogicFlowDef target = defRepository.findById(targetId)
                .orElseThrow(() -> new IllegalArgumentException("目标子流程不存在: " + targetId));
        if (!"PUBLISHED".equals(target.getStatus())) {
            throw new IllegalArgumentException("目标子流程未发布，无法调用: " + target.getFlowKey());
        }
        LogicFlowDsl subDsl = LogicFlowDsl.parse(target.getDslJson(), objectMapper);

        boolean passAllVars = !config.has("passAllVars") || config.get("passAllVars").asBoolean(true);
        Map<String, Object> subVars = new LinkedHashMap<>();
        if (passAllVars) {
            subVars.putAll(vars);
        }
        JsonNode mapping = config.get("varsMapping");
        if (mapping != null && mapping.isArray()) {
            for (JsonNode pair : mapping) {
                String source = textOrNull(pair, "source");
                String targetName = textOrNull(pair, "target");
                if (source == null || source.isBlank() || targetName == null || targetName.isBlank()) {
                    continue; // 校验器已拦；运行期宽容跳过空映射
                }
                subVars.put(targetName, vars.get(source));
            }
        }

        stack.push(targetId);
        try {
            RunOutcome sub = runInternal(subDsl, subVars);
            if (STATUS_SUCCESS.equals(sub.status())) {
                return sub.outputVars();
            }
            throw new IllegalStateException("子流程执行失败(" + target.getFlowKey() + "): "
                    + (sub.errorMessage() != null ? sub.errorMessage() : "未知原因"));
        } finally {
            stack.pop();
        }
    }

    // ------------------------------------------------------------------
    // 批处理（BATCH）节点
    // ------------------------------------------------------------------

    /** 批处理单次最大迭代数（缺省值）。 */
    public static final int BATCH_DEFAULT_MAX_ITEMS = 100;
    /** 批处理迭代数硬上限（防失控）。 */
    public static final int BATCH_HARD_MAX_ITEMS = 1000;
    /** 批处理轨迹 result 中保留的单项结果/错误明细上限（防止轨迹膨胀）。 */
    public static final int BATCH_TRACE_DETAIL_LIMIT = 20;
    /** 循环体节点 trace 记录的迭代上限（只记首轮 + 失败项，防轨迹膨胀）。 */
    private static final int BATCH_BODY_TRACE_ITERATIONS = 1;

    /** 批处理循环体允许的节点类型（业务执行五型 + BATCH 嵌套）。 */
    private static final Set<NodeType> BATCH_BODY_ALLOWED = EnumSet.of(
            NodeType.HTTP, NodeType.BEAN, NodeType.SCRIPT, NodeType.DATA_UPDATE, NodeType.SUBFLOW,
            NodeType.BATCH);

    /** BATCH 嵌套深度运行时上限（发布校验限 3 层，此处纵深防御防绕过校验的自引用 DSL） */
    private static final int MAX_BATCH_NESTING_DEPTH = 5;
    private static final ThreadLocal<Integer> BATCH_DEPTH = ThreadLocal.withInitial(() -> 0);

    /** 批处理汇总（写入 resultVar / 节点轨迹 result）。 */
    record BatchSummary(int total, int succeeded, int failed, boolean truncated,
                        List<Object> results, List<Map<String, Object>> errors) {
    }

    /**
     * 执行批处理节点：解析集合 → 逐项执行循环体链（或 legacy 单动作）→ 聚合结果列表。
     *
     * <p>config 形态（body 模式，推荐）：{@code {collection, itemVar="item", indexVar="index",
     * body:[{id?, type, name?, config, resultVar?, errorAction?}...], stopOnError=true, maxItems=100}}。
     * legacy 模式（无 body）：{@code {actionType: HTTP|SCRIPT|BEAN, actionConfig:{...}}}。
     *
     * <p>语义：每项在「主变量上下文的副本」中执行（itemVar/indexVar 注入），
     * 循环体链按序逐节点执行，节点 resultVar 写入副本，迭代后副本并回主上下文
     * （后写胜出，脚本副作用跨项保留）；聚合结果按顺序写入 resultVar
     * （汇总 Map：total/succeeded/failed/truncated/results/errors，results 取每项链末结果）；
     * 链内节点 errorAction=IGNORE_CONTINUE → 跳过该步继续后续节点；
     * 否则该项失败，stopOnError=true 时首个失败项向上抛出（由外层 errorAction 决定中断或跳过继续）。
     */
    private Object executeBatch(LogicFlowDsl.NodeDef node, Map<String, Object> vars, List<NodeTrace> traces) {
        int depth = BATCH_DEPTH.get();
        if (depth >= MAX_BATCH_NESTING_DEPTH) {
            throw new IllegalArgumentException(
                    "BATCH 嵌套过深（>" + MAX_BATCH_NESTING_DEPTH + " 层）：" + node.getId());
        }
        BATCH_DEPTH.set(depth + 1);
        try {
            return doExecuteBatch(node, vars, traces);
        } finally {
            BATCH_DEPTH.set(depth);
        }
    }

    private Object doExecuteBatch(LogicFlowDsl.NodeDef node, Map<String, Object> vars, List<NodeTrace> traces) {
        JsonNode config = node.getConfig();
        if (config == null || config.isNull()) {
            throw new IllegalArgumentException("BATCH 节点缺少 config: " + node.getId());
        }
        String collectionExpr = textOrNull(config, "collection");
        if (collectionExpr == null || collectionExpr.isBlank()) {
            throw new IllegalArgumentException("BATCH 节点缺少 collection 配置: " + node.getId());
        }
        JsonNode bodyNode = config.get("body");
        List<LogicFlowDsl.NodeDef> body = bodyNode != null && bodyNode.isArray()
                ? parseBatchBody(node, bodyNode)
                : List.of();
        String itemVar = orDefault(textOrNull(config, "itemVar"), "item");
        String indexVar = orDefault(textOrNull(config, "indexVar"), "index");
        boolean stopOnError = !config.has("stopOnError") || config.get("stopOnError").isNull()
                || config.get("stopOnError").asBoolean(true);
        int maxItems = normalizeMaxItems(config.get("maxItems"));
        if (body.isEmpty() && (textOrNull(config, "actionType") == null || textOrNull(config, "actionType").isBlank())) {
            throw new IllegalArgumentException(
                    "BATCH 节点缺少循环体(body)或 legacy actionType 配置: " + node.getId());
        }

        List<Object> items = resolveCollection(collectionExpr, vars);
        boolean truncated = items.size() > maxItems;
        if (truncated) {
            items = items.subList(0, maxItems);
        }

        List<Object> results = new ArrayList<>(items.size());
        List<Map<String, Object>> errors = new ArrayList<>();
        int succeeded = 0;
        int failed = 0;
        for (int i = 0; i < items.size(); i++) {
            Object item = items.get(i);
            Map<String, Object> childVars = new LinkedHashMap<>(vars);
            childVars.put(itemVar, item);
            childVars.put(indexVar, i);
            try {
                Object last = null;
                if (!body.isEmpty()) {
                    for (int k = 0; k < body.size(); k++) {
                        last = executeBatchBodyStep(node, body.get(k), i, k, childVars, traces);
                    }
                } else {
                    // legacy 单动作路径（兼容旧 DSL）
                    String actionTypeName = textOrNull(config, "actionType");
                    NodeType actionType;
                    try {
                        actionType = NodeType.fromJson(actionTypeName);
                    } catch (IllegalArgumentException e) {
                        throw new IllegalArgumentException("BATCH 节点 actionType 非法: " + actionTypeName);
                    }
                    if (actionType != NodeType.HTTP && actionType != NodeType.SCRIPT && actionType != NodeType.BEAN) {
                        throw new IllegalArgumentException("BATCH 节点 actionType 仅支持 HTTP/SCRIPT/BEAN: " + actionTypeName);
                    }
                    LogicFlowDsl.NodeDef inner = new LogicFlowDsl.NodeDef();
                    inner.setId(node.getId() + "#" + i);
                    inner.setName(node.getName());
                    inner.setType(actionType);
                    inner.setConfig(config.get("actionConfig"));
                    last = dispatch(inner, childVars, traces);
                }
                results.add(last);
                succeeded++;
                vars.putAll(childVars);
            } catch (Exception e) {
                failed++;
                String error = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                if (errors.size() < BATCH_TRACE_DETAIL_LIMIT) {
                    Map<String, Object> err = new LinkedHashMap<>();
                    err.put("index", i);
                    err.put("error", error);
                    errors.add(err);
                }
                if (stopOnError) {
                    throw new IllegalArgumentException("BATCH 第 " + (i + 1) + "/" + items.size()
                            + " 项执行失败: " + error);
                }
                log.debug("Batch node '{}' item {} failed but continues: {}", node.getId(), i, error);
            }
        }
        List<Object> traceResults = results.size() > BATCH_TRACE_DETAIL_LIMIT
                ? new ArrayList<>(results.subList(0, BATCH_TRACE_DETAIL_LIMIT)) : results;
        return new BatchSummary(items.size(), succeeded, failed, truncated,
                traceResults, errors);
    }

    /**
     * 执行循环体链中的单步。链内节点失败语义：errorAction=IGNORE_CONTINUE → 记失败轨迹后
     * 跳过该步继续链内后续节点；否则向上抛出（该项失败，由 stopOnError 决定整批走向）。
     * trace 记录：首轮迭代（i==0）与失败步记录（画布循环体节点 id 不含 '#'，可点亮运行状态）。
     */
    private Object executeBatchBodyStep(LogicFlowDsl.NodeDef batchNode, LogicFlowDsl.NodeDef step,
                                        int iteration, int stepIndex,
                                        Map<String, Object> childVars, List<NodeTrace> traces) {
        String stepId = step.getId() != null && !step.getId().isBlank()
                ? step.getId() : batchNode.getId() + "#b" + stepIndex;
        LogicFlowDsl.NodeDef inner = new LogicFlowDsl.NodeDef();
        inner.setId(stepId);
        inner.setName(step.getName());
        inner.setType(step.getType());
        inner.setConfig(step.getConfig());
        inner.setResultVar(step.getResultVar());
        inner.setOutputs(step.getOutputs());
        inner.setErrorAction(step.getErrorAction());
        boolean traceable = iteration < BATCH_BODY_TRACE_ITERATIONS;
        long begin = System.currentTimeMillis();
        try {
            Object result = dispatch(inner, childVars, traces);
            if (traceable && traces != null) {
                traces.add(new NodeTrace(stepId, inner.getName(), inner.getType().name(),
                        TRACE_SUCCESS, result, null, System.currentTimeMillis() - begin));
            }
            if (inner.getResultVar() != null && !inner.getResultVar().isBlank()) {
                childVars.put(inner.getResultVar(), result);
            }
            if (inner.getType() == NodeType.SCRIPT) {
                expandScriptOutputs(inner, result, childVars);
            }
            return result;
        } catch (Exception e) {
            String error = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            if (ACTION_IGNORE_CONTINUE.equalsIgnoreCase(inner.getErrorAction())) {
                if (traces != null) {
                    traces.add(new NodeTrace(stepId, inner.getName(), inner.getType().name(),
                            TRACE_FAILED, null, error, System.currentTimeMillis() - begin));
                }
                log.debug("Batch body step '{}' failed but continues: {}", stepId, error);
                return null;
            }
            throw e;
        }
    }

    /**
     * 解析循环体配置（config.body 数组）为节点定义列表。
     * 每项须为对象且 type ∈ HTTP/BEAN/SCRIPT/DATA_UPDATE/SUBFLOW，否则抛 IllegalArgumentException。
     */
    private List<LogicFlowDsl.NodeDef> parseBatchBody(LogicFlowDsl.NodeDef node, JsonNode bodyNode) {
        List<LogicFlowDsl.NodeDef> steps = new ArrayList<>();
        for (JsonNode entry : bodyNode) {
            if (entry == null || entry.isNull() || !entry.isObject()) {
                continue;
            }
            String typeName = textOrNull(entry, "type");
            NodeType type;
            try {
                type = typeName == null ? null : NodeType.fromJson(typeName);
            } catch (IllegalArgumentException e) {
                type = null;
            }
            if (type == null) {
                throw new IllegalArgumentException(
                        "BATCH 节点 " + node.getId() + " 循环体步骤缺少/非法 type: " + typeName);
            }
            if (!BATCH_BODY_ALLOWED.contains(type)) {
                throw new IllegalArgumentException(
                        "BATCH 节点 " + node.getId() + " 循环体不支持节点类型: " + type);
            }
            LogicFlowDsl.NodeDef step = new LogicFlowDsl.NodeDef();
            step.setId(textOrNull(entry, "id"));
            step.setName(textOrNull(entry, "name"));
            step.setType(type);
            step.setConfig(entry.get("config"));
            step.setResultVar(textOrNull(entry, "resultVar"));
            step.setOutputs(parseOutputsList(entry.get("outputs")));
            step.setErrorAction(textOrNull(entry, "errorAction"));
            steps.add(step);
        }
        return steps;
    }

    /** outputs 数组 → OutputVarDef 列表（null/空安全；忽略无名行）。 */
    private List<LogicFlowDsl.OutputVarDef> parseOutputsList(JsonNode outputsNode) {
        if (outputsNode == null || !outputsNode.isArray() || outputsNode.isEmpty()) {
            return null;
        }
        List<LogicFlowDsl.OutputVarDef> outputs = new ArrayList<>();
        for (JsonNode item : outputsNode) {
            LogicFlowDsl.OutputVarDef def = objectMapper.convertValue(item, LogicFlowDsl.OutputVarDef.class);
            if (def != null && def.getName() != null && !def.getName().isBlank()) {
                outputs.add(def);
            }
        }
        return outputs.isEmpty() ? null : outputs;
    }

    /** maxItems 归一化：缺省 100，钳位 1~1000。 */
    private int normalizeMaxItems(JsonNode raw) {
        int value = raw == null || raw.isNull() ? BATCH_DEFAULT_MAX_ITEMS : raw.asInt(BATCH_DEFAULT_MAX_ITEMS);
        return Math.max(1, Math.min(value, BATCH_HARD_MAX_ITEMS));
    }

    /**
     * 解析批处理集合：{@code {{var}}} 精确形态直接取变量（List/数组/JSON 数组串均可）；
     * 其余先占位符展开再按 JSON 数组字面量解析。解析失败/非集合抛 IllegalArgumentException。
     */
    private List<Object> resolveCollection(String expression, Map<String, Object> vars) {
        String trimmed = expression.trim();
        java.util.regex.Matcher direct = java.util.regex.Pattern
                .compile("^\\{\\{\\s*(\\w+)\\s*}}$").matcher(trimmed);
        if (direct.matches()) {
            Object value = vars.get(direct.group(1));
            if (value == null) {
                throw new IllegalArgumentException("BATCH 集合变量不存在或为 null: " + direct.group(1));
            }
            return toItemList(value, direct.group(1));
        }
        String resolved = variableResolver.resolve(trimmed, vars);
        try {
            JsonNode array = objectMapper.readTree(resolved);
            if (!array.isArray()) {
                throw new IllegalArgumentException("BATCH 集合表达式解析结果不是 JSON 数组: " + trimmed);
            }
            List<Object> items = new ArrayList<>(array.size());
            array.forEach(entry -> items.add(objectMapper.convertValue(entry, Object.class)));
            return items;
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("BATCH 集合表达式不是合法 JSON 数组: " + trimmed);
        }
    }

    /** 变量值 → 遍历列表（List/数组/Collection 原样转换；字符串按 JSON 数组解析）。 */
    private List<Object> toItemList(Object value, String name) {
        if (value instanceof List<?> list) {
            return new ArrayList<>(list);
        }
        if (value instanceof Object[] array) {
            return new ArrayList<>(List.of(array));
        }
        if (value instanceof java.util.Collection<?> collection) {
            return new ArrayList<>(collection);
        }
        if (value instanceof String text) {
            String trimmed = text.trim();
            if (trimmed.startsWith("[")) {
                try {
                    JsonNode array = objectMapper.readTree(trimmed);
                    if (array.isArray()) {
                        List<Object> items = new ArrayList<>(array.size());
                        array.forEach(entry -> items.add(objectMapper.convertValue(entry, Object.class)));
                        return items;
                    }
                } catch (Exception ignored) {
                    // 落入下方统一报错
                }
            }
            throw new IllegalArgumentException("BATCH 集合变量不是数组: " + name);
        }
        throw new IllegalArgumentException("BATCH 集合变量类型不支持（需数组）: " + name);
    }

    private static String orDefault(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
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
