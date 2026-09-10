package com.workflow.api.dto;

/**
 * 表单定义详情 DTO（含 schema）。
 */
public class FormDefinitionDetailDTO extends FormDefinitionDTO {

    private String schema;
    private String columnConfig;

    public FormDefinitionDetailDTO() {}

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }

    public String getColumnConfig() { return columnConfig; }
    public void setColumnConfig(String columnConfig) { this.columnConfig = columnConfig; }
}
