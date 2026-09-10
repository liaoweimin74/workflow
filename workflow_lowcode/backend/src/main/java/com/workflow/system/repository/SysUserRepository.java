package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysUser;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface SysUserRepository extends JpaRepository<SysUser, Long>,
        JpaSpecificationExecutor<SysUser> {
    Optional<SysUser> findByUsername(String username);

    List<SysUser> findByUsernameIn(List<String> usernames);

    long countByOrgId(Long orgId);
}