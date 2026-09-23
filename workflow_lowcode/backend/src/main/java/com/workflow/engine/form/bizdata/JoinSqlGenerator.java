package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * config 模式 JOIN SQL 生成器。
 * <p>
 * 将 backups 配置的 joins[]（声明式）翻译为 LEFT JOIN + 虚拟列 SELECT：
 * <pre>
 *   SELECT m.*, c.name AS customer_name FROM wf_biz_order m
 *     LEFT JOIN wf_biz_customer c ON c.id = JSON_UNQUOTE(JSON_EXTRACT(m.customer_id,'$[0]'))
 *     WHERE m.tenant_id = ? [AND 白名单筛选] ORDER BY <ref> DESC LIMIT ? OFFSET ?
 * </pre>
 * 主表固定别名 m；localField 为 JSON 列（dataPicker 外键数组）时走 JSON_EXTRACT 提取首元素匹配，
 * 普通列直接等值连接。所有标识符（列/表/排序）来自调用方传入的 QueryColumn 映射或内置白名单，
 * 值全部参数绑定，杜绝 SQL 注入。
 */
public final class JoinSqlGenerator {

    /** 内置可排序/可查询列（主表系统列） */
    private static final Set<String> BUILTIN_COLUMNS = Set.of("id", "created_at", "updated_at");

    private static final Set<String> ALLOWED_ORDER = Set.of("asc", "desc");

    private static final ObjectMapper OM = new ObjectMapper();

    private JoinSqlGenerator() {}

    /** 关联声明（joins[] 条目） */
    public record JoinConfig(String alias, String targetFormKey, String localField, String foreignField,
                             String joinField, String virtualKey, String label,
                             boolean sortable, boolean filterable) {}

    /** 分组后的 JOIN 单元：共享连接条件，携带组内字段成员（alias 由系统按组自动分配 j1..jN） */
    public record JoinGroup(String alias, String targetFormKey, String localField, String foreignField,
                            List<JoinConfig> members) {}

    /** 查询列映射（key → SQL 引用 + 类型 + 能力标记）；ref 形如 "m.order_no" / "j1.name" */
    public record QueryColumn(String key, String ref, String columnType, boolean sortable, boolean filterable) {}

    /**
     * 按 (localField, targetFormKey, foreignField) 分组；保序，组序即 alias 序号（j1, j2, ...）。
     * JoinConfig.alias 一律忽略（存量兼容），以分组分配的 alias 为准。
     */
    public static List<JoinGroup> group(List<JoinConfig> joins) {
        Map<String, JoinGroup> byKey = new LinkedHashMap<>();
        List<JoinGroup> ordered = new ArrayList<>();
        int idx = 0;
        for (JoinConfig j : joins) {
            String key = j.localField() + "|" + j.targetFormKey() + "|" + j.foreignField();
            JoinGroup g = byKey.get(key);
            if (g == null) {
                g = new JoinGroup("j" + (++idx), j.targetFormKey(), j.localField(), j.foreignField(),
                        new ArrayList<>());
                byKey.put(key, g);
                ordered.add(g);
            }
            g.members().add(j);
        }
        return ordered;
    }

