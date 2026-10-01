package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 业务数据动态 SQL 生成器。
 * 所有标识符（表名/列名/排序字段）来自白名单校验，值全部通过参数绑定（PreparedStatement），杜绝 SQL 注入。
 */
public final class BizDataQueryBuilder {

    /** 内置可排序/可查询列 */
    private static final Set<String> BUILTIN_COLUMNS = Set.of("id", "created_at", "updated_at");

    private static final Set<String> ALLOWED_ORDER = Set.of("asc", "desc");

    /** 允许的聚合函数（与 common/domain/biz-data.ts 的 AGGREGATE_FNS 保持一致的小写闭集）。 */
    private static final Map<String, String> AGGREGATE_FN_SQL = Map.of(
            "count", "COUNT",
            "sum", "SUM",
            "avg", "AVG",
            "max", "MAX",
            "min", "MIN");

    /** 时间桶 DATE_FORMAT 模板（MariaDB 方言，与 Node biz-data-query-builder.ts 同源）。 */
    private static final Map<String, String> TIME_GRAIN_FORMAT = Map.of(
            "day", "%Y-%m-%d",
            "week", "%x-W%v",
            "month", "%Y-%m");

    /** 时间桶仅允许日期类型列。 */
    private static final Set<String> DATE_COLUMN_TYPES = Set.of("DATE", "DATETIME", "TIMESTAMP");

    private static final ObjectMapper OM = new ObjectMapper();

    private BizDataQueryBuilder() {}

    /** SQL 与参数对 */
    public record SqlAndParams(String sql, List<Object> params) {}

    /** JSON 数组列：筛选走 JSON 函数（JSON_CONTAINS / JSON_OVERLAPS），普通列走标量比较 */
    private static boolean isJsonColumn(Map<String, String> columnTypeOf, String column) {
        return "JSON".equalsIgnoreCase(columnTypeOf.getOrDefault(column, ""));
    }

    /** 筛选值序列化为 JSON 片段（eq 的 `"v"`、in 的 `["a","b"]`），供 JSON_CONTAINS/JSON_OVERLAPS 匹配 */
    private static Object jsonValue(Object v) {
        try {
            return OM.writeValueAsString(v);
        } catch (JsonProcessingException e) {
            return v;
        }
    }

    /**
     * 生成分页 SELECT。
     *
     * @param tableName      物理表名（由 DdlBuilder 白名单校验过的表名）
     * @param allowedColumns 允许的业务列（column_config 中的 key）
     * @param tenantId       当前租户
     * @param filters        字段筛选（column → value）
     * @param keyword        关键词（可选，对 keywordColumn 做 LIKE）
     * @param keywordColumn  关键词匹配列（可选）
     * @param sort           排序字段（可选，白名单）
     * @param order          asc/desc（可选，默认 desc）
     * @param page           页码（0 起）
     * @param size           每页大小
     * @throws IllegalArgumentException 非法字段/排序字段时
     */
    public static SqlAndParams buildSelect(String tableName, List<String> allowedColumns, String tenantId,
                                           Map<String, Object> filters, String keyword, String keywordColumn,
                                           String sort, String order, int page, int size) {
        return buildSelect(tableName, allowedColumns, Map.of(), tenantId, filters, keyword, keywordColumn,
                sort, order, page, size);
    }

