package com.workflow.engine.logic.config;

import com.workflow.engine.logic.parse.ParamMapping;

import java.util.List;

/**
 * 后端业务逻辑 - 本系统服务（Bean）调用子配置。
 * 对应前端 {@code BackendLogicBeanConfig}。
 */
public class BackendLogicBeanConfig {

    private String beanName;
    private String methodName;
    private List<ParamMapping> params;

    public String getBeanName() { return beanName; }
    public void setBeanName(String beanName) { this.beanName = beanName; }

    public String getMethodName() { return methodName; }
    public void setMethodName(String methodName) { this.methodName = methodName; }

    public List<ParamMapping> getParams() { return params; }
    public void setParams(List<ParamMapping> params) { this.params = params; }
}