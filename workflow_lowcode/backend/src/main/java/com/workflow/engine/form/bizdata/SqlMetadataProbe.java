package com.workflow.engine.form.bizdata;

import com.workflow.api.dto.ColumnMeta;
import com.workflow.common.exception.BusinessException;
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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SQL 列元数据探测器：执行完整 SQL（LIMIT 1 包裹）并读取 ResultSetMetaData。
 * 仅接受 SELECT 单条语句；模板中的 :placeholder 全部以 NULL 替换（探测不依赖参数值）。
 * 只取列结构，不返回数据行。
 */
@Component
public class SqlMetadataProbe {

    private static final Pattern PLACEHOLDER = Pattern.compile(":[A-Za-z_][A-Za-z0-9_]*");

    /** 探测阶段仅校验 SELECT 单条语句（不强制 :tenantId——探测时 SQL 可能尚未完善；只读元数据，无行数据流出） */
    private static final Pattern MULTI_STATEMENT = Pattern.compile("(?is).*;(\\s*)(FROM|UPDATE|DELETE|INSERT|DROP|ALTER|CREATE|TRUNCATE).*");

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
        String wrapped = "SELECT * FROM (" + trimmed + ") _probe LIMIT 1";
        String bound = bindPlaceholdersNull(wrapped);

        PreparedStatementCreator psc = (Connection conn) -> conn.prepareStatement(bound);
        ResultSetExtractor<List<ColumnMeta>> extractor = (ResultSet rs) -> {
            try {
                return mapColumns(rs.getMetaData());
            } catch (SQLException e) {
                throw new BusinessException(400, "读取列元数据失败: " + e.getMessage());
            }
        };
        return jdbcTemplate.query(psc, extractor);
    }

    /** 全部 :占位符替换为 NULL（探测不依赖参数值，避免绑定失败） */
    private static String bindPlaceholdersNull(String sql) {
        Matcher m = PLACEHOLDER.matcher(sql);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            m.appendReplacement(sb, "NULL");
        }
        m.appendTail(sb);
        return sb.toString();
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
