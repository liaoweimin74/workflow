package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.*;

@Entity
@Table(name = "sys_role")
public class SysRole extends BaseEntity {
    /** 归属客户端（sys_client.id 逻辑外键），一角色恰属一端；缺省 1=portal（对齐 node V52、spec client-scoped-role）。 */
    @Column(name = "client_id", nullable = false)
    private Long clientId = SysClient.PORTAL_CLIENT_ID;

    @Column(name = "role_name", nullable = false, length = 100)
    private String roleName;

    @Column(name = "role_code", nullable = false, length = 50, unique = true)
    private String roleCode;

    @Column(length = 255)
    private String description;

    @Column(nullable = false)
    private Integer status = 1;

    public Long getClientId() { return clientId; }
    public void setClientId(Long clientId) { this.clientId = clientId; }
    public String getRoleName() { return roleName; }
    public void setRoleName(String roleName) { this.roleName = roleName; }
    public String getRoleCode() { return roleCode; }
    public void setRoleCode(String roleCode) { this.roleCode = roleCode; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
}