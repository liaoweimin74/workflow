package com.workflow.engine.process.repository;

import com.workflow.engine.process.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CategoryRepository extends JpaRepository<Category, String> {

    List<Category> findByTenantIdOrderBySortOrderAsc(String tenantId);

    /** 当前租户的最大 sort_order（内联新建分类时自动排到最后）；空表返回 0。 */
    @Query("select coalesce(max(c.sortOrder), 0) from Category c where c.tenantId = :tenantId")
    Integer findMaxSortOrder(@Param("tenantId") String tenantId);
}
