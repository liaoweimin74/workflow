package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.ai.model.ChatMessage;
import com.workflow.ai.model.ChatModel;
import com.workflow.ai.model.ChatOptions;
import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.BizDataVO;
import com.workflow.engine.form.bizdata.BizDataContext;
import com.workflow.engine.form.bizdata.BizDataSupport;
import com.workflow.engine.form.column.ColumnInfo;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.config.BackendNotifyConfig;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import com.workflow.notification.dispatch.MessageSender;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Connection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * 新增节点（DATA_QUERY/DATA_INSERT/DATA_DELETE/NOTIFY/DELAY/TRANSFORM/AGGREGATE/LLM）
 * + onError 失败路由 + BATCH chunk/breakWhen 增强引擎级测试。
 */
class LogicFlowNewNodesTest {

    private static final ObjectMapper objectMapper = new ObjectMapper();

    private HttpLogicExecutor httpExecutor;
    private BizDataSupport bizDataSupport;
    private TenantProvider tenantProvider;
    private MessageSender messageSender;
    private ChatModel chatModel;
    private JdbcTemplate jdbcTemplate;
    private LogicFlowEngine engine;

    @BeforeEach
    void setUp() {
        httpExecutor = mock(HttpLogicExecutor.class);
        GroovyScriptLogic groovyScriptLogic = mock(GroovyScriptLogic.class);
        BackendBeanRegistry beanRegistry = mock(BackendBeanRegistry.class);
        bizDataSupport = mock(BizDataSupport.class);
        tenantProvider = mock(TenantProvider.class);
        messageSender = mock(MessageSender.class);
        chatModel = mock(ChatModel.class);
        jdbcTemplate = mock(JdbcTemplate.class);
        DynamicTableManager tableManager = mock(DynamicTableManager.class);
        when(tenantProvider.getTenantId()).thenReturn("t1");
        engine = new LogicFlowEngine(httpExecutor, groovyScriptLogic, beanRegistry,
                new VariableResolver(), objectMapper, null, jdbcTemplate, tableManager,
                bizDataSupport, tenantProvider, messageSender, chatModel);
    }

    // ------------------------------------------------------------------
    // DSL 构造辅助
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

