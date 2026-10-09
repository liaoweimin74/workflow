package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.form.column.ColumnInfo;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DATA_UPDATE 多表更新引擎级单测：mock JdbcTemplate/Connection/DynamicTableManager，
 * 覆盖单事务汇总输出、别名键控、失败回滚、执行前配置校验、形态优先级与单表存量兼容。
 */
class LogicFlowDataUpdateMultiTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private JdbcTemplate jdbcTemplate;
    private Connection connection;
    private DynamicTableManager tableManager;
    private LogicFlowEngine engine;

    @BeforeEach
    void setUp() {
        HttpLogicExecutor httpExecutor = mock(HttpLogicExecutor.class);
        GroovyScriptLogic groovyScriptLogic = mock(GroovyScriptLogic.class);
        BackendBeanRegistry beanRegistry = mock(BackendBeanRegistry.class);
        VariableResolver variableResolver = mock(VariableResolver.class);
        when(variableResolver.resolve(anyString(), any())).thenAnswer(inv -> inv.getArgument(0));
        jdbcTemplate = mock(JdbcTemplate.class);
        connection = mock(Connection.class);
        tableManager = mock(DynamicTableManager.class);
        when(tableManager.tableExists("wf_biz_order")).thenReturn(true);
        when(tableManager.tableExists("wf_biz_stock")).thenReturn(true);
        when(tableManager.findTableColumns("wf_biz_order")).thenReturn(List.of(
                new ColumnInfo("id", "bigint", false, true),
                new ColumnInfo("status", "varchar", true, false),
                new ColumnInfo("amount", "decimal", true, false)));
        when(tableManager.findTableColumns("wf_biz_stock")).thenReturn(List.of(
                new ColumnInfo("sku", "varchar", false, true),
                new ColumnInfo("qty", "int", true, false)));
        // execute(ConnectionCallback) → 直连 mock Connection；SQLException 按真实 JdbcTemplate 语义翻译为运行时异常
        when(jdbcTemplate.execute(ArgumentMatchers.<ConnectionCallback<Map<String, Object>>>any()))
                .thenAnswer(inv -> {
                    ConnectionCallback<?> cb = inv.getArgument(0);
                    try {
                        return cb.doInConnection(connection);
                    } catch (SQLException e) {
                        throw new IllegalStateException(e);
                    }
                });
        engine = new LogicFlowEngine(httpExecutor, groovyScriptLogic, beanRegistry, variableResolver,
                objectMapper, null, jdbcTemplate, tableManager);
    }

    // ------------------------------------------------------------------
    // DSL 构造辅助
    // ------------------------------------------------------------------

    private static LogicFlowDsl.NodeDef node(String id, NodeType type) {
        LogicFlowDsl.NodeDef node = new LogicFlowDsl.NodeDef();
        node.setId(id);
        node.setType(type);
        node.setName(id);
        return node;
    }

    private static LogicFlowDsl flow(LogicFlowDsl.NodeDef duNode) {
        LogicFlowDsl dsl = new LogicFlowDsl();
        dsl.setNodes(List.of(node("s", NodeType.START), duNode, node("e", NodeType.END)));
        LogicFlowDsl.EdgeDef e1 = new LogicFlowDsl.EdgeDef();
        e1.setId("s->" + duNode.getId());
        e1.setSource("s");
        e1.setTarget(duNode.getId());
        LogicFlowDsl.EdgeDef e2 = new LogicFlowDsl.EdgeDef();
        e2.setId(duNode.getId() + "->e");
        e2.setSource(duNode.getId());
        e2.setTarget("e");
        dsl.setEdges(List.of(e1, e2));
        return dsl;
    }

    private ObjectNode setOp(String column, String mode, String value) {
        ObjectNode op = objectMapper.createObjectNode();
        op.put("column", column);
        op.put("mode", mode);
        op.put("value", value);
        return op;
    }

    private ObjectNode whereCond(String column, String op, String value) {
        ObjectNode cond = objectMapper.createObjectNode();
        cond.put("column", column);
        cond.put("op", op);
        cond.put("value", value);
        return cond;
    }

    private ObjectNode updateEntry(String alias, String table, ArrayNode setOps, ArrayNode where) {
        ObjectNode u = objectMapper.createObjectNode();
        if (alias != null) {
            u.put("alias", alias);
        }
        u.put("table", table);
        u.set("setOps", setOps);
        u.set("where", where);
        return u;
    }

    private LogicFlowDsl.NodeDef multiNode(String id, ObjectNode config) {
        LogicFlowDsl.NodeDef node = node(id, NodeType.DATA_UPDATE);
        node.setConfig(config);
        return node;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> summaryOf(LogicFlowEngine.RunOutcome outcome, String nodeId) {
        return (Map<String, Object>) outcome.outputVars().get(nodeId);
    }

    // ------------------------------------------------------------------
    // 用例
    // ------------------------------------------------------------------

    @Test
    void multiTableRunsInSingleTransactionWithSummary() throws SQLException {
        PreparedStatement psOrder = mock(PreparedStatement.class);
        when(psOrder.executeUpdate()).thenReturn(3);
        PreparedStatement psStock = mock(PreparedStatement.class);
        when(psStock.executeUpdate()).thenReturn(2);
        when(connection.prepareStatement(anyString())).thenReturn(psOrder, psStock);
        when(connection.getAutoCommit()).thenReturn(true);

        ArrayNode orderSets = objectMapper.createArrayNode()
                .add(setOp("status", "SET", "{{newStatus}}"));
        ArrayNode orderWheres = objectMapper.createArrayNode()
                .add(whereCond("id", "EQ", "{{orderId}}"));
        ArrayNode stockSets = objectMapper.createArrayNode()
                .add(setOp("qty", "SUB", "2"));
        ArrayNode stockWheres = objectMapper.createArrayNode()
                .add(whereCond("sku", "EQ", "A"));
        ObjectNode config = objectMapper.createObjectNode();
        config.set("updates", objectMapper.createArrayNode()
                .add(updateEntry("order", "wf_biz_order", orderSets, orderWheres))
                .add(updateEntry(null, "wf_biz_stock", stockSets, stockWheres)));

        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(multiNode("du_m", config)), Map.of("newStatus", "PAID", "orderId", 7));

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        Map<String, Object> summary = summaryOf(outcome, "du_m");
        assertThat(summary).isNotNull();
        assertThat(summary.get("total")).isEqualTo(2);
        assertThat(summary.get("affected")).isEqualTo(5);
        assertThat(summary.get("durationMs")).isInstanceOf(Number.class);
        assertThat(summary).doesNotContainKey("aborted");

        assertThat(summary).containsKey("order"); // 别名键
        assertThat(summary).containsKey("t1");    // 无别名 → 序号键
        @SuppressWarnings("unchecked")
        Map<String, Object> order = (Map<String, Object>) summary.get("order");
        assertThat(order.get("table")).isEqualTo("wf_biz_order");
        assertThat(order.get("affected")).isEqualTo(3);
        @SuppressWarnings("unchecked")
        Map<String, Object> t1 = (Map<String, Object>) summary.get("t1");
        assertThat(t1.get("table")).isEqualTo("wf_biz_stock");
        assertThat(t1.get("affected")).isEqualTo(2);

        // 单事务：autoCommit 关 → commit → 恢复，无回滚
        verify(connection).setAutoCommit(false);
        verify(connection).commit();
        verify(connection, never()).rollback();
        verify(connection).setAutoCommit(true);

        // 参数绑定下发（SET 值 + WHERE 值按序）
        verify(psOrder).setObject(1, "PAID");
        verify(psOrder).setObject(2, 7);
        verify(psStock).setObject(1, new BigDecimal("2"));
        verify(psStock).setObject(2, "A");
    }

    @Test
    void failureRollsBackAllTablesAndNodeFails() throws SQLException {
        PreparedStatement psOrder = mock(PreparedStatement.class);
        when(psOrder.executeUpdate()).thenReturn(1);
        PreparedStatement psBad = mock(PreparedStatement.class);
        when(psBad.executeUpdate()).thenThrow(new SQLException("boom"));
        when(connection.prepareStatement(anyString())).thenReturn(psOrder, psBad);
        when(connection.getAutoCommit()).thenReturn(true);

        ObjectNode config = objectMapper.createObjectNode();
        config.set("updates", objectMapper.createArrayNode()
                .add(updateEntry(null, "wf_biz_order",
                        objectMapper.createArrayNode().add(setOp("status", "SET", "PAID")),
                        objectMapper.createArrayNode()))
                .add(updateEntry(null, "wf_biz_stock",
                        objectMapper.createArrayNode().add(setOp("qty", "ADD", "1")),
                        objectMapper.createArrayNode())));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow(multiNode("du_rb", config)), Map.of());

        // 任一表失败 → 整体回滚且节点失败（走 errorAction），无汇总输出
        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.outputVars()).doesNotContainKey("du_rb");
        verify(connection).setAutoCommit(false);
        verify(connection).rollback();
        verify(connection, never()).commit();
        verify(connection).setAutoCommit(true); // finally 恢复
        verify(connection, times(2)).prepareStatement(anyString()); // 第 1 条已执行后第 2 条失败
    }

    @Test
    void configErrorsSurfaceBeforeAnyExecution() throws SQLException {
        // 第 2 项表不存在 → 编译期暴露，任何语句都不执行
        ObjectNode config = objectMapper.createObjectNode();
        config.set("updates", objectMapper.createArrayNode()
                .add(updateEntry(null, "wf_biz_order",
                        objectMapper.createArrayNode().add(setOp("status", "SET", "PAID")),
                        objectMapper.createArrayNode()))
                .add(updateEntry(null, "no_such_table",
                        objectMapper.createArrayNode().add(setOp("qty", "ADD", "1")),
                        objectMapper.createArrayNode())));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow(multiNode("du_cfg", config)), Map.of());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("目标表不存在");
        verify(connection, never()).prepareStatement(anyString());
        verify(connection, never()).setAutoCommit(false);
    }

    @Test
    void aliasMustBeUniqueAndValid() {
        // 重复别名
        ObjectNode dup = objectMapper.createObjectNode();
        dup.set("updates", objectMapper.createArrayNode()
                .add(updateEntry("order", "wf_biz_order",
                        objectMapper.createArrayNode().add(setOp("status", "SET", "PAID")),
                        objectMapper.createArrayNode()))
                .add(updateEntry("order", "wf_biz_stock",
                        objectMapper.createArrayNode().add(setOp("qty", "ADD", "1")),
                        objectMapper.createArrayNode())));
        LogicFlowEngine.RunOutcome dupOutcome = engine.run(flow(multiNode("du_dup", dup)), Map.of());
        assertThat(dupOutcome.status()).isEqualTo("FAILED");
        assertThat(dupOutcome.errorMessage()).contains("别名重复");

        // 非法别名
        ObjectNode bad = objectMapper.createObjectNode();
        bad.set("updates", objectMapper.createArrayNode()
                .add(updateEntry("bad-name", "wf_biz_order",
                        objectMapper.createArrayNode().add(setOp("status", "SET", "PAID")),
                        objectMapper.createArrayNode())));
        LogicFlowEngine.RunOutcome badOutcome = engine.run(flow(multiNode("du_bad", bad)), Map.of());
        assertThat(badOutcome.status()).isEqualTo("FAILED");
        assertThat(badOutcome.errorMessage()).contains("别名非法");
    }

    @Test
    void updatesTakePrecedenceOverLegacySingleTable() throws SQLException {
        PreparedStatement psStock = mock(PreparedStatement.class);
        when(psStock.executeUpdate()).thenReturn(2);
        when(connection.prepareStatement(anyString())).thenReturn(psStock);
        when(connection.getAutoCommit()).thenReturn(true);
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(99);

        ObjectNode config = objectMapper.createObjectNode();
        config.put("table", "wf_biz_order"); // 遗留单表字段同时存在 → updates 优先
        config.set("updates", objectMapper.createArrayNode()
                .add(updateEntry(null, "wf_biz_stock",
                        objectMapper.createArrayNode().add(setOp("qty", "ADD", "1")),
                        objectMapper.createArrayNode())));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow(multiNode("du_mix", config)), Map.of());

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(summaryOf(outcome, "du_mix").get("total")).isEqualTo(1);
        verify(jdbcTemplate, never()).update(anyString(), any(Object[].class)); // 未走单表路径
    }

    @Test
    void legacySingleFormStillReturnsAffectedCount() throws SQLException {
        when(jdbcTemplate.update(anyString(), any(Object[].class))).thenReturn(4);

        ObjectNode config = objectMapper.createObjectNode();
        config.put("table", "wf_biz_order");
        config.set("setOps", objectMapper.createArrayNode().add(setOp("status", "SET", "PAID")));
        config.set("where", objectMapper.createArrayNode());

        LogicFlowEngine.RunOutcome outcome = engine.run(flow(multiNode("du_s", config)), Map.of());

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.outputVars().get("du_s")).isEqualTo(4); // 存量行为不变
        verify(connection, never()).setAutoCommit(false); // 单表路径不进事务
        verify(jdbcTemplate).update(anyString(), any(Object[].class));
    }

    @Test
    void implicitOutputDisabledWhenExplicitResultsDeclared() throws SQLException {
        PreparedStatement psOrder = mock(PreparedStatement.class);
        when(psOrder.executeUpdate()).thenReturn(3);
        when(connection.prepareStatement(anyString())).thenReturn(psOrder, psOrder);
        when(connection.getAutoCommit()).thenReturn(true);

        LogicFlowDsl.NodeDef node = multiNode("du_ex", objectMapper.createObjectNode().set("updates",
                objectMapper.createArrayNode()
                        .add(updateEntry("order", "wf_biz_order",
                                objectMapper.createArrayNode().add(setOp("status", "SET", "PAID")),
                                objectMapper.createArrayNode()))
                        .add(updateEntry(null, "wf_biz_stock",
                                objectMapper.createArrayNode().add(setOp("qty", "ADD", "1")),
                                objectMapper.createArrayNode()))));
        // KEY 拆包：按名取汇总顶层键（如 order）
        LogicFlowDsl.ResultVarDef def = new LogicFlowDsl.ResultVarDef();
        def.setName("order");
        def.setMode("KEY");
        node.setResults(List.of(def));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow(node), Map.of());

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.outputVars()).containsKey("order");
        assertThat(outcome.outputVars()).doesNotContainKey("du_ex");
    }
}
