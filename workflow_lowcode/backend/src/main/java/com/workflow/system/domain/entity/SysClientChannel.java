package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 客户端 × 渠道开通矩阵（multi-client-support J1）。
 *
 * <p>channelType ∈ WEB|H5|APP|MP；configJson 形状
 * {loginMethods: string[], appid?, secret?, minVersion?, forceUpdate?, downloadUrl?}
 * （secret 存密文，加解密在 ClientService 落地，对齐 node 侧 Task 2）。
 * enabled 的 DEFAULT 0 只约束未来新增渠道；portal WEB seed 行显式写 1。
 */
@Entity
@Table(name = "sys_client_channel",
        uniqueConstraints = @UniqueConstraint(name = "uk_client_channel", columnNames = {"client_id", "channel_type"}),
        indexes = @Index(name = "idx_channel_client", columnList = "client_id"))
public class SysClientChannel extends BaseEntity {

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    @Column(name = "channel_type", nullable = false, length = 8)
    private String channelType;

    @Column(nullable = false)
    private Integer enabled = 0;

    @Column(name = "config_json", columnDefinition = "text")
    private String configJson;

    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public String getChannelType() { return channelType; }
    public void setChannelType(String channelType) { this.channelType = channelType; }
    public Integer getEnabled() { return enabled; }
    public void setEnabled(Integer enabled) { this.enabled = enabled; }
    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
}
