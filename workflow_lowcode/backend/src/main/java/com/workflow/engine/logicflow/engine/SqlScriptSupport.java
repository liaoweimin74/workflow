package com.workflow.engine.logicflow.engine;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SQL 批处理（SQL_SCRIPT）语句解析/编译支持（纯静态工具，无状态，供引擎与发布校验器共用）。
 *
 * <p>职责：
 * <ul>
 *   <li>{@link #splitStatements}：按 {@code ;} 切分多语句 SQL——字符串字面量（'…' 与 "…",
 *       支持 '' 与 {@code \x} 转义）、反引号标识符、行注释（{@code -- } 与 {@code #}）、
 *       块注释（&#47;* *&#47;）内部的 ; 不切分；空语句（仅空白/注释）剔除；</li>
 *   <li>{@link #extractName}：前置注释中的别名声明 {@code -- name: xxx}（重名由调用方校验）；</li>
 *   <li>{@link #kindOf}：剥注释后按首关键字识别语句类型（白名单：SELECT/SHOW/DESC/DESCRIBE/
 *       EXPLAIN/WITH → QUERY；INSERT/REPLACE → INSERT；UPDATE/DELETE → DML；
 *       DDL/管理命令拒绝——隐式提交破坏事务原子性）；</li>
 *   <li>{@link #compile}：把 {@code {{var.path}}} 占位符编译为 JDBC {@code ?} 并按序收集参数
 *       （真参数绑定防注入）：裸占位符与整段引号包裹的单占位符绑定原始对象（保留数值类型），
 *       引号内混合拼接绑定插值后的字符串；Map/List/JsonNode 值序列化为 JSON 字符串；</li>
 *   <li>{@link #bindParams}/{@link #extractRows}/{@link #extractGeneratedKeys}：JDBC 执行辅助。</li>
 * </ul>
 */
public final class SqlScriptSupport {

    private SqlScriptSupport() {
    }

    /** 单节点语句数上限（防超长脚本拖垮执行；设计器与运行期同值校验）。 */
    public static final int MAX_STATEMENTS = 100;

    /** 语句类型（决定取 affected 行数 / 自增键 / 结果集行集）。 */
    public enum Kind {
        /** 查询（SELECT/SHOW/DESC/DESCRIBE/EXPLAIN/WITH）→ data 行集。 */
        QUERY,
        /** 写入（INSERT/REPLACE）→ affected + 自增键。 */
        INSERT,
        /** 更新/删除（UPDATE/DELETE）→ affected。 */
        DML
    }

    /** 占位符（变量路径 {{var}} / {{var.sub.sub2}}，两侧允许空白）。 */
    private static final Pattern PLACEHOLDER =
            Pattern.compile("\\{\\{\\s*([\\w]+(?:\\.[\\w]+)*)\\s*}}");
    /** 整段恰为一个占位符（引号包裹场景剥引号绑原始对象）。 */
    private static final Pattern FULL_PLACEHOLDER =
            Pattern.compile("^\\{\\{\\s*([\\w]+(?:\\.[\\w]+)*)\\s*}}$");
    /** 首关键字。 */
    private static final Pattern FIRST_KEYWORD = Pattern.compile("^([A-Za-z]+)");
    /** 别名声明（注释内）：-- name: xxx / # name=xxx。 */
    private static final Pattern NAME_DECL = Pattern.compile("(?i)\\bname\\s*[:=]\\s*(\\w+)");

    /** 编译产物：JDBC SQL（? 占位）+ 按序参数。 */
    public record CompiledSql(String jdbcSql, List<Object> params) {
    }

    /** 单条语句完整编译结果（引擎执行用）。 */
    public record CompiledStatement(String key, Kind kind, String sourceSql,
                                    String jdbcSql, List<Object> params) {
    }

    /** 查询行集提取结果（truncated=超出 maxRows 截断）。 */
    public record QueryResult(List<Map<String, Object>> rows, boolean truncated) {
    }

    // ------------------------------------------------------------------
    // 语句切分
    // ------------------------------------------------------------------

    /**
     * 按 {@code ;} 切分多语句 SQL（引号/注释感知）。字面量转义规则与 MariaDB 默认一致：
     * {@code ''} 双写与 {@code \x} 反斜杠转义（反引号内仅双写）；未闭合引号/块注释抛
     * IllegalArgumentException（消息含位置）。返回按序语句文本（trim 过，空语句剔除）。
     */
    public static List<String> splitStatements(String sql) {
        List<String> raw = new ArrayList<>();
        if (sql == null || sql.isBlank()) {
            return raw;
        }
        StringBuilder cur = new StringBuilder();
        int i = 0;
        int n = sql.length();
        while (i < n) {
            char c = sql.charAt(i);
            if (isLineCommentAt(sql, i)) {
                int eol = indexOfEol(sql, i);
                cur.append(sql, i, eol < 0 ? n : eol);
                i = eol < 0 ? n : eol;
                continue;
            }
            if (c == '/' && i + 1 < n && sql.charAt(i + 1) == '*') {
                int end = sql.indexOf("*/", i + 2);
                if (end < 0) {
                    throw new IllegalArgumentException("SQL 解析失败: 第 " + (i + 1) + " 字符起存在未闭合的块注释 /*");
                }
                cur.append(sql, i, end + 2);
                i = end + 2;
                continue;
            }
            if (c == '\'' || c == '"' || c == '`') {
                int end = scanQuoted(sql, i, c);
                cur.append(sql, i, end);
                i = end;
                continue;
            }
            if (c == ';') {
                raw.add(cur.toString());
                cur.setLength(0);
                i++;
                continue;
            }
            cur.append(c);
            i++;
        }
        raw.add(cur.toString());
        List<String> out = new ArrayList<>(raw.size());
        for (String s : raw) {
            if (!stripComments(s).isBlank()) {
                out.add(s.trim());
            }
        }
        return out;
    }

    /**
     * 提取语句前置注释中的别名声明（{@code -- name: xxx} / {@code # name=xxx} /
     * {@code /* name: xxx *&#47;}，首个命中，须 {@code \w+}）；语句正文开始后不再扫描。
     */
    public static String extractName(String statement) {
        int i = 0;
        int n = statement.length();
        while (i < n) {
            while (i < n && Character.isWhitespace(statement.charAt(i))) {
                i++;
            }
            if (i >= n) {
                return null;
            }
            if (isLineCommentAt(statement, i)) {
                int eol = indexOfEol(statement, i);
                String name = matchName(statement.substring(i, eol < 0 ? n : eol));
                if (name != null) {
                    return name;
                }
                i = eol < 0 ? n : eol;
                continue;
            }
            if (statement.charAt(i) == '/' && i + 1 < n && statement.charAt(i + 1) == '*') {
                int end = statement.indexOf("*/", i + 2);
                if (end < 0) {
                    return null;
                }
                String name = matchName(statement.substring(i, end + 2));
                if (name != null) {
                    return name;
                }
                i = end + 2;
                continue;
            }
            return null;
        }
        return null;
    }

    /** 语句类型识别：剥注释后首关键字白名单；不支持类型/空语句抛 IllegalArgumentException。 */
    public static Kind kindOf(String statement) {
        String bare = stripComments(statement).trim();
        if (bare.isEmpty()) {
            throw new IllegalArgumentException("存在空语句（仅空白/注释）");
        }
        Matcher m = FIRST_KEYWORD.matcher(bare);
        if (!m.find()) {
            throw new IllegalArgumentException("无法识别的 SQL 语句: " + excerpt(bare));
        }
        String kw = m.group(1).toUpperCase(Locale.ROOT);
        return switch (kw) {
            case "SELECT", "SHOW", "DESC", "DESCRIBE", "EXPLAIN", "WITH" -> Kind.QUERY;
            case "INSERT", "REPLACE" -> Kind.INSERT;
            case "UPDATE", "DELETE" -> Kind.DML;
            default -> throw new IllegalArgumentException(
                    "仅支持 SELECT/INSERT/UPDATE/DELETE/REPLACE（及 SHOW/DESC/EXPLAIN/WITH 查询），"
                            + "DDL 与管理命令不支持（会隐式提交破坏事务）: " + kw);
        };
    }

    // ------------------------------------------------------------------
    // 占位符编译（{{var.path}} → ? + 参数绑定）
    // ------------------------------------------------------------------

    /**
     * 把语句中的 {@code {{var.path}}} 占位符编译为 JDBC {@code ?} 占位符并按序收集参数：
     * <ul>
     *   <li>语句正文中的占位符 → 绑定变量原始对象（保留数值/布尔类型）；</li>
     *   <li>字符串字面量内整段恰为一个占位符（{@code '{{var}}'}）→ 剥引号绑原始对象；</li>
     *   <li>字符串字面量内混合拼接（{@code '前缀{{var}}后缀'}）→ 绑定插值后的字符串；</li>
     *   <li>Map/List/JsonNode 值序列化为 JSON 字符串（便于写入 JSON 列）；null 绑定 SQL NULL；</li>
     *   <li>注释与反引号标识符内不扫描；变量缺失按 null 处理（与 DATA_UPDATE 取值语义一致）。</li>
     * </ul>
     * objectMapper 允许 null（发布校验场景不会遇到容器值）。
     */
    public static CompiledSql compile(String statement, Map<String, Object> vars, ObjectMapper objectMapper) {
        StringBuilder jdbc = new StringBuilder(statement.length() + 16);
        List<Object> params = new ArrayList<>();
        int i = 0;
        int n = statement.length();
        while (i < n) {
            char c = statement.charAt(i);
            if (isLineCommentAt(statement, i)) {
                int eol = indexOfEol(statement, i);
                jdbc.append(statement, i, eol < 0 ? n : eol);
                i = eol < 0 ? n : eol;
                continue;
            }
            if (c == '/' && i + 1 < n && statement.charAt(i + 1) == '*') {
                int end = statement.indexOf("*/", i + 2);
                if (end < 0) {
                    throw new IllegalArgumentException("SQL 解析失败: 第 " + (i + 1) + " 字符起存在未闭合的块注释 /*");
                }
                jdbc.append(statement, i, end + 2);
                i = end + 2;
                continue;
            }
            if (c == '`') {
                int end = scanQuoted(statement, i, c);
                jdbc.append(statement, i, end);
                i = end;
                continue;
            }
            if (c == '\'') {
                int end = scanQuoted(statement, i, c);
                String inner = statement.substring(i + 1, end - 1);
                Matcher full = FULL_PLACEHOLDER.matcher(inner);
                if (full.matches()) {
                    // '{{var}}' → 剥引号绑原始对象（保留类型，迁就手写引号习惯）
                    params.add(bindValue(resolvePath(full.group(1), vars), objectMapper));
                    jdbc.append('?');
                } else {
                    Matcher any = PLACEHOLDER.matcher(inner);
                    if (any.find()) {
                        // '前缀{{var}}后缀' → 整个字面量绑定插值后的字符串（依旧真绑定防注入）
                        StringBuilder text = new StringBuilder();
                        int last = 0;
                        any.reset();
                        while (any.find()) {
                            text.append(inner, last, any.start());
                            text.append(stringify(resolvePath(any.group(1), vars), objectMapper));
                            last = any.end();
                        }
                        text.append(inner.substring(last));
                        params.add(text.toString());
                        jdbc.append('?');
                    } else {
                        jdbc.append(statement, i, end);
                    }
                }
                i = end;
                continue;
            }
            if (c == '{' && i + 1 < n && statement.charAt(i + 1) == '{') {
                Matcher m = PLACEHOLDER.matcher(statement);
                m.region(i, n);
                if (m.lookingAt()) {
                    params.add(bindValue(resolvePath(m.group(1), vars), objectMapper));
                    jdbc.append('?');
                    i = m.end();
                } else {
                    throw new IllegalArgumentException(
                            "非法变量占位符（须 {{var.path}} 形式且右括号闭合）于第 " + (i + 1) + " 字符附近");
                }
                continue;
            }
            if (c == '"') {
                int end = scanQuoted(statement, i, c);
                String inner = statement.substring(i + 1, end - 1);
                Matcher any = PLACEHOLDER.matcher(inner);
                if (any.find()) {
                    StringBuilder text = new StringBuilder();
                    int last = 0;
                    any.reset();
                    while (any.find()) {
                        text.append(inner, last, any.start());
                        text.append(stringify(resolvePath(any.group(1), vars), objectMapper));
                        last = any.end();
                    }
                    text.append(inner.substring(last));
                    params.add(text.toString());
                    jdbc.append('?');
                } else {
                    jdbc.append(statement, i, end);
                }
                i = end;
                continue;
            }
            jdbc.append(c);
            i++;
        }
        // 不可用 List.copyOf：参数允许 null（缺失变量绑定 SQL NULL 是合法场景）
        return new CompiledSql(jdbc.toString(), java.util.Collections.unmodifiableList(params));
    }

    /** 点路径取值：首段为变量名，后续逐层 Map 取值；缺失返回 null，中间层非对象抛错。 */
    public static Object resolvePath(String path, Map<String, Object> vars) {
        String[] parts = path.split("\\.");
        Object current = vars.get(parts[0]);
        for (int i = 1; i < parts.length && current != null; i++) {
            if (current instanceof Map<?, ?> map) {
                current = map.get(parts[i]);
            } else {
                throw new IllegalArgumentException(
                        "变量取值路径中间层非对象: " + path + " (于 " + parts[i - 1] + ")");
            }
        }
        return current;
    }

    /** 绑定值归一：null → null；Map/List/JsonNode → JSON 字符串；其余原样（保留数值/布尔类型）。 */
    private static Object bindValue(Object value, ObjectMapper om) {
        if (value == null || !(value instanceof Map || value instanceof List || value instanceof JsonNode)) {
            return value;
        }
        return stringify(value, om);
    }

    /** 插值字符串化：null → ""；容器 → JSON 文本；其余 String.valueOf。 */
    private static String stringify(Object value, ObjectMapper om) {
        if (value == null) {
            return "";
        }
        if (value instanceof Map || value instanceof List || value instanceof JsonNode) {
            if (om != null) {
                try {
                    return om.writeValueAsString(value);
                } catch (Exception ignored) {
                    // 序列化失败回退 String.valueOf
                }
            }
            return String.valueOf(value);
        }
        return value.toString();
    }

    // ------------------------------------------------------------------
    // JDBC 执行辅助
    // ------------------------------------------------------------------

    /** 参数绑定：null → setNull，其余 setObject（数值/布尔/字符串直通）。 */
    public static void bindParams(PreparedStatement ps, List<Object> params) throws SQLException {
        for (int i = 0; i < params.size(); i++) {
            Object v = params.get(i);
            if (v == null) {
                ps.setNull(i + 1, java.sql.Types.NULL);
            } else {
                ps.setObject(i + 1, v);
            }
        }
    }

    /** 查询行集提取（列标签为键，LinkedHashMap 保序；超 maxRows 截断并标 truncated）。 */
    public static QueryResult extractRows(ResultSet rs, int maxRows) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        int cols = md.getColumnCount();
        String[] labels = new String[cols];
        for (int c = 1; c <= cols; c++) {
            labels[c - 1] = md.getColumnLabel(c);
        }
        List<Map<String, Object>> rows = new ArrayList<>();
        boolean truncated = false;
        while (rs.next()) {
            if (rows.size() >= maxRows) {
                truncated = true;
                break;
            }
            Map<String, Object> row = new java.util.LinkedHashMap<>();
            for (int c = 1; c <= cols; c++) {
                row.put(labels[c - 1], rs.getObject(c));
            }
            rows.add(row);
        }
        return new QueryResult(rows, truncated);
    }

    /** 自增键提取（首列，最多 100 个；无键语句返回空列表）。 */
    public static List<Object> extractGeneratedKeys(PreparedStatement ps) throws SQLException {
        List<Object> keys = new ArrayList<>();
        try (ResultSet rs = ps.getGeneratedKeys()) {
            while (rs.next() && keys.size() < 100) {
                keys.add(rs.getObject(1));
            }
        }
        return keys;
    }

    // ------------------------------------------------------------------
    // 字符扫描基础
    // ------------------------------------------------------------------

    /** 行注释起点：'#' 或 '--' 后接空白/行尾（MariaDB 语义：'--x' 不算注释）。 */
    private static boolean isLineCommentAt(String s, int i) {
        char c = s.charAt(i);
        if (c == '#') {
            return true;
        }
        if (c == '-' && i + 1 < s.length() && s.charAt(i + 1) == '-') {
            int next = i + 2;
            if (next >= s.length()) {
                return true;
            }
            char nc = s.charAt(next);
            return nc == ' ' || nc == '\t' || nc == '\n' || nc == '\r';
        }
        return false;
    }

    /** 下一行分隔符（\n 或 \r）下标；无则 -1。 */
    private static int indexOfEol(String s, int from) {
        for (int i = from; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\n' || c == '\r') {
                return i;
            }
        }
        return -1;
    }

    /**
     * 扫描引号串返回结束下标（越过后引号）：'' / "" / \`\` 双写转义；
     * ' 与 " 内支持 {@code \x} 反斜杠转义（MariaDB 默认）；未闭合抛 IllegalArgumentException。
     */
    private static int scanQuoted(String s, int start, char quote) {
        int i = start + 1;
        int n = s.length();
        while (i < n) {
            char c = s.charAt(i);
            if (quote != '`' && c == '\\' && i + 1 < n) {
                i += 2;
                continue;
            }
            if (c == quote) {
                if (i + 1 < n && s.charAt(i + 1) == quote) {
                    i += 2;
                    continue;
                }
                return i + 1;
            }
            i++;
        }
        throw new IllegalArgumentException(
                "SQL 解析失败: 第 " + (start + 1) + " 字符起存在未闭合的引号: " + quote);
    }

    /** 剥注释（保留字符串字面量），用于空语句判定与首关键字识别。 */
    private static String stripComments(String statement) {
        StringBuilder out = new StringBuilder(statement.length());
        int i = 0;
        int n = statement.length();
        while (i < n) {
            char c = statement.charAt(i);
            if (isLineCommentAt(statement, i)) {
                int eol = indexOfEol(statement, i);
                i = eol < 0 ? n : eol;
                out.append(' ');
                continue;
            }
            if (c == '/' && i + 1 < n && statement.charAt(i + 1) == '*') {
                int end = statement.indexOf("*/", i + 2);
                if (end < 0) {
                    throw new IllegalArgumentException("SQL 解析失败: 存在未闭合的块注释 /*");
                }
                i = end + 2;
                out.append(' ');
                continue;
            }
            if (c == '\'' || c == '"' || c == '`') {
                int end = scanQuoted(statement, i, c);
                out.append(statement, i, end);
                i = end;
                continue;
            }
            out.append(c);
            i++;
        }
        return out.toString();
    }

    private static String matchName(String comment) {
        Matcher m = NAME_DECL.matcher(comment);
        return m.find() ? m.group(1) : null;
    }

    private static String excerpt(String s) {
        String t = s.trim();
        return t.length() <= 80 ? t : t.substring(0, 80) + "…";
    }
}
