package com.workflow.identity.repository;

import com.workflow.identity.domain.WorkflowTenant;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface WorkflowTenantRepository extends JpaRepository<WorkflowTenant, String> {
    Optional<WorkflowTenant> findByIdAndStatus(String id, String status);
}