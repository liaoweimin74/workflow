package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SQL 批处理（SQL_SCRIPT）节点引擎级单测：mock JdbcTemplate/Connection/PreparedStatement，
 * 覆盖汇总结构、参数绑定下发、abort 回滚与 continue 继续语义、隐式整体输出。
 */
class LogicFlowSqlScriptTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private JdbcTemplate jdbcTemplate;
    private Connection connection;
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
        // execute(ConnectionCallback) → 直连 mock Connection 执行
        when(jdbcTemplate.execute(ArgumentMatchers.<ConnectionCallback<Map<String, Object>>>any()))
                .thenAnswer(inv -> {
                    ConnectionCallback<?> cb = inv.getArgument(0);
                    return cb.doInConnection(connection);
                });
        engine = new LogicFlowEngine(httpExecutor, groovyScriptLogic, beanRegistry, variableResolver,
                objectMapper, null, jdbcTemplate, null);
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

    private LogicFlowDsl.NodeDef sqlNode(String id, String sql, String onError) {
        LogicFlowDsl.NodeDef node = node(id, NodeType.SQL_SCRIPT);
        ObjectNode config = objectMapper.createObjectNode();
        config.put("sql", sql);
        if (onError != null) {
            config.put("onError", onError);
        }
        node.setConfig(config);
        return node;
    }

    private static LogicFlowDsl.EdgeDef edge(String source, String target) {
        LogicFlowDsl.EdgeDef edge = new LogicFlowDsl.EdgeDef();
        edge.setId(source + "->" + target);
        edge.setSource(source);
        edge.setTarget(target);
        return edge;
    }

    private static LogicFlowDsl flow(LogicFlowDsl.NodeDef sqlNode) {
        LogicFlowDsl dsl = new LogicFlowDsl();
        dsl.setNodes(List.of(node("s", NodeType.START), sqlNode, node("e", NodeType.END)));
        dsl.setEdges(List.of(edge("s", sqlNode.getId()), edge(sqlNode.getId(), "e")));
        return dsl;
    }

    /** 标准结果集：id/sku 两列两行。 */
    private ResultSet mockQueryResultSet() throws SQLException {
        ResultSetMetaData md = mock(ResultSetMetaData.class);
        when(md.getColumnCount()).thenReturn(2);
        when(md.getColumnLabel(1)).thenReturn("id");
        when(md.getColumnLabel(2)).thenReturn("sku");
        ResultSet rs = mock(ResultSet.class);
        when(rs.getMetaData()).thenReturn(md);
        when(rs.next()).thenReturn(true, true, false);
        when(rs.getObject(1)).thenReturn(1L, 2L);
        when(rs.getObject(2)).thenReturn("A", "B");
        return rs;
    }

    private ResultSet mockKeysResultSet(long key) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        when(rs.next()).thenReturn(true, false);
        when(rs.getObject(1)).thenReturn(key);
        return rs;
    }

    // ------------------------------------------------------------------
    // 用例
    // ------------------------------------------------------------------

    @Test
    void executesStatementsAndWritesImplicitSummary() throws SQLException {
        PreparedStatement psUpdate = mock(PreparedStatement.class);
        when(psUpdate.executeUpdate()).thenReturn(3);
        PreparedStatement psInsert = mock(PreparedStatement.class);
        when(psInsert.executeUpdate()).thenReturn(1);
        ResultSet keysRs = mockKeysResultSet(101L);
        when(psInsert.getGeneratedKeys()).thenReturn(keysRs);
        PreparedStatement psQuery = mock(PreparedStatement.class);
        ResultSet queryRs = mockQueryResultSet();
        when(psQuery.executeQuery()).thenReturn(queryRs);
        when(connection.prepareStatement(anyString())).thenReturn(psUpdate, psQuery);
        when(connection.prepareStatement(anyString(), eq(Statement.RETURN_GENERATED_KEYS))).thenReturn(psInsert);
        when(connection.getAutoCommit()).thenReturn(true);

        String sql = "UPDATE t SET a = {{v}} WHERE id = {{id}}; "
                + "-- name: new_row\nINSERT INTO t(a) VALUES ({{v}}); "
                + "SELECT id, sku FROM t";
        LogicFlowEngine.RunOutcome outcome = engine.run(flow(sqlNode("sql1", sql, null)),
                Map.of("v", 5, "id", 7));

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) outcome.outputVars().get("sql1");
        assertThat(summary).isNotNull();
        assertThat(summary.get("total")).isEqualTo(3);
        assertThat(summary.get("succeeded")).isEqualTo(3);
        assertThat(summary.get("failed")).isEqualTo(0);
        assertThat(summary).doesNotContainKey("aborted");
        assertThat(summary.get("durationMs")).isInstanceOf(Number.class);

        @SuppressWarnings("unchecked")
        Map<String, Object> s0 = (Map<String, Object>) summary.get("s0");
        assertThat(s0.get("kind")).isEqualTo("DML");
        assertThat(s0.get("affected")).isEqualTo(3);
        assertThat(s0.get("ok")).isEqualTo(Boolean.TRUE);

        @SuppressWarnings("unchecked")
        Map<String, Object> s1 = (Map<String, Object>) summary.get("new_row");
        assertThat(s1.get("kind")).isEqualTo("INSERT");
        assertThat(s1.get("affected")).isEqualTo(1);
        assertThat(s1.get("insertKey")).isEqualTo(101L);

        @SuppressWarnings("unchecked")
        Map<String, Object> s2 = (Map<String, Object>) summary.get("s2");
        assertThat(s2.get("kind")).isEqualTo("QUERY");
        assertThat(s2.get("rows")).isEqualTo(2);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> data = (List<Map<String, Object>>) s2.get("data");
        assertThat(data).hasSize(2);
        assertThat(data.get(0)).containsEntry("id", 1L).containsEntry("sku", "A");

        // abort 缺省：单事务（autoCommit 关→commit→恢复）
        verify(connection).setAutoCommit(false);
        verify(connection).commit();
        verify(connection, never()).rollback();
        verify(connection).setAutoCommit(true);

        // 参数绑定下发：UPDATE 两条参数按序绑定
        verify(psUpdate).setObject(1, 5);
        verify(psUpdate).setObject(2, 7);
        verify(psInsert).setObject(1, 5);
    }

    @Test
    void abortModeRollsBackAndStopsOnFailure() throws SQLException {
        PreparedStatement psBad = mock(PreparedStatement.class);
        when(psBad.executeUpdate()).thenThrow(new SQLException("boom"));
        when(connection.prepareStatement(anyString())).thenReturn(psBad);
        when(connection.getAutoCommit()).thenReturn(true);

        String sql = "UPDATE t SET a = 1; INSERT INTO t VALUES (2)";
        LogicFlowEngine.RunOutcome outcome = engine.run(flow(sqlNode("sql_abort", sql, null)), Map.of());

        // 节点不抛错（下游按 failed/aborted 变量分支），流 SUCCESS
        assertThat(outcome.status()).isEqualTo("SUCCESS");
        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) outcome.outputVars().get("sql_abort");
        assertThat(summary.get("total")).isEqualTo(2);
        assertThat(summary.get("succeeded")).isEqualTo(0);
        assertThat(summary.get("failed")).isEqualTo(1);
        assertThat(summary.get("aborted")).isEqualTo(Boolean.TRUE);

        @SuppressWarnings("unchecked")
        Map<String, Object> s0 = (Map<String, Object>) summary.get("s0");
        assertThat(s0.get("ok")).isEqualTo(Boolean.FALSE);
        assertThat(String.valueOf(s0.get("error"))).contains("boom");
        // 第 2 条语句未执行（abort 即停）
        assertThat(summary).doesNotContainKey("s1");

        verify(connection).rollback();
        verify(connection, never()).commit();
        // 只尝试了第 1 条
        verify(connection, times(1)).prepareStatement(anyString());
    }

    @Test
    void continueModeRecordsErrorAndKeepsGoing() throws SQLException {
        PreparedStatement psBad = mock(PreparedStatement.class);
        when(psBad.executeUpdate()).thenThrow(new SQLException("dup key"));
        PreparedStatement psQuery = mock(PreparedStatement.class);
        ResultSet queryRs = mockQueryResultSet();
        when(psQuery.executeQuery()).thenReturn(queryRs);
        when(connection.prepareStatement(anyString())).thenReturn(psBad, psQuery);
        when(connection.getAutoCommit()).thenReturn(true);

        String sql = "UPDATE t SET a = 1; SELECT id, sku FROM t";
        LogicFlowEngine.RunOutcome outcome = engine.run(flow(sqlNode("sql_c", sql, "continue")), Map.of());

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        @SuppressWarnings("unchecked")
        Map<String, Object> summary = (Map<String, Object>) outcome.outputVars().get("sql_c");
        assertThat(summary.get("total")).isEqualTo(2);
        assertThat(summary.get("succeeded")).isEqualTo(1);
        assertThat(summary.get("failed")).isEqualTo(1);
        assertThat(summary).doesNotContainKey("aborted");
        @SuppressWarnings("unchecked")
        Map<String, Object> s1 = (Map<String, Object>) summary.get("s1");
        assertThat(s1.get("ok")).isEqualTo(Boolean.TRUE);
        assertThat(s1.get("rows")).isEqualTo(2);

        // continue 模式：不进事务，失败也回滚
        verify(connection, never()).setAutoCommit(false);
        verify(connection, never()).rollback();
        verify(connection, never()).commit();
    }

    @Test
    void explicitResultsSplitSummaryByKey() throws SQLException {
        PreparedStatement psQuery = mock(PreparedStatement.class);
        ResultSet queryRs = mockQueryResultSet();
        when(psQuery.executeQuery()).thenReturn(queryRs);
        when(connection.prepareStatement(anyString())).thenReturn(psQuery);
        when(connection.getAutoCommit()).thenReturn(true);

        LogicFlowDsl.NodeDef node = sqlNode("sql_split", "SELECT id, sku FROM t", null);
        // KEY 模式按声明名取汇总 Map 顶层键：单语句 → 键为 s0（深层子字段下游点路径取）
        LogicFlowDsl.ResultVarDef def = new LogicFlowDsl.ResultVarDef();
        def.setName("s0");
        def.setMode("KEY");
        node.setResults(List.of(def));

        LogicFlowEngine.RunOutcome outcome = engine.run(flow(node), Map.of());

        assertThat(outcome.status()).isEqualTo("SUCCESS");
        assertThat(outcome.outputVars()).containsKey("s0");
        assertThat(outcome.outputVars()).doesNotContainKey("sql_split");
        @SuppressWarnings("unchecked")
        Map<String, Object> s0 = (Map<String, Object>) outcome.outputVars().get("s0");
        assertThat(s0.get("rows")).isEqualTo(2);
    }

    @Test
    void configErrorsSurfaceBeforeExecution() {
        // 空语句（仅注释）→ 执行前抛错（走 FAIL_FLOW）
        LogicFlowEngine.RunOutcome outcome = engine.run(flow(sqlNode("sql_bad", "-- 只有注释", null)), Map.of());
        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("未包含可执行语句");
    }
}