    /**
     * 生成分页 SELECT：主表 m.* + 虚拟列，LEFT JOIN 链，注入白名单筛选/排序/分页/租户。
     *
     * @param mainTable   主表物理表名（wf_biz_xxx）
     * @param tenantId    当前租户
     * @param joins       关联声明列表
     * @param columns     查询列映射（含主表列与虚拟列）
     * @param filters     字段筛选（结构化 {logic,conditions} 或旧格式 {col:value}）
     * @param sort        排序字段（可选，白名单）
     * @param order       asc/desc（可选，默认 desc）
     * @param page        页码（0 起）
     * @param size        每页大小（<=0 不分页）
     */
    public static BizDataQueryBuilder.SqlAndParams buildSelect(String mainTable, String tenantId,
                                                               List<JoinConfig> joins, List<QueryColumn> columns,
                                                               Map<String, Object> filters,
                                                               String keyword, String keywordColumn,
                                                               String sort, String order, int page, int size) {
        StringBuilder sql = new StringBuilder("SELECT m.*");
        List<JoinGroup> groups = group(joins);
        for (JoinGroup g : groups) {
            for (JoinConfig j : g.members()) {
                sql.append(", ").append(g.alias()).append(".").append(j.joinField())
                        .append(" AS ").append(j.virtualKey());
                // 目标列为 dataPicker 引用列（含 <virtualKey>_text 冗余文本 QueryColumn）：SELECT 一并带出
                if (hasColumn(columns, j.virtualKey() + "_text")) {
                    sql.append(", ").append(g.alias()).append(".").append(j.joinField())
                            .append("_text AS ").append(j.virtualKey()).append("_text");
                }
            }
        }
        sql.append(" FROM ").append(mainTable).append(" m");
        for (JoinGroup g : groups) {
            sql.append(" LEFT JOIN wf_biz_").append(g.targetFormKey()).append(" ").append(g.alias())
                    .append(" ON ").append(g.alias()).append(".").append(g.foreignField())
                    .append(" = ").append(localRef(g.localField(), columns));
        }
        sql.append(" WHERE m.tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        appendFilters(sql, params, columns, filters);

        appendKeyword(sql, params, columns, keyword, keywordColumn);

        String sortColumn = (sort == null || sort.isBlank()) ? "created_at" : sort;
        String sortRef = resolveRef(sortColumn, columns, true, "排序字段");
        String orderDir = (order == null || order.isBlank()) ? "desc" : order.toLowerCase();
        if (!ALLOWED_ORDER.contains(orderDir)) {
            throw new IllegalArgumentException("非法排序方向: " + order);
        }
        sql.append(" ORDER BY ").append(sortRef).append(" ").append(orderDir.toUpperCase());

        if (size > 0) {
            sql.append(" LIMIT ? OFFSET ?");
            params.add(size);
            params.add(page * size);
        }
        return new BizDataQueryBuilder.SqlAndParams(sql.toString(), params);
    }

    /**
     * 生成 COUNT 查询（分页总数，JOIN 链与筛选条件与 buildSelect 一致，无排序/分页）。
     */
    public static BizDataQueryBuilder.SqlAndParams buildCount(String mainTable, String tenantId,
                                                              List<JoinConfig> joins, List<QueryColumn> columns,
                                                              Map<String, Object> filters,
                                                              String keyword, String keywordColumn) {
        StringBuilder sql = new StringBuilder("SELECT COUNT(1) FROM ").append(mainTable).append(" m");
        for (JoinGroup g : group(joins)) {
            sql.append(" LEFT JOIN wf_biz_").append(g.targetFormKey()).append(" ").append(g.alias())
                    .append(" ON ").append(g.alias()).append(".").append(g.foreignField())
                    .append(" = ").append(localRef(g.localField(), columns));
        }
        sql.append(" WHERE m.tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        appendFilters(sql, params, columns, filters);

        appendKeyword(sql, params, columns, keyword, keywordColumn);
        return new BizDataQueryBuilder.SqlAndParams(sql.toString(), params);
    }

    /**
     * 保存校验：必填字段、virtualKey 唯一、virtualKey 不与主表列冲突。
     * 注：alias 由系统按组自动分配，输入值一律忽略（存量兼容）。
     *
     * @param joins       关联声明列表
     * @param mainColumns 主表列 key 列表
     */
    public static void validate(List<JoinConfig> joins, List<String> mainColumns) {
        if (joins == null || joins.isEmpty()) {
            return;
        }
        Set<String> virtualKeys = new java.util.HashSet<>();
        for (JoinConfig j : joins) {
            requireText(j.targetFormKey(), "关联目标表单");
            requireText(j.localField(), "主表关联字段");
            requireText(j.foreignField(), "目标表关联字段");
            requireText(j.joinField(), "目标表展示字段");
            requireText(j.virtualKey(), "虚拟列 key");
            if (!virtualKeys.add(j.virtualKey())) {
                throw new IllegalArgumentException("虚拟列 key 重复: " + j.virtualKey());
            }
            if (mainColumns != null && mainColumns.contains(j.virtualKey())) {
                throw new IllegalArgumentException("虚拟列 key 与主表列冲突: " + j.virtualKey());
            }
        }
    }

    /**
     * 保存校验：targetFormKey 对应业务表单物理表必须存在（防止配置引用不存在的表单）。
     *
     * @param joins        关联声明列表
     * @param tableExists  物理表存在性判断（如 dynamicTableManager::tableExists）
     */
    public static void validateTargets(List<JoinConfig> joins, java.util.function.Predicate<String> tableExists) {
        if (joins == null || joins.isEmpty()) {
            return;
        }
        for (JoinConfig j : joins) {
            String table = "wf_biz_" + j.targetFormKey();
            if (!tableExists.test(table)) {
                throw new IllegalArgumentException("关联表单不存在: " + j.targetFormKey());
            }
        }
    }

    private static void requireText(String v, String label) {
        if (v == null || v.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
    }

    /** JOIN 匹配的 localField 引用：JSON 列提取首元素，普通列直接引用 */
    private static String localRef(String localField, List<QueryColumn> columns) {
        if (isJsonColumn(columns, localField)) {
            return "JSON_UNQUOTE(JSON_EXTRACT(m." + localField + ",'$[0]'))";
        }
        return "m." + localField;
    }

    private static boolean isJsonColumn(List<QueryColumn> columns, String key) {
        for (QueryColumn c : columns) {
            if (c.key().equals(key)) {
                return "JSON".equalsIgnoreCase(c.columnType());
            }
        }
        return false;
    }

    /** columns 中是否存在指定 key（用于判断是否带出 <virtualKey>_text 冗余列） */
    private static boolean hasColumn(List<QueryColumn> columns, String key) {
        if (columns == null) {
            return false;
        }
        for (QueryColumn c : columns) {
            if (c.key().equals(key)) {
                return true;
            }
        }
        return false;
    }

    private static String columnTypeOf(List<QueryColumn> columns, String key) {
        for (QueryColumn c : columns) {
            if (c.key().equals(key)) {
                return c.columnType() == null ? "" : c.columnType();
            }
        }
        return "";
    }

    private static String jsonValue(Object v) {
        try {
            return OM.writeValueAsString(v);
        } catch (JsonProcessingException e) {
            return String.valueOf(v);
        }
    }

    /** 解析列引用：白名单校验 + 返回 SQL 引用；内置列（id/created_at/updated_at）走主表别名 */
    private static String resolveRef(String column, List<QueryColumn> columns, boolean sortable, String label) {
        if (column == null || column.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        if (BUILTIN_COLUMNS.contains(column)) {
            return "m." + column;
        }
        for (QueryColumn c : columns) {
            if (c.key().equals(column)) {
                if (sortable && !c.sortable()) {
                    throw new IllegalArgumentException("该列不可排序: " + column);
                }
                if (!sortable && !c.filterable()) {
                    throw new IllegalArgumentException("该列不可" + label + ": " + column);
                }
                return c.ref();
            }
        }
        throw new IllegalArgumentException("非法" + label + ": " + column);
    }

    /** 筛选注入：结构化 {logic,conditions} 或旧格式 {col:value}，JSON 列走 JSON 函数 */
    private static void appendFilters(StringBuilder sql, List<Object> params,
                                      List<QueryColumn> columns, Map<String, Object> filters) {
        if (filters == null || filters.isEmpty()) {
            return;
        }
        if (filters.get("conditions") instanceof List<?> condList) {
            String logic = "AND".equalsIgnoreCase(String.valueOf(filters.getOrDefault("logic", "AND"))) ? "AND" : "OR";
            appendStructuredFilters(sql, params, columns, logic, castConditions(condList));
            return;
        }
        for (Map.Entry<String, Object> e : filters.entrySet()) {
            String ref = resolveRef(e.getKey(), columns, false, "筛选字段");
            if (e.getValue() == null) {
                continue;
            }
            if (isJsonColumn(columns, e.getKey())) {
                sql.append(" AND JSON_CONTAINS(").append(ref).append(", ?)");
                params.add(jsonValue(e.getValue()));
            } else {
                sql.append(" AND ").append(ref).append(" = ?");
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

    /** 结构化多条件筛选（复用 filter 协议：eq/ne/like/in/range/isempty/isnotempty） */
    private static void appendStructuredFilters(StringBuilder sql, List<Object> params,
                                                List<QueryColumn> columns, String logic,
                                                List<Map<String, Object>> conditions) {
        List<String> fragments = new ArrayList<>();
        for (Map<String, Object> c : conditions) {
            String column = String.valueOf(c.get("column"));
            String ref = resolveRef(column, columns, false, "筛选字段");
            String op = c.get("op") == null ? "eq" : String.valueOf(c.get("op")).toLowerCase();
            boolean json = isJsonColumn(columns, column);
            switch (op) {
                case "eq" -> {
                    if (c.get("value") == null) continue;
                    if (json) {
                        fragments.add("JSON_CONTAINS(" + ref + ", ?)");
                        params.add(jsonValue(c.get("value")));
                    } else {
                        fragments.add(ref + " = ?");
                        params.add(c.get("value"));
                    }
                }
                case "ne" -> {
                    if (c.get("value") == null) continue;
                    if (json) {
                        fragments.add("NOT JSON_CONTAINS(" + ref + ", ?)");
                        params.add(jsonValue(c.get("value")));
                    } else {
                        fragments.add(ref + " <> ?");
                        params.add(c.get("value"));
                    }
                }
                case "like" -> {
                    if (c.get("value") == null) continue;
                    fragments.add(ref + " LIKE ?");
                    params.add("%" + c.get("value") + "%");
                }
                case "in" -> {
                    Object v = c.get("value");
                    if (!(v instanceof List<?> values) || values.isEmpty()) continue;
                    if (json) {
                        fragments.add("JSON_OVERLAPS(" + ref + ", ?)");
                        params.add(jsonValue(values));
                    } else {
                        String marks = String.join(", ", java.util.Collections.nCopies(values.size(), "?"));
                        fragments.add(ref + " IN (" + marks + ")");
                        params.addAll(values);
                    }
                }
                case "range" -> {
                    Object v = c.get("value");
                    if (!(v instanceof List<?> range) || range.size() != 2 || range.get(0) == null || range.get(1) == null) {
                        continue;
                    }
                    fragments.add("(" + ref + " >= ? AND " + ref + " <= ?)");
                    params.add(range.get(0));
                    params.add(range.get(1));
                }
                case "isempty" -> fragments.add("(" + ref + " IS NULL OR " + ref + " = '')");
                case "isnotempty" -> fragments.add("(" + ref + " IS NOT NULL AND " + ref + " <> '')");
                default -> throw new IllegalArgumentException("非法筛选运算符: " + op);
            }
        }
        if (fragments.isEmpty()) {
            return;
        }
        sql.append(" AND (").append(String.join(" " + logic + " ", fragments)).append(")");
    }

    /** 关键词搜索：keywordColumn 支持逗号分隔多列（OR LIKE） */
    private static void appendKeyword(StringBuilder sql, List<Object> params,
                                      List<QueryColumn> columns, String keyword, String keywordColumn) {
        if (keyword == null || keyword.isBlank()) {
            return;
        }
        String[] cols = (keywordColumn == null || keywordColumn.isBlank())
                ? new String[0]
                : keywordColumn.split(",");
        List<String> likeFragments = new ArrayList<>();
        for (String col : cols) {
            String trimmed = col.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            String ref = resolveRef(trimmed, columns, false, "关键词匹配列");
            likeFragments.add(ref + " LIKE ?");
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
}