package com.workflow.api.dto;

/**
 * 客户端实例创建/更新请求。
 * 更新时 clientType 不可变更（服务层忽略 clientType 字段；换端类型 = 新建 Client）。
 */
public class AppClientSaveRequest {

    private String clientType;
    private String name;
    private String buildConfigJson;
    private String navigationJson;

    public String getClientType() { return clientType; }
    public void setClientType(String clientType) { this.clientType = clientType; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getBuildConfigJson() { return buildConfigJson; }
    public void setBuildConfigJson(String buildConfigJson) { this.buildConfigJson = buildConfigJson; }

    public String getNavigationJson() { return navigationJson; }
    public void setNavigationJson(String navigationJson) { this.navigationJson = navigationJson; }
}
