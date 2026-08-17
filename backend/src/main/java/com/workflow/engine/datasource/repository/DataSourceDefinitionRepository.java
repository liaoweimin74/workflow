package com.workflow.engine.datasource.repository;

import com.workflow.engine.datasource.entity.DataSourceDefinition;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface DataSourceDefinitionRepository extends JpaRepository<DataSourceDefinition, String> {

    Optional<DataSourceDefinition> findByIdAndTenantId(String id, String tenantId);

    boolean existsByTenantIdAndName(String tenantId, String name);

    Page<DataSourceDefinition> findByTenantIdOrderByUpdatedAtDesc(String tenantId, Pageable pageable);

    Page<DataSourceDefinition> findByTenantIdAndTypeOrderByUpdatedAtDesc(String tenantId, String type, Pageable pageable);

    Page<DataSourceDefinition> findByTenantIdAndStatusOrderByUpdatedAtDesc(String tenantId, String status, Pageable pageable);

    Page<DataSourceDefinition> findByTenantIdAndTypeAndStatusOrderByUpdatedAtDesc(
            String tenantId, String type, String status, Pageable pageable);

    /** 页面设计器下拉用：仅已启用数据源 */
    List<DataSourceDefinition> findByTenantIdAndStatus(String tenantId, String status);
}