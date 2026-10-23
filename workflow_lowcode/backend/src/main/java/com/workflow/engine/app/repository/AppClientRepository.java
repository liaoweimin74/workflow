package com.workflow.engine.app.repository;

import com.workflow.engine.app.entity.AppClient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppClientRepository extends JpaRepository<AppClient, String> {

    Optional<AppClient> findByIdAndTenantId(String id, String tenantId);

    List<AppClient> findByTenantIdAndAppIdOrderByCreatedAtAsc(String tenantId, String appId);

    boolean existsByTenantIdAndAppIdAndClientTypeAndName(String tenantId, String appId, String clientType, String name);
}
