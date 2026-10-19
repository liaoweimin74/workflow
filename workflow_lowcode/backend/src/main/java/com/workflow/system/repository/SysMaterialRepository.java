package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysMaterial;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

/**
 * 远程物料仓储（change: remote-materials）。
 */
public interface SysMaterialRepository extends JpaRepository<SysMaterial, Long>,
        JpaSpecificationExecutor<SysMaterial> {

    Optional<SysMaterial> findByMaterialKeyAndIsDeleted(String materialKey, Integer isDeleted);

    /**
     * 按 key 查记录，含软删行。{@code uk_sys_material_key} 是全表唯一键，
     * 软删记录仍占着 key——写入前必须按这个口径判断"新物料还是复用"。
     */
    Optional<SysMaterial> findByMaterialKey(String materialKey);

    List<SysMaterial> findByTypeAndStatusAndIsDeletedOrderByCreatedAtDesc(
            String type, Integer status, Integer isDeleted);
}
