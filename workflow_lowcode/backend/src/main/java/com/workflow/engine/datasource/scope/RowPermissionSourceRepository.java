package com.workflow.engine.datasource.scope;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface RowPermissionSourceRepository extends JpaRepository<RowPermissionSource, Long> {

    List<RowPermissionSource> findByTenantId(String tenantId);

    List<RowPermissionSource> findByTenantIdAndDataSourceId(String tenantId, String dataSourceId);

    List<RowPermissionSource> findByTenantIdAndPermissionId(String tenantId, Long permissionId);

    List<RowPermissionSource> findByTenantIdAndPermissionIdIn(String tenantId, Collection<Long> permissionIds);

    void deleteByTenantIdAndPermissionId(String tenantId, Long permissionId);
}
