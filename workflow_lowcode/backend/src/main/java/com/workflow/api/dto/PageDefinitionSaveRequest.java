package com.workflow.api.dto;

/**
 * 页面定义保存请求。
 */
public class PageDefinitionSaveRequest {

    private String appId;
    private String name;
    private String key;
    private String type;
    private String formKey;
    private String dataSourceId;
    private String schema;
    private String designType;

    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }

    public String getSchema() { return schema; }
    public void setSchema(String schema) { this.schema = schema; }

    public String getDesignType() { return designType; }
    public void setDesignType(String designType) { this.designType = designType; }
}