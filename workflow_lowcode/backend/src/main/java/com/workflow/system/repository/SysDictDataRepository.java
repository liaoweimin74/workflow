package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysDictData;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface SysDictDataRepository extends JpaRepository<SysDictData, Long>,
        JpaSpecificationExecutor<SysDictData> {
    List<SysDictData> findByDictCodeOrderBySortOrder(String dictCode);

    long countByDictCode(String dictCode);
}