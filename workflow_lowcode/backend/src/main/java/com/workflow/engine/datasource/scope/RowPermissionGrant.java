package com.workflow.engine.datasource.scope;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 行权限对象的授予：把对象给某个主体，并指定读/写轴。
 *
 * <p>动作挂在授予上而不是对象上：同一个条件常常「能看」的范围与「能改」的范围不同，
 * 拆开才能给两个角色分别授读、授写，而同一条授权也不会因为改动作而变成另一条配置。
 */
@Entity
@Table(name = "wf_row_permission_grant",
       uniqueConstraints = @UniqueConstraint(name = "uk_row_permission_grant",
               columnNames = {"permission_id", "subject_type", "subject_key", "scope_action"}))
public class RowPermissionGrant extends BaseEntity {

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "permission_id", nullable = false)
    private Long permissionId;

    @Enumerated(EnumType.STRING)
    @Column(name = "subject_type", length = 20, nullable = false)
    private DataScopeSubject subjectType = DataScopeSubject.ROLE;

    @Column(name = "subject_key", length = 64, nullable = false)
    private String subjectKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "scope_action", length = 10, nullable = false)
    private DataScopeAction action = DataScopeAction.READ;

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public Long getPermissionId() { return permissionId; }
    public void setPermissionId(Long permissionId) { this.permissionId = permissionId; }
    public DataScopeSubject getSubjectType() { return subjectType; }
    public void setSubjectType(DataScopeSubject subjectType) { this.subjectType = subjectType; }
    public String getSubjectKey() { return subjectKey; }
    public void setSubjectKey(String subjectKey) { this.subjectKey = subjectKey; }
    public DataScopeAction getAction() { return action; }
    public void setAction(DataScopeAction action) { this.action = action; }

    /** 与 {@link DataScopeSubjectResolver} 产出的主体标识同格式（{@code TYPE:key}）。 */
    public String subjectRef() {
        return subjectType == null || subjectKey == null ? "" : subjectType.name() + ":" + subjectKey;
    }
}
