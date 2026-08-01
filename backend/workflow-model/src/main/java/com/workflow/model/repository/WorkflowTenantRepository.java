package com.workflow.model.repository;

import com.workflow.model.entity.WorkflowTenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface WorkflowTenantRepository extends JpaRepository<WorkflowTenant, String> {
    Optional<WorkflowTenant> findByIdAndStatus(String id, String status);
}