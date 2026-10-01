package com.workflow.api.dto;

import java.util.Set;

/**
 * 数据源分组聚合请求（Task 119 仪表盘；对齐 Node 侧
 * {@code backend-node/src/common/domain/biz-data.ts} 的 {@code AggregateRequest}）。
 *
 * <p>端点：{@code GET /api/v1/data-sources/{id}/aggregate}，查询参数按 POJO 绑定
 * （与 {@link BizDataQueryRequest} 同款形态）：Spring 实例化后字段缺省值来自初始化器
 * （{@code limit = 0}）。
 *
 * <p>与 {@link BizDataQueryRequest} 的关系：filter/keyword/keywordColumn 语义完全一致；
 * 分页字段被 {@code group/agg/metric/timeGrain/limit} 取代（聚合结果不是行集，不翻页）。
 */
public class AggregateRequest {

    /** 允许的聚合函数（闭集，控制器层校验后透传；对齐 Node {@code AGGREGATE_FNS}）。 */
    public static final Set<String> AGGREGATE_FNS = Set.of("count", "sum", "avg", "max", "min");

    /** 允许的时间桶粒度（对维度的 DATETIME/DATE 列生效；对齐 Node {@code TIME_GRAINS}）。 */
    public static final Set<String> TIME_GRAINS = Set.of("day", "week", "month");

    /** 分组维度列 key（白名单校验规则与 sort/filter 同源）。 */
    private String group;

    /** 聚合函数，缺省 count（控制器归一）。 */
    private String agg;

    /** 聚合指标列 key；{@code agg=count} 时可空，其余必填。 */
    private String metric;

    /** 时间桶粒度；非空时 group 列必须是日期时间类型。 */
    private String timeGrain;

    /** 结构化/旧格式筛选 JSON（语义与 {@code /data} 一致）。 */
    private String filter;

    /** 关键词（对 keywordColumn 做 LIKE）。 */
    private String keyword;

    /** 关键词匹配列（可选）。 */
    private String keywordColumn;

    /** SQL 模板运行时参数 JSON（语义与 {@code /data} 一致；仅模板源消费）。 */
    private String params;

    /** {@code key}（维度排序）或 {@code value}（指标排序），缺省 key。 */
    private String sort;

    /** 排序方向 asc/desc，缺省 asc。 */
    private String order;

    /** 结果条数上限；0 = 不限制。 */
    private int limit = 0;

    public String getGroup() { return group; }
    public void setGroup(String group) { this.group = group; }

    public String getAgg() { return agg; }
    public void setAgg(String agg) { this.agg = agg; }

    public String getMetric() { return metric; }
    public void setMetric(String metric) { this.metric = metric; }

    public String getTimeGrain() { return timeGrain; }
    public void setTimeGrain(String timeGrain) { this.timeGrain = timeGrain; }

    public String getFilter() { return filter; }
    public void setFilter(String filter) { this.filter = filter; }

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }

    public String getKeywordColumn() { return keywordColumn; }
    public void setKeywordColumn(String keywordColumn) { this.keywordColumn = keywordColumn; }

    public String getParams() { return params; }
    public void setParams(String params) { this.params = params; }

    public String getSort() { return sort; }
    public void setSort(String sort) { this.sort = sort; }

    public String getOrder() { return order; }
    public void setOrder(String order) { this.order = order; }

    public int getLimit() { return limit; }
    public void setLimit(int limit) { this.limit = limit; }
}
