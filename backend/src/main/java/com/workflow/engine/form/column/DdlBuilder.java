package com.workflow.engine.form.column;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * 受控 DDL 语句生成器。
 * 生成 CREATE TABLE / ALTER TABLE 语句，全部标识符经白名单校验，杜绝 SQL 注入。
 *
 * 约束：
 * - 仅允许增列、改列宽/精度（只加不减）、改必填、加索引
 * - 禁止删列（desired 中不存在的列直接忽略）
 * - 禁止类型跨大类变更（ColumnTypeMapper.isCrossTypeChange）
 */
public final class DdlBuilder {

    private static final Pattern COLUMN_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");
    private static final Pattern FORM_KEY_PATTERN = Pattern.compile("^[a-zA-Z][a-zA-Z0-9_]{0,63}$");

    /** 固定列保留字，不允许业务列占用 */
    private static final Set<String> RESERVED_COLUMNS = Set.of(
            "id", "tenant_id", "version", "created_by", "created_at", "updated_at");

    /** 子表固定列保留字（主表固定列 + 子表特有 biz_id/sort_no） */
    private static final Set<String> SUB_RESERVED_COLUMNS = Set.of(
            "id", "biz_id", "tenant_id", "sort_no", "version", "created_by", "created_at", "updated_at");

    /** 最大长度上限（VARCHAR 最大 255，TINYINT 固定 1） */
    private static final int MAX_VARCHAR_LENGTH = 255;

    private DdlBuilder() {}

    /**
     * 生成建表语句。
     *
     * @param formKey 表单 key（作为表名后缀，须通过白名单校验）
     * @param columns 列映射列表
     * @return CREATE TABLE 语句
     * @throws IllegalArgumentException 表名/列名/列类型非法时
     */
    public static String buildCreateTable(String formKey, List<ColumnConfig> columns) {
        validateFormKey(formKey);
        validateColumns(columns);

        String table = tableName(formKey);
        StringBuilder sb = new StringBuilder("CREATE TABLE IF NOT EXISTS ").append(table).append(" (\n");
        sb.append("    id VARCHAR(64) NOT NULL,\n");
        sb.append("    tenant_id VARCHAR(64) NOT NULL,\n");
        for (ColumnConfig c : columns) {
            sb.append("    ").append(c.getKey()).append(" ").append(columnDefinition(c)).append(",\n");
        }
        sb.append("    version INT NOT NULL DEFAULT 1,\n");
        sb.append("    created_by VARCHAR(50),\n");
        sb.append("    created_at DATETIME,\n");
        sb.append("    updated_at DATETIME,\n");
        sb.append("    PRIMARY KEY (id)");

        for (ColumnConfig c : columns) {
            if (c.isUnique()) {
                sb.append(",\n    UNIQUE KEY uk_").append(formKey).append("_").append(c.getKey())
                        .append(" (tenant_id, ").append(c.getKey()).append(")");
            }
            if (c.isIndexed()) {
                sb.append(",\n    INDEX idx_").append(formKey).append("_").append(c.getKey())
                        .append(" (").append(c.getKey()).append(")");
            }
        }

        sb.append("\n)");
        return sb.toString();
    }

