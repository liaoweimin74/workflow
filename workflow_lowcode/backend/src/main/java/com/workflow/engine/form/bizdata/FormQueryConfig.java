package com.workflow.engine.form.bizdata;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.form.bizdata.JoinSqlGenerator.JoinConfig;
import com.workflow.engine.form.column.ColumnConfig;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * FORM 数据源查询模式配置解析器。
 * <p>
 * 从 FORM 数据源 params JSON 中提取可选 queryMode 段（与现有 list/create/get/update/delete
 * action 配置共存于同一 JSON，互不冲突）：
 * <pre>
 *   config：{"queryMode":"config","joins":[{alias,targetFormKey,localField,foreignField,
 *            joinField,virtualKey,label,sortable,filterable}]}
 *   sql：   {"queryMode":"sql","query":"...","columns":[{key,label,columnType,sortable,filterable}],
 *            "params":["startTime"]}
 * </pre>
 * 缺省（无 queryMode / queryMode 未知 / config 且 joins 为空 / sql 且 query 空白）→
 * {@link #isConfigMode()}/{@link #isSqlMode()} 均为 false，调用方回退原单表查询，保持向后兼容。
 * <p>
 * alias 语义：joins[] 的 alias 由后端按组自动分配（前端不录入），解析时缺失/非法/重复
 * 按 {@code j1/j2/...} 兜底分配（{@link #ensureAlias}），对齐 NodeJS parseJoins。
 */
public record FormQueryConfig(String queryMode,
                              List<JoinConfig> joins,
                              String query,
                              List<ColumnConfig> columns,
                              List<String> declaredParams) {

    /** config（声明式 JOIN）模式生效：queryMode=config 且 joins 非空 */
    public boolean isConfigMode() {
        return "config".equals(queryMode) && joins != null && !joins.isEmpty();
    }

    /** sql（管理员模板 + 参数透传）模式生效：queryMode=sql 且 query 非空白 */
    public boolean isSqlMode() {
        return "sql".equals(queryMode) && query != null && !query.isBlank();
    }

    /** visual（可视化构建器）模式生效：queryMode=visual 且 query 非空白 */
    public boolean isVisualMode() {
        return "visual".equals(queryMode) && query != null && !query.isBlank();
    }

    /**
     * 解析 FORM 数据源 params JSON。null/空白返回默认配置；非法 JSON 抛 400。
     */
    public static FormQueryConfig parse(String paramsJson, ObjectMapper objectMapper) {
        if (paramsJson == null || paramsJson.isBlank()) {
            return empty();
        }
        JsonNode root;
        try {
            root = objectMapper.readTree(paramsJson);
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "数据源 params 不是合法 JSON: " + e.getOriginalMessage());
        }
        if (root == null || !root.isObject()) {
            throw new BusinessException(400, "数据源 params 必须是 JSON 对象");
        }
        String mode = text(root, "queryMode");
        if ("config".equals(mode)) {
            List<JoinConfig> joins = parseJoins(root.get("joins"));
            return new FormQueryConfig(mode, joins, null, List.of(), List.of());
        }
        if ("sql".equals(mode)) {
            String query = text(root, "query");
            List<ColumnConfig> columns = parseColumns(root.get("columns"));
            List<String> params = parseStrings(root.get("params"));
            return new FormQueryConfig(mode, List.of(), query, columns, params);
        }
        if ("visual".equals(mode)) {
            String query = text(root, "query");
            List<ColumnConfig> columns = parseColumns(root.get("columns"));
            List<String> params = parseStrings(root.get("params"));
            return new FormQueryConfig(mode, List.of(), query, columns, params);
        }
        // 缺省/未知 queryMode：保留 mode，但 isConfigMode/isSqlMode 均为 false
        return new FormQueryConfig(mode, List.of(), null, List.of(), List.of());
    }

    private static FormQueryConfig empty() {
        return new FormQueryConfig(null, List.of(), null, List.of(), List.of());
    }

    private static List<JoinConfig> parseJoins(JsonNode node) {
        List<JoinConfig> out = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return out;
        }
        Set<String> used = new HashSet<>();
        int idx = 0;
        for (JsonNode n : node) {
            if (n == null || !n.isObject()) {
                continue;
            }
            idx++;
            out.add(new JoinConfig(
                    ensureAlias(text(n, "alias"), used, idx),
                    text(n, "targetFormKey"),
                    text(n, "localField"),
                    text(n, "foreignField"),
                    text(n, "joinField"),
                    text(n, "virtualKey"),
                    text(n, "label"),
                    bool(n, "sortable"),
                    bool(n, "filterable")));
        }
        return out;
    }

    /** alias 合法格式（合法且未用 → 原样保留，否则按 jN 自动分配）。 */
    private static final Pattern ALIAS_PATTERN = Pattern.compile("^[a-zA-Z_][a-zA-Z0-9_]*$");

    /**
     * alias 确定化：合法且未用 → 原样；缺失/非法/重复 → 按 {@code j<idx>} 起步找空位。
     * <p>
     * alias 约定：前端不录入，缺失/空白时按序自动分配 {@code j1/j2/...}（保证唯一），
     * 与保存侧「alias 可缺省」校验语义一致。公开静态供
     * {@link BizDataSupport}{@code #previewJoinSql}（不经 parse 的裸 joins）复用，
     * 对齐 NodeJS {@code form-query-config.ts} 的 {@code ensureAlias}。
     *
     * @param alias 传入 alias（可为 null/非法/重复）
     * @param used 已分配 alias 集合（本方法会向其登记返回值）
     * @param idx 当前 join 序号（1 起，自动分配的起步值）
     */
    public static String ensureAlias(String alias, Set<String> used, int idx) {
        if (alias != null && ALIAS_PATTERN.matcher(alias).matches() && !used.contains(alias)) {
            used.add(alias);
            return alias;
        }
        int n = Math.max(idx, used.size() + 1);
        String candidate = "j" + n;
        while (used.contains(candidate)) {
            n++;
            candidate = "j" + n;
        }
        used.add(candidate);
        return candidate;
    }

    private static List<ColumnConfig> parseColumns(JsonNode node) {
        List<ColumnConfig> out = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return out;
        }
        for (JsonNode n : node) {
            if (n == null || !n.isObject()) {
                continue;
            }
            ColumnConfig c = new ColumnConfig();
            c.setKey(text(n, "key"));
            c.setLabel(text(n, "label"));
            c.setColumnType(text(n, "columnType"));
            c.setLength(intVal(n, "length"));
            c.setScale(intVal(n, "scale"));
            c.setRequired(bool(n, "required"));
            c.setUnique(bool(n, "unique"));
            c.setIndexed(bool(n, "indexed"));
            c.setHidden(bool(n, "hidden"));
            c.setComponentType(text(n, "componentType"));
            c.setSortable(bool(n, "sortable"));
            c.setFilterable(bool(n, "filterable"));
            c.setMatchType(text(n, "matchType"));
            out.add(c);
        }
        return out;
    }

    private static List<String> parseStrings(JsonNode node) {
        List<String> out = new ArrayList<>();
        if (node == null || !node.isArray()) {
            return out;
        }
        for (JsonNode n : node) {
            if (n != null && n.isTextual() && !n.asText().isBlank()) {
                out.add(n.asText());
            }
        }
        return out;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() ? null : v.asText();
    }

    private static boolean bool(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v != null && v.isBoolean() && v.asBoolean();
    }

    private static Integer intVal(JsonNode node, String field) {
        JsonNode v = node.get(field);
        return v == null || v.isNull() || !v.isNumber() ? null : v.asInt();
    }
}