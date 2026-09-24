package com.workflow.api.dto;

/**
 * 页面定义详情 DTO（含 schema）。
 */
public class PageDefinitionDetailDTO extends PageDefinitionDTO {

    private String schema;

    public PageDefinitionDetailDTO() {}

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }
}