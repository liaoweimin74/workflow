package com.workflow.engine.logic.config;

import java.util.List;

/**
 * 后端业务逻辑 - 聚合（AGGREGATE）节点子配置。
 *
 * <p>对集合（元素须为对象/Map）做数值聚合，可按分组键分组：
 *
 * <pre>{@code
 * {
 *   "collection": "{{dq_x1.rows}}",
 *   "field": "amount",
 *   "ops": ["SUM", "AVG", "COUNT", "MIN", "MAX"],
 *   "groupBy": "person_name"
 * }
 * }</pre>
 *
 * <ul>
 *   <li>collection：集合表达式（{{var}}；元素为 Map/List 时按 Map 取 field）；</li>
 *   <li>field：聚合字段（COUNT-only 时可省）；数值解析失败/non-numeric 元素跳过计数？——
 *       不跳过：抛错走 errorAction（数据质量问题尽早暴露）；</li>
 *   <li>ops：SUM/AVG/COUNT/MIN/MAX 子集（1~5 个）；</li>
 *   <li>groupBy：可选分组字段（值为字符串/数值 toString 作分组键）。</li>
 * </ul>
 *
 * <p>输出：无 groupBy → {@code { count, sum, avg, min, max }}（按 ops 选择键，数值保留 BigDecimal→double）；
 * 有 groupBy → {@code [{ group, count, sum, ... }, ...]}（按分组键排序）。
 * 未声明 results 时按隐式约定写入 {@code <节点id>}。
 */
public class BackendAggregateConfig {

    public static final String OP_SUM = "SUM";
    public static final String OP_AVG = "AVG";
    public static final String OP_COUNT = "COUNT";
    public static final String OP_MIN = "MIN";
    public static final String OP_MAX = "MAX";

    private String collection;
    private String field;
    private List<String> ops;
    private String groupBy;

    public String getCollection() { return collection; }
    public void setCollection(String collection) { this.collection = collection; }

    public String getField() { return field; }
    public void setField(String field) { this.field = field; }

    public List<String> getOps() { return ops; }
    public void setOps(List<String> ops) { this.ops = ops; }

    public String getGroupBy() { return groupBy; }
    public void setGroupBy(String groupBy) { this.groupBy = groupBy; }
}
