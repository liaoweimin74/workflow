package com.workflow.engine.form.bizdata;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * JoinSqlGenerator 单元测试：config 模式 joins[] → LEFT JOIN + 虚拟列 SQL 生成。
 * 覆盖单 JOIN / 多 JOIN / 关联排序 / 关联筛选 / 白名单拒绝。
 */
class JoinSqlGeneratorTest {

    private static final String MAIN = "wf_biz_order";
    private static final String TENANT = "t1";

    private static final JoinSqlGenerator.JoinConfig CUSTOMER_JOIN = new JoinSqlGenerator.JoinConfig(
            "c", "customer", "customer_id", "id", "name",
            "customer_name", "客户名称", true, true);

    private static final JoinSqlGenerator.QueryColumn MAIN_COLUMNS = null; // placeholder unused

    @Test
    void buildSelect_singleJoin_generatesLeftJoinAndVirtualColumn() {
        List<JoinSqlGenerator.QueryColumn> columns = queryColumns();
        BizDataQueryBuilder.SqlAndParams sql = JoinSqlGenerator.buildSelect(
                MAIN, TENANT, List.of(CUSTOMER_JOIN), columns,
                Map.of(), null, null, null, null, 0, 10);

        assertThat(sql.sql()).isEqualTo(
                "SELECT m.*, j1.name AS customer_name FROM wf_biz_order m"
                        + " LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))"
                        + " WHERE m.tenant_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?");
        assertThat(sql.params()).containsExactly(TENANT, 10, 0);
    }

    @Test
    void buildSelect_multiJoin_keepsOrderAndAvoidsCollision() {
        BizDataQueryBuilder.SqlAndParams sql = JoinSqlGenerator.buildSelect(
                MAIN, TENANT,
                List.of(CUSTOMER_JOIN,
                        new JoinSqlGenerator.JoinConfig("u", "user", "owner_id", "id", "nickname",
                                "owner_name", "负责人", true, false)),
                queryColumns(),
                Map.of(), null, null, null, null, 0, 10);

        assertThat(sql.sql()).isEqualTo(
                "SELECT m.*, j1.name AS customer_name, j2.nickname AS owner_name FROM wf_biz_order m"
                        + " LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))"
                        + " LEFT JOIN wf_biz_user j2 ON j2.id = JSON_UNQUOTE(JSON_EXTRACT(m.owner_id,'$[0]'))"
                        + " WHERE m.tenant_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?");
        assertThat(sql.params()).containsExactly(TENANT, 10, 0);
    }

