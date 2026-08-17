package com.workflow.engine.page.repository;

import com.workflow.engine.page.entity.PageDefinition;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PageDefinitionRepository extends JpaRepository<PageDefinition, String> {

    Optional<PageDefinition> findByIdAndTenantId(String id, String tenantId);

    boolean existsByTenantIdAndKey(String tenantId, String key);

    Optional<PageDefinition> findFirstByTenantIdAndKeyOrderByVersionDesc(String tenantId, String key);

    /**
     * 查找同 key 的最新已发布版本（排除指定 id）。
     * 重新发布时用于排除当前记录自身（当前记录已是 PUBLISHED），
     * 避免"内容未变化"比较时与自己比较恒等。
     */
    Optional<PageDefinition> findFirstByTenantIdAndKeyAndStatusAndIdNotOrderByVersionDesc(
            String tenantId, String key, String status, String excludeId);

    Optional<PageDefinition> findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc(
            String tenantId, String key, String status);

    List<PageDefinition> findByTenantIdAndKeyOrderByVersionDesc(String tenantId, String key);

    Optional<PageDefinition> findByTenantIdAndKeyAndVersion(String tenantId, String key, Integer version);

    /**
     * 悲观锁查询（用于发布等需要串行化状态流转的场景）。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT p FROM PageDefinition p WHERE p.id = :id AND p.tenantId = :tenantId")
    Optional<PageDefinition> findByIdForUpdate(@Param("id") String id, @Param("tenantId") String tenantId);

    Page<PageDefinition> findByTenantIdOrderByUpdatedAtDesc(String tenantId, Pageable pageable);

    Page<PageDefinition> findByTenantIdAndNameContainingOrderByUpdatedAtDesc(String tenantId, String name, Pageable pageable);

    Page<PageDefinition> findByTenantIdAndStatusOrderByUpdatedAtDesc(String tenantId, String status, Pageable pageable);

    Page<PageDefinition> findByTenantIdAndTypeOrderByUpdatedAtDesc(String tenantId, String type, Pageable pageable);

    Page<PageDefinition> findByTenantIdAndStatusAndTypeOrderByUpdatedAtDesc(String tenantId, String status, String type, Pageable pageable);

    Page<PageDefinition> findByTenantIdAndNameContainingAndTypeOrderByUpdatedAtDesc(String tenantId, String name, String type, Pageable pageable);

    Page<PageDefinition> findByTenantIdAndNameContainingAndStatusOrderByUpdatedAtDesc(String tenantId, String name, String status, Pageable pageable);

    Page<PageDefinition> findByTenantIdAndNameContainingAndStatusAndTypeOrderByUpdatedAtDesc(String tenantId, String name, String status, String type, Pageable pageable);
}