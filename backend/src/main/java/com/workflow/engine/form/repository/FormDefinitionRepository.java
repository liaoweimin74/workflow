package com.workflow.engine.form.repository;

import com.workflow.engine.form.entity.FormDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FormDefinitionRepository extends JpaRepository<FormDefinition, String> {

    Optional<FormDefinition> findByIdAndTenantId(String id, String tenantId);

    @Query("SELECT MAX(f.version) FROM FormDefinition f WHERE f.tenantId = :tenantId AND f.key = :key")
    Integer findMaxVersionByTenantIdAndKey(@Param("tenantId") String tenantId, @Param("key") String key);

    Page<FormDefinition> findByTenantIdAndStatusOrderByUpdatedAtDesc(String tenantId, String status, Pageable pageable);

    Page<FormDefinition> findByTenantIdOrderByUpdatedAtDesc(String tenantId, Pageable pageable);

    Page<FormDefinition> findByTenantIdAndNameContainingOrderByUpdatedAtDesc(String tenantId, String name, Pageable pageable);

    List<FormDefinition> findByTenantIdAndKeyOrderByVersionDesc(String tenantId, String key);

    Optional<FormDefinition> findByTenantIdAndKeyAndVersion(String tenantId, String key, Integer version);

    boolean existsByTenantIdAndKey(String tenantId, String key);

    Optional<FormDefinition> findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
            String tenantId, String key, String status);
}
