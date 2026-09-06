package com.workflow.example.join;

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

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * FORM 数据源 config/sql 双模式端到端集成测试（H2 真实 SQL）：
 * <ul>
 *   <li>config：metadata 推导虚拟列；query JOIN 关联行、关联筛选/排序、分页</li>
 *   <li>sql：   metadata 合并管理员声明列；query 模板包裹、运行时参数白名单透传</li>
 * </ul>
 * 说明：DdlBuilder 生成 MySQL 方言 DDL，H2 无法执行建表，故 @MockitoBean DynamicTableManager
 * 屏蔽发布建表，并在 @BeforeEach 手工预建 H2 兼容表（wf_biz_order + wf_biz_customer）。
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class FormJoinQueryIntegrationTest {

    private static final String ORDER_KEY = "order";
    private static final String CUSTOMER_KEY = "customer";
    private static final String TENANT_ID = "t1";

    private static final String ORDER_COLUMNS = """
            [
              {"key":"customer_id","label":"客户ID","columnType":"VARCHAR","length":64,"required":false,"unique":false,"indexed":false,"hidden":false},
              {"key":"order_no","label":"订单号","columnType":"VARCHAR","length":64,"required":false,"unique":false,"indexed":false,"hidden":false},
              {"key":"total","label":"总金额","columnType":"DECIMAL","length":10,"scale":2,"required":false,"unique":false,"indexed":false,"hidden":false}
            ]
            """;

    private static final String CUSTOMER_COLUMNS = """
            [
              {"key":"name","label":"客户名称","columnType":"VARCHAR","length":128,"required":false,"unique":false,"indexed":false,"hidden":false}
            ]
            """;

    private static final String CONFIG_PARAMS = """
            {"queryMode":"config","joins":[{"alias":"c","targetFormKey":"customer","localField":"customer_id",
             "foreignField":"id","joinField":"name","virtualKey":"customer_name","label":"客户名称",
             "sortable":true,"filterable":true}]}
            """;

    private static final String SQL_PARAMS = """
            {"queryMode":"sql","query":"SELECT order_no, SUM(total) AS total_amount FROM wf_biz_order WHERE tenant_id = :tenantId GROUP BY order_no",
             "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true},
                        {"key":"total_amount","label":"总金额","columnType":"DECIMAL","sortable":true,"filterable":true}],
             "params":[]}
            """;

    private static final String SQL_PARAMS_WITH_RUNTIME = """
            {"queryMode":"sql","query":"SELECT order_no, total FROM wf_biz_order WHERE tenant_id = :tenantId AND order_no = :orderNoKw",
             "columns":[{"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true},
                        {"key":"total","label":"总金额","columnType":"DECIMAL","sortable":true,"filterable":true}],
             "params":["orderNoKw"]}
            """;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private FormDefinitionService formDefService;

    @Autowired
    private UnifiedDataSourceAdapter adapter;

    /** 屏蔽发布建表（DdlBuilder 为 MySQL 方言，H2 不兼容）；表由 @BeforeEach 手工预建 */
    @MockitoBean
    private DynamicTableManager tableManager;

    @BeforeEach
    void setUp() {
        TenantContext.setTenantId(TENANT_ID);
        when(tableManager.tableExists(anyString())).thenReturn(true);
        ensureTables();
        ensureFormDefinition(ORDER_KEY, "订单", ORDER_COLUMNS);
        ensureFormDefinition(CUSTOMER_KEY, "客户", CUSTOMER_COLUMNS);
        seedData();
    }

    @AfterEach
    void tearDown() {
        TenantContext.clear();
    }

    @Test
    void configMetadata_appendsVirtualColumns() {
        DataSourceMetadata meta = adapter.metadata(formDs(ORDER_KEY, CONFIG_PARAMS));

        List<String> keys = meta.getColumns().stream().map(ColumnConfig::getKey).toList();
        assertThat(keys).contains("customer_id", "order_no", "total", "customer_name");
        ColumnConfig virtual = meta.getColumns().stream()
                .filter(c -> "customer_name".equals(c.getKey())).findFirst().orElseThrow();
        assertThat(virtual.getLabel()).isEqualTo("客户名称");
        assertThat(virtual.getColumnType()).isEqualTo("VARCHAR");
        assertThat(virtual.getSortable()).isTrue();
        assertThat(virtual.getFilterable()).isTrue();
        assertThat(meta.isWritable()).isTrue();
    }

    @Test
    void configQuery_returnsJoinedRowsWithVirtualColumn() {
        BizDataPageVO page = adapter.query(formDs(ORDER_KEY, CONFIG_PARAMS), pageReq(1, 20));

        assertThat(page.getTotal()).isEqualTo(3);
        assertThat(page.getRecords()).hasSize(3);
        Map<String, Object> newest = page.getRecords().get(0).getData();
        assertThat(newest).containsEntry("order_no", "ORD-003");
        assertThat(newest).containsEntry("customer_name", "王五");
        assertThat(newest).containsEntry("customer_id", "c1");
    }

    @Test
    void configQuery_filterByVirtualColumn_andSortByMainColumn() {
        BizDataQueryRequest req = pageReq(1, 20);
        req.setFilter("{\"customer_name\":\"王五\"}");
        req.setSort("total");
        req.setOrder("desc");

        BizDataPageVO page = adapter.query(formDs(ORDER_KEY, CONFIG_PARAMS), req);

        assertThat(page.getTotal()).isEqualTo(2);
        assertThat(page.getRecords()).hasSize(2);
        assertThat(page.getRecords().get(0).getData().get("customer_name")).isEqualTo("王五");
        assertThat(page.getRecords().get(0).getData().get("order_no")).isEqualTo("ORD-003");
        assertThat(page.getRecords().get(1).getData().get("order_no")).isEqualTo("ORD-001");
    }

    @Test
    void configQuery_sortByVirtualColumn() {
        BizDataQueryRequest req = pageReq(1, 20);
        req.setSort("customer_name");
        req.setOrder("asc");

        BizDataPageVO page = adapter.query(formDs(ORDER_KEY, CONFIG_PARAMS), req);

        assertThat(page.getTotal()).isEqualTo(3);
        // 李四(U+674E) < 王五(U+738B)：asc 首条为李四的订单
        assertThat(page.getRecords().get(0).getData().get("customer_name")).isEqualTo("李四");
    }

    @Test
    void configQuery_paging() {
        BizDataPageVO page = adapter.query(formDs(ORDER_KEY, CONFIG_PARAMS), pageReq(2, 2));

        assertThat(page.getTotal()).isEqualTo(3);
        assertThat(page.getRecords()).hasSize(1);
        assertThat(page.getPage()).isEqualTo(2);
    }

    @Test
    void sqlMetadata_appendsDeclaredColumns() {
        DataSourceMetadata meta = adapter.metadata(formDs(ORDER_KEY, SQL_PARAMS));

        List<String> keys = meta.getColumns().stream().map(ColumnConfig::getKey).toList();
        assertThat(keys).contains("customer_id", "order_no", "total", "total_amount");
        ColumnConfig ta = meta.getColumns().stream()
                .filter(c -> "total_amount".equals(c.getKey())).findFirst().orElseThrow();
        assertThat(ta.getLabel()).isEqualTo("总金额");
        assertThat(ta.getColumnType()).isEqualTo("DECIMAL");
        assertThat(ta.getSortable()).isTrue();
        assertThat(ta.getFilterable()).isTrue();
    }

    @Test
    void sqlQuery_wrapsTemplate() {
        BizDataPageVO page = adapter.query(formDs(ORDER_KEY, SQL_PARAMS), pageReq(1, 20));

        assertThat(page.getTotal()).isEqualTo(3);
        assertThat(page.getRecords()).hasSize(3);
        Map<String, Object> first = page.getRecords().get(0).getData();
        assertThat(first).containsKey("order_no");
        assertThat(first).containsKey("total_amount");
    }

    @Test
    void sqlQuery_runtimeParamsWhitelist() {
        BizDataQueryRequest req = pageReq(1, 20);
        req.setParams("{\"orderNoKw\":\"ORD-002\"}");

        BizDataPageVO page = adapter.query(formDs(ORDER_KEY, SQL_PARAMS_WITH_RUNTIME), req);

        assertThat(page.getTotal()).isEqualTo(1);
        assertThat(page.getRecords()).hasSize(1);
        assertThat(page.getRecords().get(0).getData().get("order_no")).isEqualTo("ORD-002");
    }

    // ==================== helpers ====================

    private static BizDataQueryRequest pageReq(int page, int size) {
        BizDataQueryRequest req = new BizDataQueryRequest();
        req.setPage(page);
        req.setSize(size);
        return req;
    }

    private static DataSourceDefinition formDs(String formKey, String params) {
        DataSourceDefinition ds = new DataSourceDefinition();
        ds.setType("FORM");
        ds.setFormKey(formKey);
        ds.setParams(params);
        ds.setName(formKey);
        ds.setTenantId(TENANT_ID);
        return ds;
    }

    /** 手工预建 H2 兼容业务表（列结构对齐 DdlBuilder 固定列 + 业务列） */
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

    /** 幂等发布表单定义（跨测试保留） */
    private void ensureFormDefinition(String key, String name, String columnConfig) {
        try {
            formDefService.getByKey(key);
            return; // 已存在（跨测试保留），跳过
        } catch (RuntimeException e) {
            // 不存在，创建
        }
        var def = formDefService.create(name, key, "BUSINESS");
        formDefService.update(def.getId(), null, null, "[]", columnConfig, null);
        formDefService.publish(def.getId());
    }

    private void seedData() {
        insertCustomer("c1", "王五");
        insertCustomer("c2", "李四");
        insertOrder("o1", "c1", "ORD-001", 100.00, "2026-01-01 00:00:01");
        insertOrder("o2", "c2", "ORD-002", 200.00, "2026-01-01 00:00:02");
        insertOrder("o3", "c1", "ORD-003", 300.00, "2026-01-01 00:00:03");
    }

    private void insertCustomer(String id, String name) {
        jdbcTemplate.update("""
                INSERT INTO wf_biz_customer (id, tenant_id, name, version, created_at, updated_at)
                VALUES (?, ?, ?, 1, ?, ?)
                """, id, TENANT_ID, name, ts("2026-01-01 00:00:00"), ts("2026-01-01 00:00:00"));
    }

    private void insertOrder(String id, String customerId, String orderNo, double total, String createdAt) {
        jdbcTemplate.update("""
                INSERT INTO wf_biz_order (id, tenant_id, customer_id, order_no, total, version, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, ?, ?)
                """, id, TENANT_ID, customerId, orderNo, total, ts(createdAt), ts(createdAt));
    }

    private static Timestamp ts(String s) {
        return Timestamp.valueOf(s);
    }
}