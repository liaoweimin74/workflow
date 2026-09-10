package com.workflow.engine.form.column;

/**
 * 物理表列信息（来自 information_schema 查询）。
 */
public class ColumnInfo {

    private final String key;
    private final String columnType;
    private final Integer length;
    private final Integer scale;
    private final boolean nullable;
    private final boolean unique;

    public ColumnInfo(String key, String columnType, Integer length, Integer scale, boolean nullable, boolean unique) {
        this.key = key;
        this.columnType = columnType;
        this.length = length;
        this.scale = scale;
        this.nullable = nullable;
        this.unique = unique;
    }

    public ColumnInfo(String key, String columnType, boolean nullable, boolean unique) {
        this(key, columnType, null, null, nullable, unique);
    }

    public String getKey() { return key; }

    public String getColumnType() { return columnType; }

    public Integer getLength() { return length; }

    public Integer getScale() { return scale; }

    public boolean isNullable() { return nullable; }

    public boolean isUnique() { return unique; }
}
