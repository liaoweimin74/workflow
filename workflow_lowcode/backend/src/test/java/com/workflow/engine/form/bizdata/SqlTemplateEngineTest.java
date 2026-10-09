package com.workflow.engine.form.bizdata;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SqlTemplateEngine / SqlTemplateValidator 单元测试：sql 模式管理员 SQL 模板校验与子查询包裹。
 */
class SqlTemplateEngineTest {

    private static final String TENANT = "t1";

    private static final String TEMPLATE =
            "SELECT o.id, o.order_no, c.name AS customer_name FROM wf_biz_order o"
                    + " LEFT JOIN wf_biz_customer c ON c.id = JSON_UNQUOTE(JSON_EXTRACT(o.customer_id,'$[0]'))"
                    + " WHERE o.tenant_id = :tenantId";

    private static List<JoinSqlGenerator.QueryColumn> columns() {
        return List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", true, true),
                new JoinSqlGenerator.QueryColumn("customer_name", "customer_name", "VARCHAR", true, true));
    }

    @Test
    void validate_validTemplate_passes() {
        SqlTemplateEngine.validate(TEMPLATE, columns());
        // 不抛异常即通过
    }

    @Test
    void validate_nonSelectStatement_rejected() {
        assertThatThrownBy(() -> SqlTemplateEngine.validate(
                "DELETE FROM wf_biz_order WHERE tenant_id = :tenantId", columns()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("仅允许 SELECT");
    }

    @Test
    void validate_missingTenantPlaceholder_rejected() {
        assertThatThrownBy(() -> SqlTemplateEngine.validate(
                "SELECT * FROM wf_biz_order", columns()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(":tenantId");
    }

    @Test
    void validate_blankQuery_rejected() {
        assertThatThrownBy(() -> SqlTemplateEngine.validate("   ", columns()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不能为空");
    }

    @Test
    void validate_noSortableColumn_allowed() {
        // SQL 数据源允许全部声明列不可排序：分页查询不要求默认排序列（缺省不加 ORDER BY）
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", false, false));

        SqlTemplateEngine.validate(
                "SELECT o.id, o.order_no FROM wf_biz_order o WHERE o.tenant_id = :tenantId", cols);
        // 不抛异常即通过
    }

    @Test
    void wrap_noSortableColumn_noOrderByFragment() {
        // 全部列不可排序 + 未请求排序 → 分页子查询不附加 ORDER BY
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", false, false));

        SqlQueryEngine.WrappedQuery wrapped = SqlTemplateEngine.wrap(
                "SELECT o.id, o.order_no FROM wf_biz_order o WHERE o.tenant_id = :tenantId",
                TENANT, cols, Map.of(), null, null, null, null, 1, 10);

        assertThat(wrapped.select().sql()).isEqualTo(
                "SELECT * FROM (SELECT o.id, o.order_no FROM wf_biz_order o"
                        + " WHERE o.tenant_id = ?) _qs LIMIT ? OFFSET ?");
        assertThat(wrapped.select().params()).containsExactly(TENANT, 10, 0);
    }

    @Test
    void wrap_explicitSortOnNonSortableColumn_stillRejected() {
        // 显式请求排序列仍受白名单校验（不可排序列拒绝）
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", false, false));

        assertThatThrownBy(() -> SqlTemplateEngine.wrap(
                "SELECT o.id, o.order_no FROM wf_biz_order o WHERE o.tenant_id = :tenantId",
                TENANT, cols, Map.of(), null, null, "order_no", "asc", 1, 10))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不可排序");
    }

    @Test
    void validate_columnNotInSelectOutput_rejected() {
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", true, true),
                new JoinSqlGenerator.QueryColumn("not_exist", "not_exist", "VARCHAR", true, true));

        assertThatThrownBy(() -> SqlTemplateEngine.validate(TEMPLATE, cols))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("不在查询结果中");
    }

    @Test
    void wrap_bindsTenantAndWrapsWithPagination() {
        SqlQueryEngine.WrappedQuery wrapped = SqlTemplateEngine.wrap(
                TEMPLATE, TENANT, columns(), Map.of(), null, null, null, null, 1, 10);

        assertThat(wrapped.select().sql()).isEqualTo(
                "SELECT * FROM (SELECT o.id, o.order_no, c.name AS customer_name FROM wf_biz_order o"
                        + " LEFT JOIN wf_biz_customer c ON c.id = JSON_UNQUOTE(JSON_EXTRACT(o.customer_id,'$[0]'))"
                        + " WHERE o.tenant_id = ?) _qs ORDER BY order_no DESC LIMIT ? OFFSET ?");
        assertThat(wrapped.select().params()).containsExactly(TENANT, 10, 0);
    }

    @Test
    void wrap_injectsDeclaredColumnFilter() {
        Map<String, Object> filters = Map.of("conditions", List.of(
                Map.of("column", "customer_name", "op", "like", "value", "张")));

        SqlQueryEngine.WrappedQuery wrapped = SqlTemplateEngine.wrap(
                TEMPLATE, TENANT, columns(), filters, null, null, null, null, 1, 10);

        assertThat(wrapped.select().sql()).isEqualTo(
                "SELECT * FROM (SELECT o.id, o.order_no, c.name AS customer_name FROM wf_biz_order o"
                        + " LEFT JOIN wf_biz_customer c ON c.id = JSON_UNQUOTE(JSON_EXTRACT(o.customer_id,'$[0]'))"
                        + " WHERE o.tenant_id = ?) _qs WHERE customer_name LIKE ?"
                        + " ORDER BY order_no DESC LIMIT ? OFFSET ?");
        assertThat(wrapped.select().params()).containsExactly(TENANT, "%张%", 10, 0);
    }

    @Test
    void wrap_sortsByDeclaredSortableColumn() {
        SqlQueryEngine.WrappedQuery wrapped = SqlTemplateEngine.wrap(
                TEMPLATE, TENANT, columns(), Map.of(), null, null, "customer_name", "asc", 1, 10);

        assertThat(wrapped.select().sql()).contains(") _qs ORDER BY customer_name ASC");
        assertThat(wrapped.select().params()).containsExactly(TENANT, 10, 0);
    }

    @Test
    void wrap_defaultSort_firstSortableColumn() {
        // order_no 声明为 sortable 且位于 columns 第一位 → 缺省排序
        SqlQueryEngine.WrappedQuery wrapped = SqlTemplateEngine.wrap(
                TEMPLATE, TENANT, columns(), Map.of(), null, null, null, null, 1, 10);

        assertThat(wrapped.select().sql()).contains(") _qs ORDER BY order_no DESC");
    }

    @Test
    void wrap_countSemantics_aggregationLocksWrapperCount() {
        String aggTemplate = "SELECT dept, SUM(amount) AS total FROM wf_biz_orders"
                + " WHERE tenant_id = :tenantId GROUP BY dept";
        List<JoinSqlGenerator.QueryColumn> aggColumns = List.of(
                new JoinSqlGenerator.QueryColumn("dept", "dept", "VARCHAR", true, true),
                new JoinSqlGenerator.QueryColumn("total", "total", "DECIMAL", true, true));

        SqlQueryEngine.WrappedQuery wrapped = SqlTemplateEngine.wrap(
                aggTemplate, TENANT, aggColumns, Map.of(), null, null, null, null, 1, 10);

        // COUNT 基于包裹结果集 —— 保证聚合后行数为 total，而非物理行数
        assertThat(wrapped.count().sql()).isEqualTo(
                "SELECT COUNT(*) FROM (SELECT dept, SUM(amount) AS total FROM wf_biz_orders"
                        + " WHERE tenant_id = ? GROUP BY dept) _qs");
        assertThat(wrapped.count().params()).containsExactly(TENANT);
    }

    @Test
    void wrap_rejectsUndeclaredPlaceholder() {
        String withParam = "SELECT o.id, o.order_no FROM wf_biz_order o"
                + " WHERE o.tenant_id = :tenantId AND o.created_at >= :startTime";
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", true, true));

        assertThatThrownBy(() -> SqlTemplateEngine.wrap(
                withParam, TENANT, cols, Map.of(), null, null, null, null, 1, 10))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数");
    }

    @Test
    void wrap_bindsDeclaredRuntimeParam() {
        String withParam = "SELECT o.id, o.order_no FROM wf_biz_order o"
                + " WHERE o.tenant_id = :tenantId AND o.created_at >= :startTime";
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", true, true));

        SqlQueryEngine.WrappedQuery wrapped = SqlTemplateEngine.wrap(
                withParam, TENANT, cols, Map.of(), null, null, null, null, 1, 10,
                List.of("startTime"), Map.of("startTime", "2026-01-01"));

        assertThat(wrapped.select().sql()).isEqualTo(
                "SELECT * FROM (SELECT o.id, o.order_no FROM wf_biz_order o"
                        + " WHERE o.tenant_id = ? AND o.created_at >= ?) _qs"
                        + " ORDER BY order_no DESC LIMIT ? OFFSET ?");
        assertThat(wrapped.select().params()).containsExactly(TENANT, "2026-01-01", 10, 0);
        assertThat(wrapped.count().params()).containsExactly(TENANT, "2026-01-01");
    }

    @Test
    void wrap_missingRuntimeValue_rejected() {
        String withParam = "SELECT o.id, o.order_no FROM wf_biz_order o"
                + " WHERE o.tenant_id = :tenantId AND o.created_at >= :startTime";
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", true, true));

        // 白名单声明了 startTime 但运行时未提供值 → 拒绝
        assertThatThrownBy(() -> SqlTemplateEngine.wrap(
                withParam, TENANT, cols, Map.of(), null, null, null, null, 1, 10,
                List.of("startTime"), Map.of()))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("缺少");
    }

    @Test
    void validate_placeholderNotInDeclaredParams_rejected() {
        String withParam = "SELECT o.id, o.order_no FROM wf_biz_order o"
                + " WHERE o.tenant_id = :tenantId AND o.created_at >= :startTime";
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", true, true));

        assertThatThrownBy(() -> SqlTemplateEngine.validate(withParam, cols, List.of("endTime")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("未声明参数");
    }

    @Test
    void validate_declaredParamName_illegalIdentifier_rejected() {
        String maybeParam = "SELECT o.id, o.order_no FROM wf_biz_order o"
                + " WHERE o.tenant_id = :tenantId";
        List<JoinSqlGenerator.QueryColumn> cols = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "order_no", "VARCHAR", true, true));

        assertThatThrownBy(() -> SqlTemplateEngine.validate(maybeParam, cols, List.of("bad name!")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("参数名");
    }

    @Test
    void wrap_noRuntimeSection_executesDefault() {
        // 模板仅含 :tenantId，未传 declared/runtime → 缺省正常执行
        SqlQueryEngine.WrappedQuery wrapped = SqlTemplateEngine.wrap(
                TEMPLATE, TENANT, columns(), Map.of(), null, null, null, null, 1, 10);

        assertThat(wrapped.select().params()).containsExactly(TENANT, 10, 0);
    }
}