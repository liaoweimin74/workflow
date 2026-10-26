package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 客户端定义（多端支持，multi-client-support J1）。
 *
 * <p>一个客户端一行：portal=现有平台端（seed id=1），后续 app/H5/小程序等。
 * defaultRoleId/defaultMemberGroupId 预留注册/首登的默认归属。
 * 语义对齐 backend-node V50（同一 spec client-data-model），本类服务 Java 引擎。
 */
@Entity
@Table(name = "sys_client",
        uniqueConstraints = @UniqueConstraint(name = "uk_client_code", columnNames = "code"))
public class SysClient extends BaseEntity {

    /** 默认平台客户端 id（seed 行），对齐 node 侧 DEFAULT_CLIENT_ID。 */
    public static final long PORTAL_CLIENT_ID = 1L;

    @Column(nullable = false, length = 64)
    private String code;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(length = 128)
    private String icon;

    @Column(nullable = false)
    private Integer status = 1;

    @Column(name = "default_role_id")
    private Long defaultRoleId;

    @Column(name = "default_member_group_id")
    private Long defaultMemberGroupId;

    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public Long getDefaultRoleId() { return defaultRoleId; }
    public void setDefaultRoleId(Long defaultRoleId) { this.defaultRoleId = defaultRoleId; }
    public Long getDefaultMemberGroupId() { return defaultMemberGroupId; }
    public void setDefaultMemberGroupId(Long defaultMemberGroupId) { this.defaultMemberGroupId = defaultMemberGroupId; }
}
