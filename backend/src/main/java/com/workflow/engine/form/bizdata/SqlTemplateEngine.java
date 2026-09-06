package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * sql 模式 SQL 模板引擎。
 * <p>
 * 管理员 SQL 模板（必须包含 {@code :tenantId} 占位符）作为子查询被包裹为分页查询：
 * <pre>
 *   SELECT * FROM (&lt;管理员SQL&gt;) _qs {白名单筛选} ORDER BY &lt;声明列&gt; LIMIT ? OFFSET ?
 *   SELECT COUNT(*) FROM (&lt;管理员SQL&gt;) _qs {白名单筛选}
 * </pre>
 * 外层筛选/排序/关键词仅允许引用 columns 声明中 filterable/sortable=true 的列（key 即子查询输出列名），
 * 其余占位符一律参数绑定，杜绝 SQL 注入与任意列注入。
 */
public final class SqlTemplateEngine {

    private static final Set<String> ALLOWED_ORDER = Set.of("asc", "desc");

    private static final ObjectMapper OM = new ObjectMapper();

    private static final Pattern PLACEHOLDER = Pattern.compile(":[A-Za-z_][A-Za-z0-9_]*");

    private SqlTemplateEngine() {}

    /**
     * 校验 SQL 模板：仅允许 SELECT、必须含 :tenantId、columns 非空且至少一个可排序列、
     * 每个声明列 key 必须出现在 SELECT 输出列（或别名）中。
     *
     * @param query   管理员 SQL 模板
     * @param columns 声明列映射（key 需与 SELECT 输出列/别名匹配）
     */
    public static void validate(String query, List<JoinSqlGenerator.QueryColumn> columns) {
        validate(query, columns, List.of());
    }

    /**
     * 校验 SQL 模板（含参数白名单声明）：模板中每个非 :tenantId 占位符必须命中参数白名单，
     * 白名单参数名必须是合法标识符。无参数白名单时模板不得包含其他占位符。
     *
     * @param query          管理员 SQL 模板
     * @param columns        声明列映射
     * @param declaredParams 参数白名单（如 ["startTime", "endTime"]；可空）
     */
    public static void validate(String query, List<JoinSqlGenerator.QueryColumn> columns,
                                List<String> declaredParams) {
        if (query == null || query.isBlank()) {
            throw new IllegalArgumentException("SQL 模板不能为空");
        }
        String trimmed = query.trim();
        if (!trimmed.regionMatches(true, 0, "SELECT", 0, 6)) {
            throw new IllegalArgumentException("仅允许 SELECT 查询");
        }
        if (!query.contains(":tenantId")) {
            throw new IllegalArgumentException("SQL 模板必须包含 :tenantId 占位符");
        }
        if (columns == null || columns.isEmpty()) {
            throw new IllegalArgumentException("columns 不能为空");
        }
        if (columns.stream().noneMatch(JoinSqlGenerator.QueryColumn::sortable)) {
            throw new IllegalArgumentException("columns 至少需要一个可排序列");
        }
        Set<String> outputs = extractSelectOutputs(trimmed);
        if (!outputs.contains("*")) {
            for (JoinSqlGenerator.QueryColumn c : columns) {
                if (!outputs.contains(c.key())) {
                    throw new IllegalArgumentException("声明列不在查询结果中: " + c.key());
                }
            }
        }
        List<String> params = declaredParams == null ? List.of() : declaredParams;
        for (String p : params) {
            if (!p.matches("[a-zA-Z_][a-zA-Z0-9_]*")) {
                throw new IllegalArgumentException("参数名非法: " + p);
            }
        }
        for (String ph : extractPlaceholders(trimmed)) {
            if (":tenantId".equals(ph)) {
                continue;
            }
            if (!params.contains(ph.substring(1))) {
                throw new IllegalArgumentException("SQL 模板包含未声明参数: " + ph);
            }
        }
    }

