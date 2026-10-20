package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 平台账号与小程序 openid 的绑定（P0.4）。
 *
 * <p>一个 appid 下 openid 与账号一一对应；不自动创建客户账号，
 * 绑定必须用既有账号密码完成，避免任意微信用户获得平台身份。
 */
@Entity
@Table(name = "sys_user_openid",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_user_openid_app_openid", columnNames = {"app_id", "openid"}),
                @UniqueConstraint(name = "uk_user_openid_app_user", columnNames = {"app_id", "user_id"})
        },
        indexes = @Index(name = "idx_user_openid_user", columnList = "user_id"))
public class SysUserOpenid extends BaseEntity {

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "app_id", nullable = false, length = 64)
    private String appId;

    @Column(nullable = false, length = 64)
    private String openid;

    @Column(length = 64)
    private String unionid;

    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }
    public String getOpenid() { return openid; }
    public void setOpenid(String openid) { this.openid = openid; }
    public String getUnionid() { return unionid; }
    public void setUnionid(String unionid) { this.unionid = unionid; }
}
