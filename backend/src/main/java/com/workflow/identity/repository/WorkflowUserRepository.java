package com.workflow.identity.repository;

import com.workflow.identity.domain.WorkflowUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WorkflowUserRepository extends JpaRepository<WorkflowUser, String> {
    List<WorkflowUser> findByTenantId(String tenantId);
    Optional<WorkflowUser> findByTenantIdAndUsername(String tenantId, String username);
    Optional<WorkflowUser> findByTenantIdAndId(String tenantId, String id);
}