    /**
     * 包裹查询：替换占位符绑定参数，注入白名单筛选/排序，派生行查询与 COUNT 查询。
     * 模板除 :tenantId 外不得包含其他占位符（无参数白名单场景）。
     *
     * @param query   管理员 SQL 模板（含 :tenantId）
     * @param tenantId 当前租户
     * @param columns 声明列映射
     * @param filters 字段筛选（结构化 {logic,conditions} 或旧格式 {col:value}）
     * @param sort    排序字段（可选，白名单内可排序列）
     * @param order   asc/desc（可选，默认 desc）
     */
    public static SqlQueryEngine.WrappedQuery wrap(String query, String tenantId,
                                                   List<JoinSqlGenerator.QueryColumn> columns,
                                                   Map<String, Object> filters, String keyword, String keywordColumn,
                                                   String sort, String order, int page, int size) {
        return wrap(query, tenantId, columns, filters, keyword, keywordColumn,
                sort, order, page, size, List.of(), Map.of());
    }

    /**
     * 包裹查询（含参数透传）：命中 declaredParams 白名单的运行时参数值绑定到对应 :paramName 占位符，
     * 未声明占位符 / 白名单内缺值 / 非法键一律拒绝。
     *
     * @param query          管理员 SQL 模板（含 :tenantId）
     * @param tenantId       当前租户
     * @param columns        声明列映射
     * @param filters        字段筛选
     * @param sort           排序字段（可选，白名单内可排序列）
     * @param order          asc/desc（可选，默认 desc）
     * @param declaredParams 参数白名单声明（如 ["startTime", "endTime"]）
     * @param runtimeParams  前端透传参数值（仅白名单内的键被绑定）
     */
    public static SqlQueryEngine.WrappedQuery wrap(String query, String tenantId,
                                                   List<JoinSqlGenerator.QueryColumn> columns,
                                                   Map<String, Object> filters, String keyword, String keywordColumn,
                                                   String sort, String order, int page, int size,
                                                   List<String> declaredParams, Map<String, Object> runtimeParams) {
        validate(query, columns, declaredParams);

        List<Object> innerParams = new ArrayList<>();
        String innerSql = bindPlaceholders(query, tenantId, declaredParams, runtimeParams, innerParams);

        StringBuilder filterSql = new StringBuilder();
        List<Object> filterParams = new ArrayList<>();
        appendFilters(filterSql, filterParams, columns, filters);
        appendKeyword(filterSql, filterParams, columns, keyword, keywordColumn);
        // 结构化/旧格式筛选统一以 " AND ..." 追加；作为独立片段时去掉前导 AND
        String filterBody = filterSql.toString();
        if (filterBody.startsWith(" AND ")) {
            filterBody = filterBody.substring(5);
        }
        String filterFragment = filterBody.isEmpty() ? "" : " WHERE " + filterBody;

        String sortColumn = (sort == null || sort.isBlank()) ? defaultSortColumn(columns) : sort;
        if (!isSortable(columns, sortColumn)) {
            throw new IllegalArgumentException("该列不可排序: " + sortColumn);
        }
        String orderDir = (order == null || order.isBlank()) ? "desc" : order.toLowerCase();
        if (!ALLOWED_ORDER.contains(orderDir)) {
            throw new IllegalArgumentException("非法排序方向: " + order);
        }
        String orderByFragment = " ORDER BY " + sortColumn + " " + orderDir.toUpperCase();

        return SqlQueryEngine.wrapSubquery(
                new BizDataQueryBuilder.SqlAndParams(innerSql, innerParams),
                filterFragment, filterParams, orderByFragment, page, size);
    }

