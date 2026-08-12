package com.workflow.engine.form.column;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;

/**
 * 动态物理表管理器。
 * 基于 column_config 创建/变更业务表单底表 wf_biz_<formKey>。
 * 所有标识符由 DdlBuilder 白名单校验，DDL 语句由 JdbcTemplate.execute 执行。
 */
@Component
public class DynamicTableManager {

    private static final Logger log = LoggerFactory.getLogger(DynamicTableManager.class);

    private final JdbcTemplate jdbcTemplate;

    public DynamicTableManager(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /**
     * 确保物理表存在且结构与 column_config 一致。
     * 表不存在 → 创建；已存在 → 执行差异变更（增列/改宽/加索引）。
     *
     * @param formKey 表单 key（表名 = wf_biz_<formKey>）
     * @param columns 期望的列映射（须已通过 DdlBuilder 校验）
     */
    public void ensureTable(String formKey, List<ColumnConfig> columns) {
        DdlBuilder.validateFormKey(formKey);
        String table = "wf_biz_" + formKey;

        if (!tableExists(table)) {
            String createSql = DdlBuilder.buildCreateTable(formKey, columns);
            log.info("Creating dynamic table: {}", table);
            jdbcTemplate.execute(createSql);
            return;
        }

        List<ColumnInfo> existing = findTableColumns(table);
        List<String> alterStatements = DdlBuilder.buildAlterStatements(formKey, columns, existing);
        if (alterStatements.isEmpty()) {
            log.info("Dynamic table {} structure unchanged", table);
            return;
        }
        for (String stmt : alterStatements) {
            log.info("Altering dynamic table: {}", stmt);
            jdbcTemplate.execute(stmt);
        }
    }

    /**
     * 判断物理表是否存在。
     */
    public boolean tableExists(String tableName) {
        String sql = """
                SELECT COUNT(1) FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                """;
        Integer count = jdbcTemplate.queryForObject(sql, Integer.class, tableName);
        return count != null && count > 0;
    }

    /**
     * 查询物理表列信息（information_schema）。
     *
     * @param tableName 物理表名
     * @return 列信息列表
     */
    public List<ColumnInfo> findTableColumns(String tableName) {
        String sql = """
                SELECT COLUMN_NAME, DATA_TYPE,
                       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
                       IS_NULLABLE, COLUMN_KEY
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
                """;
        return jdbcTemplate.query(sql, this::mapColumnInfo, tableName);
    }

    private ColumnInfo mapColumnInfo(ResultSet rs, int rowNum) throws SQLException {
        String key = rs.getString("COLUMN_NAME");
        String dataType = rs.getString("DATA_TYPE");
        String columnType = normalizeType(dataType);
        Integer length = getNullableInt(rs, "CHARACTER_MAXIMUM_LENGTH");
        if (length == null) {
            length = getNullableInt(rs, "NUMERIC_PRECISION");
        }
        Integer scale = getNullableInt(rs, "NUMERIC_SCALE");
        boolean nullable = "YES".equalsIgnoreCase(rs.getString("IS_NULLABLE"));
        String columnKey = rs.getString("COLUMN_KEY");
        boolean unique = columnKey != null && columnKey.contains("UNI");
        return new ColumnInfo(key, columnType, length, scale, nullable, unique);
    }

    /** information_schema DATA_TYPE 归一化为大写白名单类型 */
    private static String normalizeType(String dataType) {
        if (dataType == null) return "UNKNOWN";
        return switch (dataType.toLowerCase()) {
            case "varchar" -> "VARCHAR";
            case "text", "longtext", "mediumtext", "tinytext" -> "TEXT";
            case "int", "integer", "bigint", "smallint", "mediumint" -> "INT";
            case "decimal", "numeric" -> "DECIMAL";
            case "date" -> "DATE";
            case "datetime", "timestamp" -> "DATETIME";
            case "tinyint" -> "TINYINT";
            case "json" -> "JSON";
            default -> dataType.toUpperCase();
        };
    }

    private static Integer getNullableInt(ResultSet rs, String columnLabel) throws SQLException {
        int v = rs.getInt(columnLabel);
        return rs.wasNull() ? null : v;
    }
}
