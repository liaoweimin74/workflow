package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 平台账号与端身份（openid）的绑定（J3 由 V64 小程序单端泛化）。
 *
 * <p>身份键 = clientId + openid：同一微信 openid 在不同客户端是不同身份记录（spec 跨端隔离）。
 * appId 降级为审计列（记录绑定来源小程序 appid，仅 MP 绑定有值，可空）。
 * 不自动创建客户账号，绑定必须凭既有账号密码或一次性绑定码完成。
 */
@Entity
@Table(name = "sys_user_openid",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_user_openid_client_openid", columnNames = {"client_id", "openid"}),
                @UniqueConstraint(name = "uk_user_openid_client_user", columnNames = {"client_id", "user_id"})
        },
        indexes = @Index(name = "idx_user_openid_user", columnList = "user_id"))
public class SysUserOpenid extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private Long userId;

    /** 归属客户端 id（sys_client.id 逻辑外键），1=portal——V75 DEFAULT 1 回填存量。 */
    @Column(name = "client_id", nullable = false)
    private Long clientId = SysClient.PORTAL_CLIENT_ID;

    /** 来源小程序 appid（审计列；泛化后不再是身份键）。 */
    @Column(name = "app_id", length = 64)
    private String appId;

    @Column(nullable = false, length = 64)
    private String openid;

    @Column(length = 64)
    private String unionid;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }
    public String getOpenid() { return openid; }
    public void setOpenid(String openid) { this.openid = openid; }
    public String getUnionid() { return unionid; }
    public void setUnionid(String unionid) { this.unionid = unionid; }
}
