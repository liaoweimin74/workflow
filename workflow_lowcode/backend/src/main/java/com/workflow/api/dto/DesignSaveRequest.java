package com.workflow.api.dto;

import java.util.Map;

/**
 * 设计器保存请求 DTO。
 * 前端 PUT /process-definitions/{id}/design 提交的数据结构。
 */
public class DesignSaveRequest {

    /** 流程名称 */
    private String name;

    /** 流程 key */
    private String key;

    /** 分类 ID */
    private String categoryId;

    /** BPMN XML 内容 */
    private String bpmnXml;

    /** 节点配置 Map: nodeId → configJson */
    private Map<String, String> nodeConfigs;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }

    public String getCategoryId() { return categoryId; }
    public void setCategoryId(String categoryId) { this.categoryId = categoryId; }

    public String getBpmnXml() { return bpmnXml; }
    public void setBpmnXml(String bpmnXml) { this.bpmnXml = bpmnXml; }

    public Map<String, String> getNodeConfigs() { return nodeConfigs; }
    public void setNodeConfigs(Map<String, String> nodeConfigs) { this.nodeConfigs = nodeConfigs; }
}
