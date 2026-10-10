package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * {@code __lastError} 失败详情上下文变量测试：任一节点失败时引擎写入
 * Map{nodeId, nodeName, type, message, timestamp}（最近一次覆盖），
 * 三级回落链（error 出边 / IGNORE_CONTINUE / FAIL_FLOW）后的补救节点模板均可引用。
 */
class LogicFlowLastErrorTest {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private HttpLogicExecutor httpExecutor;
    private LogicFlowEngine engine;

    @BeforeEach
    void setUp() {
        httpExecutor = mock(HttpLogicExecutor.class);
        engine = new LogicFlowEngine(httpExecutor,
                mock(GroovyScriptLogic.class), mock(BackendBeanRegistry.class),
                new VariableResolver(), objectMapper);
    }

    // ------------------------------------------------------------------
    // DSL 构造辅助（与 LogicFlowNewNodesTest 同风格）
    // ------------------------------------------------------------------

    private static LogicFlowDsl.NodeDef node(String id, NodeType type, String configJson) {
        LogicFlowDsl.NodeDef node = new LogicFlowDsl.NodeDef();
        node.setId(id);
        node.setType(type);
        node.setName(id);
        if (configJson != null) {
            try {
                node.setConfig(objectMapper.readTree(configJson));
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }
        return node;
    }

    private static LogicFlowDsl.NodeDef node(String id, NodeType type) {
        return node(id, type, null);
    }

    private static LogicFlowDsl.NodeDef node(String id, NodeType type, String configJson, String errorAction) {
        LogicFlowDsl.NodeDef n = node(id, type, configJson);
        n.setErrorAction(errorAction);
        return n;
    }

    private static LogicFlowDsl.EdgeDef edge(String source, String target) {
        return edge(source, target, null);
    }

    private static LogicFlowDsl.EdgeDef edge(String source, String target, String branch) {
        LogicFlowDsl.EdgeDef e = new LogicFlowDsl.EdgeDef();
        e.setId("e_" + source + "_" + target);
        e.setSource(source);
        e.setTarget(target);
        e.setBranch(branch);
        return e;
    }

    private static LogicFlowDsl dsl(List<LogicFlowDsl.NodeDef> nodes, List<LogicFlowDsl.EdgeDef> edges) {
        LogicFlowDsl dsl = new LogicFlowDsl();
        dsl.setNodes(nodes);
        dsl.setEdges(edges);
        return dsl;
    }

    private void httpAlwaysThrows(String message) {
        when(httpExecutor.execute(anyString(), anyString(), any(), any(), any(), any(),
                anyInt(), anyInt(), anyInt()))
                .thenThrow(new IllegalArgumentException(message));
    }

    // ------------------------------------------------------------------
    // IGNORE_CONTINUE：失败后继续主边，下游节点模板解析 __lastError
    // ------------------------------------------------------------------

    @Test
    void ignoreContinueFailureWritesLastErrorAndDownstreamTemplateResolvesIt() {
        httpAlwaysThrows("外部接口超时");

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("call", NodeType.HTTP, "{\"url\":\"https://x/api\"}", "IGNORE_CONTINUE"),
                node("report", NodeType.TRANSFORM, """
                        {"template":"{\\"msg\\": \\"{{__lastError.message}}\\", \\"failedNode\\": \\"{{__lastError.nodeId}}\\", \\"type\\": \\"{{__lastError.type}}\\"}"}
                        """),
                node("e", NodeType.END)),
                List.of(edge("s", "call"), edge("call", "report"), edge("report", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, Map.of());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);

        // 上下文含 __lastError（Map 形态，五字段齐全）
        Object lastError = outcome.outputVars().get(LogicFlowEngine.VAR_LAST_ERROR);
        assertThat(lastError).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(m.get("nodeId")).isEqualTo("call");
            assertThat(m.get("nodeName")).isEqualTo("call");
            assertThat(m.get("type")).isEqualTo("HTTP");
            assertThat(m.get("message")).isEqualTo("外部接口超时");
            assertThat(String.valueOf(m.get("timestamp"))).isNotBlank();
        });

        // 下游模板能解析点路径字段
        assertThat(outcome.outputVars().get("report")).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(m.get("msg")).isEqualTo("外部接口超时");
            assertThat(m.get("failedNode")).isEqualTo("call");
            assertThat(m.get("type")).isEqualTo("HTTP");
        });
    }

    @Test
    void ignoreContinueWholeMapPlaceholderInjectsOriginalObject() {
        httpAlwaysThrows("boom");

        // 值位纯占位符：{{__lastError}} 注入原始 Map（类型保留，writeJsonSafe 序列化为对象）
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("call", NodeType.HTTP, "{\"url\":\"https://x/api\"}", "IGNORE_CONTINUE"),
                node("snap", NodeType.TRANSFORM, """
                        {"template":"{\\"detail\\": {{__lastError}}}"}
                        """),
                node("e", NodeType.END)),
                List.of(edge("s", "call"), edge("call", "snap"), edge("snap", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, Map.of());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.outputVars().get("snap")).isInstanceOfSatisfying(Map.class, m ->
                assertThat(m.get("detail")).isInstanceOfSatisfying(Map.class, detail -> {
                    assertThat(detail.get("nodeId")).isEqualTo("call");
                    assertThat(detail.get("message")).isEqualTo("boom");
                }));
    }

    // ------------------------------------------------------------------
    // error 出边：补救节点（分支目标）能读到失败详情
    // ------------------------------------------------------------------

    @Test
    void errorBranchTargetReadsLastError() {
        httpAlwaysThrows("外部接口超时");

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("call", NodeType.HTTP, "{\"url\":\"https://x/api\"}"),
                node("ok", NodeType.TRANSFORM, """
                        {"template":"{\\"ok\\": true}"}
                        """),
                node("fallback", NodeType.TRANSFORM, """
                        {"template":"{\\"from\\": \\"{{__lastError.nodeId}}\\", \\"reason\\": \\"{{__lastError.message}}\\"}"}
                        """),
                node("e", NodeType.END)),
                List.of(edge("s", "call"), edge("call", "ok"), edge("call", "fallback", "error"),
                        edge("ok", "e"), edge("fallback", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, Map.of());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.traces())
                .anySatisfy(t -> {
                    assertThat(t.nodeId()).isEqualTo("call");
                    assertThat(t.status()).isEqualTo(LogicFlowEngine.TRACE_FAILED);
                })
                .anySatisfy(t -> assertThat(t.nodeId()).isEqualTo("fallback"));
        assertThat(outcome.outputVars().get("fallback")).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(m.get("from")).isEqualTo("call");
            assertThat(m.get("reason")).isEqualTo("外部接口超时");
        });
    }

    // ------------------------------------------------------------------
    // FAIL_FLOW：收敛 FAILED 的快照同样带出 __lastError
    // ------------------------------------------------------------------

    @Test
    void failFlowSnapshotCarriesLastError() {
        httpAlwaysThrows("boom");

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("call", NodeType.HTTP, "{\"url\":\"https://x/api\"}"),
                node("e", NodeType.END)),
                List.of(edge("s", "call"), edge("call", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, Map.of());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
        assertThat(outcome.errorMessage()).contains("boom");
        assertThat(outcome.outputVars().get(LogicFlowEngine.VAR_LAST_ERROR))
                .isInstanceOfSatisfying(Map.class, m -> assertThat(m.get("nodeId")).isEqualTo("call"));
    }

    // ------------------------------------------------------------------
    // 覆盖语义：多个节点连续失败 → __lastError 为最近一次失败
    // ------------------------------------------------------------------

    @Test
    void consecutiveFailuresOverwriteWithLatestError() {
        httpAlwaysThrows("boom");

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("step1", NodeType.HTTP, "{\"url\":\"https://x/1\"}", "IGNORE_CONTINUE"),
                node("step2", NodeType.HTTP, "{\"url\":\"https://x/2\"}", "IGNORE_CONTINUE"),
                node("report", NodeType.TRANSFORM, """
                        {"template":"{\\"latest\\": \\"{{__lastError.nodeId}}\\"}"}
                        """),
                node("e", NodeType.END)),
                List.of(edge("s", "step1"), edge("step1", "step2"), edge("step2", "report"),
                        edge("report", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, Map.of());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.outputVars().get("report")).isInstanceOfSatisfying(Map.class,
                m -> assertThat(m.get("latest")).isEqualTo("step2"));
    }
}
