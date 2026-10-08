package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysDictType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.Optional;

public interface SysDictTypeRepository extends JpaRepository<SysDictType, Long>,
        JpaSpecificationExecutor<SysDictType> {
    Optional<SysDictType> findByDictCode(String dictCode);
}