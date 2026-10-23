package com.workflow.engine.app.repository;

import com.workflow.engine.app.entity.AppRelease;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppReleaseRepository extends JpaRepository<AppRelease, String> {

    Optional<AppRelease> findByIdAndTenantId(String id, String tenantId);

    Optional<AppRelease> findFirstByClientIdOrderByVersionDesc(String clientId);

    List<AppRelease> findByTenantIdAndClientIdOrderByVersionDesc(String tenantId, String clientId);

    long countByTenantIdAndClientId(String tenantId, String clientId);
}
