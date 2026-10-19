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

    List<SysMenu> findByPathAndIsDeleted(String path, int isDeleted);

    /** 物料删除前置检查：按 component（material:&lt;key&gt;）找出引用该物料的菜单。 */
    List<SysMenu> findByComponentAndIsDeleted(String component, int isDeleted);
}