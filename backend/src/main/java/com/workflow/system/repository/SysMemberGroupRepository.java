package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysMemberGroup;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 成员组仓库（Task 142）。
 * 软删除统一走 is_deleted=0 过滤（BaseEntity 字段）。
 */
public interface SysMemberGroupRepository extends JpaRepository<SysMemberGroup, Long> {

    Optional<SysMemberGroup> findByIdAndIsDeleted(Long id, Integer isDeleted);

    /** 按名称 + 删除态取组（复活软删墓碑 / 墓碑清理用）。 */
    Optional<SysMemberGroup> findByGroupNameAndIsDeleted(String groupName, Integer isDeleted);

    /** 名称唯一性检查（排除自身，用于更新场景；excludeId 为 null 时全表查）。 */
    @Query("SELECT COUNT(g) FROM SysMemberGroup g WHERE g.isDeleted = 0 AND g.groupName = :name " +
           "AND (:excludeId IS NULL OR g.id <> :excludeId)")
    long countByNameExcluding(@Param("name") String name, @Param("excludeId") Long excludeId);

    /**
     * 全量有效成员组（keyword 匹配名称/说明；对齐 PostService 的内存分页模式）。
     * keyword 为空串时按不过滤处理（调用方先归一）。
     */
    @Query("SELECT g FROM SysMemberGroup g WHERE g.isDeleted = 0 " +
           "AND (:keyword IS NULL OR g.groupName LIKE CONCAT('%', :keyword, '%') " +
           "     OR g.description LIKE CONCAT('%', :keyword, '%')) " +
           "ORDER BY g.id ASC")
    List<SysMemberGroup> search(@Param("keyword") String keyword);
}
