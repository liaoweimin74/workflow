package com.workflow.api.dto;

/**
 * 应用创建/更新请求。
 * 更新时 code 不可变更（服务层忽略 code 字段）。
 */
public class AppSaveRequest {

    private String code;
    private String name;
    private String themeJson;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getThemeJson() { return themeJson; }
    public void setThemeJson(String themeJson) { this.themeJson = themeJson; }
}
