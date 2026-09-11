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
     * 确保子表物理表存在且结构与 column_config 一致（wf_biz_<formKey>_<field>）。
     * 表不存在 → 创建；已存在 → 执行差异变更。
     *
     * @param formKey    主表表单 key
     * @param field      子表字段名
     * @param subColumns 期望的子表列映射（须已通过 DdlBuilder 校验）
     */
    public void ensureSubTable(String formKey, String field, List<ColumnConfig> subColumns) {
        DdlBuilder.validateFormKey(formKey);
        DdlBuilder.validateSubField(field);
        String table = "wf_biz_" + formKey + "_" + field;

        if (!tableExists(table)) {
            String createSql = DdlBuilder.buildCreateSubTable(formKey, field, subColumns);
            log.info("Creating sub table: {}", table);
            jdbcTemplate.execute(createSql);
            return;
        }

        List<ColumnInfo> existing = findTableColumns(table);
        List<String> alterStatements = DdlBuilder.buildAlterSubTable(formKey, field, subColumns, existing);
        if (alterStatements.isEmpty()) {
            log.info("Sub table {} structure unchanged", table);
            return;
        }
        for (String stmt : alterStatements) {
            log.info("Altering sub table: {}", stmt);
            jdbcTemplate.execute(stmt);
        }
    }

    /**
     * 查询当前库全部基础表名（information_schema.TABLES）。
     * 仅枚举 BASE TABLE，排除视图；Flyway 历史表是否过滤由调用方决定。
     * schema 谓词跨库兼容：MySQL 用 DATABASE()，H2 表落在 PUBLIC schema（DATABASE() 返回库名而非 schema）。
     *
     * @return 表名列表（按表名字母序）
     */
    public List<String> listTableNames() {
        String sql = """
                SELECT TABLE_NAME FROM information_schema.TABLES
                WHERE (TABLE_SCHEMA = DATABASE() OR TABLE_SCHEMA = 'PUBLIC') AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
                """;
        return jdbcTemplate.queryForList(sql, String.class);
    }

    /**
     * 判断物理表是否存在（schema 谓词跨库兼容，同 listTableNames）。
     */
    public boolean tableExists(String tableName) {
        String sql = """
                SELECT COUNT(1) FROM information_schema.TABLES
                WHERE (TABLE_SCHEMA = DATABASE() OR TABLE_SCHEMA = 'PUBLIC') AND TABLE_NAME = ?
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
        // 跨库兼容（按数据库产品名分支，各自限定当前 schema）：
        // - H2 2.x：COLUMNS 无 COLUMN_KEY/TYPE_NAME 列；DATA_TYPE 本身即类型名字符串
        //   （如 INTEGER/CHARACTER VARYING/NUMERIC/TIMESTAMP，已被 normalizeType 白名单覆盖），
        //   COLUMN_KEY 置空串（unique 标记在 H2 下不解析，均为 false）。
        // - MySQL：DATA_TYPE 为类型名、COLUMN_KEY 可判 UNI，schema 谓词用 DATABASE()。
        String sql = isH2()
                ? """
                SELECT COLUMN_NAME, DATA_TYPE,
                       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
                       IS_NULLABLE, '' AS COLUMN_KEY
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = 'PUBLIC' AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
                """
                : """
                SELECT COLUMN_NAME, DATA_TYPE,
                       CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE,
                       IS_NULLABLE, COLUMN_KEY
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
                ORDER BY ORDINAL_POSITION
                """;
        return jdbcTemplate.query(sql, this::mapColumnInfo, tableName);
    }

    /** 当前数据库产品名（懒加载缓存一次；探测失败时回退 mysql 语义） */
    private volatile String databaseProductName;

    private boolean isH2() {
        if (databaseProductName == null) {
            synchronized (this) {
                if (databaseProductName == null) {
                    String name = "MySQL";
                    try {
                        name = jdbcTemplate.execute((org.springframework.jdbc.core.ConnectionCallback<String>) con ->
                                con.getMetaData().getDatabaseProductName());
                    } catch (Exception e) {
                        log.warn("Detect database product failed, fallback to mysql semantics: {}", e.getMessage());
                    }
                    databaseProductName = name == null ? "MySQL" : name;
                }
            }
        }
        return databaseProductName.toLowerCase().contains("h2");
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
            case "varchar", "character varying" -> "VARCHAR";
            case "text", "mediumtext", "tinytext", "clob", "character large object" -> "TEXT";
            case "longtext" -> "LONGTEXT";
            case "int", "integer", "bigint", "smallint", "mediumint" -> "INT";
            case "decimal", "numeric" -> "DECIMAL";
            case "date" -> "DATE";
            case "datetime", "timestamp", "timestamp without time zone" -> "DATETIME";
            case "tinyint" -> "TINYINT";
            case "json" -> "JSON";
            default -> dataType.toUpperCase();
        };
    }

    /** 读取可空整数；LONGTEXT/CLOB 的 CHARACTER_MAXIMUM_LENGTH≥int 上限 → 返回 null（无固定长度） */
    private static Integer getNullableInt(ResultSet rs, String columnLabel) throws SQLException {
        long v = rs.getLong(columnLabel);
        if (rs.wasNull()) return null;
        return v >= Integer.MAX_VALUE ? null : (int) v;
    }
}
