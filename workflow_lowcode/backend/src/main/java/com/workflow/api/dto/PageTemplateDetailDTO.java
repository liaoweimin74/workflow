package com.workflow.api.dto;

/**
 * 页面模板详情 DTO（含 schema 快照原文）。
 */
public class PageTemplateDetailDTO extends PageTemplateDTO {

    private String schema;

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }
}
