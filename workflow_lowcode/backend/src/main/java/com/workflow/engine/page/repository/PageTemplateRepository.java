package com.workflow.engine.page.repository;

import com.workflow.engine.page.entity.PageTemplate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PageTemplateRepository extends JpaRepository<PageTemplate, String> {

    Optional<PageTemplate> findByIdAndTenantId(String id, String tenantId);

    boolean existsByTenantIdAndKey(String tenantId, String key);

    Optional<PageTemplate> findByTenantIdAndKey(String tenantId, String key);

    Page<PageTemplate> findByTenantIdOrderByUpdatedAtDesc(String tenantId, Pageable pageable);

    Page<PageTemplate> findByTenantIdAndNameContainingOrderByUpdatedAtDesc(String tenantId, String name, Pageable pageable);
}
