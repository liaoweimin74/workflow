package com.workflow.model.repository;

import com.workflow.model.entity.WorkflowDept;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WorkflowDeptRepository extends JpaRepository<WorkflowDept, String> {
    List<WorkflowDept> findByTenantId(String tenantId);
    List<WorkflowDept> findByTenantIdAndParentId(String tenantId, String parentId);
}