    /**
     * 生成分页 SELECT（带列类型，JSON 数组列走 JSON 函数筛选）。
     *
     * @param columnTypeOf  列类型映射（key → columnType 大写；JSON 列触发 JSON_CONTAINS/JSON_OVERLAPS 分支）
     */
    public static SqlAndParams buildSelect(String tableName, List<String> allowedColumns,
                                           Map<String, String> columnTypeOf, String tenantId,
                                           Map<String, Object> filters, String keyword, String keywordColumn,
                                           String sort, String order, int page, int size) {
        StringBuilder sql = new StringBuilder("SELECT * FROM ").append(tableName).append(" WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        appendFilters(sql, params, allowedColumns, columnTypeOf, filters);

        appendKeyword(sql, params, allowedColumns, keyword, keywordColumn);

        String sortColumn = (sort == null || sort.isBlank()) ? "created_at" : sort;
        validateColumn(sortColumn, allowedColumns, "排序字段");
        String orderDir = (order == null || order.isBlank()) ? "desc" : order.toLowerCase();
        if (!ALLOWED_ORDER.contains(orderDir)) {
            throw new IllegalArgumentException("非法排序方向: " + order);
        }
        sql.append(" ORDER BY ").append(sortColumn).append(" ").append(orderDir.toUpperCase());

        // size <= 0 表示不分页取全部（跳过 LIMIT/OFFSET）
        if (size > 0) {
            sql.append(" LIMIT ? OFFSET ?");
            params.add(size);
            params.add(page * size);
        }
        return new SqlAndParams(sql.toString(), params);
    }

    /**
     * 生成聚合查询（Task 119 仪表盘）：{@code SELECT <维度> AS __k, <聚合> AS __v ... GROUP BY __k}。
     *
     * <p>WHERE 构造与 {@link #buildSelect} 完全同源（租户 + 白名单筛选 + 关键词），安全模型一致：
     * 标识符走白名单校验，值参数绑定。别名固定 {@code __k}/{@code __v}。
     *
     * <p>⚠️ JSON 类型列<b>拒绝</b>参与 group/metric：单表业务列是真实物理列，JSON 列的聚合语义
     * （数组展开）与仪表盘诉求不符，宁可显式 400 也不静默给错误数字。
     *
     * @param agg      聚合函数（count/sum/avg/max/min，闭集）
     * @param metric   聚合指标列（count 时可空，其余必填）
     * @param timeGrain 时间桶粒度（非空时 group 列必须是日期类型）
     * @throws IllegalArgumentException 非法聚合函数/字段/粒度/排序时（调用方转 400）
     */
    public static SqlAndParams buildAggregate(String tableName, List<String> allowedColumns,
                                              Map<String, String> columnTypeOf, String tenantId,
                                              Map<String, Object> filters, String keyword, String keywordColumn,
                                              String group, String agg, String metric, String timeGrain,
                                              String sort, String order) {
        String fn = AGGREGATE_FN_SQL.get(agg);
        if (fn == null) {
            throw new IllegalArgumentException("非法聚合函数: " + agg);
        }

        // `__all__` 是保留维度：不做分组、整表聚成一个数（KPI 场景），键恒为 '__all__'
        boolean isAll = "__all__".equals(group);
        if (!isAll) {
            validateColumn(group, allowedColumns, "分组字段");
            assertNotJson(columnTypeOf, group, "分组字段");
        }
        String keyExpr = isAll ? "'__all__'" : group;
        if (!isAll && timeGrain != null) {
            String format = TIME_GRAIN_FORMAT.get(timeGrain);
            if (format == null) {
                throw new IllegalArgumentException("非法时间粒度: " + timeGrain);
            }
            String type = columnTypeOf.getOrDefault(group, "");
            if (!DATE_COLUMN_TYPES.contains(type.toUpperCase())) {
                throw new IllegalArgumentException("时间分组的列必须是日期类型: " + group);
            }
            keyExpr = "DATE_FORMAT(" + group + ", '" + format + "')";
        }

        String valueExpr;
        if ("count".equals(agg)) {
            valueExpr = "COUNT(1)";
        } else {
            if (metric == null || metric.isBlank()) {
                throw new IllegalArgumentException("聚合字段不能为空");
            }
            validateColumn(metric, allowedColumns, "聚合字段");
            assertNotJson(columnTypeOf, metric, "聚合字段");
            valueExpr = fn + "(" + metric + ")";
        }

        StringBuilder sql = new StringBuilder("SELECT ").append(keyExpr).append(" AS __k, ")
                .append(valueExpr).append(" AS __v FROM ").append(tableName)
                .append(" WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        appendFilters(sql, params, allowedColumns, columnTypeOf, filters);
        appendKeyword(sql, params, allowedColumns, keyword, keywordColumn);
        sql.append(" GROUP BY __k");

        String sortKey = (sort == null || sort.isBlank()) ? "key" : sort.trim().toLowerCase();
        if (!"key".equals(sortKey) && !"value".equals(sortKey)) {
            throw new IllegalArgumentException("非法聚合排序字段: " + sort);
        }
        String orderDir = (order == null || order.isBlank()) ? "asc" : order.toLowerCase();
        if (!ALLOWED_ORDER.contains(orderDir)) {
            throw new IllegalArgumentException("非法排序方向: " + order);
        }
        sql.append(" ORDER BY ").append("key".equals(sortKey) ? "__k" : "__v")
                .append(" ").append(orderDir.toUpperCase());
        return new SqlAndParams(sql.toString(), params);
    }

    /** 聚合列的 JSON 类型守卫（统一文案，避免 group/metric 两处漂移）。 */
    private static void assertNotJson(Map<String, String> columnTypeOf, String column, String label) {
        if (isJsonColumn(columnTypeOf, column)) {
            throw new IllegalArgumentException(label + "不支持 JSON 类型列: " + column);
        }
    }

    /**
     * 生成 COUNT 查询（分页总数，过滤条件与 buildSelect 一致）。
     */
    public static SqlAndParams buildCount(String tableName, List<String> allowedColumns, String tenantId,
                                          Map<String, Object> filters, String keyword, String keywordColumn) {
        return buildCount(tableName, allowedColumns, Map.of(), tenantId, filters, keyword, keywordColumn);
    }

    /**
     * 生成 COUNT 查询（分页总数，过滤条件与 buildSelect 一致，支持 JSON 列分支）。
     */
    public static SqlAndParams buildCount(String tableName, List<String> allowedColumns,
                                          Map<String, String> columnTypeOf, String tenantId,
                                          Map<String, Object> filters, String keyword, String keywordColumn) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(1) FROM ").append(tableName).append(" WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        appendFilters(sql, params, allowedColumns, columnTypeOf, filters);

        appendKeyword(sql, params, allowedColumns, keyword, keywordColumn);
        return new SqlAndParams(sql.toString(), params);
    }

    /**
     * 生成 INSERT。仅插入白名单列 + tenant_id + version，值全参数化。
     */
    public static SqlAndParams buildInsert(String tableName, List<String> allowedColumns,
                                           Map<String, Object> data, String tenantId) {
        Map<String, Object> safeData = filterData(allowedColumns, data);

        StringBuilder cols = new StringBuilder("INSERT INTO ").append(tableName)
                .append(" (id, tenant_id, version");
        StringBuilder placeholders = new StringBuilder(" VALUES (?, ?, ?");
        List<Object> params = new ArrayList<>();
        params.add(java.util.UUID.randomUUID().toString().replace("-", ""));
        params.add(tenantId);
        params.add(1);

        for (Map.Entry<String, Object> e : safeData.entrySet()) {
            cols.append(", ").append(e.getKey());
            placeholders.append(", ?");
            params.add(e.getValue());
        }
        cols.append(")");
        placeholders.append(")");
        return new SqlAndParams(cols.toString() + placeholders, params);
    }

    /**
     * 生成 UPDATE（乐观锁：WHERE id = ? AND tenant_id = ? AND version = ?）。
     */
    public static SqlAndParams buildUpdate(String tableName, List<String> allowedColumns,
                                           Map<String, Object> data, String tenantId, String id, int version) {
        Map<String, Object> safeData = filterData(allowedColumns, data);
        if (safeData.isEmpty()) {
            throw new IllegalArgumentException("更新内容不能为空");
        }

        StringBuilder sql = new StringBuilder("UPDATE ").append(tableName).append(" SET ");
        List<Object> params = new ArrayList<>();
        boolean first = true;
        for (Map.Entry<String, Object> e : safeData.entrySet()) {
            if (!first) {
                sql.append(", ");
            }
            sql.append(e.getKey()).append(" = ?");
            params.add(e.getValue());
            first = false;
        }
        sql.append(", version = version + 1, updated_at = NOW() WHERE id = ? AND tenant_id = ? AND version = ?");
        params.add(id);
        params.add(tenantId);
        params.add(version);
        return new SqlAndParams(sql.toString(), params);
    }

    /**
     * 生成 DELETE（租户范围限定）。
     */
    public static SqlAndParams buildDelete(String tableName, String tenantId, String id) {
        String sql = "DELETE FROM " + tableName + " WHERE id = ? AND tenant_id = ?";
        return new SqlAndParams(sql, List.of(id, tenantId));
    }

    /**
     * 关键词搜索：keywordColumn 支持逗号分隔多列（OR LIKE 组合，括号包裹）。
     * 单列保持向后兼容（原样 LIKE）。列名逐一白名单校验。
     */
    private static void appendKeyword(StringBuilder sql, List<Object> params,
                                      List<String> allowedColumns, String keyword, String keywordColumn) {
        if (keyword == null || keyword.isBlank()) {
            return;
        }
        String[] columns = (keywordColumn == null || keywordColumn.isBlank())
                ? new String[0]
                : keywordColumn.split(",");
        List<String> likeFragments = new ArrayList<>();
        for (String col : columns) {
            String trimmed = col.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            validateColumn(trimmed, allowedColumns, "关键词匹配列");
            likeFragments.add(trimmed + " LIKE ?");
            params.add("%" + keyword + "%");
        }
        if (likeFragments.isEmpty()) {
            throw new IllegalArgumentException("关键词匹配列不能为空");
        }
        if (likeFragments.size() == 1) {
            sql.append(" AND ").append(likeFragments.get(0));
        } else {
            sql.append(" AND (").append(String.join(" OR ", likeFragments)).append(")");
        }
    }

    private static void appendFilters(StringBuilder sql, List<Object> params,
                                      List<String> allowedColumns, Map<String, String> columnTypeOf,
                                      Map<String, Object> filters) {
        if (filters == null || filters.isEmpty()) {
            return;
        }
        // 结构化格式：{ "logic": "AND"|"OR", "conditions": [{column, op, value}] }
        if (filters.get("conditions") instanceof List<?> condList) {
            String logic = "AND".equalsIgnoreCase(String.valueOf(filters.getOrDefault("logic", "AND"))) ? "AND" : "OR";
            appendStructuredFilters(sql, params, allowedColumns, columnTypeOf, logic, castConditions(condList));
            return;
        }
        // 旧格式：{col: value} 等值 AND
        for (Map.Entry<String, Object> e : filters.entrySet()) {
            validateColumn(e.getKey(), allowedColumns, "筛选字段");
            if (e.getValue() == null) {
                continue;
            }
            if (isJsonColumn(columnTypeOf, e.getKey())) {
                sql.append(" AND JSON_CONTAINS(").append(e.getKey()).append(", ?)");
                params.add(jsonValue(e.getValue()));
            } else {
                sql.append(" AND ").append(e.getKey()).append(" = ?");
                params.add(e.getValue());
            }
        }
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> castConditions(List<?> list) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
        }
        return out;
    }

