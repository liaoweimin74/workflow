package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysOrganization;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface SysOrganizationRepository extends JpaRepository<SysOrganization, Long>,
        JpaSpecificationExecutor<SysOrganization> {
    List<SysOrganization> findByParentIdOrderBySortOrder(Long parentId);

    List<SysOrganization> findByParentIdIsNullOrderBySortOrder();

    long countByParentId(Long parentId);
}