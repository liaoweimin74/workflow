package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/**
 * 用户推送设备绑定（J3，plan Task 12 锚点表 sys_user_device）。
 *
 * <p>J3 只落表与实体双轨；读写业务链（推送绑定、A4 端身份 Tab 的列表/吊销）归 J5/P2。
 * revoked=1 表示已吊销（通知发送侧应跳过吊销设备）。
 */
@Entity
@Table(name = "sys_user_device",
        uniqueConstraints = @UniqueConstraint(name = "uk_user_device_token", columnNames = {"device_token"}),
        indexes = @Index(name = "idx_user_device", columnList = "user_id, client_id"))
public class SysUserDevice extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "client_id", nullable = false)
    private Long clientId = SysClient.PORTAL_CLIENT_ID;

    @Column(name = "device_token", nullable = false, length = 255)
    private String deviceToken;

    /** 设备平台：ios / android / harmony 等。 */
    @Column(length = 32)
    private String platform;

    @Column(name = "last_login_at")
    private LocalDateTime lastLoginAt;

    /** 吊销标记：1 已吊销（A4 端身份 Tab 操作）。 */
    @Column(nullable = false)
    private Integer revoked = 0;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public String getDeviceToken() { return deviceToken; }
    public void setDeviceToken(String deviceToken) { this.deviceToken = deviceToken; }
    public String getPlatform() { return platform; }
    public void setPlatform(String platform) { this.platform = platform; }
    public LocalDateTime getLastLoginAt() { return lastLoginAt; }
    public void setLastLoginAt(LocalDateTime lastLoginAt) { this.lastLoginAt = lastLoginAt; }
    public Integer getRevoked() { return revoked; }
    public void setRevoked(Integer revoked) { this.revoked = revoked; }
}
