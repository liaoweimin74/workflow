package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.JoinSqlGenerator.JoinConfig;
import com.workflow.engine.form.column.ColumnConfig;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * FormQueryConfig 解析测试：从 FORM 数据源 params JSON 提取 queryMode/joins/query/columns/params。
 * <p>
 * params 与现有 FORM action 配置（list/create/get/update/delete）共存于同一 JSON；
 * 缺省（无 queryMode）→ 返回默认配置（单表回退）。
 */
class FormQueryConfigTest {

    private final ObjectMapper om = new ObjectMapper();

    @Test
    void parse_nullParams_returnsDefault() {
        FormQueryConfig cfg = FormQueryConfig.parse(null, om);
        assertThat(cfg.queryMode()).isNull();
        assertThat(cfg.joins()).isEmpty();
        assertThat(cfg.query()).isNull();
        assertThat(cfg.columns()).isEmpty();
        assertThat(cfg.declaredParams()).isEmpty();
        assertThat(cfg.isConfigMode()).isFalse();
        assertThat(cfg.isSqlMode()).isFalse();
    }

    @Test
    void parse_blankParams_returnsDefault() {
        FormQueryConfig cfg = FormQueryConfig.parse("   ", om);
        assertThat(cfg.queryMode()).isNull();
        assertThat(cfg.isConfigMode()).isFalse();
        assertThat(cfg.isSqlMode()).isFalse();
    }

