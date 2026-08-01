package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysRole;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface SysRoleRepository extends JpaRepository<SysRole, Long>,
        JpaSpecificationExecutor<SysRole> {
    Optional<SysRole> findByRoleCode(String roleCode);

    long countByRoleCode(String roleCode);
}