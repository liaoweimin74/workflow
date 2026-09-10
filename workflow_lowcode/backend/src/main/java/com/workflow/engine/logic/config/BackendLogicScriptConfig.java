package com.workflow.engine.logic.config;

/**
 * 后端业务逻辑 - 脚本执行子配置。
 * 对应前端 {@code BackendLogicScriptConfig}。
 */
public class BackendLogicScriptConfig {

    private String language;
    private String source;

    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}