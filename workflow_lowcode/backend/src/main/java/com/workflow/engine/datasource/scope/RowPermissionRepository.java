package com.workflow.engine.datasource.scope;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface RowPermissionRepository extends JpaRepository<RowPermission, Long> {

    Optional<RowPermission> findByIdAndTenantId(Long id, String tenantId);

    List<RowPermission> findByTenantIdAndIdIn(String tenantId, Collection<Long> ids);

    List<RowPermission> findByTenantIdOrderByIdDesc(String tenantId);
}
