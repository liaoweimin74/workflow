package com.workflow.api.dto;

/**
 * 已部署流程定义精简 DTO。
 * 供调用活动 (CallActivity) 子流程选择下拉使用。
 */
public class ProcessDefinitionSummary {

    /** 流程定义 ID */
    private String id;

    /** 流程 key（用于 calledElement） */
    private String key;

    /** 流程名称 */
    private String name;

    /** 版本号 */
    private int version;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }
}
