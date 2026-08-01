package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysRoleMenu;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Set;

public interface SysRoleMenuRepository extends JpaRepository<SysRoleMenu, Long> {
    List<SysRoleMenu> findByRoleId(Long roleId);

    List<SysRoleMenu> findByRoleIdIn(Set<Long> roleIds);

    /**
     * 批量删除角色的菜单关联。
     * <p>
     * 必须使用 @Modifying 的 bulk DELETE：派生删除方法（select-then-remove）
     * 会把 DELETE 延迟到事务提交且晚于新 INSERT 执行，与 sys_role_menu 的
     * (role_id, menu_id) 唯一约束冲突（见 RoleServiceImpl.assignMenus）。
     */
    @Modifying
    @Query("DELETE FROM SysRoleMenu rm WHERE rm.roleId = :roleId")
    void deleteByRoleId(@Param("roleId") Long roleId);
}