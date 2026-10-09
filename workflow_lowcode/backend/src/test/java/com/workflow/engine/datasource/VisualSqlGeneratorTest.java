package com.workflow.engine.datasource;

import com.workflow.api.dto.VisualQueryRequest;
import com.workflow.api.dto.VisualQueryRequest.*;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class VisualSqlGeneratorTest {

    @Test
    void generate_simpleSelect() {
        var req = new VisualQueryRequest(
            "wf_biz_order", "m", List.of(),
            List.of("m.order_no", "m.total"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("SELECT m.order_no, m.total");
        assertThat(sql).contains("FROM wf_biz_order m");
        assertThat(sql).contains("WHERE m.tenant_id = :tenantId");
    }

    @Test
    void generate_withJoin() {
        var join = new JoinClause("c", "wf_biz_customer", "LEFT",
            "c.id = m.customer_id", List.of("c.name"));
        var req = new VisualQueryRequest(
            "wf_biz_order", "m", List.of(join),
            List.of("m.order_no", "c.name AS customer_name"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("LEFT JOIN wf_biz_customer c ON c.id = m.customer_id");
        assertThat(sql).contains("c.name AS customer_name");
    }

    @Test
    void generate_withWhere() {
        var where = new WhereCondition("m.total", ">=", 100);
        var req = new VisualQueryRequest(
            "order", "m", List.of(),
            List.of("m.order_no"),
            List.of(where), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("m.total >= ?");
    }

    @Test
    void generate_withOrderBy() {
        var order = new OrderClause("m.created_at", "DESC");
        var req = new VisualQueryRequest(
            "order", "m", List.of(),
            List.of("m.order_no"),
            List.of(), List.of(order), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("ORDER BY m.created_at DESC");
    }

    @Test
    void generate_formKeyAsTableName() {
        // generator 直接使用传入的表名（formKey 映射由 adapter 层完成）
        var req = new VisualQueryRequest(
            "wf_biz_order", "m", List.of(),
            List.of("m.order_no"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("FROM wf_biz_order m");
    }

    @Test
    void generate_physicalTableName() {
        var req = new VisualQueryRequest(
            "raw_logs", "m", List.of(),
            List.of("m.id"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("FROM raw_logs m");
    }

    @Test
    void generate_multipleJoins() {
        var join1 = new JoinClause("c", "wf_biz_customer", "LEFT", "c.id = m.customer_id", List.of("c.name"));
        var join2 = new JoinClause("p", "wf_biz_product", "LEFT", "p.id = m.product_id", List.of("p.title"));
        var req = new VisualQueryRequest(
            "wf_biz_order", "m", List.of(join1, join2),
            List.of("m.order_no", "c.name AS customer_name", "p.title AS product_title"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("LEFT JOIN wf_biz_customer c ON c.id = m.customer_id");
        assertThat(sql).contains("LEFT JOIN wf_biz_product p ON p.id = m.product_id");
    }

    @Test
    void generate_multipleWhere() {
        var w1 = new WhereCondition("m.total", ">=", 100);
        var w2 = new WhereCondition("m.total", "<=", 1000);
        var req = new VisualQueryRequest(
            "order", "m", List.of(),
            List.of("m.order_no"),
            List.of(w1, w2), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).contains("m.total >= ?");
        assertThat(sql).contains("m.total <= ?");
    }

    @Test
    void generate_noOrderBy() {
        var req = new VisualQueryRequest(
            "order", "m", List.of(),
            List.of("m.order_no"),
            List.of(), List.of(), List.of()
        );
        String sql = VisualSqlGenerator.generate(req);
        assertThat(sql).doesNotContain("ORDER BY");
    }
}
