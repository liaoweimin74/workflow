package com.workflow.engine.logicflow.repository;

import com.workflow.engine.logicflow.entity.LogicFlowDef;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface LogicFlowDefRepository extends JpaRepository<LogicFlowDef, String> {

    Optional<LogicFlowDef> findByTenantIdAndFlowKey(String tenantId, String flowKey);

    boolean existsByTenantIdAndFlowKey(String tenantId, String flowKey);

    /**
     * 分页搜索：租户内按关键字模糊匹配 flowKey / name，按 updatedAt 倒序。
     * keyword 为 null 时不做关键字过滤。
     */
    @Query("""
            SELECT f FROM LogicFlowDef f
            WHERE f.tenantId = :tenantId
              AND (:keyword IS NULL
                   OR LOWER(f.flowKey) LIKE LOWER(CONCAT('%', :keyword, '%'))
                   OR LOWER(f.name) LIKE LOWER(CONCAT('%', :keyword, '%')))
            ORDER BY f.updatedAt DESC
            """)
    Page<LogicFlowDef> search(@Param("tenantId") String tenantId,
                              @Param("keyword") String keyword,
                              Pageable pageable);
}