    @Test
    void parse_noQueryMode_returnsDefault_evenWithFormActions() {
        String params = """
                {"list":{"action":"/api/v1/biz-data/order","method":"GET","parse":"records","totalParse":"total"},
                 "create":{"action":"/api/v1/biz-data/order","method":"POST"}}""";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.queryMode()).isNull();
        assertThat(cfg.isConfigMode()).isFalse();
        assertThat(cfg.isSqlMode()).isFalse();
    }

    @Test
    void parse_configMode_parsesJoinsFully() {
        String params = """
                {"queryMode":"config","joins":[{
                  "alias":"c","targetFormKey":"customer","localField":"customer_id",
                  "foreignField":"id","joinField":"name","virtualKey":"customer_name",
                  "label":"客户名称","sortable":true,"filterable":true}]}""";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.queryMode()).isEqualTo("config");
        assertThat(cfg.isConfigMode()).isTrue();
        assertThat(cfg.joins()).hasSize(1);
        JoinConfig j = cfg.joins().get(0);
        assertThat(j.alias()).isEqualTo("c");
        assertThat(j.targetFormKey()).isEqualTo("customer");
        assertThat(j.localField()).isEqualTo("customer_id");
        assertThat(j.foreignField()).isEqualTo("id");
        assertThat(j.joinField()).isEqualTo("name");
        assertThat(j.virtualKey()).isEqualTo("customer_name");
        assertThat(j.label()).isEqualTo("客户名称");
        assertThat(j.sortable()).isTrue();
        assertThat(j.filterable()).isTrue();
        assertThat(cfg.isSqlMode()).isFalse();
    }

    @Test
    void parse_configMode_missingSortableFilterable_defaultsFalse() {
        String params = """
                {"queryMode":"config","joins":[{
                  "alias":"c","targetFormKey":"customer","localField":"customer_id",
                  "foreignField":"id","joinField":"name","virtualKey":"customer_name"}]}""";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.isConfigMode()).isTrue();
        JoinConfig j = cfg.joins().get(0);
        assertThat(j.sortable()).isFalse();
        assertThat(j.filterable()).isFalse();
    }

    @Test
    void parse_configMode_emptyJoins_fallsBackToSingleTable() {
        String params = "{\"queryMode\":\"config\",\"joins\":[]}";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.queryMode()).isEqualTo("config");
        assertThat(cfg.isConfigMode()).isFalse();
    }

    @Test
    void parse_sqlMode_parsesQueryColumnsAndParams() {
        String params = """
                {"queryMode":"sql",
                 "query":"SELECT o.order_no, c.name AS customer_name, o.amount FROM wf_biz_order o LEFT JOIN wf_biz_customer c ON c.id = o.customer_id WHERE o.created_at >= :startTime",
                 "columns":[
                   {"key":"order_no","label":"订单号","columnType":"VARCHAR","sortable":true,"filterable":true},
                   {"key":"customer_name","label":"客户名称","columnType":"VARCHAR","sortable":true,"filterable":true},
                   {"key":"amount","label":"金额","columnType":"DECIMAL","sortable":true,"filterable":false}],
                 "params":["startTime"]}""";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.queryMode()).isEqualTo("sql");
        assertThat(cfg.isSqlMode()).isTrue();
        assertThat(cfg.query()).contains(":startTime");
        assertThat(cfg.columns()).hasSize(3);
        ColumnConfig first = cfg.columns().get(0);
        assertThat(first.getKey()).isEqualTo("order_no");
        assertThat(first.getLabel()).isEqualTo("订单号");
        assertThat(first.getColumnType()).isEqualTo("VARCHAR");
        assertThat(first.getSortable()).isTrue();
        assertThat(first.getFilterable()).isTrue();
        ColumnConfig amount = cfg.columns().get(2);
        assertThat(amount.getFilterable()).isFalse();
        assertThat(cfg.declaredParams()).containsExactly("startTime");
        assertThat(cfg.isConfigMode()).isFalse();
    }

    @Test
    void parse_sqlMode_missingColumnFlags_defaultFalse() {
        String params = """
                {"queryMode":"sql",
                 "query":"SELECT id FROM wf_biz_order",
                 "columns":[{"key":"id","label":"ID","columnType":"VARCHAR"}]}""";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.isSqlMode()).isTrue();
        ColumnConfig c = cfg.columns().get(0);
        assertThat(c.getSortable()).isFalse();
        assertThat(c.getFilterable()).isFalse();
    }

    @Test
    void parse_sqlMode_blankQuery_notSqlMode() {
        String params = """
                {"queryMode":"sql","query":"   ",
                 "columns":[{"key":"id","label":"ID","columnType":"VARCHAR"}]}""";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.queryMode()).isEqualTo("sql");
        assertThat(cfg.isSqlMode()).isFalse();
    }

    @Test
    void parse_coexistsWithFormActions() {
        String params = """
                {"list":{"action":"/api/v1/biz-data/order","method":"GET"},
                 "queryMode":"sql",
                 "query":"SELECT o.id, c.name AS customer_name FROM wf_biz_order o LEFT JOIN wf_biz_customer c ON c.id = o.customer_id"}""";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.queryMode()).isEqualTo("sql");
        assertThat(cfg.isSqlMode()).isTrue();
        assertThat(cfg.query()).contains("wf_biz_order");
    }

    @Test
    void parse_invalidJson_throws400() {
        assertThatThrownBy(() -> FormQueryConfig.parse("{not-json", om))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("params");
    }

    @Test
    void parse_unknownQueryMode_returnsDefault() {
        String params = "{\"queryMode\":\"magic\"}";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.queryMode()).isEqualTo("magic");
        assertThat(cfg.isConfigMode()).isFalse();
        assertThat(cfg.isSqlMode()).isFalse();
    }

    @Test
    void parse_sqlColumns_returnedAsUnmodifiableSafeList() {
        String params = """
                {"queryMode":"sql","query":"SELECT id FROM wf_biz_order",
                 "columns":[{"key":"id","label":"ID","columnType":"VARCHAR"}],
                 "params":["p1"]}""";
        FormQueryConfig cfg = FormQueryConfig.parse(params, om);
        assertThat(cfg.declaredParams()).containsExactly("p1");
        assertThat(cfg.columns().get(0).getKey()).isEqualTo("id");
        assertThat(List.copyOf(cfg.columns())).isNotNull();
    }
}