    /**
     * 生成表结构差异变更语句列表。
     * 对比 desired（column_config）与 existing（当前物理表），生成 ADD COLUMN / MODIFY COLUMN / ADD INDEX。
     *
     * @param formKey  表单 key
     * @param desired  期望的列映射
     * @param existing 当前物理表列信息（空表视为新建场景）
     * @return ALTER TABLE 语句列表；无变更时为空列表
     * @throws IllegalArgumentException 列名/列类型非法、类型跨类变更时
     */
    public static List<String> buildAlterStatements(String formKey, List<ColumnConfig> desired, List<ColumnInfo> existing) {
        validateFormKey(formKey);
        validateColumns(desired);

        String table = tableName(formKey);
        Map<String, ColumnInfo> existingMap = new LinkedHashMap<>();
        for (ColumnInfo info : existing) {
            existingMap.put(info.getKey(), info);
        }

        List<String> statements = new ArrayList<>();
        for (ColumnConfig c : desired) {
            ColumnInfo current = existingMap.get(c.getKey());
            if (current == null) {
                statements.add("ALTER TABLE " + table + " ADD COLUMN " + c.getKey() + " " + columnDefinition(c));
                if (c.isUnique()) {
                    statements.add("ALTER TABLE " + table + " ADD UNIQUE INDEX uk_" + formKey + "_" + c.getKey()
                            + " (tenant_id, " + c.getKey() + ")");
                }
                if (c.isIndexed()) {
                    statements.add("ALTER TABLE " + table + " ADD INDEX idx_" + formKey + "_" + c.getKey()
                            + " (" + c.getKey() + ")");
                }
                continue;
            }

            // 已存在列：禁止类型跨类变更
            if (ColumnTypeMapper.isCrossTypeChange(current.getColumnType(), c.getColumnType())) {
                throw new IllegalArgumentException(
                        "列 " + c.getKey() + " 类型跨类变更不被支持: " + current.getColumnType() + " -> " + c.getColumnType());
            }

            // 类型或长度/必填变化 → MODIFY COLUMN；长度只增不减（缩短抛异常防数据截断）
            if (isNarrowing(current, c)) {
                throw new IllegalArgumentException("列 " + c.getKey() + " 不允许缩短长度/精度（防数据截断）");
            }
            if (!sameDefinition(current, c)) {
                statements.add("ALTER TABLE " + table + " MODIFY COLUMN " + c.getKey() + " " + columnDefinition(c));
            }

            if (c.isUnique() && !current.isUnique()) {
                statements.add("ALTER TABLE " + table + " ADD UNIQUE INDEX uk_" + formKey + "_" + c.getKey()
                        + " (tenant_id, " + c.getKey() + ")");
            }
        }
        // desired 中不存在的现有列：忽略（禁止 DROP COLUMN，防丢数据）
        return statements;
    }

    /**
     * 校验表单 key 是否合法（表名白名单）。
     */
    public static void validateFormKey(String formKey) {
        if (formKey == null || !FORM_KEY_PATTERN.matcher(formKey).matches()) {
            throw new IllegalArgumentException("非法表单 key（仅允许字母开头，含字母/数字/下划线，最长 64）: " + formKey);
        }
    }

    /**
     * 校验子表字段名是否合法（用于子表名后缀 wf_biz_<formKey>_<field> 白名单）。
     */
    public static void validateSubField(String field) {
        if (field == null || !COLUMN_KEY_PATTERN.matcher(field).matches()) {
            throw new IllegalArgumentException("非法子表字段名（仅允许字母开头，含字母/数字/下划线，最长 64）: " + field);
        }
    }

    /**
     * 生成子表建表语句。
     * 子表命名 wf_biz_<formKey>_<field>，固定列 id/biz_id/tenant_id/sort_no/version/created_by/created_at/updated_at，
     * 加 (tenant_id, biz_id) 复合索引供按主行查询。
     *
     * @param formKey    主表表单 key
     * @param field      子表字段名（子表名后缀）
     * @param subColumns 子表列映射
     * @return CREATE TABLE 语句
     */
    public static String buildCreateSubTable(String formKey, String field, List<ColumnConfig> subColumns) {
        validateFormKey(formKey);
        validateSubField(field);
        validateSubColumns(subColumns);

        String table = subTableName(formKey, field);
        StringBuilder sb = new StringBuilder("CREATE TABLE IF NOT EXISTS ").append(table).append(" (\n");
        sb.append("    id VARCHAR(64) NOT NULL,\n");
        sb.append("    biz_id VARCHAR(64) NOT NULL,\n");
        sb.append("    tenant_id VARCHAR(64) NOT NULL,\n");
        for (ColumnConfig c : subColumns) {
            sb.append("    ").append(c.getKey()).append(" ").append(columnDefinition(c)).append(",\n");
        }
        sb.append("    sort_no INT NOT NULL DEFAULT 0,\n");
        sb.append("    version INT NOT NULL DEFAULT 1,\n");
        sb.append("    created_by VARCHAR(50),\n");
        sb.append("    created_at DATETIME,\n");
        sb.append("    updated_at DATETIME,\n");
        sb.append("    PRIMARY KEY (id),\n");
        sb.append("    KEY idx_").append(formKey).append("_").append(field).append("_biz (tenant_id, biz_id)");

        for (ColumnConfig c : subColumns) {
            if (c.isUnique()) {
                sb.append(",\n    UNIQUE KEY uk_").append(formKey).append("_").append(field).append("_").append(c.getKey())
                        .append(" (tenant_id, biz_id, ").append(c.getKey()).append(")");
            }
            if (c.isIndexed()) {
                sb.append(",\n    INDEX idx_").append(formKey).append("_").append(field).append("_").append(c.getKey())
                        .append(" (").append(c.getKey()).append(")");
            }
        }

        sb.append("\n)");
        return sb.toString();
    }

