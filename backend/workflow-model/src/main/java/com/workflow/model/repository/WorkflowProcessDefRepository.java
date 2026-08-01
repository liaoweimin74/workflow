package com.workflow.model.repository;

import com.workflow.model.entity.WorkflowProcessDef;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WorkflowProcessDefRepository extends JpaRepository<WorkflowProcessDef, String> {
    Page<WorkflowProcessDef> findByTenantId(String tenantId, Pageable pageable);
    Optional<WorkflowProcessDef> findByTenantIdAndId(String tenantId, String id);
    Optional<WorkflowProcessDef> findByTenantIdAndProcessKeyAndVersion(String tenantId, String processKey, Integer version);
    List<WorkflowProcessDef> findByTenantIdAndProcessKeyOrderByVersionDesc(String tenantId, String processKey);
    Optional<WorkflowProcessDef> findTopByTenantIdAndProcessKeyOrderByVersionDesc(String tenantId, String processKey);
}