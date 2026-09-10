package com.workflow.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Date;

/**
 * 流程历史版本列表项 DTO。
 * GET /api/v1/deployed-processes/key/{key}/versions 返回的数据结构。
 */
public class ProcessVersionVO {

    /** Flowable 流程定义 ID */
    private String procDefId;

    /** 版本号 */
    private int version;

    /** 流程名称 */
    private String name;

    /** 部署时间 */
    private Date deploymentTime;

    /** 是否为该流程 key 的最新版本 */
    private boolean latest;

    public String getProcDefId() { return procDefId; }
    public void setProcDefId(String procDefId) { this.procDefId = procDefId; }

    public int getVersion() { return version; }
    public void setVersion(int version) { this.version = version; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public Date getDeploymentTime() { return deploymentTime; }
    public void setDeploymentTime(Date deploymentTime) { this.deploymentTime = deploymentTime; }

    @JsonProperty("isLatest")
    public boolean isLatest() { return latest; }

    @JsonProperty("isLatest")
    public void setLatest(boolean latest) { this.latest = latest; }
}
