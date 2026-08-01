package com.workflow.identity.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "wf_dept", indexes = {
    @Index(name = "idx_tenant_dept", columnList = "tenantId")
})
public class WorkflowDept {

    @Id
    @Column(length = 64)
    private String id;

    @Column(name = "tenant_id", nullable = false, length = 64)
    private String tenantId;

    @Column(nullable = false, length = 255)
    private String name;

    @Column(name = "parent_id", length = 64)
    private String parentId;

    @Column(name = "sort_order")
    private Integer sortOrder;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getParentId() { return parentId; }
    public void setParentId(String parentId) { this.parentId = parentId; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
}