    @Test
    void buildSelect_localFieldPlainColumn_joinsDirectlyWithoutJsonExtract() {
        JoinSqlGenerator.JoinConfig plain = new JoinSqlGenerator.JoinConfig(
                "c", "customer", "customer_id", "id", "name",
                "customer_name", "客户名称", true, true);

        // 主表列类型映射中 customer_id 为 VARCHAR（非 JSON）→ 直接等值连接
        List<JoinSqlGenerator.QueryColumn> plainColumns = List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "m.order_no", "VARCHAR", true, true),
                new JoinSqlGenerator.QueryColumn("customer_id", "m.customer_id", "VARCHAR", true, true),
                new JoinSqlGenerator.QueryColumn("customer_name", "j1.name", "VARCHAR", true, true));

        BizDataQueryBuilder.SqlAndParams sql = JoinSqlGenerator.buildSelect(
                MAIN, TENANT, List.of(plain), plainColumns,
                Map.of(), null, null, null, null, 0, 10);

        assertThat(sql.sql()).isEqualTo(
                "SELECT m.*, j1.name AS customer_name FROM wf_biz_order m"
                        + " LEFT JOIN wf_biz_customer j1 ON j1.id = m.customer_id"
                        + " WHERE m.tenant_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?");
    }

    @Test
    void buildSelect_virtualColumnFilter_injectsQualifiedCondition() {
        Map<String, Object> filters = Map.of("conditions", List.of(
                Map.of("column", "customer_name", "op", "like", "value", "张")));

        BizDataQueryBuilder.SqlAndParams sql = JoinSqlGenerator.buildSelect(
                MAIN, TENANT, List.of(CUSTOMER_JOIN), queryColumns(),
                filters, null, null, null, null, 0, 10);

        assertThat(sql.sql()).isEqualTo(
                "SELECT m.*, j1.name AS customer_name FROM wf_biz_order m"
                        + " LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))"
                        + " WHERE m.tenant_id = ? AND (j1.name LIKE ?)"
                        + " ORDER BY m.created_at DESC LIMIT ? OFFSET ?");
        assertThat(sql.params()).containsExactly(TENANT, "%张%", 10, 0);
    }

    @Test
    void buildSelect_mainColumnFilter_qualifiesMainAlias() {
        Map<String, Object> filters = Map.of("order_no", "NO-1");

        BizDataQueryBuilder.SqlAndParams sql = JoinSqlGenerator.buildSelect(
                MAIN, TENANT, List.of(CUSTOMER_JOIN), queryColumns(),
                filters, null, null, null, null, 0, 10);

        assertThat(sql.sql()).contains(" AND m.order_no = ?");
        assertThat(sql.params()).containsExactly(TENANT, "NO-1", 10, 0);
    }

    @Test
    void buildSelect_virtualColumnSort_sortsByQualifiedColumn() {
        BizDataQueryBuilder.SqlAndParams sql = JoinSqlGenerator.buildSelect(
                MAIN, TENANT, List.of(CUSTOMER_JOIN), queryColumns(),
                Map.of(), null, null, "customer_name", "asc", 0, 10);

        assertThat(sql.sql()).contains(" ORDER BY j1.name ASC");
    }

    @Test
    void buildSelect_filterNotFilterableColumn_rejected() {
        Map<String, Object> filters = Map.of("owner_name", "x");

        assertThatThrownBy(() -> JoinSqlGenerator.buildSelect(
                MAIN, TENANT,
                List.of(new JoinSqlGenerator.JoinConfig("u", "user", "owner_id", "id", "nickname",
                        "owner_name", "负责人", true, false)),
                queryColumns(), filters, null, null, null, null, 0, 10))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("筛选");
    }

    @Test
    void buildCount_noLimitMatchesSelectJoins() {
        BizDataQueryBuilder.SqlAndParams count = JoinSqlGenerator.buildCount(
                MAIN, TENANT, List.of(CUSTOMER_JOIN), queryColumns(),
                Map.of(), null, null);

        assertThat(count.sql()).isEqualTo(
                "SELECT COUNT(1) FROM wf_biz_order m"
                        + " LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))"
                        + " WHERE m.tenant_id = ?");
        assertThat(count.params()).containsExactly(TENANT);
    }

    @Test
    void validate_duplicateVirtualKey_rejected() {
        JoinSqlGenerator.JoinConfig dup = new JoinSqlGenerator.JoinConfig(
                "d", "dept", "dept_id", "id", "name",
                "customer_name", "部门名称", true, true);

        assertThatThrownBy(() -> JoinSqlGenerator.validate(
                List.of(CUSTOMER_JOIN, dup), List.of("order_no", "customer_id", "owner_id", "dept_id")))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("虚拟列");
    }

    @Test
    void validateTargets_missingTable_rejected() {
        assertThatThrownBy(() -> JoinSqlGenerator.validateTargets(
                List.of(CUSTOMER_JOIN), table -> false))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("关联表单不存在");
    }

    @Test
    void validateTargets_allTablesExist_passes() {
        JoinSqlGenerator.validateTargets(
                List.of(CUSTOMER_JOIN), table -> table.equals("wf_biz_customer"));
        // 不抛异常即通过
    }

    @Test
    void buildSelect_sameJoinConditionMultipleFields_mergesIntoOneLeftJoin() {
        JoinSqlGenerator.JoinConfig name = new JoinSqlGenerator.JoinConfig(
                "ignored", "customer", "customer_id", "id", "name",
                "customer_name", "客户名称", true, true);
        JoinSqlGenerator.JoinConfig phone = new JoinSqlGenerator.JoinConfig(
                "ignored", "customer", "customer_id", "id", "phone",
                "customer_phone", "客户电话", true, true);
        JoinSqlGenerator.JoinConfig email = new JoinSqlGenerator.JoinConfig(
                "ignored", "customer", "customer_id", "id", "email",
                "customer_email", "客户邮箱", true, true);

        BizDataQueryBuilder.SqlAndParams sql = JoinSqlGenerator.buildSelect(
                MAIN, TENANT, List.of(name, phone, email), queryColumns(),
                Map.of(), null, null, null, null, 0, 10);

        assertThat(sql.sql()).isEqualTo(
                "SELECT m.*, j1.name AS customer_name, j1.phone AS customer_phone, j1.email AS customer_email"
                        + " FROM wf_biz_order m"
                        + " LEFT JOIN wf_biz_customer j1 ON j1.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))"
                        + " WHERE m.tenant_id = ? ORDER BY m.created_at DESC LIMIT ? OFFSET ?");
    }

    @Test
    void group_distinctConditions_assignSequentialAliasesInOrder() {
        List<JoinSqlGenerator.JoinGroup> groups = JoinSqlGenerator.group(List.of(
                new JoinSqlGenerator.JoinConfig("a1", "customer", "customer_id", "id", "name", "customer_name", "客户名称", true, true),
                new JoinSqlGenerator.JoinConfig("a1", "customer", "customer_id", "id", "phone", "customer_phone", "客户电话", true, true),
                new JoinSqlGenerator.JoinConfig("a2", "user", "owner_id", "id", "nickname", "owner_name", "负责人", true, false)));

        assertThat(groups).hasSize(2);
        assertThat(groups.get(0).alias()).isEqualTo("j1");
        assertThat(groups.get(0).members()).hasSize(2);
        assertThat(groups.get(0).members().get(0).virtualKey()).isEqualTo("customer_name");
        assertThat(groups.get(1).alias()).isEqualTo("j2");
        assertThat(groups.get(1).members()).hasSize(1);
    }

    @Test
    void validate_aliasIgnored_doesNotRejectMissingAlias() {
        List<JoinSqlGenerator.JoinConfig> joins = List.of(
                new JoinSqlGenerator.JoinConfig(null, "customer", "customer_id", "id", "name",
                        "customer_name", "客户名称", true, true));

        JoinSqlGenerator.validate(joins, List.of("order_no", "customer_id"));
        // 不抛异常即通过（alias 可空、可重复，生成时按组分配）
    }

    private static List<JoinSqlGenerator.QueryColumn> queryColumns() {
        // 主表列（ref = m.<key>）+ 虚拟列（ref = <alias>.<joinField>）
        return List.of(
                new JoinSqlGenerator.QueryColumn("order_no", "m.order_no", "VARCHAR", true, true),
                new JoinSqlGenerator.QueryColumn("customer_id", "m.customer_id", "JSON", true, true),
                new JoinSqlGenerator.QueryColumn("owner_id", "m.owner_id", "JSON", true, true),
                new JoinSqlGenerator.QueryColumn("customer_name", "j1.name", "VARCHAR", true, true),
                new JoinSqlGenerator.QueryColumn("owner_name", "j2.nickname", "VARCHAR", true, false));
    }
}