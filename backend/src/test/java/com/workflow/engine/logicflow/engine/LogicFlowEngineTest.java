package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.parse.ParamMapping;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.AdditionalMatchers.aryEq;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 逻辑流引擎纯单测：Mockito mock 四依赖（HTTP/脚本/Bean 注册表/变量解析器），不起 Spring。
 */
class LogicFlowEngineTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private HttpLogicExecutor httpExecutor;
    private GroovyScriptLogic groovyScriptLogic;
    private BackendBeanRegistry beanRegistry;
    private VariableResolver variableResolver;
    private LogicFlowEngine engine;

    @BeforeEach
    void setUp() {
        httpExecutor = mock(HttpLogicExecutor.class);
        groovyScriptLogic = mock(GroovyScriptLogic.class);
        beanRegistry = mock(BackendBeanRegistry.class);
        variableResolver = mock(VariableResolver.class);
        // 占位符解析恒等（测试用例的 value 均不含 {{}}）
        when(variableResolver.resolve(anyString(), any())).thenAnswer(inv -> inv.getArgument(0));
        engine = new LogicFlowEngine(httpExecutor, groovyScriptLogic, beanRegistry, variableResolver, objectMapper);
    }

    // ------------------------------------------------------------------
    // DSL 构造辅助
    // ------------------------------------------------------------------

    private static LogicFlowDsl.NodeDef node(String id, NodeType type, String name) {
        LogicFlowDsl.NodeDef node = new LogicFlowDsl.NodeDef();
        node.setId(id);
        node.setType(type);
        node.setName(name);
        return node;
    }

    private LogicFlowDsl.NodeDef scriptNode(String id, String source, String resultVar, String errorAction) {
        LogicFlowDsl.NodeDef node = node(id, NodeType.SCRIPT, id);
        ObjectNode config = objectMapper.createObjectNode();
        config.put("language", "groovy");
        config.put("source", source);
        node.setConfig(config);
        node.setResultVar(resultVar);
        node.setErrorAction(errorAction);
        return node;
    }

    private static LogicFlowDsl.EdgeDef edge(String source, String target) {
        return edge(source, target, null);
    }

    private static LogicFlowDsl.EdgeDef edge(String source, String target, String branch) {
        LogicFlowDsl.EdgeDef edge = new LogicFlowDsl.EdgeDef();
        edge.setId(source + "->" + target + (branch == null ? "" : ":" + branch));
        edge.setSource(source);
        edge.setTarget(target);
        edge.setBranch(branch);
        return edge;
    }

    private static LogicFlowDsl dsl(List<LogicFlowDsl.NodeDef> nodes, List<LogicFlowDsl.EdgeDef> edges) {
        LogicFlowDsl dsl = new LogicFlowDsl();
        dsl.setNodes(nodes);
        dsl.setEdges(edges);
        return dsl;
    }

    // ------------------------------------------------------------------
    // 用例
    // ------------------------------------------------------------------

    @Test
    void sequentialScriptChainWritesResultVars() {
        when(groovyScriptLogic.execute(eq("a + b"), isNull(), anyMap())).thenReturn(3);
        when(groovyScriptLogic.execute(eq("'total=' + sum"), isNull(), anyMap())).thenReturn("total=3");

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"),
                        scriptNode("n1", "a + b", "sum", null),
                        scriptNode("n2", "'total=' + sum", "out", null),
                        node("e", NodeType.END, "结束")),
                List.of(edge("s", "n1"), edge("n1", "n2"), edge("n2", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of("a", 1, "b", 2));

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.errorMessage()).isNull();
        assertThat(outcome.outputVars())
                .containsEntry("a", 1)
                .containsEntry("b", 2)
                .containsEntry("sum", 3)
                .containsEntry("out", "total=3");
        // 轨迹：START + 两个脚本节点 + END
        assertThat(outcome.traces()).hasSize(4);
        assertThat(outcome.traces().get(1).status()).isEqualTo("SUCCESS");
        assertThat(outcome.traces().get(1).result()).isEqualTo(3);
        assertThat(outcome.traces().get(3).type()).isEqualTo("END");
    }

    @Test
    void conditionBranchesTrueAndFalse() {
        when(groovyScriptLogic.execute(eq("'vip'"), isNull(), anyMap())).thenReturn("vip");
        when(groovyScriptLogic.execute(eq("'standard'"), isNull(), anyMap())).thenReturn("standard");

        LogicFlowDsl.NodeDef cond = node("cond", NodeType.CONDITION, "金额是否大于100");
        ObjectNode config = objectMapper.createObjectNode();
        config.put("variable", "amount");
        config.put("operator", "GT");
        config.put("value", "100");
        cond.setConfig(config);

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"), cond,
                        scriptNode("vip", "'vip'", "lane", null),
                        scriptNode("std", "'standard'", "lane", null),
                        node("e", NodeType.END, "结束")),
                List.of(edge("s", "cond"),
                        edge("cond", "vip", "true"),
                        edge("cond", "std", "false"),
                        edge("vip", "e"),
                        edge("std", "e")));

        LogicFlowEngine.RunOutcome high = engine.run(flow, Map.of("amount", 500));
        assertThat(high.status()).isEqualTo("SUCCESS");
        assertThat(high.outputVars()).containsEntry("lane", "vip");
        assertThat(high.traces().get(1).type()).isEqualTo("CONDITION");
        assertThat(high.traces().get(1).result()).isEqualTo("true");

        LogicFlowEngine.RunOutcome low = engine.run(flow, Map.of("amount", 50));
        assertThat(low.status()).isEqualTo("SUCCESS");
        assertThat(low.outputVars()).containsEntry("lane", "standard");
        assertThat(low.traces().get(1).result()).isEqualTo("false");
    }

    @Test
    void conditionMissingBranchEdgeFails() {
        LogicFlowDsl.NodeDef cond = node("cond", NodeType.CONDITION, "永真");
        ObjectNode config = objectMapper.createObjectNode();
        config.put("variable", "ok");
        config.put("operator", "EQ");
        config.put("value", "true");
        cond.setConfig(config);

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"), cond, node("e", NodeType.END, "结束")),
                List.of(edge("s", "cond"),
                        edge("cond", "e", "false"))); // 只配了 false 分支

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of("ok", true));

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("branch=true");
    }

    @Test
    void failFlowStopsOnError() {
        when(groovyScriptLogic.execute(eq("boom"), isNull(), anyMap()))
                .thenThrow(new RuntimeException("kaput"));

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"),
                        scriptNode("n1", "boom", null, "FAIL_FLOW"),
                        scriptNode("n2", "1", null, "FAIL_FLOW"),
                        node("e", NodeType.END, "结束")),
                List.of(edge("s", "n1"), edge("n1", "n2"), edge("n2", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("kaput").contains("n1");
        // START + 失败的 n1；n2 未执行
        assertThat(outcome.traces()).hasSize(2);
        assertThat(outcome.traces().get(1).status()).isEqualTo("FAILED");
        assertThat(outcome.traces().get(1).error()).isEqualTo("kaput");
        verify(groovyScriptLogic, times(1)).execute(anyString(), isNull(), anyMap());
    }

    @Test
    void ignoreContinueProceedsAfterFailure() {
        when(groovyScriptLogic.execute(eq("noisy"), isNull(), anyMap()))
                .thenThrow(new RuntimeException("noisy"));
        when(groovyScriptLogic.execute(eq("'yes'"), isNull(), anyMap())).thenReturn("yes");

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"),
                        scriptNode("n1", "noisy", null, "IGNORE_CONTINUE"),
                        scriptNode("n2", "'yes'", "done", null),
                        node("e", NodeType.END, "结束")),
                List.of(edge("s", "n1"), edge("n1", "n2"), edge("n2", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.outputVars()).containsEntry("done", "yes");
        assertThat(outcome.traces().get(1).status()).isEqualTo("FAILED");
        assertThat(outcome.traces().get(1).error()).isEqualTo("noisy");
        assertThat(outcome.traces().get(2).status()).isEqualTo("SUCCESS");
    }

    @Test
    void maxStepsLoopDetected() {
        when(groovyScriptLogic.execute(anyString(), isNull(), anyMap())).thenReturn(1);

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"),
                        scriptNode("a", "1", null, "IGNORE_CONTINUE"),
                        node("e", NodeType.END, "结束")),
                List.of(edge("s", "a"),
                        edge("a", "a"),   // 自环排首位：requireNext 取首条出边
                        edge("a", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("最大执行步数");
        assertThat(outcome.traces().size()).isLessThanOrEqualTo(LogicFlowEngine.MAX_STEPS + 1);
    }

    @Test
    void missingOutEdgeFails() {
        LogicFlowDsl flow = dsl(List.of(node("s", NodeType.START, "开始")), List.of());

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("无出边").contains("s");
    }

    @Test
    void noStartNodeFails() {
        LogicFlowDsl flow = dsl(List.of(node("e", NodeType.END, "结束")), List.of());

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("START");
    }

    @Test
    void multipleStartsTakesFirst() {
        when(groovyScriptLogic.execute(eq("'second'"), isNull(), anyMap())).thenReturn("second");

        LogicFlowDsl flow = dsl(
                List.of(node("s2", NodeType.START, "第二个起点"),
                        scriptNode("n", "'second'", "who", null),
                        node("e", NodeType.END, "结束"),
                        node("s1", NodeType.START, "第一个起点被忽略")),
                List.of(edge("s2", "n"), edge("n", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.traces().get(0).nodeId()).isEqualTo("s2");
        assertThat(outcome.outputVars()).containsEntry("who", "second");
    }

    @Test
    void httpNodePassesConfigAndWritesResultVar() {
        when(httpExecutor.execute(eq("https://api.example.com/x"), eq("GET"), anyMap(), anyList(),
                anyList(), anyMap(), eq(3000), eq(5000), eq(0))).thenReturn("{\"ok\":true}");

        LogicFlowDsl.NodeDef http = node("h", NodeType.HTTP, "调用风控");
        ObjectNode config = objectMapper.createObjectNode();
        config.put("url", "https://api.example.com/x");
        config.put("method", "GET");
        config.putObject("headers");
        config.putArray("queryParams").addObject().put("source", "orderId").put("target", "orderId");
        config.put("connTimeoutMs", 3000);
        config.put("readTimeoutMs", 5000);
        config.put("retryCount", 0);
        http.setConfig(config);
        http.setResultVar("resp");

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"), http, node("e", NodeType.END, "结束")),
                List.of(edge("s", "h"), edge("h", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of("orderId", "42"));

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.outputVars()).containsEntry("resp", "{\"ok\":true}");
        assertThat(outcome.traces().get(1).result()).isEqualTo("{\"ok\":true}");

        @SuppressWarnings("unchecked")
        ArgumentCaptor<List<ParamMapping>> queryCaptor = ArgumentCaptor.forClass(List.class);
        verify(httpExecutor).execute(eq("https://api.example.com/x"), eq("GET"), anyMap(),
                queryCaptor.capture(), anyList(), anyMap(), eq(3000), eq(5000), eq(0));
        assertThat(queryCaptor.getValue()).hasSize(1);
        assertThat(queryCaptor.getValue().get(0).source()).isEqualTo("orderId");
        assertThat(queryCaptor.getValue().get(0).target()).isEqualTo("orderId");
    }

    @Test
    void beanNodeInvokesRegistryWithArgsInSourceOrder() {
        when(beanRegistry.invoke(eq("orderSvc"), eq("approve"), any())).thenReturn("approved");

        LogicFlowDsl.NodeDef bean = node("b", NodeType.BEAN, "审批");
        ObjectNode config = objectMapper.createObjectNode();
        config.put("beanName", "orderSvc");
        config.put("methodName", "approve");
        ArrayNode params = config.putArray("params");
        params.addObject().put("source", "orderId").put("target", "p1");
        params.addObject().put("source", "amount").put("target", "p2");
        bean.setConfig(config);
        bean.setResultVar("state");

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"), bean, node("e", NodeType.END, "结束")),
                List.of(edge("s", "b"), edge("b", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of("orderId", "42", "amount", 100));

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.outputVars()).containsEntry("state", "approved");
        // args 按 params 的 source 顺序从 vars 取值
        verify(beanRegistry).invoke(eq("orderSvc"), eq("approve"), aryEq(new Object[]{"42", 100}));
    }

    @Test
    void beanNotRegisteredFailsFlow() {
        when(beanRegistry.invoke(eq("ghost"), eq("haunt"), any()))
                .thenThrow(new IllegalArgumentException("Backend logic bean method not registered: ghost.haunt"));

        LogicFlowDsl.NodeDef bean = node("b", NodeType.BEAN, "幽灵调用");
        ObjectNode config = objectMapper.createObjectNode();
        config.put("beanName", "ghost");
        config.put("methodName", "haunt");
        bean.setConfig(config);

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"), bean, node("e", NodeType.END, "结束")),
                List.of(edge("s", "b"), edge("b", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("not registered");
        assertThat(outcome.traces().get(1).status()).isEqualTo("FAILED");
        assertThat(outcome.traces().get(1).error()).contains("not registered");
    }

    @Test
    void unsupportedScriptLanguageFailsNode() {
        LogicFlowDsl.NodeDef script = node("js", NodeType.SCRIPT, "JS 脚本");
        ObjectNode config = objectMapper.createObjectNode();
        config.put("language", "javascript");
        config.put("source", "1 + 1");
        script.setConfig(config);

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"), script, node("e", NodeType.END, "结束")),
                List.of(edge("s", "js"), edge("js", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("UNSUPPORTED_LANGUAGE");
        assertThat(outcome.traces().get(1).error()).contains("UNSUPPORTED_LANGUAGE");
    }

    @Test
    void unknownConditionOperatorFailsFlow() {
        LogicFlowDsl.NodeDef cond = node("cond", NodeType.CONDITION, "非法运算符");
        ObjectNode config = objectMapper.createObjectNode();
        config.put("variable", "v");
        config.put("operator", "LIKE");
        config.put("value", "x");
        cond.setConfig(config);

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"), cond, node("e", NodeType.END, "结束")),
                List.of(edge("s", "cond"), edge("cond", "e", "true"), edge("cond", "e", "false")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of("v", "x"));

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("UNKNOWN_CONDITION_OPERATOR");
    }

    @Test
    @SuppressWarnings("unchecked")
    void outputVarsAreSnapshotDeepCopy() {
        when(groovyScriptLogic.execute(eq("list"), isNull(), anyMap()))
                .thenAnswer(inv -> {
                    Map<String, Object> vars = inv.getArgument(2);
                    List<String> list = new ArrayList<>(List.of("a"));
                    vars.put("shared", list);
                    return list;
                });

        LogicFlowDsl flow = dsl(
                List.of(node("s", NodeType.START, "开始"),
                        scriptNode("n", "list", "list", null),
                        node("e", NodeType.END, "结束")),
                List.of(edge("s", "n"), edge("n", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow, Map.of());

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        // 快照为深拷贝：清空输出容器不影响 trace 中记录的原结果
        ((List<String>) outcome.outputVars().get("shared")).clear();
        List<String> traceResult = (List<String>) outcome.traces().get(1).result();
        assertThat(traceResult).containsExactly("a");
    }
}
