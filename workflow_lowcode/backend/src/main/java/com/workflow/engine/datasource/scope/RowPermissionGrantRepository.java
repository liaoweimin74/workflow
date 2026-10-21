package com.workflow.engine.datasource.scope;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RowPermissionGrantRepository extends JpaRepository<RowPermissionGrant, Long> {

    Optional<RowPermissionGrant> findByIdAndTenantId(Long id, String tenantId);

    List<RowPermissionGrant> findByTenantId(String tenantId);

    List<RowPermissionGrant> findByTenantIdAndPermissionId(String tenantId, Long permissionId);

    List<RowPermissionGrant> findByTenantIdAndPermissionIdIn(String tenantId, Collection<Long> permissionIds);

    List<RowPermissionGrant> findByTenantIdAndSubjectTypeAndSubjectKey(
            String tenantId, DataScopeSubject subjectType, String subjectKey);

    void deleteByTenantIdAndPermissionId(String tenantId, Long permissionId);
}
