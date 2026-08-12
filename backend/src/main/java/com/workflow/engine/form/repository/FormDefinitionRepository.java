package com.workflow.engine.form.repository;

import com.workflow.engine.form.entity.FormDefinition;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface FormDefinitionRepository extends JpaRepository<FormDefinition, String> {

    Optional<FormDefinition> findByIdAndTenantId(String id, String tenantId);

    /**
     * 悲观锁查询（用于发布等需要串行化结构变更的场景）。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT f FROM FormDefinition f WHERE f.id = :id AND f.tenantId = :tenantId")
    Optional<FormDefinition> findByIdForUpdate(@Param("id") String id, @Param("tenantId") String tenantId);

    @Query("SELECT MAX(f.version) FROM FormDefinition f WHERE f.tenantId = :tenantId AND f.key = :key")
    Integer findMaxVersionByTenantIdAndKey(@Param("tenantId") String tenantId, @Param("key") String key);

    Page<FormDefinition> findByTenantIdAndStatusOrderByUpdatedAtDesc(String tenantId, String status, Pageable pageable);

    Page<FormDefinition> findByTenantIdOrderByUpdatedAtDesc(String tenantId, Pageable pageable);

    Page<FormDefinition> findByTenantIdAndNameContainingOrderByUpdatedAtDesc(String tenantId, String name, Pageable pageable);

    Page<FormDefinition> findByTenantIdAndTypeOrderByUpdatedAtDesc(String tenantId, String type, Pageable pageable);

    Page<FormDefinition> findByTenantIdAndTypeAndStatusOrderByUpdatedAtDesc(String tenantId, String type, String status, Pageable pageable);

    Page<FormDefinition> findByTenantIdAndTypeAndNameContainingOrderByUpdatedAtDesc(String tenantId, String type, String name, Pageable pageable);

    List<FormDefinition> findByTenantIdAndKeyOrderByVersionDesc(String tenantId, String key);

    Optional<FormDefinition> findByTenantIdAndKeyAndVersion(String tenantId, String key, Integer version);

    boolean existsByTenantIdAndKey(String tenantId, String key);

    Optional<FormDefinition> findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
            String tenantId, String key, String status);
}
