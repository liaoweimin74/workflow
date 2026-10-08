package com.workflow.system.domain.entity;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/**
 * 岗位实体（V43 对位；V47 Java Flyway 建表）。
 *
 * <p>人员组织模型增强：岗位是用户归属与成员组「按岗位」自动规则的维度。
 * 用户归属字段见 {@link SysUser#getPostId()}（单个岗位）。
 */
@Entity
@Table(name = "sys_post", indexes = {
        @Index(name = "uk_sys_post_code", columnList = "post_code", unique = true)
})
public class SysPost extends BaseEntity {

    @Column(name = "post_code", nullable = false, length = 64)
    private String postCode;

    @Column(name = "post_name", nullable = false, length = 64)
    private String postName;

    @Column(name = "description", length = 255)
    private String description;

    @Column(name = "sort_order")
    private Integer sortOrder;

    /** 状态：1 启用 0 停用。 */
    @Column(nullable = false)
    private Integer status = 1;

    public String getPostCode() { return postCode; }
    public void setPostCode(String postCode) { this.postCode = postCode; }
    public String getPostName() { return postName; }
    public void setPostName(String postName) { this.postName = postName; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public Integer getSortOrder() { return sortOrder; }
    public void setSortOrder(Integer sortOrder) { this.sortOrder = sortOrder; }
    public Integer getStatus() { return status; }
    public void setStatus(Integer status) { this.status = status; }
}
