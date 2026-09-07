package com.workflow.example.sql;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataQueryRequest;
import com.workflow.api.dto.DataSourceMetadata;
import com.workflow.engine.datasource.UnifiedDataSourceAdapter;
import com.workflow.engine.datasource.entity.DataSourceDefinition;
import com.workflow.engine.form.FormDefinitionService;
import com.workflow.engine.form.column.ColumnConfig;
import com.workflow.engine.form.column.DynamicTableManager;
import com.workflow.engine.tenant.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * SQL 数据源端到端集成测试（H2 真实 SQL）：
 * - visual 模式：可视化配置→查询→关联数据
 * - formKey 绑定：主表单绑定→CRUD 可写
 * - 无 formKey：只读
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class SqlDataSourceIntegrationTest {

    private static final String TENANT_ID = "t1";

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FormDefinitionService formDefService;

    @Autowired
    private UnifiedDataSourceAdapter adapter;

    @MockitoBean
    private DynamicTableManager tableManager;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        when(tableManager.tableExists(anyString())).thenReturn(true);
        ensureTables();
        ensureFormDefinition();
        seedData();
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void sqlVisualMode_queryReturnsJoinedRows() {
        DataSourceDefinition ds = sqlDs(null, """
                {"queryMode":"visual",
                 "query":"SELECT m.order_no, m.total, c.name AS customer_name FROM wf_biz_order m LEFT JOIN wf_biz_customer c ON c.id = m.customer_id WHERE m.tenant_id = :tenantId",
                 "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true},
                            {"key":"total","label":"总金额","columnType":"DECIMAL","sortable":true,"filterable":true},
                            {"key":"customer_name","label":"客户名称","columnType":"VARCHAR","sortable":true,"filterable":true}],
                 "params":[]}
                """);

        BizDataPageVO page = adapter.query(ds, pageReq(1, 20));

        assertThat(page.getTotal()).isEqualTo(3);
        Map<String, Object> first = page.getRecords().get(0).getData();
        assertThat(first).containsKey("order_no");
        assertThat(first).containsKey("customer_name");
    }

    @Test
    void sqlVisualMode_filterAndSort() {
        DataSourceDefinition ds = sqlDs(null, """
                {"queryMode":"visual",
                 "query":"SELECT m.order_no, m.total, c.name AS customer_name FROM wf_biz_order m LEFT JOIN wf_biz_customer c ON c.id = m.customer_id WHERE m.tenant_id = :tenantId",
                 "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true},
                            {"key":"total","label":"总金额","columnType":"DECIMAL","sortable":true,"filterable":true},
                            {"key":"customer_name","label":"客户名称","columnType":"VARCHAR","sortable":true,"filterable":true}],
                 "params":[]}
                """);
        BizDataQueryRequest req = pageReq(1, 20);
        req.setFilter("{\"customer_name\":\"王五\"}");
        req.setSort("total");
        req.setOrder("desc");

        BizDataPageVO page = adapter.query(ds, req);

        assertThat(page.getTotal()).isEqualTo(2);
        assertThat(page.getRecords().get(0).getData().get("customer_name")).isEqualTo("王五");
    }

    @Test
    void sqlVisualMode_formKeyBinding_writable() {
        DataSourceDefinition ds = sqlDs("order", """
                {"queryMode":"sql",
                 "query":"SELECT m.order_no FROM wf_biz_order m WHERE m.tenant_id = :tenantId",
                 "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true}],
                 "params":[]}
                """);

        DataSourceMetadata meta = adapter.metadata(ds);

        assertThat(meta.isWritable()).isTrue();
        assertThat(meta.getFormKey()).isEqualTo("order");
    }

    @Test
    void sqlVisualMode_noFormKey_readonly() {
        DataSourceDefinition ds = sqlDs(null, """
                {"queryMode":"sql",
                 "query":"SELECT order_no FROM wf_biz_order WHERE tenant_id = :tenantId",
                 "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true}],
                 "params":[]}
                """);

        DataSourceMetadata meta = adapter.metadata(ds);

        assertThat(meta.isWritable()).isFalse();
    }

    // ==================== helpers ====================

    private static BizDataQueryRequest pageReq(int page, int size) {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(page);
        req.setSize(size);
        return req;
    }

    private static DataSourceDefinition sqlDs(String formKey, String params) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setType("SQL");
        ds.setFormKey(formKey);
        ds.setParams(params);
        ds.setName("sql-test");
        ds.setTenantId(TENANT_ID);
        return ds;
    }

    private void ensureTables() {
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS wf_biz_order (
                    id VARCHAR(64) NOT NULL,
                    tenant_id VARCHAR(64) NOT NULL,
                    customer_id VARCHAR(64),
                    order_no VARCHAR(64),
                    total DECIMAL(10,2),
                    version INT NOT NULL DEFAULT 1,
                    created_by VARCHAR(50),
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (id)
                )
                """);
        jdbcTemplate.execute("""
                CREATE TABLE IF NOT EXISTS wf_biz_customer (
                    id VARCHAR(64) NOT NULL,
                    tenant_id VARCHAR(64) NOT NULL,
                    name VARCHAR(128),
                    version INT NOT NULL DEFAULT 1,
                    created_by VARCHAR(50),
                    created_at TIMESTAMP,
                    updated_at TIMESTAMP,
                    PRIMARY KEY (id)
                )
                """);
    }

    private void ensureFormDefinition() {
        try {
            formDefService.getByKey("order");
            return;
        } catch (RuntimeException e) {
            // 不存在，创建
        }
        var def = formDefService.create("订单", "order", "BUSINESS");
        formDefService.update(def.getId(), null, null, "[]", """
                [{"key":"customer_id","label":"客户ID","columnType":"VARCHAR","length":64},
                 {"key":"order_no","label":"订单号","columnType":"VARCHAR","length":64},
                 {"key":"total","label":"总金额","columnType":"DECIMAL","length":10,"scale":2}]
                """, null);
        formDefService.publish(def.getId());
    }

    private void seedData() {
        jdbcTemplate.update("""
                INSERT INTO wf_biz_customer (id, tenant_id, name, version, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?)
                """, "c1", TENANT_ID, "王五", java.sql.Timestamp.valueOf("2026-01-01 00:00:00"), java.sql.Timestamp.valueOf("2026-01-01 00:00:00"));
        jdbcTemplate.update("""
                INSERT INTO wf_biz_customer (id, tenant_id, name, version, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?)
                """, "c2", TENANT_ID, "李四", java.sql.Timestamp.valueOf("2026-01-01 00:00:00"), java.sql.Timestamp.valueOf("2026-01-01 00:00:00"));
        jdbcTemplate.update("""
                INSERT INTO wf_biz_order (id, tenant_id, customer_id, order_no, total, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """, "o1", TENANT_ID, "c1", "ORD-001", 100.00, java.sql.Timestamp.valueOf("2026-01-01 00:00:01"), java.sql.Timestamp.valueOf("2026-01-01 00:00:01"));
        jdbcTemplate.update("""
                INSERT INTO wf_biz_order (id, tenant_id, customer_id, order_no, total, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """, "o2", TENANT_ID, "c2", "ORD-002", 200.00, java.sql.Timestamp.valueOf("2026-01-01 00:00:02"), java.sql.Timestamp.valueOf("2026-01-01 00:00:02"));
        jdbcTemplate.update("""
                INSERT INTO wf_biz_order (id, tenant_id, customer_id, order_no, total, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """, "o3", TENANT_ID, "c1", "ORD-003", 300.00, java.sql.Timestamp.valueOf("2026-01-01 00:00:03"), java.sql.Timestamp.valueOf("2026-01-01 00:00:03"));
    }
}
