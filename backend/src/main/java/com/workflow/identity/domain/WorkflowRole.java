package com.workflow.identity.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "wf_role", indexes = {
    @Index(name = "idx_tenant_role", columnList = "tenantId")
}, uniqueConstraints = {
    @UniqueConstraint(name = "uk_tenant_role_code", columnNames = {"tenantId", "code"})
})
public class WorkflowRole {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(nullable = false, length = 128)
    private String code;

    @Column(length = 512)
    private String description;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getCode() { return code; }
    public void setCode(String code) { this.code = code; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}