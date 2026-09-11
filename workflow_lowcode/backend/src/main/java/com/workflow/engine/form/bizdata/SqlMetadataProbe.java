package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.exception.BusinessException;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.PreparedStatementCreator;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * SQL 列元数据探测器：执行完整 SQL（LIMIT 1 兜底）并读取 ResultSetMetaData。
 * 仅接受 SELECT 单条语句；模板中的 :name 占位符与裸 ? 占位符全部以 NULL 替换
 * （探测只读列结构不依赖参数值，且不返回数据行）。
 * <p>
 * 实现说明（Task 10）：不再包裹 {@code SELECT * FROM (...) _probe LIMIT 1} 派生表——
 * H2 2.x 要求派生表列名唯一，JOIN + SELECT *（或同名列重复输出）会直接报
 * {@code Duplicate column name}；顶层执行无此限制（重复标签合法），
 * 且对 ORDER BY / UNION 等语句形态兼容性更好。
 */
@Component
public class SqlMetadataProbe {

    /** 探测阶段仅校验 SELECT 单条语句（不强制 :tenantId——探测时 SQL 可能尚未完善；只读元数据，无行数据流出） */
    private static final Pattern MULTI_STATEMENT = Pattern.compile("(?is).*;(\\s*)(FROM|UPDATE|DELETE|INSERT|DROP|ALTER|CREATE|TRUNCATE).*");

    /** SQL 尾部已带 LIMIT n / LIMIT n,m / FETCH FIRST n ROWS 时不再追加 LIMIT 1 */
    private static final Pattern TRAILING_LIMIT = Pattern.compile(
            "(?is)\\s+LIMIT\\s+\\d+\\s*(,\\s*\\d+\\s*)?$|(?is)\\s+FETCH\\s+FIRST\\s+\\d+\\s+ROWS\\s+ONLY\\s*$");

    private final JdbcTemplate jdbcTemplate;

    public SqlMetadataProbe(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<ColumnMeta> probe(String sql) {
        if (sql == null || sql.isBlank()) {
            throw new BusinessException(400, "SQL 不能为空");
        }
        String trimmed = sql.trim();
        if (trimmed.endsWith(";")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        if (!trimmed.regionMatches(true, 0, "SELECT", 0, 6)) {
            throw new BusinessException(400, "仅支持 SELECT 查询");
        }
        if (MULTI_STATEMENT.matcher(trimmed).matches()) {
            throw new BusinessException(400, "仅支持单条 SELECT 查询");
        }
        String stripped = stripTrailingLineComment(trimmed);
        String bound = bindPlaceholdersNull(stripped);
        String exec = TRAILING_LIMIT.matcher(bound).find()
                ? bound
                : bound + " LIMIT 1";

        PreparedStatementCreator psc = (Connection conn) -> conn.prepareStatement(exec);
        ResultSetExtractor<List<ColumnMeta>> extractor = (ResultSet rs) -> {
            try {
                return mapColumns(rs.getMetaData());
            } catch (SQLException e) {
                throw new BusinessException(400, "读取列元数据失败: " + e.getMessage());
            }
        };
        try {
            return jdbcTemplate.query(psc, extractor);
        } catch (DataAccessException e) {
            Throwable root = rootCause(e);
            throw new BusinessException(400, "SQL 探测失败: " + root.getMessage());
        }
    }

    /**
     * 引号感知占位符替换：单引号字符串 / 双引号标识符 / 反引号标识符之外的
     * {@code :name} 命名占位符与裸 {@code ?} 占位符统一替换为 NULL。
     * （可视化构建器的 WHERE 条件此前生成裸 ?，运行时模板引擎同样无法绑定，探测阶段先行消化）
     */
    static String bindPlaceholdersNull(String sql) {
        StringBuilder sb = new StringBuilder(sql.length() + 16);
        int n = sql.length();
        for (int i = 0; i < n; i++) {
            char c = sql.charAt(i);
            if (c == '\'' || c == '"' || c == '`') {
                char quote = c;
                sb.append(c);
                while (++i < n) {
                    char q = sql.charAt(i);
                    sb.append(q);
                    if (q == quote) {
                        if (i + 1 < n && sql.charAt(i + 1) == quote) {
                            sb.append(quote);
                            i++;
                        } else {
                            break;
                        }
                    }
                }
                continue;
            }
            if (c == '?') {
                sb.append("NULL");
                continue;
            }
            if (c == ':' && i + 1 < n && Character.isLetter(sql.charAt(i + 1))) {
                int j = i + 1;
                while (j < n && (Character.isLetterOrDigit(sql.charAt(j)) || sql.charAt(j) == '_')) {
                    j++;
                }
                sb.append("NULL");
                i = j - 1;
                continue;
            }
            sb.append(c);
        }
        return sb.toString();
    }

    /** 剥离 SQL 末尾的 "-- 行注释"（防止追加 LIMIT 1 后被注释吞掉） */
    static String stripTrailingLineComment(String sql) {
        int idx = sql.lastIndexOf("--");
        if (idx < 0) {
            return sql;
        }
        if (sql.indexOf('\n', idx) >= 0) {
            return sql; // 注释后还有内容（新行），非尾随注释
        }
        // 确认 "--" 不在字符串/标识符引号内：粗略统计其左侧引号数量
        String left = sql.substring(0, idx);
        if (countUnescaped(left, '\'') % 2 == 0 && countUnescaped(left, '"') % 2 == 0) {
            return sql.substring(0, idx).trim();
        }
        return sql;
    }

    private static int countUnescaped(String s, char quote) {
        int count = 0;
        for (int i = 0; i < s.length(); i++) {
            if (s.charAt(i) == quote) {
                if (i + 1 < s.length() && s.charAt(i + 1) == quote) {
                    i++;
                } else {
                    count++;
                }
            }
        }
        return count;
    }

    private static Throwable rootCause(Throwable e) {
        Throwable cur = e;
        int depth = 0;
        while (cur.getCause() != null && cur.getCause() != cur && depth++ < 10) {
            cur = cur.getCause();
        }
        return cur;
    }

    private static List<ColumnMeta> mapColumns(ResultSetMetaData md) throws SQLException {
        List<ColumnMeta> out = new ArrayList<>();
        int count = md.getColumnCount();
        for (int i = 1; i <= count; i++) {
            String label = md.getColumnLabel(i);
            String jdbcType = md.getColumnTypeName(i);
            int precision = md.getPrecision(i);
            int scale = md.getScale(i);
            boolean nullable = md.isNullable(i) != ResultSetMetaData.columnNoNulls;
            out.add(new ColumnMeta(label, label, normalizeType(jdbcType),
                    precision == 0 ? null : precision, scale == 0 ? null : scale, nullable));
        }
        return out;
    }

    /** JDBC 类型名 → 业务列类型白名单 */
    private static String normalizeType(String typeName) {
        if (typeName == null) {
            return "VARCHAR";
        }
        return switch (typeName.toUpperCase()) {
            case "VARCHAR", "CHAR" -> "VARCHAR";
            case "LONGVARCHAR", "CLOB" -> "TEXT";
            case "LONGNVARCHAR", "NCLOB" -> "LONGTEXT";
            case "INTEGER", "INT", "BIGINT", "SMALLINT", "TINYINT" -> "INT";
            case "DECIMAL", "NUMERIC" -> "DECIMAL";
            case "DATE" -> "DATE";
            case "TIMESTAMP", "DATETIME" -> "DATETIME";
            case "BOOLEAN", "BIT" -> "TINYINT";
            default -> "VARCHAR";
        };
    }
}
