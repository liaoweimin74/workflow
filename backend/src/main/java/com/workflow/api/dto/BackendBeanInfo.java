package com.workflow.api.dto;

/**
 * 白名单 Bean 方法清单项 DTO，供前端设计器「调用本系统服务」下拉选择。
 */
public class BackendBeanInfo {

    private String beanName;
    private String methodName;
    private String displayName;
    private int parameterCount;

    public String getBeanName() { return beanName; }
    public void setBeanName(String beanName) { this.beanName = beanName; }

    public String getMethodName() { return methodName; }
    public void setMethodName(String methodName) { this.methodName = methodName; }

    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public int getParameterCount() { return parameterCount; }
    public void setParameterCount(int parameterCount) { this.parameterCount = parameterCount; }
}