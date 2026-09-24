package com.workflow.engine.process.repository;

import com.workflow.engine.process.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface CategoryRepository extends JpaRepository<Category, String> {

    List<Category> findByTenantIdOrderBySortOrderAsc(String tenantId);

    List<Category> findByParentId(String parentId);
}