    private static Map<String, Object> vars(Object... kv) {
        Map<String, Object> map = new HashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            map.put((String) kv[i], kv[i + 1]);
        }
        return map;
    }

    // ------------------------------------------------------------------
    // DATA_QUERY / DATA_INSERT / DATA_DELETE
    // ------------------------------------------------------------------

    @Test
    void dataQueryReturnsRowsAndImplicitOutput() {
        BizDataVO vo = new BizDataVO();
        vo.setId("r1");
        vo.setVersion(1);
        vo.setData(Map.of("person_name", "张三", "leave_days", 3));
        when(bizDataSupport.queryGeneric(eq("bill_test"), any(BizDataQueryRequest.class)))
                .thenReturn(new BizDataPageVO(List.of(vo), 1, 1, 50));

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("dq1", NodeType.DATA_QUERY, "{\"formKey\":\"bill_test\",\"size\":50}"),
                node("e", NodeType.END)),
                List.of(edge("s", "dq1"), edge("dq1", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.outputVars().get("dq1")).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(((Number) m.get("total")).longValue()).isEqualTo(1L);
            assertThat((List<?>) m.get("rows")).hasSize(1);
            assertThat((List<?>) m.get("rows")).first().isInstanceOfSatisfying(Map.class,
                    row -> assertThat(row.get("person_name")).isEqualTo("张三"));
        });
    }

    @Test
    void dataInsertResolvesPlaceholdersAndReturnsId() {
        BizDataVO created = new BizDataVO();
        created.setId("new-row-1");
        created.setVersion(0);
        created.setData(Map.of("person_name", "李四"));
        when(bizDataSupport.createGeneric(eq("bill_test"), any()))
                .thenReturn(created);

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("di1", NodeType.DATA_INSERT,
                        "{\"formKey\":\"bill_test\",\"data\":[{\"column\":\"person_name\",\"value\":\"{{name}}\"},{\"column\":\"leave_days\",\"value\":\"2\"}]}"),
                node("e", NodeType.END)),
                List.of(edge("s", "di1"), edge("di1", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars("name", "李四"));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        verify(bizDataSupport).createGeneric(eq("bill_test"), eq(Map.of("person_name", "李四", "leave_days", "2")));
        assertThat(outcome.outputVars().get("di1")).isInstanceOfSatisfying(Map.class,
                m -> assertThat(m.get("id")).isEqualTo("new-row-1"));
    }

    @Test
    void dataDeleteByIdDelegatesToSupport() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("dd1", NodeType.DATA_DELETE, "{\"formKey\":\"bill_test\",\"id\":\"{{rowId}}\"}"),
                node("e", NodeType.END)),
                List.of(edge("s", "dd1"), edge("dd1", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars("rowId", "abc123"));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        verify(bizDataSupport).deleteGeneric("bill_test", "abc123");
        assertThat(outcome.outputVars().get("dd1")).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(m.get("deleted")).isEqualTo(1);
            assertThat(m.get("mode")).isEqualTo("id");
        });
    }

    @Test
    void dataDeleteByFilterAppendsTenantGuard() {
        when(bizDataSupport.loadContext("bill_test")).thenReturn(new BizDataContext(
                "wf_biz_bill_test", "bill_test", List.of(), List.of("status"), Map.of()));
        when(jdbcTemplate.update(startsWith("DELETE FROM wf_biz_bill_test WHERE"), any(Object[].class)))
                .thenReturn(3);

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("dd2", NodeType.DATA_DELETE,
                        "{\"formKey\":\"bill_test\",\"filter\":[{\"column\":\"status\",\"op\":\"EQ\",\"value\":\"DRAFT\"}]}"),
                node("e", NodeType.END)),
                List.of(edge("s", "dd2"), edge("dd2", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        verify(jdbcTemplate).update(anyString(), any(Object[].class));
        assertThat(outcome.outputVars().get("dd2")).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(m.get("deleted")).isEqualTo(3);
            assertThat(m.get("mode")).isEqualTo("filter");
        });
    }

    @Test
    void dataDeleteWithoutIdAndFilterFails() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("dd3", NodeType.DATA_DELETE, "{\"formKey\":\"bill_test\"}"),
                node("e", NodeType.END)),
                List.of(edge("s", "dd3"), edge("dd3", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
        assertThat(outcome.errorMessage()).contains("DATA_DELETE");
    }

    // ------------------------------------------------------------------
    // NOTIFY / DELAY
    // ------------------------------------------------------------------

    @Test
    void notifyResolvesRecipientsAndSends() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("n1", NodeType.NOTIFY,
                        "{\"templateCode\":\"T1\",\"recipientIds\":[\"{{ownerId}}\",\"2\"],"
                                + "\"variables\":[{\"name\":\"orderNo\",\"value\":\"{{orderNo}}\"}]}"),
                node("e", NodeType.END)),
                List.of(edge("s", "n1"), edge("n1", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars("ownerId", 1, "orderNo", "A001"));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        verify(messageSender).sendByTemplate(eq(null), eq("T1"), eq(Map.of("orderNo", "A001")),
                any(), eq(List.of(1L, 2L)), any());
        assertThat(outcome.outputVars().get("n1")).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(m.get("sent")).isEqualTo(true);
            assertThat(m.get("recipients")).isEqualTo(2);
        });
    }

    @Test
    void notifyInvalidRecipientFailsNode() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("n2", NodeType.NOTIFY, "{\"templateCode\":\"T1\",\"recipientIds\":[\"abc\"]}"),
                node("e", NodeType.END)),
                List.of(edge("s", "n2"), edge("n2", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
        assertThat(outcome.errorMessage()).contains("数字");
    }

    @Test
    void delayWaitsAndReportsWaitedMs() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("d1", NodeType.DELAY, "{\"durationMs\":20}"),
                node("e", NodeType.END)),
                List.of(edge("s", "d1"), edge("d1", "e")));

        long begin = System.currentTimeMillis();
        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        long elapsed = System.currentTimeMillis() - begin;
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(elapsed).isGreaterThanOrEqualTo(20);
        assertThat(outcome.outputVars().get("d1")).isInstanceOfSatisfying(Map.class,
                m -> assertThat(((Number) m.get("waitedMs")).longValue()).isGreaterThanOrEqualTo(20L));
    }

    @Test
    void delayOutOfRangeFails() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("d2", NodeType.DELAY, "{\"durationMs\":99000}"),
                node("e", NodeType.END)),
                List.of(edge("s", "d2"), edge("d2", "e")));

        assertThat(engine.run(dsl, vars()).status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
    }

    // ------------------------------------------------------------------
    // TRANSFORM / AGGREGATE
    // ------------------------------------------------------------------

    @Test
    void transformInjectsRawValueAtValuePositionAndInterpolates() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("t1", NodeType.TRANSFORM, """
                        {"template":"{\\"person\\": {{person}}, \\"summary\\": \\"姓名 {{person.person_name}} 共 {{count}} 条\\"}"}
                        """),
                node("e", NodeType.END)),
                List.of(edge("s", "t1"), edge("t1", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl,
                vars("person", Map.of("person_name", "王五"), "count", 3));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.outputVars().get("t1")).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(m.get("person")).isEqualTo(Map.of("person_name", "王五"));
            assertThat(m.get("summary")).isEqualTo("姓名 王五 共 3 条");
        });
    }

    @Test
    void transformInvalidJsonFailsNode() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("t2", NodeType.TRANSFORM, "{\"template\":\"{not-json\"}"),
                node("e", NodeType.END)),
                List.of(edge("s", "t2"), edge("t2", "e")));

        assertThat(engine.run(dsl, vars()).status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
    }

    @Test
    void aggregateSumsFieldWithoutGrouping() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("a1", NodeType.AGGREGATE,
                        "{\"collection\":\"{{rows}}\",\"field\":\"amount\",\"ops\":[\"SUM\",\"COUNT\"]}"),
                node("e", NodeType.END)),
                List.of(edge("s", "a1"), edge("a1", "e")));

        Map<Object, Object> row1 = new HashMap<>();
        row1.put("amount", 10.5);
        Map<Object, Object> row2 = new HashMap<>();
        row2.put("amount", 20.25);
        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars("rows", List.of(row1, row2)));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.outputVars().get("a1")).isInstanceOfSatisfying(Map.class, m -> {
            assertThat(m.get("count")).isEqualTo(2);
            assertThat((Double) m.get("sum")).isEqualTo(30.75);
        });
    }

    @Test
    void aggregateGroupByProducesGroupList() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("a2", NodeType.AGGREGATE,
                        "{\"collection\":\"{{rows}}\",\"field\":\"amount\",\"ops\":[\"COUNT\",\"SUM\"],\"groupBy\":\"name\"}"),
                node("e", NodeType.END)),
                List.of(edge("s", "a2"), edge("a2", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars("rows", List.of(
                Map.of("name", "张三", "amount", 10),
                Map.of("name", "李四", "amount", 5),
                Map.of("name", "张三", "amount", 7))));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.outputVars().get("a2")).isInstanceOfSatisfying(List.class, list -> {
            assertThat(list).hasSize(2);
            assertThat(list.get(0)).isInstanceOfSatisfying(Map.class, m -> {
                assertThat(m.get("group")).isEqualTo("张三");
                assertThat(m.get("count")).isEqualTo(2);
                assertThat((Double) m.get("sum")).isEqualTo(17.0);
            });
        });
    }

    @Test
    void aggregateNonNumericFieldFails() {
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("a3", NodeType.AGGREGATE,
                        "{\"collection\":\"{{rows}}\",\"field\":\"amount\",\"ops\":[\"SUM\"]}"),
                node("e", NodeType.END)),
                List.of(edge("s", "a3"), edge("a3", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars("rows", List.of(Map.of("amount", "abc"))));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
        assertThat(outcome.errorMessage()).contains("数字");
    }

    // ------------------------------------------------------------------
    // LLM
    // ------------------------------------------------------------------

    @Test
    void llmInterpolatesPromptAndReturnsContent() {
        when(chatModel.complete(any(), any())).thenReturn("病假");

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("l1", NodeType.LLM,
                        "{\"prompt\":\"归类：{{reason}}\",\"system\":\"只输出一个词\",\"temperature\":0.1}"),
                node("e", NodeType.END)),
                List.of(edge("s", "l1"), edge("l1", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars("reason", "发烧请假"));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        verify(chatModel).complete(any(), any(ChatOptions.class));
        assertThat(outcome.outputVars().get("l1")).isInstanceOfSatisfying(Map.class,
                m -> assertThat(m.get("content")).isEqualTo("病假"));
    }

    @Test
    void llmWithoutChatModelFailsWithAssemblyHint() {
        LogicFlowEngine bareEngine = new LogicFlowEngine(httpExecutor,
                mock(GroovyScriptLogic.class), mock(BackendBeanRegistry.class),
                new VariableResolver(), objectMapper);
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("l2", NodeType.LLM, "{\"prompt\":\"hi\"}"),
                node("e", NodeType.END)),
                List.of(edge("s", "l2"), edge("l2", "e")));

        LogicFlowEngine.RunOutcome outcome = bareEngine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
        assertThat(outcome.errorMessage()).contains("未装配大模型");
    }

    // ------------------------------------------------------------------
    // onError 失败路由
    // ------------------------------------------------------------------

    @Test
    void onErrorEdgeRoutesFailedNodeToRecoveryBranch() {
        when(httpExecutor.execute(anyString(), anyString(), any(), any(), any(), any(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt()))
                .thenThrow(new IllegalArgumentException("外部接口超时"));

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("call", NodeType.HTTP, "{\"url\":\"https://x/api\"}"),
                node("ok", NodeType.TRANSFORM, "{\"template\":\"{\\\"ok\\\": true}\"}"),
                node("fallback", NodeType.TRANSFORM, """
                        {"template":"{\\"degraded\\": true}"}
                        """),
                node("e", NodeType.END)),
                List.of(edge("s", "call"), edge("call", "ok"), edge("call", "fallback", "error"),
                        edge("ok", "e"), edge("fallback", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.traces())
                .anySatisfy(t -> {
                    assertThat(t.nodeId()).isEqualTo("call");
                    assertThat(t.status()).isEqualTo(LogicFlowEngine.TRACE_FAILED);
                })
                .anySatisfy(t -> {
                    assertThat(t.nodeId()).isEqualTo("fallback");
                    assertThat(t.status()).isEqualTo(LogicFlowEngine.TRACE_SUCCESS);
                });
        // 成功路径未走：ok 节点不在轨迹中
        assertThat(outcome.traces()).noneSatisfy(t -> assertThat(t.nodeId()).isEqualTo("ok"));
        assertThat(outcome.outputVars().get("fallback")).isInstanceOfSatisfying(Map.class,
                m -> assertThat(m.get("degraded")).isEqualTo(true));
    }

    @Test
    void successPathSkipsErrorEdges() {
        when(httpExecutor.execute(anyString(), anyString(), any(), any(), any(), any(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt()))
                .thenReturn("PONG");

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("call", NodeType.HTTP, "{\"url\":\"https://x/api\"}"),
                node("fallback", NodeType.TRANSFORM, "{\"template\":\"{}\"}"),
                node("e", NodeType.END)),
                List.of(edge("s", "call"), edge("call", "e"), edge("call", "fallback", "error"),
                        edge("fallback", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        assertThat(outcome.traces()).noneSatisfy(t -> assertThat(t.nodeId()).isEqualTo("fallback"));
        assertThat(outcome.outputVars().get("call")).isEqualTo("PONG");
    }

    @Test
    void failFlowStillAppliesWithoutErrorEdge() {
        when(httpExecutor.execute(anyString(), anyString(), any(), any(), any(), any(),
                org.mockito.ArgumentMatchers.anyInt(), org.mockito.ArgumentMatchers.anyInt(),
                org.mockito.ArgumentMatchers.anyInt()))
                .thenThrow(new IllegalArgumentException("boom"));

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("call", NodeType.HTTP, "{\"url\":\"https://x/api\"}"),
                node("e", NodeType.END)),
                List.of(edge("s", "call"), edge("call", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
        assertThat(outcome.errorMessage()).contains("boom");
    }

    // ------------------------------------------------------------------
    // BATCH 增强：chunk / breakWhen
    // ------------------------------------------------------------------

    @Test
    void batchChunkSlicesCollectionIntoBatches() {
        BackendBeanRegistry beanRegistry = mock(BackendBeanRegistry.class);
        when(beanRegistry.invoke(anyString(), anyString(), any())).thenReturn("OK");
        LogicFlowEngine chunkEngine = new LogicFlowEngine(httpExecutor,
                mock(GroovyScriptLogic.class), beanRegistry, new VariableResolver(), objectMapper,
                null, jdbcTemplate, mock(DynamicTableManager.class),
                bizDataSupport, tenantProvider, messageSender, chatModel);
        org.mockito.ArgumentCaptor<Object[]> captor = org.mockito.ArgumentCaptor.forClass(Object[].class);

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("b1", NodeType.BATCH,
                        "{\"collection\":\"{{nums}}\",\"chunkSize\":2,"
                                + "\"body\":[{\"type\":\"BEAN\",\"name\":\"handle\","
                                + "\"config\":{\"beanName\":\"svc\",\"methodName\":\"handle\","
                                + "\"params\":[{\"source\":\"item\",\"target\":\"batch\"}]}}]}"),
                node("e", NodeType.END)),
                List.of(edge("s", "b1"), edge("b1", "e")));

        LogicFlowEngine.RunOutcome outcome = chunkEngine.run(dsl, vars("nums", List.of(1, 2, 3, 4, 5)));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        verify(beanRegistry, org.mockito.Mockito.times(3))
                .invoke(eq("svc"), eq("handle"), captor.capture());
        List<Object[]> batches = captor.getAllValues();
        assertThat(batches.get(0)[0]).isEqualTo(List.of(1, 2));
        assertThat(batches.get(1)[0]).isEqualTo(List.of(3, 4));
        assertThat(batches.get(2)[0]).isEqualTo(List.of(5));
        LogicFlowEngine.BatchSummary summary = (LogicFlowEngine.BatchSummary) outcome.outputVars().get("b1");
        assertThat(summary.total()).isEqualTo(3);
        assertThat(summary.succeeded()).isEqualTo(3);
        assertThat(summary.chunkSize()).isEqualTo(2);
    }

    @Test
    void batchBreakWhenStopsIterationEarly() {
        BackendBeanRegistry beanRegistry = mock(BackendBeanRegistry.class);
        when(beanRegistry.invoke(anyString(), anyString(), any())).thenReturn("OK");
        LogicFlowEngine breakEngine = new LogicFlowEngine(httpExecutor,
                mock(GroovyScriptLogic.class), beanRegistry, new VariableResolver(), objectMapper,
                null, jdbcTemplate, mock(DynamicTableManager.class),
                bizDataSupport, tenantProvider, messageSender, chatModel);

        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("b2", NodeType.BATCH,
                        "{\"collection\":\"{{nums}}\",\"breakWhen\":{\"variable\":\"item\",\"operator\":\"GTE\",\"value\":\"3\"},"
                                + "\"body\":[{\"type\":\"BEAN\",\"name\":\"handle\","
                                + "\"config\":{\"beanName\":\"svc\",\"methodName\":\"handle\","
                                + "\"params\":[{\"source\":\"item\",\"target\":\"v\"}]}}]}"),
                node("e", NodeType.END)),
                List.of(edge("s", "b2"), edge("b2", "e")));

        LogicFlowEngine.RunOutcome outcome = breakEngine.run(dsl, vars("nums", List.of(1, 2, 3, 4)));
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_SUCCESS);
        // item=3 时 GTE 3 成立 → 提前跳出，只执行了 1、2 两项
        verify(beanRegistry, org.mockito.Mockito.times(2)).invoke(anyString(), anyString(), any());
        LogicFlowEngine.BatchSummary summary = (LogicFlowEngine.BatchSummary) outcome.outputVars().get("b2");
        assertThat(summary.succeeded()).isEqualTo(2);
        assertThat(summary.brokenAt()).isEqualTo(2);
    }

    @Test
    void notifyConfigRejectsOversizedRecipientList() {
        // 校验器语义（≤20）：构造 21 个接收人
        StringBuilder recipients = new StringBuilder("[");
        for (int i = 0; i < 21; i++) {
            recipients.append(i > 0 ? "," : "").append(i + 1);
        }
        recipients.append("]");
        LogicFlowDsl dsl = dsl(List.of(
                node("s", NodeType.START),
                node("n3", NodeType.NOTIFY,
                        "{\"templateCode\":\"T1\",\"recipientIds\":" + recipients + "}"),
                node("e", NodeType.END)),
                List.of(edge("s", "n3"), edge("n3", "e")));

        LogicFlowEngine.RunOutcome outcome = engine.run(dsl, vars());
        assertThat(outcome.status()).isEqualTo(LogicFlowEngine.STATUS_FAILED);
        assertThat(outcome.errorMessage()).contains("上限");
        assertThat(BackendNotifyConfig.MAX_RECIPIENTS).isEqualTo(20);
    }
}