    /**
     * 生成子表结构差异变更语句列表（规则与主表 buildAlterStatements 一致：只增不减、禁删列、禁类型跨类变更）。
     *
     * @param formKey  主表表单 key
     * @param field    子表字段名
     * @param desired  期望的子表列映射
     * @param existing 当前子表物理列信息（空表视为新建场景）
     * @return ALTER TABLE 语句列表；无变更时为空列表
     */
    public static List<String> buildAlterSubTable(String formKey, String field, List<ColumnConfig> desired, List<ColumnInfo> existing) {
        validateFormKey(formKey);
        validateSubField(field);
        validateSubColumns(desired);

        String table = subTableName(formKey, field);
        Map<String, ColumnInfo> existingMap = new LinkedHashMap<>();
        for (ColumnInfo info : existing) {
            existingMap.put(info.getKey(), info);
        }

        List<String> statements = new ArrayList<>();
        for (ColumnConfig c : desired) {
            ColumnInfo current = existingMap.get(c.getKey());
            if (current == null) {
                statements.add("ALTER TABLE " + table + " ADD COLUMN " + c.getKey() + " " + columnDefinition(c));
                continue;
            }

            if (ColumnTypeMapper.isCrossTypeChange(current.getColumnType(), c.getColumnType())) {
                throw new IllegalArgumentException(
                        "子表列 " + c.getKey() + " 类型跨类变更不被支持: " + current.getColumnType() + " -> " + c.getColumnType());
            }
            if (isNarrowing(current, c)) {
                throw new IllegalArgumentException("子表列 " + c.getKey() + " 不允许缩短长度/精度（防数据截断）");
            }
            if (!sameDefinition(current, c)) {
                statements.add("ALTER TABLE " + table + " MODIFY COLUMN " + c.getKey() + " " + columnDefinition(c));
            }
        }
        return statements;
    }

    /**
     * 校验子表列映射列表：复用主表列校验，并额外禁止子表固定列（biz_id/sort_no 等）作为业务列。
     */
    private static void validateSubColumns(List<ColumnConfig> columns) {
        validateColumns(columns);
        for (ColumnConfig c : columns) {
            if (SUB_RESERVED_COLUMNS.contains(c.getKey())) {
                throw new IllegalArgumentException("子表列名 " + c.getKey() + " 为系统保留列，不允许作为业务列");
            }
        }
    }

