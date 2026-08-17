package com.workflow.api.dto;

/**
 * 页面定义保存请求。
 */
public class PageDefinitionSaveRequest {

    private String name;
    private String key;
    private String type;
    private String formKey;
    private String schema;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }
}