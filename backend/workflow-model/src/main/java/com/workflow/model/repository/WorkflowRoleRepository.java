package com.workflow.model.repository;

import com.workflow.model.entity.WorkflowRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WorkflowRoleRepository extends JpaRepository<WorkflowRole, String> {
    List<WorkflowRole> findByTenantId(String tenantId);
    Optional<WorkflowRole> findByTenantIdAndCode(String tenantId, String code);
}