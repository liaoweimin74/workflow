package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.LocalDateTime;

/**
 * 端内首绑绑定码（J3，ledger D1 表方案裁定）。
 *
 * <p>管理员为用户生成一次性绑定码（target=user_id × client_id），用户在目标端小程序静默登录后
 * 输入绑定码完成 openid↔账号 绑定（spec client-login-identity「绑定码首绑」场景）。
 * 一次性=used 置位；TTL=expires_at（表方案替代 Redis 过期语义）。
 */
@Entity
@Table(name = "sys_bind_code",
        uniqueConstraints = @UniqueConstraint(name = "uk_bind_code", columnNames = {"code"}),
        indexes = @Index(name = "idx_bind_code_user", columnList = "user_id, client_id"))
public class SysBindCode extends BaseEntity {

    @Column(nullable = false, length = 32)
    private String code;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "client_id", nullable = false)
    private Long clientId;

    /** 已消费标记：1 已用（一次性）。 */
    @Column(nullable = false)
    private Integer used = 0;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public Integer getUsed() { return used; }
    public void setUsed(Integer used) { this.used = used; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public void setExpiresAt(LocalDateTime expiresAt) { this.expiresAt = expiresAt; }
}