    /**
     * 校验列映射列表：列名合法、非保留字、列类型白名单、长度合法。
     */
    private static void validateColumns(List<ColumnConfig> columns) {
        for (ColumnConfig c : columns) {
            if (c.getKey() == null || !COLUMN_KEY_PATTERN.matcher(c.getKey()).matches()) {
                throw new IllegalArgumentException("非法列名（仅允许字母开头，含字母/数字/下划线，最长 64）: " + c.getKey());
            }
            if (RESERVED_COLUMNS.contains(c.getKey())) {
                throw new IllegalArgumentException("列名 " + c.getKey() + " 为系统保留列，不允许作为业务列");
            }
            if (!ColumnTypeMapper.isAllowedColumnType(c.getColumnType())) {
                throw new IllegalArgumentException("非法列类型: " + c.getColumnType());
            }
            if ("VARCHAR".equals(c.getColumnType())) {
                int len = c.getLength() == null ? 255 : c.getLength();
                if (len < 1 || len > MAX_VARCHAR_LENGTH) {
                    throw new IllegalArgumentException("VARCHAR 长度必须在 1~255 之间: " + c.getKey());
                }
            }
            if ("DECIMAL".equals(c.getColumnType())) {
                int len = c.getLength() == null ? 18 : c.getLength();
                int scale = c.getScale() == null ? 0 : c.getScale();
                if (len < 1 || len > 30 || scale < 0 || scale > len) {
                    throw new IllegalArgumentException("DECIMAL 长度/精度非法: " + c.getKey());
                }
            }
        }
    }

    private static String columnDefinition(ColumnConfig c) {
        String type = switch (c.getColumnType()) {
            case "VARCHAR" -> "VARCHAR(" + (c.getLength() == null ? 255 : c.getLength()) + ")";
            case "TEXT" -> "TEXT";
            case "LONGTEXT" -> "LONGTEXT";
            case "INT" -> "INT";
            case "DECIMAL" -> "DECIMAL(" + (c.getLength() == null ? 18 : c.getLength())
                    + "," + (c.getScale() == null ? 0 : c.getScale()) + ")";
            case "DATE" -> "DATE";
            case "DATETIME" -> "DATETIME";
            case "TINYINT" -> "TINYINT(1)";
            case "JSON" -> "JSON";
            default -> throw new IllegalArgumentException("非法列类型: " + c.getColumnType());
        };
        return c.isRequired() ? type + " NOT NULL" : type;
    }

    private static boolean sameDefinition(ColumnInfo current, ColumnConfig c) {
        if (!current.getColumnType().equals(c.getColumnType())
                || current.isNullable() != !c.isRequired()) {
            return false;
        }
        // 长度/精度比较（仅对带长度的类型有效）
        if ("VARCHAR".equals(c.getColumnType()) || "TINYINT".equals(c.getColumnType())) {
            int desiredLen = c.getLength() == null ? 255 : c.getLength();
            int currentLen = current.getLength() == null ? 0 : current.getLength();
            return desiredLen == currentLen;
        }
        if ("DECIMAL".equals(c.getColumnType())) {
            int desiredLen = c.getLength() == null ? 18 : c.getLength();
            int desiredScale = c.getScale() == null ? 0 : c.getScale();
            int currentLen = current.getLength() == null ? 0 : current.getLength();
            int currentScale = current.getScale() == null ? 0 : current.getScale();
            return desiredLen == currentLen && desiredScale == currentScale;
        }
        return true;
    }

    private static boolean isNarrowing(ColumnInfo current, ColumnConfig c) {
        if ("VARCHAR".equals(c.getColumnType()) || "TINYINT".equals(c.getColumnType())) {
            int desiredLen = c.getLength() == null ? 255 : c.getLength();
            int currentLen = current.getLength() == null ? 0 : current.getLength();
            return desiredLen < currentLen;
        }
        if ("DECIMAL".equals(c.getColumnType())) {
            int desiredLen = c.getLength() == null ? 18 : c.getLength();
            int desiredScale = c.getScale() == null ? 0 : c.getScale();
            int currentLen = current.getLength() == null ? 0 : current.getLength();
            int currentScale = current.getScale() == null ? 0 : current.getScale();
            return desiredLen < currentLen || desiredScale < currentScale;
        }
        return false;
    }

    private static String tableName(String formKey) {
        return "wf_biz_" + formKey;
    }

    private static String subTableName(String formKey, String field) {
        return "wf_biz_" + formKey + "_" + field;
    }
}
