package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.BizDataPageVO;
import com.workflow.api.dto.BizDataVO;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.jdbc.core.JdbcTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * SqlQueryEngine 单元测试：统一执行器（count+select 执行与子查询包裹）。
 */
@ExtendWith(MockitoExtension.class)
class SqlQueryEngineTest {

    @Mock
    private JdbcTemplate jdbcTemplate;

    private SqlQueryEngine engine;

    @BeforeEach
    void setUp() {
        engine = new SqlQueryEngine(jdbcTemplate);
    }

    @Test
    void execPage_runsCountAndSelect_assemblesPageVO() {
        BizDataQueryBuilder.SqlAndParams count = new BizDataQueryBuilder.SqlAndParams(
                "SELECT COUNT(1) FROM wf_biz_x WHERE tenant_id = ?", List.of("t1"));
        BizDataQueryBuilder.SqlAndParams select = new BizDataQueryBuilder.SqlAndParams(
                "SELECT * FROM wf_biz_x WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
                List.of("t1", 10, 0));
        when(jdbcTemplate.queryForObject(eq(count.sql()), eq(Long.class), any(Object[].class))).thenReturn(42L);
        when(jdbcTemplate.queryForList(eq(select.sql()), any(Object[].class)))
                .thenReturn(List.of(
                        Map.of("id", "r1", "name", "a"),
                        Map.of("id", "r2", "name", "b")));

        BizDataPageVO page = engine.execPage(1, 10, count, select,
                row -> new BizDataVO(String.valueOf(row.get("id")), row, null, null, null));

        assertThat(page.getTotal()).isEqualTo(42L);
        assertThat(page.getPage()).isEqualTo(1);
        assertThat(page.getSize()).isEqualTo(10);
        assertThat(page.getRecords()).hasSize(2);
        assertThat(page.getRecords().get(0).getId()).isEqualTo("r1");
        assertThat(page.getRecords().get(0).getData()).containsEntry("name", "a");
        verify(jdbcTemplate).queryForObject(eq(count.sql()), eq(Long.class), any(Object[].class));
        verify(jdbcTemplate).queryForList(eq(select.sql()), any(Object[].class));
    }

    @Test
    void execPage_nullTotal_defaultsToZero() {
        BizDataQueryBuilder.SqlAndParams count = new BizDataQueryBuilder.SqlAndParams(
                "SELECT COUNT(1) FROM wf_biz_x WHERE tenant_id = ?", List.of("t1"));
        BizDataQueryBuilder.SqlAndParams select = new BizDataQueryBuilder.SqlAndParams(
                "SELECT * FROM wf_biz_x WHERE tenant_id = ?", List.of("t1"));
        when(jdbcTemplate.queryForObject(eq(count.sql()), eq(Long.class), any(Object[].class))).thenReturn(null);
        when(jdbcTemplate.queryForList(eq(select.sql()), any(Object[].class))).thenReturn(List.of());

        BizDataPageVO page = engine.execPage(1, 20, count, select,
                row -> new BizDataVO(String.valueOf(row.get("id")), row, null, null, null));

        assertThat(page.getTotal()).isZero();
        assertThat(page.getRecords()).isEmpty();
    }

    @Test
    void wrapSubquery_select_injectsFilterOrderAndPagination() {
        BizDataQueryBuilder.SqlAndParams inner = new BizDataQueryBuilder.SqlAndParams(
                "SELECT create_time, SUM(amount) AS total FROM wf_biz_orders WHERE tenant_id = :tenantId",
                List.of("t1"));
        String filter = " WHERE create_time BETWEEN ? AND ?";
        List<Object> filterParams = List.of("2026-01-01", "2026-02-01");
        String orderBy = " ORDER BY total DESC";

        SqlQueryEngine.WrappedQuery wrapped = SqlQueryEngine.wrapSubquery(inner, filter, filterParams, orderBy, 2, 10);

        assertThat(wrapped.select().sql())
                .isEqualTo("SELECT * FROM (SELECT create_time, SUM(amount) AS total FROM wf_biz_orders"
                        + " WHERE tenant_id = :tenantId) _qs WHERE create_time BETWEEN ? AND ?"
                        + " ORDER BY total DESC LIMIT ? OFFSET ?");
        assertThat(wrapped.select().params())
                .containsExactly("t1", "2026-01-01", "2026-02-01", 10, 10);
    }

    @Test
    void wrapSubquery_select_nonPositiveSize_skipsPagination() {
        BizDataQueryBuilder.SqlAndParams inner = new BizDataQueryBuilder.SqlAndParams(
                "SELECT * FROM wf_biz_x WHERE tenant_id = ?", List.of("t1"));

        SqlQueryEngine.WrappedQuery wrapped = SqlQueryEngine.wrapSubquery(inner, "", List.of(), "", 1, 0);

        assertThat(wrapped.select().sql())
                .isEqualTo("SELECT * FROM (SELECT * FROM wf_biz_x WHERE tenant_id = ?) _qs");
        assertThat(wrapped.select().params()).containsExactly("t1");
        assertThat(wrapped.select().sql()).doesNotContain("LIMIT");
    }

    @Test
    void wrapSubquery_count_countsWrappedResultSet() {
        BizDataQueryBuilder.SqlAndParams inner = new BizDataQueryBuilder.SqlAndParams(
                "SELECT dept, SUM(amount) AS total FROM wf_biz_x GROUP BY dept", List.of());
        String filter = " WHERE total > ?";
        List<Object> filterParams = List.of(100);

        SqlQueryEngine.WrappedQuery wrapped = SqlQueryEngine.wrapSubquery(inner, filter, filterParams, "", 1, 10);

        assertThat(wrapped.count().sql())
                .isEqualTo("SELECT COUNT(*) FROM (SELECT dept, SUM(amount) AS total FROM wf_biz_x"
                        + " GROUP BY dept) _qs WHERE total > ?");
        assertThat(wrapped.count().params()).containsExactly(100);
    }
}