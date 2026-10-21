package com.workflow.engine.datasource.scope;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface RowScopeExemptionRepository extends JpaRepository<RowScopeExemption, Long> {

    Optional<RowScopeExemption> findByIdAndTenantId(Long id, String tenantId);

    List<RowScopeExemption> findByTenantIdOrderByIdDesc(String tenantId);

    List<RowScopeExemption> findByTenantIdAndRevokedAtIsNull(String tenantId);

    Optional<RowScopeExemption> findFirstByTenantIdAndDataSourceIdAndRevokedAtIsNull(
            String tenantId, String dataSourceId);
}