    private static String defaultSortColumn(List<JoinSqlGenerator.QueryColumn> columns) {
        return columns.stream()
                .filter(JoinSqlGenerator.QueryColumn::sortable)
                .map(JoinSqlGenerator.QueryColumn::key)
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("columns 至少需要一个可排序列"));
    }

    private static boolean isSortable(List<JoinSqlGenerator.QueryColumn> columns, String key) {
        for (JoinSqlGenerator.QueryColumn c : columns) {
            if (c.key().equals(key)) {
                return c.sortable();
            }
        }
        return false;
    }

    /** 替换全部 :占位符；:tenantId 绑定租户，白名单参数绑定运行时值，其余占位符/缺值拒绝 */
    private static String bindPlaceholders(String query, String tenantId,
                                           List<String> declaredParams, Map<String, Object> runtimeParams,
                                           List<Object> params) {
        StringBuilder sb = new StringBuilder();
        Matcher m = PLACEHOLDER.matcher(query);
        int last = 0;
        while (m.find()) {
            sb.append(query, last, m.start());
            String ph = m.group();
            if (":tenantId".equals(ph)) {
                sb.append('?');
                params.add(tenantId);
            } else {
                String name = ph.substring(1);
                if (!declaredParams.contains(name)) {
                    throw new IllegalArgumentException("SQL 模板包含未声明参数: " + ph);
                }
                if (runtimeParams == null || !runtimeParams.containsKey(name)) {
                    throw new IllegalArgumentException("缺少运行时参数值: " + ph);
                }
                sb.append('?');
                params.add(runtimeParams.get(name));
            }
            last = m.end();
        }
        sb.append(query.substring(last));
        return sb.toString();
    }

    /** 提取模板中全部 :占位符（含 :tenantId） */
    static List<String> extractPlaceholders(String sql) {
        List<String> out = new ArrayList<>();
        Matcher m = PLACEHOLDER.matcher(sql);
        while (m.find()) {
            out.add(m.group());
        }
        return out;
    }

    /** 解析 SELECT 输出列/别名集合（"*" 表示通配，跳过逐列匹配） */
    static Set<String> extractSelectOutputs(String sql) {
        Set<String> out = new HashSet<>();
        int sel = indexOfKeyword(sql, "SELECT");
        if (sel < 0) {
            return out;
        }
        int from = indexOfKeyword(sql, "FROM", sel + 6);
        if (from < 0) {
            return out;
        }
        String list = sql.substring(sel + 6, from);
        for (String part : list.split(",")) {
            String trimmed = part.trim();
            if (trimmed.isEmpty()) {
                continue;
            }
            if (trimmed.equals("*") || trimmed.endsWith(".*")) {
                out.add("*");
                continue;
            }
            String name;
            int as = indexOfKeyword(trimmed, "AS");
            if (as >= 0) {
                String after = trimmed.substring(as + 2).trim();
                name = after.split("[\\s,]+")[0];
            } else {
                int dot = trimmed.lastIndexOf('.');
                name = (dot >= 0 ? trimmed.substring(dot + 1) : trimmed).trim();
            }
            name = name.replace("`", "").replace("\"", "");
            if (!name.isEmpty()) {
                out.add(name);
            }
        }
        return out;
    }

    private static int indexOfKeyword(String s, String kw) {
        return indexOfKeyword(s, kw, 0);
    }

    private static int indexOfKeyword(String s, String kw, int from) {
        String lower = s.toLowerCase();
        String k = kw.toLowerCase();
        int i = lower.indexOf(k, from);
        while (i >= 0) {
            boolean beforeOk = i == 0 || !Character.isLetterOrDigit(lower.charAt(i - 1));
            int end = i + k.length();
            boolean afterOk = end >= lower.length() || !Character.isLetterOrDigit(lower.charAt(end));
            if (beforeOk && afterOk) {
                return i;
            }
            i = lower.indexOf(k, i + 1);
        }
        return -1;
    }

    /** 筛选注入：引用 = 声明列 key（子查询输出列名），仅允许 filterable=true 列 */
    private static void appendFilters(StringBuilder sql, List<Object> params,
                                      List<JoinSqlGenerator.QueryColumn> columns, Map<String, Object> filters) {
        if (filters == null || filters.isEmpty()) {
            return;
        }
        if (filters.get("conditions") instanceof List<?> condList) {
            String logic = "AND".equalsIgnoreCase(String.valueOf(filters.getOrDefault("logic", "AND"))) ? "AND" : "OR";
            appendStructuredFilters(sql, params, columns, logic, castConditions(condList));
            return;
        }
        for (Map.Entry<String, Object> e : filters.entrySet()) {
            String key = resolveKey(e.getKey(), columns, "筛选字段");
            if (e.getValue() == null) {
                continue;
            }
            if (isJsonColumn(columns, e.getKey())) {
                sql.append(" AND JSON_CONTAINS(").append(key).append(", ?)");
                params.add(jsonValue(e.getValue()));
            } else {
                sql.append(" AND ").append(key).append(" = ?");
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
                                                List<JoinSqlGenerator.QueryColumn> columns, String logic,
                                                List<Map<String, Object>> conditions) {
        List<String> fragments = new ArrayList<>();
        for (Map<String, Object> c : conditions) {
            String column = String.valueOf(c.get("column"));
            String key = resolveKey(column, columns, "筛选字段");
            String op = c.get("op") == null ? "eq" : String.valueOf(c.get("op")).toLowerCase();
            boolean json = isJsonColumn(columns, column);
            switch (op) {
                case "eq" -> {
                    if (c.get("value") == null) continue;
                    if (json) {
                        fragments.add("JSON_CONTAINS(" + key + ", ?)");
                        params.add(jsonValue(c.get("value")));
                    } else {
                        fragments.add(key + " = ?");
                        params.add(c.get("value"));
                    }
                }
                case "ne" -> {
                    if (c.get("value") == null) continue;
                    if (json) {
                        fragments.add("NOT JSON_CONTAINS(" + key + ", ?)");
                        params.add(jsonValue(c.get("value")));
                    } else {
                        fragments.add(key + " <> ?");
                        params.add(c.get("value"));
                    }
                }
                case "like" -> {
                    if (c.get("value") == null) continue;
                    fragments.add(key + " LIKE ?");
                    params.add("%" + c.get("value") + "%");
                }
                case "in" -> {
                    Object v = c.get("value");
                    if (!(v instanceof List<?> values) || values.isEmpty()) continue;
                    if (json) {
                        fragments.add("JSON_OVERLAPS(" + key + ", ?)");
                        params.add(jsonValue(values));
                    } else {
                        String marks = String.join(", ", java.util.Collections.nCopies(values.size(), "?"));
                        fragments.add(key + " IN (" + marks + ")");
                        params.addAll(values);
                    }
                }
                case "range" -> {
                    Object v = c.get("value");
                    if (!(v instanceof List<?> range) || range.size() != 2 || range.get(0) == null || range.get(1) == null) {
                        continue;
                    }
                    fragments.add("(" + key + " >= ? AND " + key + " <= ?)");
                    params.add(range.get(0));
                    params.add(range.get(1));
                }
                case "isempty" -> fragments.add("(" + key + " IS NULL OR " + key + " = '')");
                case "isnotempty" -> fragments.add("(" + key + " IS NOT NULL AND " + key + " <> '')");
                default -> throw new IllegalArgumentException("非法筛选运算符: " + op);
            }
        }
        if (fragments.isEmpty()) {
            return;
        }
        if (fragments.size() == 1) {
            sql.append(" AND ").append(fragments.get(0));
        } else {
            sql.append(" AND (").append(String.join(" " + logic + " ", fragments)).append(")");
        }
    }

    /** 关键词搜索：keywordColumn 支持逗号分隔多列（OR LIKE），仅允许 filterable=true 列 */
    private static void appendKeyword(StringBuilder sql, List<Object> params,
                                      List<JoinSqlGenerator.QueryColumn> columns, String keyword, String keywordColumn) {
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
            String key = resolveKey(trimmed, columns, "关键词匹配列");
            likeFragments.add(key + " LIKE ?");
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

    /** 白名单校验：返回列 key；filterable=false 或未声明列拒绝 */
    private static String resolveKey(String column, List<JoinSqlGenerator.QueryColumn> columns, String label) {
        if (column == null || column.isBlank()) {
            throw new IllegalArgumentException(label + "不能为空");
        }
        for (JoinSqlGenerator.QueryColumn c : columns) {
            if (c.key().equals(column)) {
                if (!c.filterable()) {
                    throw new IllegalArgumentException("该列不可" + label + ": " + column);
                }
                return c.key();
            }
        }
        throw new IllegalArgumentException("非法" + label + ": " + column);
    }

    private static boolean isJsonColumn(List<JoinSqlGenerator.QueryColumn> columns, String key) {
        for (JoinSqlGenerator.QueryColumn c : columns) {
            if (c.key().equals(key)) {
                return "JSON".equalsIgnoreCase(c.columnType());
            }
        }
        return false;
    }

    private static String jsonValue(Object v) {
        try {
            return OM.writeValueAsString(v);
        } catch (JsonProcessingException e) {
            return String.valueOf(v);
        }
    }
}