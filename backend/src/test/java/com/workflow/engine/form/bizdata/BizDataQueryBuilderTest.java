package com.workflow.engine.form.bizdata;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * BizDataQueryBuilder 单元测试：动态 SQL 生成、白名单校验、参数化。
 */
class BizDataQueryBuilderTest {

    private static final List<String> COLUMNS = List.of("dept", "name");

    @Test
    void buildSelect_forcesTenantFilter() {
        BizDataQueryBuilder.SqlAndParams sp = BizDataQueryBuilder.buildSelect(
                "wf_biz_biz_leave", COLUMNS, "t1", Map.of(), null, null, null, "desc", 0, 20);

        assertThat(sp.sql()).contains("tenant_id = ?");
        assertThat(sp.params()).contains("t1");
    }

    @Test
    void buildSelect_filterParams_bindValuesNotInSql() {
        BizDataQueryBuilder.SqlAndParams sp = BizDataQueryBuilder.buildSelect(
                "wf_biz_biz_leave", COLUMNS, "t1", Map.of("dept", "研发部"), null, null, null, "desc", 0, 20);

        assertThat(sp.sql()).contains("dept = ?");
        assertThat(sp.sql()).doesNotContain("研发部");
        assertThat(sp.params()).contains("研发部");
    }

    @Test
    void buildSelect_rejectsUnknownFilterColumn() {
        assertThatThrownBy(() -> BizDataQueryBuilder.buildSelect(
                "wf_biz_biz_leave", COLUMNS, "t1", Map.of("hack", "x"), null, null, null, "desc", 0, 20))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void buildSelect_rejectsUnknownSortColumn() {
        assertThatThrownBy(() -> BizDataQueryBuilder.buildSelect(
                "wf_biz_biz_leave", COLUMNS, "t1", Map.of(), null, null, "hack", "asc", 0, 20))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void buildSelect_defaultSort_createdAtDesc() {
        BizDataQueryBuilder.SqlAndParams sp = BizDataQueryBuilder.buildSelect(
                "wf_biz_biz_leave", COLUMNS, "t1", Map.of(), null, null, null, null, 0, 20);

        assertThat(sp.sql()).contains("ORDER BY created_at DESC");
    }

    @Test
    void buildSelect_keyword_likeClause() {
        BizDataQueryBuilder.SqlAndParams sp = BizDataQueryBuilder.buildSelect(
                "wf_biz_biz_leave", COLUMNS, "t1", Map.of(), "张三", "name", null, "desc", 0, 20);

        assertThat(sp.sql()).contains("name LIKE ?");
        assertThat(sp.params()).contains("%张三%");
    }

    @Test
    void buildSelect_pagination_limits() {
        BizDataQueryBuilder.SqlAndParams sp = BizDataQueryBuilder.buildSelect(
                "wf_biz_biz_leave", COLUMNS, "t1", Map.of(), null, null, null, "desc", 2, 10);

        assertThat(sp.sql()).contains("LIMIT ? OFFSET ?");
        assertThat(sp.params()).contains(10, 20);
    }

    @Test
    void buildInsert_whitelistsColumns_andForcesTenant() {
        Map<String, Object> data = Map.of("dept", "研发部", "name", "张三", "evil", "x");
        BizDataQueryBuilder.SqlAndParams sp = BizDataQueryBuilder.buildInsert(
                "wf_biz_biz_leave", COLUMNS, data, "t1");

        assertThat(sp.sql()).contains("INSERT INTO wf_biz_biz_leave");
        assertThat(sp.sql()).contains("dept", "name", "tenant_id", "version");
        assertThat(sp.sql()).doesNotContain("evil");
        assertThat(sp.params()).contains("研发部", "张三", "t1", 1);
    }

    @Test
    void buildUpdate_versionCondition_andTenant() {
        Map<String, Object> data = Map.of("name", "李四");
        BizDataQueryBuilder.SqlAndParams sp = BizDataQueryBuilder.buildUpdate(
                "wf_biz_biz_leave", COLUMNS, data, "t1", "row-1", 3);

        assertThat(sp.sql()).contains("version = version + 1");
        assertThat(sp.sql()).contains("WHERE id = ? AND tenant_id = ? AND version = ?");
        assertThat(sp.params()).contains("row-1", "t1", 3);
    }

    @Test
    void buildDelete_tenantScoped() {
        BizDataQueryBuilder.SqlAndParams sp = BizDataQueryBuilder.buildDelete(
                "wf_biz_biz_leave", "t1", "row-1");

        assertThat(sp.sql()).contains("DELETE FROM wf_biz_biz_leave WHERE id = ? AND tenant_id = ?");
        assertThat(sp.params()).contains("row-1", "t1");
    }
}
