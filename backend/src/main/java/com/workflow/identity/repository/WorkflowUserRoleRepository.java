package com.workflow.identity.repository;

import com.workflow.identity.domain.WorkflowUserRole;
import com.workflow.identity.domain.WorkflowUserRole.UserRoleId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WorkflowUserRoleRepository extends JpaRepository<WorkflowUserRole, UserRoleId> {
    List<WorkflowUserRole> findByUserId(String userId);
    List<WorkflowUserRole> findByRoleId(String roleId);
}