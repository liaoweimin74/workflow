package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysMenu;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;

public interface SysMenuRepository extends JpaRepository<SysMenu, Long>,
        JpaSpecificationExecutor<SysMenu> {
    List<SysMenu> findByParentIdOrderBySortOrder(Long parentId);

    List<SysMenu> findByParentIdIsNullOrderBySortOrder();

    long countByParentId(Long parentId);
}