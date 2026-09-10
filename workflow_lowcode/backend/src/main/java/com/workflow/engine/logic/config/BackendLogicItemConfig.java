package com.workflow.engine.logic.config;

/**
 * 单个后端业务逻辑配置项 (Jackson 反序列化目标)。
 * 对应前端 {@code BackendLogicItem}：节点进入/完成时按序执行。
 */
public class BackendLogicItemConfig {

    private String id;
    private String name;
    private boolean enabled;
    /** 触发时机：ENTER | COMPLETE */
    private String trigger;
    /** 逻辑类型：http | bean | script */
    private String type;
    /** 异常策略：IGNORE_CONTINUE | FAIL_FLOW */
    private String errorAction;
    /** 结果写回流程变量名（可选） */
    private String resultVar;

    private BackendLogicHttpConfig http;
    private BackendLogicBeanConfig bean;
    private BackendLogicScriptConfig script;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public String getTrigger() { return trigger; }
    public void setTrigger(String trigger) { this.trigger = trigger; }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }

    public String getErrorAction() { return errorAction; }
    public void setErrorAction(String errorAction) { this.errorAction = errorAction; }

    public String getResultVar() { return resultVar; }
    public void setResultVar(String resultVar) { this.resultVar = resultVar; }

    public BackendLogicHttpConfig getHttp() { return http; }
    public void setHttp(BackendLogicHttpConfig http) { this.http = http; }

    public BackendLogicBeanConfig getBean() { return bean; }
    public void setBean(BackendLogicBeanConfig bean) { this.bean = bean; }

    public BackendLogicScriptConfig getScript() { return script; }
    public void setScript(BackendLogicScriptConfig script) { this.script = script; }
}