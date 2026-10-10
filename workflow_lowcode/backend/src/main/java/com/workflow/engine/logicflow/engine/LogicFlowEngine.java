package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.engine.form.bizdata.BizDataSupport;
import com.workflow.engine.form.column.ColumnInfo;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.config.BackendAggregateConfig;
import com.workflow.engine.logic.config.BackendDataDeleteConfig;
import com.workflow.engine.logic.config.BackendDataInsertConfig;
import com.workflow.engine.logic.config.BackendDataQueryConfig;
import com.workflow.engine.logic.config.BackendDataUpdateConfig;
import com.workflow.engine.logic.config.BackendDataUpsertConfig;
import com.workflow.engine.logic.config.BackendDelayConfig;
import com.workflow.engine.logic.config.BackendLlmConfig;
import com.workflow.engine.logic.config.BackendNotifyConfig;
import com.workflow.engine.logic.config.BackendSqlScriptConfig;
import com.workflow.engine.logic.config.BackendTransformConfig;
import com.workflow.engine.logic.config.BackendLogicBeanConfig;
import com.workflow.engine.logic.config.BackendLogicHttpConfig;
import com.workflow.engine.logic.config.BackendLogicScriptConfig;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.parse.ParamMapping;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.notification.dispatch.MessageSender;
import com.workflow.engine.tenant.TenantProvider;
import com.workflow.notification.model.ChannelType;
import com.workflow.notification.model.MessageType;
import com.workflow.engine.logicflow.dsl.ConditionEvaluator;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import com.workflow.engine.logicflow.entity.LogicFlowDef;
import com.workflow.engine.logicflow.repository.LogicFlowDefRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 独立逻辑流编排解释执行引擎（普通类，由 FlowableEngineConfig 装配为 Bean）。
 *
 * <p>执行语义：
 * <ul>
 *   <li>从 START 节点出发沿出边行走，到达 END 结束；多个 START 取第一个，无 START → FAILED；</li>
 *   <li>CONDITION 节点按 branch=true/false 选出边（缺边 → FAILED）；非条件/结束节点缺出边 → FAILED「节点无出边」；</li>
 *   <li>maxSteps=200：步数超出 → FAILED「超出最大执行步数(疑似死循环)」；</li>
 *   <li>全部执行型节点（HTTP/BEAN/SCRIPT/DATA_UPDATE/DATA_UPSERT/SUBFLOW/BATCH/SQL_SCRIPT 及 CONDITION）输出统一由
 *       节点级 results 声明驱动（mode=WHOLE 整包 / mode=KEY 拆包，见 {@link #writeResults}；
 *       SCRIPT 严格 / 其余宽松）；resultVar 已全链路下线；</li>
 *   <li>隐式默认输出（约定优于配置）：未声明 results 的执行型节点自动把整体返回值写入
 *       以节点 id 命名的变量（如 http_x7k2），下游零配置即可引用；显式声明后按声明执行；</li>
 *       BATCH 遍历集合并按循环体链（config.body[]，逐项顺序执行链上各节点）执行，
 *       聚合结果列表为节点返回值（由 results 声明写入）；legacy 单动作（actionType+actionConfig）仍兼容；
 *       SUBFLOW 调用另一条已发布逻辑流（环检测 + 深度限制），其 outputVars 为节点返回值（由 results 声明写入）；</li>
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
    /** 业务数据通用 CRUD（DATA_QUERY/INSERT/DELETE 节点依赖；可为 null → 对应节点报未装配）。 */
    private final BizDataSupport bizDataSupport;
    /** 租户提供者（DATA_DELETE 条件形态强制租户过滤 / DATA_UPSERT 写入 tenant_id；可为 null → 对应节点报未装配）。 */
    private final TenantProvider tenantProvider;
    /** 消息发送器（NOTIFY 节点依赖；可为 null，同上）。 */
    private final MessageSender messageSender;
    /** 平台内置大模型（LLM 节点依赖；可为 null，同上）。 */
    private final ChatModel chatModel;

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

    /** 存量八参构造器（新节点依赖均为 null：DATA_QUERY/INSERT/DELETE/NOTIFY/DELAY/TRANSFORM/AGGREGATE/LLM 报未装配）。 */
    public LogicFlowEngine(HttpLogicExecutor httpExecutor,
                           GroovyScriptLogic groovyScriptLogic,
                           BackendBeanRegistry backendBeanRegistry,
                           VariableResolver variableResolver,
                           ObjectMapper objectMapper,
                           LogicFlowDefRepository defRepository,
                           JdbcTemplate jdbcTemplate,
                           DynamicTableManager tableManager) {
        this(httpExecutor, groovyScriptLogic, backendBeanRegistry, variableResolver, objectMapper,
                defRepository, jdbcTemplate, tableManager, null, null, null, null);
    }

    public LogicFlowEngine(HttpLogicExecutor httpExecutor,
                           GroovyScriptLogic groovyScriptLogic,
                           BackendBeanRegistry backendBeanRegistry,
                           VariableResolver variableResolver,
                           ObjectMapper objectMapper,
                           LogicFlowDefRepository defRepository,
                           JdbcTemplate jdbcTemplate,
                           DynamicTableManager tableManager,
                           BizDataSupport bizDataSupport,
                           TenantProvider tenantProvider,
                           MessageSender messageSender,
                           ChatModel chatModel) {
        this.httpExecutor = httpExecutor;
        this.groovyScriptLogic = groovyScriptLogic;
        this.backendBeanRegistry = backendBeanRegistry;
        this.variableResolver = variableResolver;
        this.objectMapper = objectMapper;
        this.defRepository = defRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.tableManager = tableManager;
        this.bizDataSupport = bizDataSupport;
        this.tenantProvider = tenantProvider;
        this.messageSender = messageSender;
        this.chatModel = chatModel;
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

    /** 错误分支出边标记（EdgeDef.branch）：节点失败时优先路由到该边（onError 失败路由）。 */
    public static final String BRANCH_ERROR = "error";

    /**
     * 执行 HTTP/BEAN/SCRIPT/数据/通知等逻辑节点，返回下一节点。
     * 失败按顺序尝试：① 存在 branch=error 出边 → 路由到失败分支（trace 记 FAILED，输出不写入）；
     * ② errorAction=IGNORE_CONTINUE → trace 记 FAILED 后继续主边；
     * ③ FAIL_FLOW（默认）→ 抛 {@link FlowAbortedException}（run 顶层收敛为 FAILED）。
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
            // 输出统一由 results 声明驱动（全部执行型节点；SCRIPT 严格 / 其余宽松；无声明则隐式整体输出为 <节点id>）
            writeResults(node, result, vars);
            traces.add(new NodeTrace(node.getId(), node.getName(), node.getType().name(),
                    TRACE_SUCCESS, result, null, duration));
        } catch (Exception e) {
            long duration = System.currentTimeMillis() - begin;
            String error = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            traces.add(new NodeTrace(node.getId(), node.getName(), node.getType().name(),
                    TRACE_FAILED, null, error, duration));
            LogicFlowDsl.NodeDef errorTarget = resolveErrorTarget(node, nodeById, outEdges.get(node.getId()));
            if (errorTarget != null) {
                log.debug("Logic flow node '{}' failed, route to error branch: {}", node.getId(), error);
                return errorTarget;
            }
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
            LogicFlowDsl.NodeDef errorTarget = resolveErrorTarget(node, nodeById, outEdges.get(node.getId()));
            if (errorTarget != null) {
                return errorTarget;
            }
            if (!ACTION_IGNORE_CONTINUE.equalsIgnoreCase(node.getErrorAction())) {
                throw new FlowAbortedException("条件评估失败: " + node.getId() + ": " + error);
            }
            // 容错继续：条件失败默认走 false 分支
            branch = false;
        }
        long duration = System.currentTimeMillis() - begin;
        // 输出统一由 results 声明（宽松语义）：WHOLE 写回布尔；未声明则隐式写入 <节点id>=布尔
        writeResults(node, branch, vars);
        traces.add(new NodeTrace(node.getId(), node.getName(), NodeType.CONDITION.name(),
                TRACE_SUCCESS, String.valueOf(branch), null, duration));
        return resolveBranchTarget(node, nodeById, outEdges.get(node.getId()), branch);
    }

    /** 四型逻辑 + 批处理/子流程/数据/通知/延时/转换/聚合/LLM 分发。 */
    private Object dispatch(LogicFlowDsl.NodeDef node, Map<String, Object> vars, List<NodeTrace> traces) {
        return switch (node.getType()) {
            case HTTP -> executeHttp(node, vars);
            case BEAN -> executeBean(node, vars);
            case SCRIPT -> executeScript(node, vars);
            case BATCH -> executeBatch(node, vars, traces);
            case SUBFLOW -> executeSubflow(node, vars);
            case DATA_UPDATE -> executeDataUpdate(node, vars);
            case DATA_UPSERT -> executeDataUpsert(node, vars);
            case SQL_SCRIPT -> executeSqlScript(node, vars);
            case DATA_QUERY -> executeDataQuery(node, vars);
            case DATA_INSERT -> executeDataInsert(node, vars);
            case DATA_DELETE -> executeDataDelete(node, vars);
            case NOTIFY -> executeNotify(node, vars);
            case DELAY -> executeDelay(node, vars);
            case TRANSFORM -> executeTransform(node, vars);
            case AGGREGATE -> executeAggregate(node, vars);
            case LLM -> executeLlm(node, vars);
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
     * 节点统一输出写回（results 声明式单表模型，适用于全部执行型节点）：
     * <ul>
     *   <li>mode=WHOLE：节点返回值整体写入变量；值为 null → 跳过并警告（防覆盖上游变量）；</li>
     *   <li>mode=KEY：要求输出源为 Map，按声明名取对应 key 写入；缺 key → 跳过不写；
     *       输出源为字符串时先尝试 JSON 解析为对象（HTTP body 载体拍板 2A）；</li>
     *   <li>严格度分流（拍板 3B）：SCRIPT 严格——声明 KEY 而末行非 Map → 抛
     *       IllegalArgumentException（节点 FAILED，配置错误尽早暴露）；其余节点宽松——
     *       非 Map/解析失败 → 警告跳过，节点继续（外部系统输出不受本流控制）；</li>
     *   <li>输出名与上游同名变量冲突 → log.warn 警告后放行（运行期宽容策略）；</li>
     *   <li>未声明 results → 隐式整体输出（见 {@link #writeImplicitResult}）。</li>
     * </ul>
     * 调用点须在 trace 记 SUCCESS 之前（失败归入节点异常路径）。
     */
    private void writeResults(LogicFlowDsl.NodeDef node, Object result, Map<String, Object> vars) {
        List<LogicFlowDsl.ResultVarDef> results = node.getResults();
        if (results == null || results.isEmpty()) {
            // 未声明输出：隐式约定——整体返回值写入以节点 id 命名的变量（零配置即可被下游引用）
            writeImplicitResult(node, result, vars);
            return;
        }
        String nodeLabel = node.getName() != null && !node.getName().isBlank()
                ? node.getName() : node.getId();
        boolean strict = node.getType() == NodeType.SCRIPT;
        boolean needsMap = results.stream()
                .anyMatch(r -> r != null && r.getMode() != null && "KEY".equalsIgnoreCase(r.getMode().trim()));
        Map<?, ?> keyMap = needsMap ? resolveKeyMap(node, nodeLabel, result, strict) : null;
        for (LogicFlowDsl.ResultVarDef def : results) {
            String name = def != null ? def.getName() : null;
            if (name == null || name.isBlank()) {
                continue;
            }
            Object value;
            if (def.getMode() != null && "KEY".equalsIgnoreCase(def.getMode().trim())) {
                if (keyMap == null || !keyMap.containsKey(name)) {
                    continue; // 解析失败已警告 / 缺 key 跳过不写（防 null 覆盖上游同名变量）
                }
                value = keyMap.get(name);
            } else {
                if (result == null) {
                    log.warn("节点 '{}' 输出 '{}' 返回值为 null，跳过写入（防覆盖上游同名变量）",
                            nodeLabel, name);
                    continue;
                }
                value = result;
            }
            if (vars.containsKey(name)) {
                log.warn("节点 '{}' 输出 '{}' 覆盖上游同名变量（警告放行）", nodeLabel, name);
            }
            vars.put(name, value);
        }
    }

    /**
     * 隐式默认输出（约定优于配置）：未声明 results 的执行型节点把整体返回值写入
     * 以节点 id 命名的变量（如 http_x7k2），下游零配置即可引用；需要重命名/拆包时才显式声明。
     * <ul>
     *   <li>null 结果静默跳过（纯副作用节点常见，不刷警告）；</li>
     *   <li>节点 id 须为合法变量名（\w+）才写——循环体步骤 fallback id 含 '#' 时跳过；</li>
     *   <li>同名覆盖沿用警告放行策略（节点 id 带类型前缀，与用户变量撞名概率极低）。</li>
     * </ul>
     */
    private void writeImplicitResult(LogicFlowDsl.NodeDef node, Object result, Map<String, Object> vars) {
        if (result == null) {
            return;
        }
        String id = node.getId();
        if (id == null || !id.matches("\\w+")) {
            return;
        }
        if (vars.containsKey(id)) {
            // debug 级：隐式输出属赠品语义，自环/同名场景高频触发，避免刷屏
            log.debug("节点 '{}' 隐式输出 '{}' 覆盖同名变量（放行）",
                    node.getName() != null && !node.getName().isBlank() ? node.getName() : id, id);
        }
        vars.put(id, result);
    }

    /**
     * KEY 模式输出源归一为 Map：Map 直通；字符串尝试 JSON 解析（宽松失败返回 null 并警告）；
     * 严格模式（SCRIPT）非 Map 直接抛 IllegalArgumentException。
     */
    private Map<?, ?> resolveKeyMap(LogicFlowDsl.NodeDef node, String nodeLabel,
                                    Object result, boolean strict) {
        if (result instanceof Map<?, ?> map) {
            return map;
        }
        if (result instanceof String text) {
            try {
                JsonNode tree = objectMapper.readTree(text);
                if (tree != null && tree.isObject()) {
                    return objectMapper.convertValue(tree, Map.class);
                }
            } catch (Exception e) {
                // 落入下方统一警告
            }
        }
        if (strict) {
            throw new IllegalArgumentException("SCRIPT 节点 " + node.getId()
                    + " 声明了 mode=KEY 的输出但脚本未返回 Map（实际 "
                    + (result == null ? "null" : result.getClass().getSimpleName())
                    + "）：KEY 输出需脚本以 [key: value, ...] 形式返回");
        }
        log.warn("节点 '{}' 声明了 mode=KEY 输出但返回值非 Map/JSON 对象（实际 {}），KEY 输出跳过写入",
                nodeLabel, result == null ? "null" : result.getClass().getSimpleName());
        return null;
    }

    // ------------------------------------------------------------------
    // 数据更新（DATA_UPDATE）节点
    // ------------------------------------------------------------------

    /** 数据更新节点 SET 禁改列（租户隔离列，防止跨租户污染）。 */
    private static final String DATA_UPDATE_FORBIDDEN_COLUMN = "tenant_id";

    /** DATA_UPDATE 多表更新（updates）条目数上限（与发布校验同值）。 */
    private static final int DATA_UPDATE_MAX_UPDATES = BackendDataUpdateConfig.MAX_UPDATES;

    /** 单表 UPDATE 编译产物（key 为多表汇总输出键=别名或 t{序号}；单表路径仅用 sql/params）。 */
    private record BuiltUpdate(String key, String table, String sql, List<Object> params) {
    }

    /**
     * 执行数据更新节点：纯配置 UPDATE 动态表。
     * 表名/列名经元数据校验，值经参数绑定执行（防注入）。
     *
     * <p>统一多表形态（设计器唯一产出）：{@code updates} 存在且非空时——
     * <ul>
     *   <li>恰好 1 条：与存量单表更新完全等价（含输出 Integer 受影响行数），
     *       存量流迁移到 updates 形态后行为零变化；</li>
     *   <li>多条：各表单事务顺序执行、全有或全无，
     *       返回汇总 Map（见 {@link #executeDataUpdateMulti}）。</li>
     * </ul>
     * legacy 单表形态（{@code {table, setOps, where}} 顶层字段）仍接受，行为不变。
     * 返回值由 results 声明写入（未声明走隐式整体输出）。
     */
    private Object executeDataUpdate(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendDataUpdateConfig config = readConfig(node, BackendDataUpdateConfig.class);
        if (config == null) {
            throw new IllegalArgumentException("DATA_UPDATE 节点缺少 config: " + node.getId());
        }
        if (config.getUpdates() != null && !config.getUpdates().isEmpty()) {
            // 统一编辑器形态：updates 恰好 1 条 = 单表更新（输出与存量单表一致，迁移零回归）
            if (config.getUpdates().size() == 1) {
                return executeDataUpdateSingle(node, config.getUpdates().get(0), vars);
            }
            return executeDataUpdateMulti(node, config, vars);
        }
        // legacy 单表形态：顶层 {table, setOps, where}
        BackendDataUpdateConfig.TableUpdate single = new BackendDataUpdateConfig.TableUpdate();
        single.setTable(config.getTable());
        single.setSetOps(config.getSetOps());
        single.setWhere(config.getWhere());
        return executeDataUpdateSingle(node, single, vars);
    }

    /**
     * 单表 UPDATE（legacy 单表形态与 updates 单条目共用）：校验配置 → 编译 → 执行，
     * 返回受影响行数 Integer（存量输出契约不变）。
     */
    private Object executeDataUpdateSingle(LogicFlowDsl.NodeDef node,
                                           BackendDataUpdateConfig.TableUpdate single,
                                           Map<String, Object> vars) {
        if (isBlank(single.getTable())) {
            throw new IllegalArgumentException("DATA_UPDATE 节点缺少 table 配置: " + node.getId());
        }
        if (single.getSetOps() == null || single.getSetOps().isEmpty()) {
            throw new IllegalArgumentException("DATA_UPDATE 节点缺少 setOps 配置: " + node.getId());
        }
        if (jdbcTemplate == null || tableManager == null) {
            throw new IllegalStateException("引擎未装配数据更新能力(JdbcTemplate/DynamicTableManager): " + node.getId());
        }
        BuiltUpdate built = buildDataUpdate(node.getId(), single, vars);

        int affected = jdbcTemplate.update(built.sql(), built.params().toArray());
        if (log.isDebugEnabled()) {
            log.debug("DATA_UPDATE node '{}' -> {} rows: {}", node.getId(), affected, built.sql());
        }
        return affected;
    }

    /**
     * 多表更新（config.updates）：各表 UPDATE 逐条编译（表/列校验等配置类错误在任何语句
     * 执行前全部暴露）后，于单连接单事务内顺序执行——全成提交；任一失败整体回滚且节点抛错
     * （走 errorAction；多表数据一致性优先，需要逐表独立失败语义请拆多个 DATA_UPDATE 节点）。
     *
     * <p>返回汇总 Map（条目键 = 别名或 t{序号}）：
     * {@code { total, affected, t0|别名: {table, affected}, ... }}，
     * 未声明 results 时按隐式约定写入 {@code <节点id>}（下游如 du_x1.t0.affected、du_x1.order.affected）。
     */
    private Map<String, Object> executeDataUpdateMulti(LogicFlowDsl.NodeDef node,
                                                       BackendDataUpdateConfig config,
                                                       Map<String, Object> vars) {
        if (jdbcTemplate == null || tableManager == null) {
            throw new IllegalStateException("引擎未装配数据更新能力(JdbcTemplate/DynamicTableManager): " + node.getId());
        }
        List<BackendDataUpdateConfig.TableUpdate> updates = config.getUpdates();
        if (updates.size() > DATA_UPDATE_MAX_UPDATES) {
            throw new IllegalArgumentException("DATA_UPDATE 节点多表更新数超出上限("
                    + DATA_UPDATE_MAX_UPDATES + "): " + updates.size() + " (" + node.getId() + ")");
        }
        // 编译 + 键名冲突预检：全部配置错误在任何语句执行前暴露
        List<BuiltUpdate> built = new ArrayList<>(updates.size());
        Set<String> keys = new HashSet<>();
        for (int i = 0; i < updates.size(); i++) {
            BackendDataUpdateConfig.TableUpdate u = updates.get(i);
            String alias = u.getAlias() == null ? "" : u.getAlias().trim();
            if (!alias.isEmpty() && !alias.matches("\\w+")) {
                throw new IllegalArgumentException("DATA_UPDATE 节点多表更新别名非法（仅字母/数字/下划线）: "
                        + u.getAlias() + " (" + node.getId() + ")");
            }
            String key = alias.isEmpty() ? ("t" + i) : alias;
            if (!keys.add(key)) {
                throw new IllegalArgumentException(
                        "DATA_UPDATE 节点多表更新别名重复: " + key + " (" + node.getId() + ")");
            }
            BuiltUpdate b = buildDataUpdate(node.getId(), u, vars);
            built.add(new BuiltUpdate(key, b.table(), b.sql(), b.params()));
        }
        long begin = System.currentTimeMillis();
        return jdbcTemplate.execute((Connection con) -> runDataUpdateMulti(con, built, begin));
    }

    /**
     * 单连接单事务顺序执行多表 UPDATE：全成提交并返回汇总；任一失败回滚并抛出（节点失败走
     * errorAction）。汇总条目键 = 别名或 t{序号}，值为 {table, affected}。
     */
    private Map<String, Object> runDataUpdateMulti(Connection con, List<BuiltUpdate> built,
                                                   long begin) throws SQLException {
        boolean oldAuto = con.getAutoCommit();
        con.setAutoCommit(false);
        try {
            Map<String, Object> items = new LinkedHashMap<>();
            int total = 0;
            for (BuiltUpdate u : built) {
                int affected;
                try (PreparedStatement ps = con.prepareStatement(u.sql())) {
                    List<Object> params = u.params();
                    for (int i = 0; i < params.size(); i++) {
                        ps.setObject(i + 1, params.get(i));
                    }
                    affected = ps.executeUpdate();
                }
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("table", u.table());
                item.put("affected", affected);
                items.put(u.key(), item);
                total += affected;
            }
            con.commit();
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("total", built.size());
            summary.put("affected", total);
            summary.put("durationMs", System.currentTimeMillis() - begin);
            summary.putAll(items);
            if (log.isDebugEnabled()) {
                log.debug("DATA_UPDATE multi-table -> {} tables / {} rows: {}", built.size(), total, items);
            }
            return summary;
        } catch (SQLException | RuntimeException ex) {
            try {
                con.rollback();
            } catch (SQLException re) {
                ex.addSuppressed(re);
            }
            throw ex;
        } finally {
            con.setAutoCommit(oldAuto);
        }
    }

    /**
     * 编译单表 UPDATE（单表与多表形态共用）：表名/列名经元数据校验，值经参数绑定（防注入）。
     * 配置类错误（缺 table/setOps、表/列不存在、mode 非法、禁改列等）在执行前抛出。
     */
    private BuiltUpdate buildDataUpdate(String nodeId, BackendDataUpdateConfig.TableUpdate u,
                                        Map<String, Object> vars) {
        if (isBlank(u.getTable())) {
            throw new IllegalArgumentException("DATA_UPDATE 节点缺少 table 配置: " + nodeId);
        }
        if (u.getSetOps() == null || u.getSetOps().isEmpty()) {
            throw new IllegalArgumentException("DATA_UPDATE 节点缺少 setOps 配置: " + nodeId);
        }
        String table = u.getTable().trim();
        validateDataUpdateTable(table);
        Map<String, ColumnInfo> columns = columnsOf(table);

        StringBuilder sql = new StringBuilder("UPDATE ").append(table).append(" SET ");
        List<Object> params = new ArrayList<>();
        List<String> setParts = new ArrayList<>();
        for (BackendDataUpdateConfig.SetOp setOp : u.getSetOps()) {
            String column = requireColumn(columns, table, setOp.getColumn(), "SET");
            if (DATA_UPDATE_FORBIDDEN_COLUMN.equalsIgnoreCase(column)) {
                throw new IllegalArgumentException("DATA_UPDATE 节点禁止修改列 tenant_id: " + nodeId);
            }
            String mode = setOp.getMode() == null || setOp.getMode().isBlank()
                    ? BackendDataUpdateConfig.MODE_SET : setOp.getMode().trim().toUpperCase(Locale.ROOT);
            Object value = resolveDataUpdateValue(setOp.getValue(), vars);
            switch (mode) {
                case BackendDataUpdateConfig.MODE_SET -> setParts.add(column + " = ?");
                case BackendDataUpdateConfig.MODE_ADD -> {
                    setParts.add(column + " = " + column + " + ?");
                    value = requireNumeric(value, nodeId, column, "ADD");
                }
                case BackendDataUpdateConfig.MODE_SUB -> {
                    setParts.add(column + " = " + column + " - ?");
                    value = requireNumeric(value, nodeId, column, "SUB");
                }
                default -> throw new IllegalArgumentException(
                        "DATA_UPDATE 节点 setOp.mode 非法(须 SET/ADD/SUB): " + setOp.getMode());
            }
            params.add(value);
        }
        sql.append(String.join(", ", setParts));

        List<BackendDataUpdateConfig.WhereCond> where = u.getWhere() != null
                ? u.getWhere() : List.of();
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
                throw new IllegalArgumentException("DATA_UPDATE 节点 WHERE 条件为空: " + nodeId);
            }
            sql.append(String.join(" AND ", whereParts));
        }

        return new BuiltUpdate("", table, sql.toString(), params);
    }

    /** 表名校验：合法标识符 + 存在（目标表放开为全库表清单，表名经标识符校验后拼接，值一律参数绑定防注入）。 */
    private void validateDataUpdateTable(String table) {
        if (!table.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
            throw new IllegalArgumentException("DATA_UPDATE 表名非法: " + table);
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
    // 业务数据写入（DATA_UPSERT）节点：表单记录 upsert（INSERT ... ON DUPLICATE KEY UPDATE）
    // ------------------------------------------------------------------

    /**
     * 执行业务数据写入节点：面向已发布 BUSINESS 表单物理表 wf_biz_&lt;formKey&gt; 的记录级 upsert。
     *
     * <p>以 (tenant_id, conflictKey) 唯一索引（表单唯一字段发布产物）为冲突判定执行原子
     * {@code INSERT ... ON DUPLICATE KEY UPDATE}：冲突键命中 → 更新（version+1、updated_at 刷新，
     * 列值 = 插入镜像 VALUES(col)，onUpdate 额外覆盖）；未命中 → 新增（version=1、审计列自动填充）。
     * 单语句原子完成，无 check-then-act 竞态；值一律参数绑定防注入。
     *
     * <p>输出 Map：{@code { result: "created"|"updated"|"unchanged", affected, id, table }}——
     * MariaDB ODKU 受影响行数 1=新增 / 2=更新 / 0=无变化（updated_at 恒随更新子句刷新，
     * 命中已有行常规返回 2；0 为保留态，仅值全同且同毫秒写入才出现）；id 恒反查回填（新增=本次生成，
     * 更新/无变化=按冲突键参数化反查），下游零配置点路径取用。
     */
    private Object executeDataUpsert(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendDataUpsertConfig config = readConfig(node, BackendDataUpsertConfig.class);
        if (config == null) {
            throw new IllegalArgumentException("DATA_UPSERT 节点缺少 config: " + node.getId());
        }
        if (jdbcTemplate == null || tableManager == null) {
            throw new IllegalStateException("引擎未装配数据写入能力(JdbcTemplate/DynamicTableManager): " + node.getId());
        }
        if (tenantProvider == null) {
            throw new IllegalStateException("引擎未装配租户能力(TenantProvider): " + node.getId());
        }
        // 统一编辑器形态（upserts）：0 条 = legacy 单表；恰好 1 条 = 单表更新（输出与存量一致，迁移零回归）；
        // 多条 = 单事务顺序执行，全成提交、任一失败整体回滚（全有或全无）
        List<BackendDataUpsertConfig.TableUpsert> ups = config.getUpserts();
        if (ups != null && !ups.isEmpty()) {
            if (ups.size() == 1) {
                BackendDataUpsertConfig.TableUpsert u = ups.get(0);
                return executeBuiltUpsert(node.getId(), compileUpsertEntry(node.getId(),
                        u.getFormKey(), u.getConflictKey(), u.getValues(), u.getOnUpdate(), vars));
            }
            return executeDataUpsertMulti(node, ups, vars);
        }
        return executeBuiltUpsert(node.getId(), compileUpsertEntry(node.getId(), config.getFormKey(),
                config.getConflictKey(), config.getValues(), config.getOnUpdate(), vars));
    }

    /** DATA_UPSERT 单条目编译产物：ODKU SQL + 参数 + 冲突键上下文（单表/多表单复用）。 */
    private record BuiltUpsert(String table, String sql, List<Object> params,
                               String conflictCol, Object conflictValue, String id, String tenantId) {
    }

    /**
     * 编译单条目 DATA_UPSERT：formKey/冲突键/写入列全量校验（表存在、(tenant_id, conflictKey) 唯一索引、
     * 引擎管理列禁写、列不重复、values 须含冲突键）→ ODKU SQL（INSERT 镜像 + UPDATE 子句）。
     * 全部配置类错误在任何语句执行前暴露。
     */
    private BuiltUpsert compileUpsertEntry(String nodeId, String formKey, String conflictKey,
                                           List<BackendDataUpsertConfig.ValueOp> values,
                                           List<BackendDataUpsertConfig.ValueOp> onUpdate,
                                           Map<String, Object> vars) {
        String fk = formKey == null ? "" : formKey.trim();
        if (!fk.matches("[a-zA-Z0-9_]{1,64}")) {
            throw new IllegalArgumentException("DATA_UPSERT 节点 formKey 非法(仅字母/数字/下划线): "
                    + fk + " (" + nodeId + ")");
        }
        String table = "wf_biz_" + fk;
        if (!tableManager.tableExists(table)) {
            throw new IllegalArgumentException("DATA_UPSERT 目标表不存在(表单未发布或已下线): "
                    + table + " (" + nodeId + ")");
        }
        String ck = conflictKey == null ? "" : conflictKey.trim();
        if (ck.isEmpty()) {
            throw new IllegalArgumentException("DATA_UPSERT 节点缺少 conflictKey: " + nodeId);
        }
        Map<String, ColumnInfo> columns = columnsOf(table);
        String conflictCol = requireUpsertColumn(columns, table, ck, "conflictKey", nodeId);
        if (BackendDataUpsertConfig.MANAGED_COLUMNS.contains(conflictCol.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException("DATA_UPSERT 冲突键禁止使用引擎管理列: " + conflictCol
                    + " (" + nodeId + ")");
        }
        if (!hasTenantScopedUniqueIndex(table, conflictCol)) {
            throw new IllegalArgumentException("DATA_UPSERT 冲突键缺少 (tenant_id, " + conflictCol
                    + ") 唯一索引——请先在表单设计器将该字段标记为唯一并重新发布: " + table + " (" + nodeId + ")");
        }
        if (values == null || values.isEmpty()) {
            throw new IllegalArgumentException("DATA_UPSERT 节点缺少 values: " + nodeId);
        }
        if (values.size() > BackendDataUpsertConfig.MAX_VALUES) {
            throw new IllegalArgumentException("DATA_UPSERT 节点写入字段数超出上限("
                    + BackendDataUpsertConfig.MAX_VALUES + "): " + values.size() + " (" + nodeId + ")");
        }
        // 冲突键 + 写入列编译（canonical 列名统一为元数据原键，大小写不敏感）
        LinkedHashMap<String, Object> insertCols = new LinkedHashMap<>();
        Object conflictValue = null;
        for (BackendDataUpsertConfig.ValueOp op : values) {
            String col = requireUpsertColumn(columns, table, op.getColumn(), "values", nodeId);
            if (BackendDataUpsertConfig.MANAGED_COLUMNS.contains(col.toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("DATA_UPSERT 禁止写入引擎管理列: " + col + " (" + nodeId + ")");
            }
            if (insertCols.containsKey(col)) {
                throw new IllegalArgumentException("DATA_UPSERT 写入列重复: " + col + " (" + nodeId + ")");
            }
            Object resolved = resolveDataUpdateValue(op.getValue(), vars);
            insertCols.put(col, resolved);
            if (col.equalsIgnoreCase(conflictCol)) {
                conflictValue = resolved;
            }
        }
        if (conflictValue == null) {
            throw new IllegalArgumentException("DATA_UPSERT values 须包含冲突键列: "
                    + conflictCol + " (" + nodeId + ")");
        }
        if (String.valueOf(conflictValue).isBlank()) {
            throw new IllegalArgumentException("DATA_UPSERT 冲突键取值为空(无法判定存在性): "
                    + conflictCol + " (" + nodeId + ")");
        }
        LinkedHashMap<String, Object> updateOnlyCols = new LinkedHashMap<>();
        for (BackendDataUpsertConfig.ValueOp op : onUpdate != null
                ? onUpdate : List.<BackendDataUpsertConfig.ValueOp>of()) {
            String col = requireUpsertColumn(columns, table, op.getColumn(), "onUpdate", nodeId);
            if (BackendDataUpsertConfig.MANAGED_COLUMNS.contains(col.toLowerCase(Locale.ROOT))) {
                throw new IllegalArgumentException("DATA_UPSERT 禁止写入引擎管理列: " + col + " (" + nodeId + ")");
            }
            if (updateOnlyCols.containsKey(col)) {
                throw new IllegalArgumentException("DATA_UPSERT onUpdate 列重复: " + col + " (" + nodeId + ")");
            }
            updateOnlyCols.put(col, resolveDataUpdateValue(op.getValue(), vars));
        }

        // 编译 ODKU：INSERT 镜像 = 引擎管理列(id/tenant_id/version=1/created_by/审计时间戳) + values；
        // UPDATE 子句 = version+1、updated_at=NOW(3) + 全量 values 列 + onUpdate 仅追加列(col = ?)
        String id = UUID.randomUUID().toString().replace("-", "");
        String tenantId = tenantProvider.getTenantId();
        String createdBy = resolveUpsertOperator(vars);
        List<Object> params = new ArrayList<>();
        params.add(id);
        params.add(tenantId);
        params.add(createdBy);

        StringBuilder sql = new StringBuilder("INSERT INTO ").append(table).append(" (id, tenant_id, version, created_by, created_at, updated_at");
        for (String col : insertCols.keySet()) {
            sql.append(", ").append(col);
        }
        sql.append(") VALUES (?, ?, 1, ?, NOW(3), NOW(3)");
        for (int i = 0; i < insertCols.size(); i++) {
            sql.append(", ?");
        }
        sql.append(") ON DUPLICATE KEY UPDATE version = version + 1, updated_at = NOW(3)");
        for (Map.Entry<String, Object> entry : insertCols.entrySet()) {
            sql.append(", ").append(entry.getKey()).append(" = VALUES(").append(entry.getKey()).append(")");
            params.add(entry.getValue());
        }
        for (Map.Entry<String, Object> entry : updateOnlyCols.entrySet()) {
            if (insertCols.containsKey(entry.getKey())) {
                // values 已含该列：ODKU 子句已覆盖，无需重复（onUpdate 同列同值时为冗余配置，容忍）
                continue;
            }
            sql.append(", ").append(entry.getKey()).append(" = ?");
            params.add(entry.getValue());
        }
        return new BuiltUpsert(table, sql.toString(), params, conflictCol, conflictValue, id, tenantId);
    }

    /** 单条目执行（jdbc 直连路径）：ODKU 受影响行数 → result 派生 → id 回填，输出单表 Map。 */
    private Map<String, Object> executeBuiltUpsert(String nodeId, BuiltUpsert b) {
        int affected = jdbcTemplate.update(b.sql(), b.params().toArray());
        String result = affected == 1 ? "created" : affected == 2 ? "updated" : "unchanged";
        String rowId = affected == 1 ? b.id()
                : queryUpsertRowId(b.table(), b.conflictCol(), b.conflictValue(), b.tenantId());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("result", result);
        out.put("affected", affected);
        out.put("id", rowId);
        out.put("table", b.table());
        if (log.isDebugEnabled()) {
            log.debug("DATA_UPSERT node '{}' -> {} ({}) rows={} id={}", nodeId, result, b.table(), affected, rowId);
        }
        return out;
    }

    /**
     * 多表单写入：单连接单事务顺序执行，全成提交、任一失败整体回滚（全有或全无）。
     * 输出 {@code { total, created, updated, <别名|u{序号}>: {result, affected, id, table}, ... }}。
     */
    private Map<String, Object> executeDataUpsertMulti(LogicFlowDsl.NodeDef node,
                                                       List<BackendDataUpsertConfig.TableUpsert> ups,
                                                       Map<String, Object> vars) {
        if (ups.size() > BackendDataUpsertConfig.MAX_UPSERTS) {
            throw new IllegalArgumentException("DATA_UPSERT 节点多表单写入数超出上限("
                    + BackendDataUpsertConfig.MAX_UPSERTS + "): " + ups.size() + " (" + node.getId() + ")");
        }
        // 编译 + 键名冲突预检：全部配置错误在任何语句执行前暴露
        List<BuiltUpsert> built = new ArrayList<>(ups.size());
        List<String> keys = new ArrayList<>(ups.size());
        for (int i = 0; i < ups.size(); i++) {
            BackendDataUpsertConfig.TableUpsert u = ups.get(i);
            String alias = u.getAlias() == null ? "" : u.getAlias().trim();
            if (!alias.isEmpty() && !alias.matches("\\w+")) {
                throw new IllegalArgumentException("DATA_UPSERT 节点多表单写入别名非法（仅字母/数字/下划线）: "
                        + u.getAlias() + " (" + node.getId() + ")");
            }
            String key = alias.isEmpty() ? ("u" + i) : alias;
            if (keys.contains(key)) {
                throw new IllegalArgumentException("DATA_UPSERT 节点多表单写入别名重复: " + key
                        + " (" + node.getId() + ")");
            }
            keys.add(key);
            built.add(compileUpsertEntry(node.getId(), u.getFormKey(), u.getConflictKey(),
                    u.getValues(), u.getOnUpdate(), vars));
        }
        long begin = System.currentTimeMillis();
        return jdbcTemplate.execute((Connection con) -> runUpsertMulti(con, built, keys, begin));
    }

    /** 单连接单事务顺序执行多表单 ODKU；id 反查复用同连接（事务内一致性）。 */
    private Map<String, Object> runUpsertMulti(Connection con, List<BuiltUpsert> built,
                                               List<String> keys, long begin) throws SQLException {
        boolean oldAuto = con.getAutoCommit();
        con.setAutoCommit(false);
        try {
            Map<String, Object> items = new LinkedHashMap<>();
            int created = 0;
            int updated = 0;
            for (int idx = 0; idx < built.size(); idx++) {
                BuiltUpsert b = built.get(idx);
                int affected;
                try (PreparedStatement ps = con.prepareStatement(b.sql())) {
                    List<Object> params = b.params();
                    for (int i = 0; i < params.size(); i++) {
                        ps.setObject(i + 1, params.get(i));
                    }
                    affected = ps.executeUpdate();
                }
                String result = affected == 1 ? "created" : affected == 2 ? "updated" : "unchanged";
                if (affected == 1) {
                    created++;
                } else if (affected == 2) {
                    updated++;
                }
                String rowId = affected == 1 ? b.id()
                        : queryUpsertRowIdCon(con, b.table(), b.conflictCol(), b.conflictValue(), b.tenantId());
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("result", result);
                item.put("affected", affected);
                item.put("id", rowId);
                item.put("table", b.table());
                items.put(keys.get(idx), item);
            }
            con.commit();
            Map<String, Object> summary = new LinkedHashMap<>();
            summary.put("total", built.size());
            summary.put("created", created);
            summary.put("updated", updated);
            summary.putAll(items);
            if (log.isDebugEnabled()) {
                log.debug("DATA_UPSERT multi -> {} entries in {} ms", built.size(), System.currentTimeMillis() - begin);
            }
            return summary;
        } catch (SQLException | RuntimeException ex) {
            try {
                con.rollback();
            } catch (SQLException e) {
                log.warn("DATA_UPSERT multi rollback 失败", e);
            }
            throw ex;
        } finally {
            con.setAutoCommit(oldAuto);
        }
    }

    /** 冲突键反查记录 id（事务内同连接版本；查无返回 null）。 */
    private String queryUpsertRowIdCon(Connection con, String table, String conflictCol,
                                       Object conflictValue, String tenantId) throws SQLException {
        String sql = "SELECT id FROM " + table + " WHERE tenant_id = ? AND " + conflictCol + " = ? LIMIT 1";
        try (PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setObject(1, tenantId);
            ps.setObject(2, conflictValue);
            try (java.sql.ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getString(1) : null;
            }
        }
    }

    /** 列存在性校验（大小写不敏感），返回元数据原键列名（DATA_UPSERT 专用错误文案）。 */
    private String requireUpsertColumn(Map<String, ColumnInfo> columns, String table,
                                       String column, String clause, String nodeId) {
        if (column == null || column.isBlank()) {
            throw new IllegalArgumentException("DATA_UPSERT " + clause + " 列名为空: " + nodeId);
        }
        ColumnInfo info = columns.get(column.trim().toLowerCase(Locale.ROOT));
        if (info == null) {
            throw new IllegalArgumentException("DATA_UPSERT 目标表缺少列: " + table + "." + column.trim()
                    + " (" + nodeId + ")");
        }
        return info.getKey();
    }

    /**
     * 实查 (tenant_id, column) 二列唯一索引是否存在（information_schema.STATISTICS）：
     * NON_UNIQUE=0 且第 1 序位为 tenant_id、第 2 序位为目标列、索引总列数恰为 2。
     * 复合唯一索引首列才带 COLUMN_KEY=UNI，故不能复用 ColumnInfo.unique。
     */
    private boolean hasTenantScopedUniqueIndex(String table, String column) {
        String sql = """
                SELECT s1.INDEX_NAME
                FROM information_schema.STATISTICS s1
                JOIN information_schema.STATISTICS s2
                  ON s2.TABLE_SCHEMA = s1.TABLE_SCHEMA AND s2.TABLE_NAME = s1.TABLE_NAME
                 AND s2.INDEX_NAME = s1.INDEX_NAME
                WHERE s1.TABLE_SCHEMA = DATABASE() AND s1.TABLE_NAME = ? AND s1.NON_UNIQUE = 0
                  AND s1.SEQ_IN_INDEX = 1 AND s1.COLUMN_NAME = 'tenant_id'
                  AND s2.SEQ_IN_INDEX = 2 AND s2.COLUMN_NAME = ?
                  AND (SELECT COUNT(*) FROM information_schema.STATISTICS s3
                       WHERE s3.TABLE_SCHEMA = s1.TABLE_SCHEMA AND s3.TABLE_NAME = s1.TABLE_NAME
                         AND s3.INDEX_NAME = s1.INDEX_NAME) = 2
                LIMIT 1
                """;
        List<String> found = jdbcTemplate.query(sql, (rs, i) -> rs.getString(1), table, column);
        return !found.isEmpty();
    }

    /** 冲突键反查记录 id（参数绑定；更新/无变化路径回填，查无返回 null）。 */
    private String queryUpsertRowId(String table, String conflictCol, Object conflictValue, String tenantId) {
        String sql = "SELECT id FROM " + table + " WHERE tenant_id = ? AND " + conflictCol + " = ? LIMIT 1";
        List<String> ids = jdbcTemplate.query(sql, (rs, i) -> rs.getString(1), tenantId, conflictValue);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** created_by 取值：上下文 operator 变量（表单触发注入当前登录人），缺省 logicflow。 */
    private String resolveUpsertOperator(Map<String, Object> vars) {
        Object operator = vars.get("operator");
        String name = operator == null ? null : String.valueOf(operator).trim();
        return name == null || name.isEmpty() ? "logicflow" : name;
    }

    // ------------------------------------------------------------------
    // SQL 批处理（SQL_SCRIPT）节点
    // ------------------------------------------------------------------

    /** SQL_SCRIPT 单语句数上限（防超长脚本；与发布校验同值）。 */
    private static final int SQL_SCRIPT_MAX_STATEMENTS = SqlScriptSupport.MAX_STATEMENTS;

    /** SQL_SCRIPT 单语句超时（秒）。 */
    private static final int SQL_STATEMENT_TIMEOUT_SECONDS = 30;

    /** SQL_SCRIPT 查询行数缺省上限（可配 maxRows 覆盖，硬上限 1000）。 */
    private static final int SQL_DEFAULT_MAX_ROWS = 200;
    private static final int SQL_MAX_ROWS_HARD_CAP = 1000;

    /**
     * 执行 SQL 批处理节点：多条 SQL 按 {@code ;} 顺序执行（切分/编译见 {@link SqlScriptSupport}），
     * {{var.path}} 占位符编译为 JDBC ? 参数绑定（防注入）。返回执行汇总 Map 作为节点返回值
     * （未声明 results 时按隐式约定写入 {@code <节点id>}，如 sql_script_x1.s0.affected）。
     *
     * <p>config 形态：{@code {sql, onError?: abort(默认)|continue, maxRows?: 1~1000}}。
     *
     * <p>失败语义：abort（默认）——单事务（setAutoCommit=false），任一语句失败整体回滚，
     * 汇总标 aborted=true 且后续语句不再执行，节点<b>不抛错</b>（下游按 failed/aborted 变量分支）；
     * continue——自动提交逐条执行，失败记入 sN.error 继续。
     * 配置类错误（空 sql/语句超限/别名重复/类型白名单外/占位符语法）在任何语句执行前抛出（走 errorAction）。
     */
    private Object executeSqlScript(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        if (jdbcTemplate == null) {
            throw new IllegalStateException("引擎未装配 SQL 执行能力(JdbcTemplate): " + node.getId());
        }
        BackendSqlScriptConfig config = readConfig(node, BackendSqlScriptConfig.class);
        if (config == null || config.getSql() == null || config.getSql().isBlank()) {
            throw new IllegalArgumentException("SQL_SCRIPT 节点缺少 sql 配置: " + node.getId());
        }
        boolean abort = !BackendSqlScriptConfig.ON_ERROR_CONTINUE.equalsIgnoreCase(config.getOnError());
        int maxRows = config.getMaxRows() == null
                ? SQL_DEFAULT_MAX_ROWS
                : Math.max(1, Math.min(SQL_MAX_ROWS_HARD_CAP, config.getMaxRows()));

        List<String> statements = SqlScriptSupport.splitStatements(config.getSql());
        if (statements.isEmpty()) {
            throw new IllegalArgumentException("SQL_SCRIPT 节点 sql 未包含可执行语句: " + node.getId());
        }
        if (statements.size() > SQL_SCRIPT_MAX_STATEMENTS) {
            throw new IllegalArgumentException("SQL_SCRIPT 节点语句数超出上限("
                    + SQL_SCRIPT_MAX_STATEMENTS + "): " + statements.size() + " (" + node.getId() + ")");
        }
        // 编译 + 键名冲突预检：配置错误在任何语句执行前暴露（编译同时校验占位符语法与引号闭合）
        List<SqlScriptSupport.CompiledStatement> entries = new ArrayList<>(statements.size());
        Set<String> keys = new HashSet<>();
        for (int i = 0; i < statements.size(); i++) {
            String stmt = statements.get(i);
            String name = SqlScriptSupport.extractName(stmt);
            String key = (name != null && !name.isBlank()) ? name.trim() : ("s" + i);
            if (!keys.add(key)) {
                throw new IllegalArgumentException(
                        "SQL_SCRIPT 节点语句别名重复: " + key + " (" + node.getId() + ")");
            }
            SqlScriptSupport.Kind kind = SqlScriptSupport.kindOf(stmt);
            SqlScriptSupport.CompiledSql compiled = SqlScriptSupport.compile(stmt, vars, objectMapper);
            entries.add(new SqlScriptSupport.CompiledStatement(key, kind, stmt, compiled.jdbcSql(), compiled.params()));
        }
        long begin = System.currentTimeMillis();
        return jdbcTemplate.execute((Connection con) ->
                runSqlScript(con, entries, abort, maxRows, begin));
    }

    /**
     * 在单连接上顺序执行已编译语句并构建汇总（条目键=别名或 s{i}）：
     * QUERY → {data, rows, truncated?}；INSERT → {affected, insertKey?}；DML → {affected}；
     * 失败条目 → {ok:false, error}。abort 模式失败即回滚并终止。
     */
    private Map<String, Object> runSqlScript(Connection con, List<SqlScriptSupport.CompiledStatement> entries,
                                             boolean abort, int maxRows, long begin) throws SQLException {
        boolean oldAuto = con.getAutoCommit();
        if (abort) {
            con.setAutoCommit(false);
        }
        boolean aborted = false;
        int succeeded = 0;
        int failed = 0;
        Map<String, Object> items = new LinkedHashMap<>();
        try {
            for (int i = 0; i < entries.size(); i++) {
                SqlScriptSupport.CompiledStatement e = entries.get(i);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("index", i);
                item.put("kind", e.kind().name());
                try {
                    switch (e.kind()) {
                        case QUERY -> {
                            try (PreparedStatement ps = con.prepareStatement(e.jdbcSql())) {
                                ps.setQueryTimeout(SQL_STATEMENT_TIMEOUT_SECONDS);
                                SqlScriptSupport.bindParams(ps, e.params());
                                try (ResultSet rs = ps.executeQuery()) {
                                    SqlScriptSupport.QueryResult qr = SqlScriptSupport.extractRows(rs, maxRows);
                                    item.put("data", qr.rows());
                                    item.put("rows", qr.rows().size());
                                    if (qr.truncated()) {
                                        item.put("truncated", true);
                                    }
                                }
                            }
                        }
                        case INSERT -> {
                            try (PreparedStatement ps =
                                         con.prepareStatement(e.jdbcSql(), Statement.RETURN_GENERATED_KEYS)) {
                                ps.setQueryTimeout(SQL_STATEMENT_TIMEOUT_SECONDS);
                                SqlScriptSupport.bindParams(ps, e.params());
                                item.put("affected", ps.executeUpdate());
                                List<Object> keys = SqlScriptSupport.extractGeneratedKeys(ps);
                                if (!keys.isEmpty()) {
                                    item.put("insertKey", keys.get(0));
                                }
                            }
                        }
                        default -> {
                            try (PreparedStatement ps = con.prepareStatement(e.jdbcSql())) {
                                ps.setQueryTimeout(SQL_STATEMENT_TIMEOUT_SECONDS);
                                SqlScriptSupport.bindParams(ps, e.params());
                                item.put("affected", ps.executeUpdate());
                            }
                        }
                    }
                    item.put("ok", true);
                    succeeded++;
                } catch (Exception ex) {
                    String msg = ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName();
                    item.put("ok", false);
                    item.put("error", msg);
                    failed++;
                    if (abort) {
                        con.rollback();
                        aborted = true;
                    }
                }
                items.put(e.key(), item);
                if (aborted) {
                    break;
                }
            }
            if (abort && !aborted) {
                con.commit();
            }
        } finally {
            con.setAutoCommit(oldAuto);
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", entries.size());
        summary.put("succeeded", succeeded);
        summary.put("failed", failed);
        if (aborted) {
            summary.put("aborted", true);
        }
        summary.put("durationMs", System.currentTimeMillis() - begin);
        summary.putAll(items);
        return summary;
    }

    // ------------------------------------------------------------------
    // 数据查询（DATA_QUERY）/ 数据新增（DATA_INSERT）/ 数据删除（DATA_DELETE）
    // ------------------------------------------------------------------

    /**
     * 执行数据查询节点：按 formKey 复用 {@link BizDataSupport#queryGeneric}
     * （租户隔离内建：tenant_id 由上下文强制注入，动态表列白名单防注入）。
     *
     * <p>config：{@code { formKey, filter?: [{column, value}], keyword?, keywordColumn?, size? }}。
     * 输出 {@code { total, page, size, rows: [...] }}（rows 行 = {id, version, ...业务列}）。
     */
    private Object executeDataQuery(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        if (bizDataSupport == null) {
            throw new IllegalStateException("引擎未装配数据查询能力(BizDataSupport): " + node.getId());
        }
        BackendDataQueryConfig config = readConfig(node, BackendDataQueryConfig.class);
        if (config == null || isBlank(config.getFormKey())) {
            throw new IllegalArgumentException("DATA_QUERY 节点缺少 formKey 配置: " + node.getId());
        }
        BizDataQueryRequest req = new BizDataQueryRequest();
        Map<String, Object> filters = new LinkedHashMap<>();
        if (config.getFilter() != null) {
            for (BackendDataQueryConfig.DataFilter f : config.getFilter()) {
                if (f == null || isBlank(f.getColumn())) {
                    continue;
                }
                Object value = resolveDataUpdateValue(f.getValue(), vars);
                filters.put(f.getColumn().trim(), value);
            }
        }
        if (!filters.isEmpty()) {
            req.setFilter(writeJsonSafe(filters));
        }
        req.setKeyword(orNullToTrimmed(config.getKeyword()));
        req.setKeywordColumn(orNullToTrimmed(config.getKeywordColumn()));
        int size = config.getSize() == null || config.getSize() <= 0
                ? BackendDataQueryConfig.DEFAULT_SIZE
                : Math.min(config.getSize(), BackendDataQueryConfig.MAX_SIZE);
        req.setSize(size);

        BizDataPageVO page = bizDataSupport.queryGeneric(config.getFormKey().trim(), req);
        List<Object> rows = new ArrayList<>(page.getRecords() != null ? page.getRecords().size() : 0);
        if (page.getRecords() != null) {
            for (BizDataVO vo : page.getRecords()) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("id", vo.getId());
                if (vo.getVersion() != null) {
                    row.put("version", vo.getVersion());
                }
                if (vo.getData() != null) {
                    row.putAll(vo.getData());
                }
                rows.add(row);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("total", page.getTotal());
        out.put("page", page.getPage());
        out.put("size", page.getSize());
        out.put("rows", rows);
        return out;
    }

    /**
     * 执行数据新增节点：按 formKey 复用 {@link BizDataSupport#createGeneric}
     * （必填校验/JSON 列/日期归一/data-picker 冗余，租户隔离内建）。
     *
     * <p>config：{@code { formKey, data: [{column, value}] }}，value 支持 {@code {{var}}} 取上下文。
     * 输出新行对象 {@code { id, version, data: {...} }}。
     */
    private Object executeDataInsert(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        if (bizDataSupport == null) {
            throw new IllegalStateException("引擎未装配数据新增能力(BizDataSupport): " + node.getId());
        }
        BackendDataInsertConfig config = readConfig(node, BackendDataInsertConfig.class);
        if (config == null || isBlank(config.getFormKey())) {
            throw new IllegalArgumentException("DATA_INSERT 节点缺少 formKey 配置: " + node.getId());
        }
        if (config.getData() == null || config.getData().isEmpty()) {
            throw new IllegalArgumentException("DATA_INSERT 节点缺少 data 配置: " + node.getId());
        }
        Map<String, Object> data = new LinkedHashMap<>();
        for (BackendDataInsertConfig.DataField field : config.getData()) {
            if (field == null || isBlank(field.getColumn())) {
                continue;
            }
            data.put(field.getColumn().trim(), resolveDataUpdateValue(field.getValue(), vars));
        }
        if (data.isEmpty()) {
            throw new IllegalArgumentException("DATA_INSERT 节点 data 无有效列值对: " + node.getId());
        }
        BizDataVO created = bizDataSupport.createGeneric(config.getFormKey().trim(), data);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", created.getId());
        if (created.getVersion() != null) {
            out.put("version", created.getVersion());
        }
        out.put("data", created.getData() != null ? created.getData() : Map.of());
        return out;
    }

    /**
     * 执行数据删除节点。两种形态（id 优先）：
     * <ul>
     *   <li>按 id：{@code { formKey, id }} → {@link BizDataSupport#deleteGeneric}（级联子表，行不存在报错）；</li>
     *   <li>按条件：{@code { formKey, filter: [{column, op, value}] }} → 纯配置 DELETE，
     *       列经业务列白名单校验，<b>自动追加 tenant_id = 当前租户</b>（跨租户误删防护），至少一个条件。</li>
     * </ul>
     * 输出 {@code { deleted: N, mode: "id"|"filter" }}。
     */
    private Object executeDataDelete(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendDataDeleteConfig config = readConfig(node, BackendDataDeleteConfig.class);
        if (config == null || isBlank(config.getFormKey())) {
            throw new IllegalArgumentException("DATA_DELETE 节点缺少 formKey 配置: " + node.getId());
        }
        if (bizDataSupport == null || jdbcTemplate == null || tenantProvider == null) {
            throw new IllegalStateException("引擎未装配数据删除能力(BizDataSupport/JdbcTemplate/TenantProvider): " + node.getId());
        }
        String formKey = config.getFormKey().trim();
        Object resolvedId = config.getId() == null ? null : resolveDataUpdateValue(config.getId(), vars);
        String id = resolvedId == null ? null : String.valueOf(resolvedId);
        if (id != null && !id.isBlank()) {
            bizDataSupport.deleteGeneric(formKey, id.toString());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("deleted", 1);
            out.put("mode", "id");
            return out;
        }
        List<BackendDataDeleteConfig.DeleteCond> filter = config.getFilter();
        if (filter == null || filter.isEmpty()) {
            throw new IllegalArgumentException(
                    "DATA_DELETE 节点须提供 id 或至少一个 filter 条件（防全表删除）: " + node.getId());
        }
        var ctx = bizDataSupport.loadContext(formKey);
        Set<String> allowed = new HashSet<>(ctx.columnKeys());
        allowed.add("id");
        allowed.add("version");
        allowed.add("tenant_id");
        StringBuilder sql = new StringBuilder("DELETE FROM ").append(ctx.tableName()).append(" WHERE ");
        List<Object> params = new ArrayList<>();
        List<String> parts = new ArrayList<>();
        for (BackendDataDeleteConfig.DeleteCond cond : filter) {
            if (cond == null || isBlank(cond.getColumn())) {
                continue;
            }
            String column = cond.getColumn().trim();
            if (!allowed.contains(column)) {
                throw new IllegalArgumentException("DATA_DELETE 目标表缺少列: " + ctx.tableName() + "." + column);
            }
            String op = cond.getOp() == null ? "EQ" : cond.getOp().trim().toUpperCase(Locale.ROOT);
            switch (op) {
                case "IS_NULL" -> parts.add(column + " IS NULL");
                case "NOT_NULL" -> parts.add(column + " IS NOT NULL");
                case "EQ", "NE", "GT", "GTE", "LT", "LTE" -> {
                    String symbol = switch (op) {
                        case "NE" -> "<>";
                        case "GT" -> ">";
                        case "GTE" -> ">=";
                        case "LT" -> "<";
                        case "LTE" -> "<=";
                        default -> "=";
                    };
                    parts.add(column + " " + symbol + " ?");
                    params.add(resolveDataUpdateValue(cond.getValue(), vars));
                }
                default -> throw new IllegalArgumentException(
                        "DATA_DELETE 节点 filter.op 非法(须 EQ/NE/GT/GTE/LT/LTE/IS_NULL/NOT_NULL): " + cond.getOp());
            }
        }
        if (parts.isEmpty()) {
            throw new IllegalArgumentException("DATA_DELETE 节点 filter 无有效条件: " + node.getId());
        }
        // 租户强制过滤（跨租户误删防护；条件形态专有）
        parts.add("tenant_id = ?");
        params.add(tenantProvider.getTenantId());
        sql.append(String.join(" AND ", parts));
        int deleted = jdbcTemplate.update(sql.toString(), params.toArray());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deleted", deleted);
        out.put("mode", "filter");
        return out;
    }

    // ------------------------------------------------------------------
    // 消息通知（NOTIFY）/ 延时（DELAY）/ 数据映射（TRANSFORM）/ 聚合（AGGREGATE）/ LLM
    // ------------------------------------------------------------------

    /**
     * 执行消息通知节点：复用 {@link MessageSender#sendByTemplate}（模板加载/必填变量校验/渲染/投递）。
     * config：{@code { templateCode, recipientIds: [{{var}}|数值串], variables: [{name,value}],
     * messageType?: PRIVATE(默认)|PUBLIC|SYSTEM, channels?: [IN_APP(默认)|SMS] }}。
     * 输出 {@code { sent: true, templateCode, recipients: N, channels: [...] }}。
     */
    private Object executeNotify(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        if (messageSender == null) {
            throw new IllegalStateException("引擎未装配消息通知能力(MessageSender): " + node.getId());
        }
        BackendNotifyConfig config = readConfig(node, BackendNotifyConfig.class);
        if (config == null || isBlank(config.getTemplateCode())) {
            throw new IllegalArgumentException("NOTIFY 节点缺少 templateCode 配置: " + node.getId());
        }
        if (config.getRecipientIds() == null || config.getRecipientIds().isEmpty()) {
            throw new IllegalArgumentException("NOTIFY 节点缺少 recipientIds 配置: " + node.getId());
        }
        if (config.getRecipientIds().size() > BackendNotifyConfig.MAX_RECIPIENTS) {
            throw new IllegalArgumentException("NOTIFY 节点接收人数超出上限("
                    + BackendNotifyConfig.MAX_RECIPIENTS + "): " + config.getRecipientIds().size());
        }
        List<Long> recipients = new ArrayList<>(config.getRecipientIds().size());
        for (String raw : config.getRecipientIds()) {
            Object value = resolveDataUpdateValue(raw, vars);
            if (value == null) {
                continue;
            }
            try {
                recipients.add(Long.parseLong(String.valueOf(value).trim()));
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("NOTIFY 节点接收人 ID 须为数字（解析失败）: " + raw);
            }
        }
        if (recipients.isEmpty()) {
            throw new IllegalArgumentException("NOTIFY 节点无有效接收人: " + node.getId());
        }
        Map<String, Object> variables = new LinkedHashMap<>();
        if (config.getVariables() != null) {
            for (BackendNotifyConfig.VarPair pair : config.getVariables()) {
                if (pair == null || isBlank(pair.getName())) {
                    continue;
                }
                variables.put(pair.getName().trim(), resolveDataUpdateValue(pair.getValue(), vars));
            }
        }
        MessageType messageType;
        try {
            messageType = MessageType.valueOf(orDefault(config.getMessageType(), BackendNotifyConfig.TYPE_PRIVATE)
                    .trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("NOTIFY 节点 messageType 非法(须 PRIVATE/PUBLIC/SYSTEM): "
                    + config.getMessageType());
        }
        List<ChannelType> channels = new ArrayList<>();
        if (config.getChannels() != null) {
            for (String raw : config.getChannels()) {
                if (isBlank(raw)) {
                    continue;
                }
                try {
                    channels.add(ChannelType.valueOf(raw.trim().toUpperCase(Locale.ROOT)));
                } catch (IllegalArgumentException e) {
                    throw new IllegalArgumentException("NOTIFY 节点渠道非法(须 IN_APP/SMS): " + raw);
                }
            }
        }
        if (channels.isEmpty()) {
            channels.add(ChannelType.IN_APP);
        }
        messageSender.sendByTemplate(null, config.getTemplateCode().trim(), variables,
                messageType, recipients, channels);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("sent", true);
        out.put("templateCode", config.getTemplateCode().trim());
        out.put("recipients", recipients.size());
        out.put("channels", channels.stream().map(Enum::name).toList());
        return out;
    }

    /**
     * 执行延时节点：同步等待（逻辑流运行在请求线程，上限 60000ms 防拖垮吞吐）。
     * 输出 {@code { waitedMs: N }}。
     */
    private Object executeDelay(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendDelayConfig config = readConfig(node, BackendDelayConfig.class);
        int duration = config == null || config.getDurationMs() == null ? 0 : config.getDurationMs();
        if (duration < BackendDelayConfig.MIN_MS || duration > BackendDelayConfig.MAX_MS) {
            throw new IllegalArgumentException("DELAY 节点 durationMs 须在 "
                    + BackendDelayConfig.MIN_MS + "~" + BackendDelayConfig.MAX_MS + " 之间: " + duration);
        }
        long begin = System.currentTimeMillis();
        try {
            Thread.sleep(duration);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("DELAY 节点等待被中断: " + node.getId());
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("waitedMs", System.currentTimeMillis() - begin);
        return out;
    }

    /**
     * 执行数据映射节点：JSON 模板 {@code {{var.path}}} 两段式编译——
     * ① 值位占位符（独占 JSON 值位置）注入变量原始值（类型保留，缺失注入 null）；
     * ② 字符串内占位符 toString 插值（缺失空串）；产物须为合法 JSON（对象/数组）。
     */
    private Object executeTransform(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendTransformConfig config = readConfig(node, BackendTransformConfig.class);
        if (config == null || isBlank(config.getTemplate())) {
            throw new IllegalArgumentException("TRANSFORM 节点缺少 template 配置: " + node.getId());
        }
        String compiled = compileTransformTemplate(config.getTemplate(), vars);
        try {
            JsonNode tree = objectMapper.readTree(compiled);
            if (tree == null || (!tree.isObject() && !tree.isArray())) {
                throw new IllegalArgumentException("TRANSFORM 模板编译产物须为 JSON 对象或数组");
            }
            return objectMapper.convertValue(tree, Object.class);
        } catch (IllegalArgumentException e) {
            throw e;
        } catch (Exception e) {
            throw new IllegalArgumentException("TRANSFORM 模板编译产物不是合法 JSON: " + e.getMessage());
        }
    }

    /**
     * TRANSFORM 模板编译：先替换值位占位符（`: {{path}}` → `: <原始值 JSON>`，类型保留），
     * 再对字符串字面量内的剩余占位符做 toString 插值（缺失空串）。
     * 注意：第二步不走 resolveDataUpdateValue（它会把整段折叠成 String 丢掉已注入值的类型）。
     */
    private String compileTransformTemplate(String template, Map<String, Object> vars) {
        java.util.regex.Pattern valuePos = java.util.regex.Pattern
                .compile(":\\s*\\{\\{\\s*([\\w]+(?:\\.[\\w]+)*)\\s*}}");
        java.util.regex.Matcher matcher = valuePos.matcher(template);
        StringBuilder sb = new StringBuilder();
        int last = 0;
        while (matcher.find()) {
            sb.append(template, last, matcher.start()).append(": ");
            Object value = resolvePath(matcher.group(1), vars);
            sb.append(writeJsonSafe(value));
            last = matcher.end();
        }
        sb.append(template.substring(last));
        String withValues = sb.toString();
        // 字符串字面量内占位符插值（toString，缺失空串）；值位已在上一步处理
        java.util.regex.Matcher inline = java.util.regex.Pattern
                .compile("\\{\\{\\s*([\\w]+(?:\\.[\\w]+)*)\\s*}}").matcher(withValues);
        StringBuilder out = new StringBuilder();
        last = 0;
        while (inline.find()) {
            Object value = resolvePath(inline.group(1), vars);
            out.append(withValues, last, inline.start()).append(value != null ? value : "");
            last = inline.end();
        }
        out.append(withValues.substring(last));
        return out.toString();
    }

    /**
     * 执行聚合节点：集合元素须为 Map（或可转换），对 field 做 SUM/AVG/COUNT/MIN/MAX，
     * 可按 groupBy 分组。输出汇总 Map（无分组）或分组列表（有分组）。
     */
    private Object executeAggregate(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        BackendAggregateConfig config = readConfig(node, BackendAggregateConfig.class);
        if (config == null || isBlank(config.getCollection())) {
            throw new IllegalArgumentException("AGGREGATE 节点缺少 collection 配置: " + node.getId());
        }
        List<String> ops = config.getOps() == null ? List.of()
                : config.getOps().stream().filter(o -> !isBlank(o)).map(String::trim).toList();
        if (ops.isEmpty()) {
            throw new IllegalArgumentException("AGGREGATE 节点缺少 ops 配置: " + node.getId());
        }
        for (String op : ops) {
            if (!Set.of(BackendAggregateConfig.OP_SUM, BackendAggregateConfig.OP_AVG,
                    BackendAggregateConfig.OP_COUNT, BackendAggregateConfig.OP_MIN,
                    BackendAggregateConfig.OP_MAX).contains(op.toUpperCase(Locale.ROOT))) {
                throw new IllegalArgumentException("AGGREGATE 节点 ops 非法(须 SUM/AVG/COUNT/MIN/MAX): " + op);
            }
        }
        boolean countOnly = ops.size() == 1
                && BackendAggregateConfig.OP_COUNT.equalsIgnoreCase(ops.get(0));
        if (!countOnly && isBlank(config.getField())) {
            throw new IllegalArgumentException("AGGREGATE 节点缺少 field 配置（纯 COUNT 可省）: " + node.getId());
        }
        List<Object> items = resolveCollectionOrPath(config.getCollection(), vars, node.getId());
        String field = config.getField() == null ? null : config.getField().trim();
        String groupBy = isBlank(config.getGroupBy()) ? null : config.getGroupBy().trim();

        if (groupBy == null) {
            return aggregateGroup(items, field, ops, null);
        }
        // 分组聚合：按 groupBy 值分组后逐组聚合，输出按分组键排序
        Map<String, List<Object>> groups = new TreeMap<>();
        for (Object item : items) {
            Map<?, ?> map = toMapOrNull(item, node.getId());
            if (map == null) {
                continue;
            }
            Object key = map.get(groupBy);
            groups.computeIfAbsent(key == null ? "" : String.valueOf(key), k -> new ArrayList<>()).add(item);
        }
        List<Object> out = new ArrayList<>(groups.size());
        for (Map.Entry<String, List<Object>> e : groups.entrySet()) {
            Map<String, Object> row = aggregateGroup(e.getValue(), field, ops, e.getKey());
            out.add(row);
        }
        return out;
    }

    /** 单组聚合计算：count 恒输出；其余按 ops 输出（数值经 BigDecimal 精确计算）。 */
    private Map<String, Object> aggregateGroup(List<Object> items, String field,
                                               List<String> ops, String groupKey) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (groupKey != null) {
            out.put("group", groupKey);
        }
        out.put("count", items.size());
        boolean needValues = ops.stream().anyMatch(o -> !BackendAggregateConfig.OP_COUNT.equalsIgnoreCase(o));
        List<BigDecimal> values = new ArrayList<>(items.size());
        if (needValues) {
            for (Object item : items) {
                Map<?, ?> map = toMapOrNull(item, null);
                Object raw = map == null ? null : map.get(field);
                if (raw instanceof Number number) {
                    values.add(new BigDecimal(number.toString()));
                } else if (raw != null && !String.valueOf(raw).isBlank()) {
                    try {
                        values.add(new BigDecimal(String.valueOf(raw).trim()));
                    } catch (NumberFormatException e) {
                        throw new IllegalArgumentException(
                                "AGGREGATE 聚合字段值须为数字: " + field + "=" + raw);
                    }
                }
            }
        }
        for (String op : ops) {
            switch (op.toUpperCase(Locale.ROOT)) {
                case BackendAggregateConfig.OP_SUM -> out.put("sum", values.stream()
                        .reduce(BigDecimal.ZERO, BigDecimal::add).doubleValue());
                case BackendAggregateConfig.OP_AVG -> out.put("avg", values.isEmpty() ? 0.0
                        : values.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                        .divide(BigDecimal.valueOf(values.size()), java.math.MathContext.DECIMAL64)
                        .doubleValue());
                case BackendAggregateConfig.OP_MIN -> out.put("min", values.isEmpty() ? null
                        : values.stream().min(BigDecimal::compareTo).orElseThrow().doubleValue());
                case BackendAggregateConfig.OP_MAX -> out.put("max", values.isEmpty() ? null
                        : values.stream().max(BigDecimal::compareTo).orElseThrow().doubleValue());
                default -> {
                    // COUNT 已在头部输出
                }
            }
        }
        return out;
    }

    /** 元素 → Map（Map 直通；其余 null；strict 时非 Map 抛错）。 */
    private Map<?, ?> toMapOrNull(Object item, String nodeId) {
        if (item instanceof Map<?, ?> map) {
            return map;
        }
        if (nodeId != null) {
            throw new IllegalArgumentException(
                    "AGGREGATE 集合元素须为对象（Map）：节点 " + nodeId + " 收到 " + item.getClass().getSimpleName());
        }
        return null;
    }

    /**
     * 执行 LLM 节点：平台内置模型（{@link ChatModel#complete}），prompt/system 支持 {@code {{var}}} 插值。
     * 输出 {@code { content }}。
     */
    private Object executeLlm(LogicFlowDsl.NodeDef node, Map<String, Object> vars) {
        if (chatModel == null) {
            throw new IllegalStateException("引擎未装配大模型能力(ChatModel): " + node.getId());
        }
        BackendLlmConfig config = readConfig(node, BackendLlmConfig.class);
        if (config == null || isBlank(config.getPrompt())) {
            throw new IllegalArgumentException("LLM 节点缺少 prompt 配置: " + node.getId());
        }
        Double temperature = config.getTemperature();
        if (temperature != null && (temperature < 0 || temperature > 2)) {
            throw new IllegalArgumentException("LLM 节点 temperature 须在 0~2 之间: " + temperature);
        }
        String prompt = String.valueOf(resolveDataUpdateValue(config.getPrompt(), vars));
        List<ChatMessage> messages = new ArrayList<>(2);
        if (!isBlank(config.getSystem())) {
            messages.add(ChatMessage.system(
                    String.valueOf(resolveDataUpdateValue(config.getSystem(), vars))));
        }
        messages.add(ChatMessage.user(prompt));
        ChatOptions options = temperature == null
                ? ChatOptions.defaults()
                : new ChatOptions(temperature, null, false, null, null);
        String content = chatModel.complete(messages, options);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("content", content);
        return out;
    }

    /** null→null；非空白→trim。 */
    private String orNullToTrimmed(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** 对象 → JSON 字符串（失败回退 "{}"，防止单点序列化异常中断流程）。 */
    private String writeJsonSafe(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            log.warn("Logic flow JSON serialize failed, fallback '{}': {}", value,
                    e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName());
            return "{}";
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
     * 子流程自身轨迹不并入父轨迹；节点 result = 子流程 outputVars（由 results 声明写入）。
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

    /** 批处理循环体允许的节点类型（业务执行多型 + SQL_SCRIPT + 数据/通知/转换/聚合/LLM + BATCH 嵌套；DELAY 阻塞型不可入循环体）。 */
    private static final Set<NodeType> BATCH_BODY_ALLOWED = EnumSet.of(
            NodeType.HTTP, NodeType.BEAN, NodeType.SCRIPT, NodeType.DATA_UPDATE, NodeType.DATA_UPSERT, NodeType.SUBFLOW,
            NodeType.SQL_SCRIPT, NodeType.BATCH,
            NodeType.DATA_QUERY, NodeType.DATA_INSERT, NodeType.DATA_DELETE, NodeType.NOTIFY,
            NodeType.TRANSFORM, NodeType.AGGREGATE, NodeType.LLM);

    /** BATCH 嵌套深度运行时上限（发布校验限 3 层，此处纵深防御防绕过校验的自引用 DSL） */
    private static final int MAX_BATCH_NESTING_DEPTH = 5;
    private static final ThreadLocal<Integer> BATCH_DEPTH = ThreadLocal.withInitial(() -> 0);

    /** 批处理汇总（节点返回值，由 results 声明写入 / 节点轨迹 result）；chunkSize/brokenAt 为 P1 增强可选字段。 */
    record BatchSummary(int total, int succeeded, int failed, boolean truncated,
                        List<Object> results, List<Map<String, Object>> errors,
                        Integer chunkSize, Integer brokenAt) {

        /** 兼容旧字段序构造（chunkSize/brokenAt 均空）。 */
        BatchSummary(int total, int succeeded, int failed, boolean truncated,
                     List<Object> results, List<Map<String, Object>> errors) {
            this(total, succeeded, failed, truncated, results, errors, null, null);
        }
    }

    /**
     * 执行批处理节点：解析集合 → 逐项执行循环体链（或 legacy 单动作）→ 聚合结果列表。
     *
     * <p>config 形态（body 模式，推荐）：{@code {collection, itemVar="item", indexVar="index",
     * body:[{id?, type, name?, config, results?, errorAction?}...], stopOnError=true, maxItems=100}}。
     * legacy 模式（无 body）：{@code {actionType: HTTP|SCRIPT|BEAN, actionConfig:{...}}}。
     *
     * <p>语义：每项在「主变量上下文的副本」中执行（itemVar/indexVar 注入），
     * 循环体链按序逐节点执行，节点输出由 results 声明写入副本，迭代后副本并回主上下文
     * （后写胜出，脚本副作用跨项保留）；聚合结果作为节点返回值由 results 声明写入
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
        // P1 增强：chunk 分批 / interval 节流 / breakWhen 提前跳出
        int chunkSize = normalizeBounded(config.get("chunkSize"), 1, 1, 100);
        long intervalMs = normalizeBounded(config.get("intervalMs"), 0, 0, 5000);
        JsonNode breakWhen = config.get("breakWhen");
        boolean breakEnabled = breakWhen != null && breakWhen.isObject()
                && textOrNull(breakWhen, "variable") != null && !textOrNull(breakWhen, "variable").isBlank();
        if (body.isEmpty() && (textOrNull(config, "actionType") == null || textOrNull(config, "actionType").isBlank())) {
            throw new IllegalArgumentException(
                    "BATCH 节点缺少循环体(body)或 legacy actionType 配置: " + node.getId());
        }

        List<Object> items = resolveCollection(collectionExpr, vars);
        // chunk 分批：集合按 chunkSize 切片，每批 List 整体作为迭代项（itemVar = 批次列表）
        boolean chunked = chunkSize > 1;
        if (chunked) {
            List<Object> chunks = new ArrayList<>((items.size() + chunkSize - 1) / chunkSize);
            for (int i = 0; i < items.size(); i += chunkSize) {
                chunks.add(new ArrayList<>(items.subList(i, Math.min(i + chunkSize, items.size()))));
            }
            items = chunks;
        }
        boolean truncated = items.size() > maxItems;
        if (truncated) {
            items = items.subList(0, maxItems);
        }

        List<Object> results = new ArrayList<>(items.size());
        List<Map<String, Object>> errors = new ArrayList<>();
        int succeeded = 0;
        int failed = 0;
        Integer brokenAt = null;
        for (int i = 0; i < items.size(); i++) {
            Object item = items.get(i);
            Map<String, Object> childVars = new LinkedHashMap<>(vars);
            childVars.put(itemVar, item);
            childVars.put(indexVar, i);
            // breakWhen：每项循环体执行前评估，true → 提前跳出（已处理项保留）
            if (breakEnabled && evaluateBreakWhen(breakWhen, childVars, node.getId())) {
                brokenAt = i;
                break;
            }
            if (intervalMs > 0 && i > 0) {
                try {
                    Thread.sleep(intervalMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    throw new IllegalStateException("BATCH 节点迭代间隔被中断: " + node.getId());
                }
            }
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
                traceResults, errors, chunked ? chunkSize : null, brokenAt);
    }

    /** breakWhen 条件评估：复用 ConditionEvaluator（变量/算子/值语义与 CONDITION 一致）；评估异常视为 false（不阻断迭代，容错优先）。 */
    private boolean evaluateBreakWhen(JsonNode breakWhen, Map<String, Object> childVars, String nodeId) {
        try {
            return ConditionEvaluator.evaluate(textOrNull(breakWhen, "variable"),
                    textOrNull(breakWhen, "operator"), textOrNull(breakWhen, "value"),
                    childVars, variableResolver);
        } catch (Exception e) {
            log.debug("BATCH node '{}' breakWhen evaluate failed, treat as false: {}", nodeId, e.getMessage());
            return false;
        }
    }

    /** 有界整数归一化：null/非法回退默认，钳位 [min, max]。 */
    private int normalizeBounded(JsonNode raw, int fallback, int min, int max) {
        int value = raw == null || raw.isNull() ? fallback : raw.asInt(fallback);
        return Math.max(min, Math.min(value, max));
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
        inner.setResults(step.getResults());
        inner.setErrorAction(step.getErrorAction());
        boolean traceable = iteration < BATCH_BODY_TRACE_ITERATIONS;
        long begin = System.currentTimeMillis();
        try {
            Object result = dispatch(inner, childVars, traces);
            // 统一结果写回：results 声明驱动（SCRIPT 严格 / 其余宽松；无声明则隐式整体输出为 <步骤id>）
            writeResults(inner, result, childVars);
            if (traceable && traces != null) {
                traces.add(new NodeTrace(stepId, inner.getName(), inner.getType().name(),
                        TRACE_SUCCESS, result, null, System.currentTimeMillis() - begin));
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
     * 每项须为对象且 type ∈ HTTP/BEAN/SCRIPT/DATA_UPDATE/SUBFLOW/SQL_SCRIPT/BATCH，否则抛 IllegalArgumentException。
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
            step.setResults(parseResultsList(entry.get("results")));
            step.setErrorAction(textOrNull(entry, "errorAction"));
            steps.add(step);
        }
        return steps;
    }

    /** results 数组 → ResultVarDef 列表（null/空安全；忽略无名行）。 */
    private List<LogicFlowDsl.ResultVarDef> parseResultsList(JsonNode resultsNode) {
        if (resultsNode == null || !resultsNode.isArray() || resultsNode.isEmpty()) {
            return null;
        }
        List<LogicFlowDsl.ResultVarDef> results = new ArrayList<>();
        for (JsonNode item : resultsNode) {
            LogicFlowDsl.ResultVarDef def = objectMapper.convertValue(item, LogicFlowDsl.ResultVarDef.class);
            if (def != null && def.getName() != null && !def.getName().isBlank()) {
                results.add(def);
            }
        }
        return results.isEmpty() ? null : results;
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

    /**
     * 集合解析（AGGREGATE 专用）：支持 {{var}} 与 {{var.sub.path}} 点路径直接取上下文集合
     * （保留元素原始类型）；其余形态回退 {@link #resolveCollection}（JSON 数组字面量等）。
     */
    @SuppressWarnings("unchecked")
    private List<Object> resolveCollectionOrPath(String expression, Map<String, Object> vars, String nodeId) {
        String trimmed = expression == null ? "" : expression.trim();
        java.util.regex.Matcher direct = java.util.regex.Pattern
                .compile("^\\{\\{\\s*([\\w]+(?:\\.[\\w]+)*)\\s*}}$").matcher(trimmed);
        if (direct.matches()) {
            Object value = resolvePath(direct.group(1), vars);
            if (value == null) {
                throw new IllegalArgumentException("AGGREGATE 集合变量不存在或为 null: " + direct.group(1)
                        + " (节点 " + nodeId + ")");
            }
            return toItemList(value, direct.group(1));
        }
        return resolveCollection(expression, vars);
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

    /** 非 CONDITION 节点的后继：取首条<b>非 error</b>出边（error 边仅失败路由使用）；缺出边/边引用缺失节点 → FAILED（经 FlowAbortedException 收敛）。 */
    private LogicFlowDsl.NodeDef requireNext(Map<String, LogicFlowDsl.NodeDef> nodeById,
                                             Map<String, List<LogicFlowDsl.EdgeDef>> outEdges,
                                             String nodeId) {
        List<LogicFlowDsl.EdgeDef> edges = outEdges.get(nodeId);
        if (edges != null) {
            for (LogicFlowDsl.EdgeDef edge : edges) {
                if (BRANCH_ERROR.equalsIgnoreCase(edge.getBranch() == null ? "" : edge.getBranch().trim())) {
                    continue; // 错误分支边不参与成功路径
                }
                String target = edge.getTarget();
                LogicFlowDsl.NodeDef next = target != null ? nodeById.get(target) : null;
                if (next == null) {
                    throw new FlowAbortedException("边引用不存在的节点: " + target);
                }
                return next;
            }
        }
        throw new FlowAbortedException("节点无出边: " + nodeId);
    }

    /**
     * 失败路由：取该节点 branch=error 的出边目标（至多一条；取首条）。
     * 无 error 出边返回 null（调用方回落 errorAction 全局策略）。
     */
    private LogicFlowDsl.NodeDef resolveErrorTarget(LogicFlowDsl.NodeDef node,
                                                    Map<String, LogicFlowDsl.NodeDef> nodeById,
                                                    List<LogicFlowDsl.EdgeDef> edges) {
        if (edges == null) {
            return null;
        }
        for (LogicFlowDsl.EdgeDef edge : edges) {
            if (BRANCH_ERROR.equalsIgnoreCase(edge.getBranch() == null ? "" : edge.getBranch().trim())) {
                LogicFlowDsl.NodeDef next = edge.getTarget() != null ? nodeById.get(edge.getTarget()) : null;
                if (next == null) {
                    throw new FlowAbortedException("边引用不存在的节点: " + edge.getTarget());
                }
                return next;
            }
        }
        return null;
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
