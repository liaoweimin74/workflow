package com.workflow.api.dto;

/**
 * 表单定义保存请求。
 */
public class FormDefinitionSaveRequest {

    private String name;
    private String key;
    private String schema;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }
}