    /**
     * 结构化多条件：按 logic 组合 AND/OR，括号包裹；列名白名单校验，值参数绑定。
     * 运算符：eq/ne/like/in/isEmpty/isNotEmpty（isEmpty/isNotEmpty 忽略 value）。
     */
    private static void appendStructuredFilters(StringBuilder sql, List<Object> params,
                                                List<String> allowedColumns, Map<String, String> columnTypeOf,
                                                String logic, List<Map<String, Object>> conditions) {
        List<String> fragments = new ArrayList<>();
        for (Map<String, Object> c : conditions) {
            String column = String.valueOf(c.get("column"));
            validateColumn(column, allowedColumns, "筛选字段");
            String op = c.get("op") == null ? "eq" : String.valueOf(c.get("op")).toLowerCase();
            boolean json = isJsonColumn(columnTypeOf, column);
            switch (op) {
                case "eq" -> {
                    if (c.get("value") == null) continue;
                    // JSON 数组列：数组含元素（多选命中）；普通列：标量等值
                    if (json) {
                        fragments.add("JSON_CONTAINS(" + column + ", ?)");
                        params.add(jsonValue(c.get("value")));
                    } else {
                        fragments.add(column + " = ?");
                        params.add(c.get("value"));
                    }
                }
                case "ne" -> {
                    if (c.get("value") == null) continue;
                    if (json) {
                        fragments.add("NOT JSON_CONTAINS(" + column + ", ?)");
                        params.add(jsonValue(c.get("value")));
                    } else {
                        fragments.add(column + " <> ?");
                        params.add(c.get("value"));
                    }
                }
                case "like" -> {
                    if (c.get("value") == null) continue;
                    fragments.add(column + " LIKE ?");
                    params.add("%" + c.get("value") + "%");
                }
                case "in" -> {
                    Object v = c.get("value");
                    if (!(v instanceof List<?> values) || values.isEmpty()) continue;
                    if (json) {
                        // JSON 数组列：与候选集有交集（任一命中）
                        fragments.add("JSON_OVERLAPS(" + column + ", ?)");
                        params.add(jsonValue(values));
                    } else {
                        String marks = String.join(", ", java.util.Collections.nCopies(values.size(), "?"));
                        fragments.add(column + " IN (" + marks + ")");
                        params.addAll(values);
                    }
                }
                case "range" -> {
                    Object v = c.get("value");
                    if (!(v instanceof List<?> range) || range.size() != 2 || range.get(0) == null || range.get(1) == null) {
                        continue;
                    }
                    fragments.add("(" + column + " >= ? AND " + column + " <= ?)");
                    params.add(range.get(0));
                    params.add(range.get(1));
                }
                case "isempty" -> fragments.add("(" + column + " IS NULL OR " + column + " = '')");
                case "isnotempty" -> fragments.add("(" + column + " IS NOT NULL AND " + column + " <> '')");
                default -> throw new IllegalArgumentException("非法筛选运算符: " + op);
            }
        }
        if (fragments.isEmpty()) {
            return;
        }
        sql.append(" AND (").append(String.join(" " + logic + " ", fragments)).append(")");
    }

    /**
     * 过滤数据：仅保留白名单列，静默忽略未知字段与系统字段（防覆盖/注入）。
     */
    private static Map<String, Object> filterData(List<String> allowedColumns, Map<String, Object> data) {
        Map<String, Object> safe = new LinkedHashMap<>();
        if (data == null) {
            return safe;
        }
        for (Map.Entry<String, Object> e : data.entrySet()) {
            String key = e.getKey();
            if (key == null || key.equals("id") || key.equals("tenant_id") || key.equals("version")) {
                continue; // 忽略系统列，防覆盖
            }
            if (!allowedColumns.contains(key)) {
                continue; // 忽略未知字段
            }
            safe.put(key, e.getValue());
        }
        return safe;
    }

    private static void validateColumn(String column, List<String> allowedColumns, String label) {
        if (column == null || column.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        if (!allowedColumns.contains(column) && !BUILTIN_COLUMNS.contains(column)) {
            throw new IllegalArgumentException("非法" + label + ": " + column);
        }
    }
}
