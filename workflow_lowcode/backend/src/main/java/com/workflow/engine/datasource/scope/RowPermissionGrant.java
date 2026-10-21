package com.workflow.engine.datasource.scope;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/**
 * 行权限对象的授予：把对象授给某个主体（v3：授权 = 赋予可见行，不再分读写轴）。
 *
 * <p>可见性同时管读与改删（「看即能操作」），一条授权就是一个「该主体能看这批行」的宣告；
 * 同一主体命中多个对象时取并集。
 */
@Entity
@Table(name = "wf_row_permission_grant",
       uniqueConstraints = @UniqueConstraint(name = "uk_row_permission_grant",
               columnNames = {"permission_id", "subject_type", "subject_key"}))
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

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public Long getPermissionId() { return permissionId; }
    public void setPermissionId(Long permissionId) { this.permissionId = permissionId; }
    public DataScopeSubject getSubjectType() { return subjectType; }
    public void setSubjectType(DataScopeSubject subjectType) { this.subjectType = subjectType; }
    public String getSubjectKey() { return subjectKey; }
    public void setSubjectKey(String subjectKey) { this.subjectKey = subjectKey; }

    /** 与 {@link DataScopeSubjectResolver} 产出的主体标识同格式（{@code TYPE:key}）。 */
    public String subjectRef() {
        return subjectType == null || subjectKey == null ? "" : subjectType.name() + ":" + subjectKey;
    }
}
