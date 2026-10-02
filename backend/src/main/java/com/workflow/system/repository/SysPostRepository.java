package com.workflow.system.repository;

import com.workflow.system.domain.entity.SysPost;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

/**
 * 岗位仓库（V43 对位）。
 * 软删除统一走 is_deleted=0 过滤（BaseEntity 字段）。
 */
public interface SysPostRepository extends JpaRepository<SysPost, Long> {

    Optional<SysPost> findByIdAndIsDeleted(Long id, Integer isDeleted);

    /** 编码唯一性检查（排除自身，用于更新场景；excludeId 为 null 时全表查）。 */
    @Query("SELECT COUNT(p) FROM SysPost p WHERE p.isDeleted = 0 AND p.postCode = :code " +
           "AND (:excludeId IS NULL OR p.id <> :excludeId)")
    long countByCodeExcluding(@Param("code") String code, @Param("excludeId") Long excludeId);

    /**
     * 分页列表（keyword 匹配名称/编码，status 可选；对齐 Node listPosts 语义）。
     * keyword 为空串时按不过滤处理（调用方先归一）。
     */
    @Query("SELECT p FROM SysPost p WHERE p.isDeleted = 0 " +
           "AND (:keyword IS NULL OR p.postName LIKE CONCAT('%', :keyword, '%') OR p.postCode LIKE CONCAT('%', :keyword, '%')) " +
           "AND (:status IS NULL OR p.status = :status) " +
           "ORDER BY p.sortOrder ASC, p.id ASC")
    List<SysPost> search(@Param("keyword") String keyword, @Param("status") Integer status);

    /** 启用岗位（下拉选项；排序对齐 search）。 */
    @Query("SELECT p FROM SysPost p WHERE p.isDeleted = 0 AND p.status = 1 " +
           "ORDER BY p.sortOrder ASC, p.id ASC")
    List<SysPost> listEnabled();

    /** 归属某岗位的有效用户数（删除前的占用检查）。 */
    @Query("SELECT COUNT(u) FROM SysUser u WHERE u.isDeleted = 0 AND u.postId = :postId")
    long countUsersByPostId(@Param("postId") Long postId);
}
