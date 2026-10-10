package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.workflow.engine.form.column.ColumnInfo;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.logic.BackendBeanRegistry;
import com.workflow.engine.logic.config.BackendDataUpsertConfig;
import com.workflow.engine.logic.executor.GroovyScriptLogic;
import com.workflow.engine.logic.executor.HttpLogicExecutor;
import com.workflow.engine.logic.parse.VariableResolver;
import com.workflow.engine.logicflow.dsl.LogicFlowDsl;
import com.workflow.engine.logicflow.dsl.NodeType;
import com.workflow.engine.tenant.TenantProvider;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentMatchers;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * DATA_UPSERT（业务数据写入）引擎级单测：mock JdbcTemplate/DynamicTableManager/TenantProvider，
 * 覆盖 ODKU 编译（列序/参数序/onUpdate 追加）、created/updated/unchanged 输出翻译与 id 回填、
 * 唯一索引缺失拒绝、冲突键缺列/空值拒绝、管理列禁写、租户能力缺失降级。
 */
class LogicFlowDataUpsertTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private JdbcTemplate jdbcTemplate;
    private DynamicTableManager tableManager;
    private TenantProvider tenantProvider;
    private LogicFlowEngine engine;

    /** 捕获 upsert 执行下发：SQL 文本与绑定参数（Object[] 可变参数展开为单个数组实参）。 */
    private String capturedSql;
    private Object[] capturedParams;

    @BeforeEach
    void setUp() {
        HttpLogicExecutor httpExecutor = mock(HttpLogicExecutor.class);
        GroovyScriptLogic groovyScriptLogic = mock(GroovyScriptLogic.class);
        BackendBeanRegistry beanRegistry = mock(BackendBeanRegistry.class);
        VariableResolver variableResolver = mock(VariableResolver.class);
        when(variableResolver.resolve(anyString(), any())).thenAnswer(inv -> inv.getArgument(0));
        jdbcTemplate = mock(JdbcTemplate.class);
        tableManager = mock(DynamicTableManager.class);
        tenantProvider = mock(TenantProvider.class);
        when(tenantProvider.getTenantId()).thenReturn("t1");
        when(tableManager.tableExists("wf_biz_warehouse")).thenReturn(true);
        when(tableManager.findTableColumns("wf_biz_warehouse")).thenReturn(List.of(
                new ColumnInfo("id", "varchar", false, true),
                new ColumnInfo("tenant_id", "varchar", false, true),
                new ColumnInfo("version", "int", true, false),
                new ColumnInfo("created_by", "varchar", true, false),
                new ColumnInfo("created_at", "datetime", true, false),
                new ColumnInfo("updated_at", "datetime", true, false),
                new ColumnInfo("sku", "varchar", true, false),
                new ColumnInfo("qty", "int", true, false),
                new ColumnInfo("last_seen_by", "varchar", true, false)));
        // update(String, Object...)：记录 SQL 与参数后返回预设受影响行数
        when(jdbcTemplate.update(anyString(), ArgumentMatchers.any(Object[].class))).thenAnswer(inv -> {
            capturedSql = inv.getArgument(0);
            Object[] all = inv.getArguments();
            capturedParams = java.util.Arrays.copyOfRange(all, 1, all.length);
            return 1;
        });
        // 默认放行：(tenant_id, sku) 唯一索引存在（unique-keys 检查查询）
        when(jdbcTemplate.query(ArgumentMatchers.contains("STATISTICS"),
                ArgumentMatchers.<RowMapper<String>>any(), eq("wf_biz_warehouse"), eq("sku")))
                .thenReturn(List.of("uk_warehouse_sku"));
        engine = new LogicFlowEngine(httpExecutor, groovyScriptLogic, beanRegistry, variableResolver,
                objectMapper, null, jdbcTemplate, tableManager, null, tenantProvider, null, null);
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

    private static LogicFlowDsl flow(LogicFlowDsl.NodeDef target) {
        LogicFlowDsl dsl = new LogicFlowDsl();
        dsl.setNodes(List.of(node("s", NodeType.START), target, node("e", NodeType.END)));
        LogicFlowDsl.EdgeDef e1 = new LogicFlowDsl.EdgeDef();
        e1.setId("s->" + target.getId());
        e1.setSource("s");
        e1.setTarget(target.getId());
        LogicFlowDsl.EdgeDef e2 = new LogicFlowDsl.EdgeDef();
        e2.setId(target.getId() + "->e");
        e2.setSource(target.getId());
        e2.setTarget("e");
        dsl.setEdges(List.of(e1, e2));
        return dsl;
    }

    private ObjectNode valueOp(String column, String value) {
        ObjectNode op = objectMapper.createObjectNode();
        op.put("column", column);
        op.put("value", value);
        return op;
    }

    private LogicFlowDsl.NodeDef upsertNode(String id, ObjectNode config) {
        LogicFlowDsl.NodeDef node = node(id, NodeType.DATA_UPSERT);
        node.setConfig(config);
        return node;
    }

    private ObjectNode config(String conflictKey, ArrayNode values, ArrayNode onUpdate) {
        ObjectNode config = objectMapper.createObjectNode();
        config.put("formKey", "warehouse");
        config.put("conflictKey", conflictKey);
        config.set("values", values);
        if (onUpdate != null) {
            config.set("onUpdate", onUpdate);
        }
        return config;
    }

    private ArrayNode defaultValues() {
        return objectMapper.createArrayNode()
                .add(valueOp("sku", "{{formData.sku}}"))
                .add(valueOp("qty", "{{formData.qty}}"));
    }

    private Map<String, Object> vars() {
        return Map.of("formData", Map.of("sku", "SKU-001", "qty", 3), "operator", "alice");
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> outputOf(LogicFlowEngine.RunOutcome outcome, String nodeId) {
        return (Map<String, Object>) outcome.outputVars().get(nodeId);
    }

    // ------------------------------------------------------------------
    // 用例
    // ------------------------------------------------------------------

    @Test
    void insertsNewRecordAndReturnsCreatedWithGeneratedId() {
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_1", config("sku", defaultValues(), null))), vars());

        assertThat(outcome.status()).as(String.valueOf(outcome.errorMessage())).isEqualTo("SUCCESS");
        Map<String, Object> out = outputOf(outcome, "up_1");
        assertThat(out).isNotNull();
        assertThat(out.get("result")).isEqualTo("created");
        assertThat(out.get("affected")).isEqualTo(1);
        assertThat(out.get("table")).isEqualTo("wf_biz_warehouse");
        // 新增路径 id = 本次生成值（出现在绑定参数第 1 位）
        assertThat(String.valueOf(out.get("id"))).isEqualTo(String.valueOf(capturedParams[0]));
        assertThat(capturedParams[1]).isEqualTo("t1");
        assertThat(capturedParams[2]).isEqualTo("alice");

        // ODKU 语句形态：管理列填充 + 业务列 + ON DUPLICATE KEY UPDATE
        assertThat(capturedSql).startsWith("INSERT INTO wf_biz_warehouse ");
        assertThat(capturedSql).contains("(id, tenant_id, version, created_by, created_at, updated_at, sku, qty)");
        assertThat(capturedSql).contains("VALUES (?, ?, 1, ?, NOW(3), NOW(3), ?, ?)");
        assertThat(capturedSql)
                .contains("ON DUPLICATE KEY UPDATE version = version + 1, updated_at = NOW(3)")
                .contains("sku = VALUES(sku)")
                .contains("qty = VALUES(qty)");
        // 参数序：id/tenant/created_by 之后按 values 列序
        assertThat(capturedParams).hasSize(5);
        assertThat(capturedParams[3]).isEqualTo("SKU-001");
        assertThat(capturedParams[4]).isEqualTo(3);
    }

    @Test
    void updatesExistingRecordAndResolvesRowIdByConflictKey() {
        when(jdbcTemplate.update(anyString(), ArgumentMatchers.any(Object[].class))).thenAnswer(inv -> {
            capturedSql = inv.getArgument(0);
            Object[] all = inv.getArguments();
            capturedParams = java.util.Arrays.copyOfRange(all, 1, all.length);
            return 2;
        });
        when(jdbcTemplate.query(ArgumentMatchers.contains("SELECT id FROM"),
                ArgumentMatchers.<RowMapper<String>>any(), eq("t1"), eq("SKU-001")))
                .thenReturn(List.of("row-existing"));

        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_2", config("sku", defaultValues(), null))), vars());

        assertThat(outcome.status()).as(String.valueOf(outcome.errorMessage())).isEqualTo("SUCCESS");
        Map<String, Object> out = outputOf(outcome, "up_2");
        assertThat(out.get("result")).isEqualTo("updated");
        assertThat(out.get("affected")).isEqualTo(2);
        assertThat(out.get("id")).isEqualTo("row-existing");
    }

    @Test
    void unchangedPathMapsZeroAffectedAndBackfillsId() {
        when(jdbcTemplate.update(anyString(), ArgumentMatchers.any(Object[].class))).thenReturn(0);
        when(jdbcTemplate.query(ArgumentMatchers.contains("SELECT id FROM"),
                ArgumentMatchers.<RowMapper<String>>any(), eq("t1"), eq("SKU-001")))
                .thenReturn(List.of("row-same"));

        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_3", config("sku", defaultValues(), null))), vars());

        assertThat(outcome.status()).as(String.valueOf(outcome.errorMessage())).isEqualTo("SUCCESS");
        Map<String, Object> out = outputOf(outcome, "up_3");
        assertThat(out.get("result")).isEqualTo("unchanged");
        assertThat(out.get("affected")).isEqualTo(0);
        assertThat(out.get("id")).isEqualTo("row-same");
    }

    @Test
    void onUpdateAddsUpdateOnlyColumnBinding() {
        ArrayNode onUpdate = objectMapper.createArrayNode().add(valueOp("last_seen_by", "{{operator}}"));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_4", config("sku", defaultValues(), onUpdate))), vars());

        assertThat(outcome.status()).as(String.valueOf(outcome.errorMessage())).isEqualTo("SUCCESS");
        // 仅更新路径追加列：INSERT 镜像不含 last_seen_by，ODKU 子句以 ? 直绑
        assertThat(capturedSql).doesNotContain("last_seen_by, ");
        assertThat(capturedSql).contains(", last_seen_by = ?");
        assertThat(capturedParams).hasSize(6);
        assertThat(capturedParams[5]).isEqualTo("alice");
    }

    @Test
    void missingUniqueIndexRejectedBeforeExecution() {
        when(jdbcTemplate.query(ArgumentMatchers.contains("STATISTICS"),
                ArgumentMatchers.<RowMapper<String>>any(), eq("wf_biz_warehouse"), eq("sku")))
                .thenReturn(List.of());

        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_5", config("sku", defaultValues(), null))), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("唯一索引").contains("标记为唯一");
    }

    @Test
    void conflictKeyMissingFromValuesRejected() {
        ArrayNode values = objectMapper.createArrayNode().add(valueOp("qty", "1"));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_6", config("sku", values, null))), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("values 须包含冲突键列: sku");
    }

    @Test
    void blankConflictValueRejected() {
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_7", config("sku", defaultValues(), null))),
                Map.of("formData", Map.of("sku", " ", "qty", 1)));

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("冲突键取值为空");
    }

    @Test
    void managedColumnsRejected() {
        ArrayNode values = objectMapper.createArrayNode()
                .add(valueOp("sku", "A"))
                .add(valueOp("tenant_id", "evil"));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_8", config("sku", values, null))), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("禁止写入引擎管理列: tenant_id");
    }

    @Test
    void duplicateColumnsRejected() {
        ArrayNode values = objectMapper.createArrayNode()
                .add(valueOp("sku", "A"))
                .add(valueOp("qty", "1"))
                .add(valueOp("SKU", "B"));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_9", config("sku", values, null))), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("写入列重复: sku");
    }

    @Test
    void missingTableRejected() {
        when(tableManager.tableExists("wf_biz_nosuch")).thenReturn(false);
        ObjectNode cfg = config("sku", defaultValues(), null);
        cfg.put("formKey", "nosuch");
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_10", cfg)), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("目标表不存在");
    }

    @Test
    void unknownColumnRejected() {
        ArrayNode values = objectMapper.createArrayNode()
                .add(valueOp("sku", "A"))
                .add(valueOp("not_a_col", "x"));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_11", config("sku", values, null))), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("目标表缺少列: wf_biz_warehouse.not_a_col");
    }

    @Test
    void missingTenantProviderFailsFast() {
        LogicFlowEngine bare = new LogicFlowEngine(mock(HttpLogicExecutor.class), mock(GroovyScriptLogic.class),
                mock(BackendBeanRegistry.class), mock(VariableResolver.class), objectMapper,
                null, jdbcTemplate, tableManager);
        LogicFlowEngine.RunOutcome outcome = bare.run(
                flow(upsertNode("up_12", config("sku", defaultValues(), null))), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("引擎未装配租户能力");
    }

    // ------------------------------------------------------------------
    // 多表单形态（upserts）：单条目 = 单表等价输出；多条目单连接单事务汇总
    // ------------------------------------------------------------------

    private void stubLedgerTable() {
        when(tableManager.tableExists("wf_biz_ledger")).thenReturn(true);
        when(tableManager.findTableColumns("wf_biz_ledger")).thenReturn(List.of(
                new ColumnInfo("id", "varchar", false, true),
                new ColumnInfo("tenant_id", "varchar", false, true),
                new ColumnInfo("version", "int", true, false),
                new ColumnInfo("created_by", "varchar", true, false),
                new ColumnInfo("created_at", "datetime", true, false),
                new ColumnInfo("updated_at", "datetime", true, false),
                new ColumnInfo("order_no", "varchar", true, false),
                new ColumnInfo("amount", "int", true, false)));
        when(jdbcTemplate.query(ArgumentMatchers.contains("STATISTICS"),
                ArgumentMatchers.<RowMapper<String>>any(), eq("wf_biz_ledger"), eq("order_no")))
                .thenReturn(List.of("uk_ledger_order_no"));
    }

    private ObjectNode upsertEntry(String alias, String formKey, String conflictKey, ArrayNode values) {
        ObjectNode entry = objectMapper.createObjectNode();
        if (alias != null) {
            entry.put("alias", alias);
        }
        entry.put("formKey", formKey);
        entry.put("conflictKey", conflictKey);
        entry.set("values", values);
        return entry;
    }

    private ObjectNode multiConfig(ObjectNode... entries) {
        ObjectNode config = objectMapper.createObjectNode();
        ArrayNode arr = objectMapper.createArrayNode();
        for (ObjectNode e : entries) {
            arr.add(e);
        }
        config.set("upserts", arr);
        return config;
    }

    @SuppressWarnings("unchecked")
    private Connection stubTransaction(java.util.List<String> sqls) throws SQLException {
        Connection con = mock(Connection.class);
        PreparedStatement psDml = mock(PreparedStatement.class);
        PreparedStatement psQry = mock(PreparedStatement.class);
        java.sql.ResultSet rs = mock(java.sql.ResultSet.class);
        when(con.getAutoCommit()).thenReturn(true);
        // ODKU 语句：捕获 SQL + affected 序列（首条 created、次条 updated）
        when(con.prepareStatement(ArgumentMatchers.startsWith("INSERT"))).thenAnswer(inv -> {
            sqls.add(inv.getArgument(0));
            return psDml;
        });
        when(psDml.executeUpdate()).thenReturn(1, 2);
        // 冲突键反查（SELECT id ...）：返回既有行
        when(con.prepareStatement(ArgumentMatchers.startsWith("SELECT id"))).thenReturn(psQry);
        when(psQry.executeQuery()).thenReturn(rs);
        when(rs.next()).thenReturn(true);
        when(rs.getString(1)).thenReturn("row-existing");
        when(jdbcTemplate.execute(ArgumentMatchers.<ConnectionCallback<Map<String, Object>>>any()))
                .thenAnswer(inv -> ((ConnectionCallback<Map<String, Object>>) inv.getArgument(0)).doInConnection(con));
        return con;
    }

    @Test
    void multiUpsertSingleEntryMatchesLegacyOutput() {
        ObjectNode config = multiConfig(upsertEntry(null, "warehouse", "sku", defaultValues()));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_20", config)), vars());

        assertThat(outcome.status()).as(String.valueOf(outcome.errorMessage())).isEqualTo("SUCCESS");
        Map<String, Object> out = outputOf(outcome, "up_20");
        // 恰好 1 条 = 单表更新等价输出（无 total/created/updated 汇总键）
        assertThat(out.get("result")).isEqualTo("created");
        assertThat(out.get("affected")).isEqualTo(1);
        assertThat(out.get("table")).isEqualTo("wf_biz_warehouse");
        assertThat(out).doesNotContainKeys("total", "created", "updated");
        verify(jdbcTemplate, never()).execute(ArgumentMatchers.<ConnectionCallback<Map<String, Object>>>any());
    }

    @Test
    void multiUpsertRunsAllEntriesInSingleTransactionAndSummarizes() throws SQLException {
        stubLedgerTable();
        java.util.List<String> sqls = new java.util.ArrayList<>();
        Connection con = stubTransaction(sqls);

        ObjectNode config = multiConfig(
                upsertEntry(null, "warehouse", "sku", defaultValues()),
                upsertEntry("stock", "ledger", "order_no",
                        objectMapper.createArrayNode().add(valueOp("order_no", "{{formData.sku}}"))
                                .add(valueOp("amount", "5"))));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_21", config)), vars());

        assertThat(outcome.status()).as(String.valueOf(outcome.errorMessage())).isEqualTo("SUCCESS");
        Map<String, Object> out = outputOf(outcome, "up_21");
        assertThat(out.get("total")).isEqualTo(2);
        assertThat(out.get("created")).isEqualTo(1);
        assertThat(out.get("updated")).isEqualTo(1);
        assertThat(out).containsKey("u0").containsKey("stock");
        Map<String, Object> u0 = (Map<String, Object>) out.get("u0");
        assertThat(u0.get("result")).isEqualTo("created");
        assertThat(u0.get("affected")).isEqualTo(1);
        assertThat(u0.get("table")).isEqualTo("wf_biz_warehouse");
        Map<String, Object> stock = (Map<String, Object>) out.get("stock");
        assertThat(stock.get("result")).isEqualTo("updated");
        assertThat(stock.get("affected")).isEqualTo(2);
        // 两条 ODKU 分别指向两张物理表
        assertThat(sqls).hasSize(2);
        assertThat(sqls.get(0)).startsWith("INSERT INTO wf_biz_warehouse ");
        assertThat(sqls.get(1)).startsWith("INSERT INTO wf_biz_ledger ");
        // 事务语义：单连接、autoCommit 关闭、全成提交后恢复
        verify(con).setAutoCommit(false);
        verify(con).commit();
        verify(con).setAutoCommit(true);
    }

    @Test
    void multiUpsertRollsBackAllOnFailure() throws SQLException {
        stubLedgerTable();
        java.util.List<String> sqls = new java.util.ArrayList<>();
        Connection con = mock(Connection.class);
        PreparedStatement ps = mock(PreparedStatement.class);
        when(con.getAutoCommit()).thenReturn(true);
        when(con.prepareStatement(anyString())).thenAnswer(inv -> {
            sqls.add(inv.getArgument(0));
            return ps;
        });
        // 首条成功、次条失败 → 整体回滚
        when(ps.executeUpdate()).thenReturn(1).thenThrow(new SQLException("dup key"));
        when(jdbcTemplate.execute(ArgumentMatchers.<ConnectionCallback<Map<String, Object>>>any()))
                .thenAnswer(inv -> ((ConnectionCallback<Map<String, Object>>) inv.getArgument(0)).doInConnection(con));

        ObjectNode config = multiConfig(
                upsertEntry(null, "warehouse", "sku", defaultValues()),
                upsertEntry("stock", "ledger", "order_no",
                        objectMapper.createArrayNode().add(valueOp("order_no", "X"))
                                .add(valueOp("amount", "1"))));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_22", config)), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        verify(con).rollback();
        verify(con, never()).commit();
    }

    @Test
    void multiUpsertRejectsDuplicateAliasBeforeExecution() {
        stubLedgerTable();
        ObjectNode config = multiConfig(
                upsertEntry("same", "warehouse", "sku", defaultValues()),
                upsertEntry("same", "ledger", "order_no",
                        objectMapper.createArrayNode().add(valueOp("order_no", "X"))
                                .add(valueOp("amount", "1"))));
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_23", config)), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("多表单写入别名重复: same");
    }

    @Test
    void multiUpsertRejectsOverLimitBeforeExecution() {
        ObjectNode[] entries = new ObjectNode[BackendDataUpsertConfig.MAX_UPSERTS + 1];
        for (int i = 0; i < entries.length; i++) {
            entries[i] = upsertEntry(null, "warehouse", "sku", defaultValues());
        }
        ObjectNode config = multiConfig(entries);
        LogicFlowEngine.RunOutcome outcome = engine.run(
                flow(upsertNode("up_24", config)), vars());

        assertThat(outcome.status()).isEqualTo("FAILED");
        assertThat(outcome.errorMessage()).contains("多表单写入数超出上限");
    }
}
