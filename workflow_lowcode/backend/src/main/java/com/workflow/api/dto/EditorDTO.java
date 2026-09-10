package com.workflow.api.dto;

import java.util.Map;

/**
 * 设计器数据加载 DTO。
 * 前端 GET /process-definitions/{id}/editor 返回的数据结构。
 */
public class EditorDTO {

    /** 流程定义草稿 ID */
    private String id;

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

    /** 状态：DRAFT / DEPLOYED */
    private String status;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

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

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}
