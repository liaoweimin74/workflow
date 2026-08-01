package com.workflow.identity.repository;

import com.workflow.identity.domain.WorkflowProcessDef;
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
    List<WorkflowProcessDef> findByTenantIdAndProcessKeyOrderByVersionDesc(String tenantId, String processKey);
}