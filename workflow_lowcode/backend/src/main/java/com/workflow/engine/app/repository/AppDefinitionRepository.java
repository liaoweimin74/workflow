package com.workflow.engine.app.repository;

import com.workflow.engine.app.entity.AppDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AppDefinitionRepository extends JpaRepository<AppDefinition, String> {

    Optional<AppDefinition> findByIdAndTenantId(String id, String tenantId);

    Optional<AppDefinition> findByTenantIdAndCode(String tenantId, String code);

    boolean existsByTenantIdAndCode(String tenantId, String code);

    List<AppDefinition> findByTenantIdOrderByUpdatedAtDesc(String tenantId);

    Page<AppDefinition> findByTenantIdOrderByUpdatedAtDesc(String tenantId, Pageable pageable);

    Page<AppDefinition> findByTenantIdAndNameContainingOrderByUpdatedAtDesc(String tenantId, String name, Pageable pageable);
}
