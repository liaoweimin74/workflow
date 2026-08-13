package com.workflow.engine.form.bizdata;

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

    private BizDataQueryBuilder() {}

    /** SQL 与参数对 */
    public record SqlAndParams(String sql, List<Object> params) {}

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
        StringBuilder sql = new StringBuilder("SELECT * FROM ").append(tableName).append(" WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        appendFilters(sql, params, allowedColumns, filters);

        if (keyword != null && !keyword.isBlank()) {
            validateColumn(keywordColumn, allowedColumns, "关键词匹配列");
            sql.append(" AND ").append(keywordColumn).append(" LIKE ?");
            params.add("%" + keyword + "%");
        }

        String sortColumn = (sort == null || sort.isBlank()) ? "created_at" : sort;
        validateColumn(sortColumn, allowedColumns, "排序字段");
        String orderDir = (order == null || order.isBlank()) ? "desc" : order.toLowerCase();
        if (!ALLOWED_ORDER.contains(orderDir)) {
            throw new IllegalArgumentException("非法排序方向: " + order);
        }
        sql.append(" ORDER BY ").append(sortColumn).append(" ").append(orderDir.toUpperCase());

        sql.append(" LIMIT ? OFFSET ?");
        params.add(size);
        params.add(page * size);
        return new SqlAndParams(sql.toString(), params);
    }

    /**
     * 生成 COUNT 查询（分页总数，过滤条件与 buildSelect 一致）。
     */
    public static SqlAndParams buildCount(String tableName, List<String> allowedColumns, String tenantId,
                                          Map<String, Object> filters, String keyword, String keywordColumn) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(1) FROM ").append(tableName).append(" WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        appendFilters(sql, params, allowedColumns, filters);

        if (keyword != null && !keyword.isBlank()) {
            validateColumn(keywordColumn, allowedColumns, "关键词匹配列");
            sql.append(" AND ").append(keywordColumn).append(" LIKE ?");
            params.add("%" + keyword + "%");
        }
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

    private static void appendFilters(StringBuilder sql, List<Object> params,
                                      List<String> allowedColumns, Map<String, Object> filters) {
        if (filters == null || filters.isEmpty()) {
            return;
        }
        // 结构化格式：{ "logic": "AND"|"OR", "conditions": [{column, op, value}] }
        if (filters.get("conditions") instanceof List<?> condList) {
            String logic = "AND".equalsIgnoreCase(String.valueOf(filters.getOrDefault("logic", "AND"))) ? "AND" : "OR";
            appendStructuredFilters(sql, params, allowedColumns, logic, castConditions(condList));
            return;
        }
        // 旧格式：{col: value} 等值 AND
        for (Map.Entry<String, Object> e : filters.entrySet()) {
            validateColumn(e.getKey(), allowedColumns, "筛选字段");
            if (e.getValue() == null) {
                continue;
            }
            sql.append(" AND ").append(e.getKey()).append(" = ?");
            params.add(e.getValue());
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
                                                List<String> allowedColumns, String logic,
                                                List<Map<String, Object>> conditions) {
        List<String> fragments = new ArrayList<>();
        for (Map<String, Object> c : conditions) {
            String column = String.valueOf(c.get("column"));
            validateColumn(column, allowedColumns, "筛选字段");
            String op = c.get("op") == null ? "eq" : String.valueOf(c.get("op")).toLowerCase();
            switch (op) {
                case "eq" -> {
                    if (c.get("value") == null) continue;
                    fragments.add(column + " = ?");
                    params.add(c.get("value"));
                }
                case "ne" -> {
                    if (c.get("value") == null) continue;
                    fragments.add(column + " <> ?");
                    params.add(c.get("value"));
                }
                case "like" -> {
                    if (c.get("value") == null) continue;
                    fragments.add(column + " LIKE ?");
                    params.add("%" + c.get("value") + "%");
                }
                case "in" -> {
                    Object v = c.get("value");
                    if (!(v instanceof List<?> values) || values.isEmpty()) continue;
                    String marks = String.join(", ", java.util.Collections.nCopies(values.size(), "?"));
                    fragments.add(column + " IN (" + marks + ")");
                    params.addAll(values);
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
