package com.workflow.engine.datasource.scope;

import com.workflow.common.domain.entity.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** 行权限对象与数据源的关联（对象在哪些数据源上生效）。 */
@Entity
@Table(name = "wf_row_permission_source",
       uniqueConstraints = @UniqueConstraint(name = "uk_row_permission_source",
               columnNames = {"permission_id", "data_source_id"}))
public class RowPermissionSource extends BaseEntity {

    @Column(name = "tenant_id", length = 64, nullable = false)
    private String tenantId;

    @Column(name = "permission_id", nullable = false)
    private Long permissionId;

    @Column(name = "data_source_id", length = 64, nullable = false)
    private String dataSourceId;

    public String getTenantId() { return tenantId; }
    public void setTenantId(String tenantId) { this.tenantId = tenantId; }
    public Long getPermissionId() { return permissionId; }
    public void setPermissionId(Long permissionId) { this.permissionId = permissionId; }
    public String getDataSourceId() { return dataSourceId; }
    public void setDataSourceId(String dataSourceId) { this.dataSourceId = dataSourceId; }
}
