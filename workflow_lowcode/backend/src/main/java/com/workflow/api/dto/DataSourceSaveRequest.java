package com.workflow.api.dto;

/**
 * 数据源定义保存请求（创建/更新共用）。
 */
public class DataSourceSaveRequest {

    private String name;
    private String type;
    private String formKey;
    private String sourceKey;
    private String params;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getFormKey() { return formKey; }
    public void setFormKey(String formKey) { this.formKey = formKey; }

    public String getSourceKey() { return sourceKey; }
    public void setSourceKey(String sourceKey) { this.sourceKey = sourceKey; }

    public String getParams() { return params; }
    public void setParams(String params) { this.params = params; }
}