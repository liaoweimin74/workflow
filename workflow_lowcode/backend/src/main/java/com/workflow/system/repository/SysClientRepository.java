package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysClient;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SysClientRepository extends JpaRepository<SysClient, Long> {

    Optional<SysClient> findByCodeAndIsDeleted(String code, Integer isDeleted);
}
