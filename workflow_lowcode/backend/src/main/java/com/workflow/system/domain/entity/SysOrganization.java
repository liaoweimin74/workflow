package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "sys_organization")
public class SysOrganization extends BaseEntity {
    @Column(name = "parent_id")
    private Long parentId;

    @Column(name = "org_name", nullable = false, length = 100)
    private String orgName;

    @Column(name = "org_code", nullable = false, length = 50, unique = true)
    private String orgCode;

    @Column(name = "sort_order")
    private Integer sortOrder = 0;

    @Column(name = "status")
    private Integer status = 1;

    @OneToMany(mappedBy = "parentId", fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    private List<SysOrganization> children = new ArrayList<>();

    public Long getParentId() { return parentId; }
    public void setParentId(Long parentId) { this.parentId = parentId; }
    public String getOrgName() { return orgName; }
    public void setOrgName(String orgName) { this.orgName = orgName; }
    public String getOrgCode() { return orgCode; }
    public void setOrgCode(String orgCode) { this.orgCode = orgCode; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
    public List<SysOrganization> getChildren() { return children; }
    public void setChildren(List<SysOrganization> children) { this.children = children; }
}