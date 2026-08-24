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

    /** 迁移器命名约定查重：租户内同类型同名数据源 */
    Optional<DataSourceDefinition> findByTenantIdAndTypeAndName(String tenantId, String type, String name);

    /** 按 formKey 查找数据源（业务表单关联） */
    Optional<DataSourceDefinition> findByTenantIdAndFormKey(String tenantId, String formKey);

    /** 按 sourceKey 查找数据源（系统数据源） */
    Optional<DataSourceDefinition> findByTenantIdAndSourceKey(String tenantId, String sourceKey);

    /**
     * 跨租户查询：当前租户的启用数据源 + SYSTEM 类型的启用数据源（系统资源对所有租户可见）。
     * SQL: WHERE status = ?1 AND (tenant_id = ?2 OR type = 'SYSTEM')
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT ds FROM DataSourceDefinition ds WHERE ds.status = ?1 AND (ds.tenantId = ?2 OR ds.type = 'SYSTEM')")
    List<DataSourceDefinition> findByStatusAndAccessibleTenant(String status, String tenantId);

    /**
     * 分页跨租户查询：当前租户的数据源 + SYSTEM 类型的数据源。
     * SQL: WHERE tenant_id = ?1 OR type = 'SYSTEM'
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT ds FROM DataSourceDefinition ds WHERE ds.tenantId = ?1 OR ds.type = 'SYSTEM'")
    Page<DataSourceDefinition> findByAccessibleTenantOrderByUpdatedAtDesc(String tenantId, Pageable pageable);

    /**
     * 分页跨租户查询：按类型过滤 + SYSTEM 可见。
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT ds FROM DataSourceDefinition ds WHERE (ds.tenantId = ?1 OR ds.type = 'SYSTEM') AND ds.type = ?2")
    Page<DataSourceDefinition> findByAccessibleTenantAndTypeOrderByUpdatedAtDesc(String tenantId, String type, Pageable pageable);

    /**
     * 分页跨租户查询：按状态过滤 + SYSTEM 可见。
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT ds FROM DataSourceDefinition ds WHERE (ds.tenantId = ?1 OR ds.type = 'SYSTEM') AND ds.status = ?2")
    Page<DataSourceDefinition> findByAccessibleTenantAndStatusOrderByUpdatedAtDesc(String tenantId, String status, Pageable pageable);

    /**
     * 分页跨租户查询：按类型+状态过滤 + SYSTEM 可见。
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT ds FROM DataSourceDefinition ds WHERE (ds.tenantId = ?1 OR ds.type = 'SYSTEM') AND ds.type = ?2 AND ds.status = ?3")
    Page<DataSourceDefinition> findByAccessibleTenantAndTypeAndStatusOrderByUpdatedAtDesc(
            String tenantId, String type, String status, Pageable pageable);
}