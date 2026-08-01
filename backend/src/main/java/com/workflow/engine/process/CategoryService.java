package com.workflow.engine.process;

import com.workflow.engine.process.entity.Category;
import com.workflow.engine.process.repository.CategoryRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;
import java.util.stream.Collectors;

/**
 * 流程分类服务。
 * 支持树形结构的分类管理。
 */
@Service
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final TenantProvider tenantProvider;

    public CategoryService(CategoryRepository categoryRepository, TenantProvider tenantProvider) {
        this.categoryRepository = categoryRepository;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 查询分类树。
     */
    public List<Category> getCategoryTree() {
        String tenantId = tenantProvider.getTenantId();
        List<Category> all = categoryRepository.findByTenantIdOrderBySortOrderAsc(tenantId);
        return buildTree(all, null);
    }

    /**
     * 查询所有分类（扁平列表）。
     */
    public List<Category> listAll() {
        String tenantId = tenantProvider.getTenantId();
        return categoryRepository.findByTenantIdOrderBySortOrderAsc(tenantId);
    }

    /**
     * 创建分类。
     */
    @Transactional
    public Category createCategory(String name, String parentId, Integer sortOrder) {
        String tenantId = tenantProvider.getTenantId();
        Category category = new Category();
        category.setId(UUID.randomUUID().toString().replace("-", ""));
        category.setTenantId(tenantId);
        category.setName(name);
        category.setParentId(parentId);
        category.setSortOrder(sortOrder != null ? sortOrder : 0);
        return categoryRepository.save(category);
    }

    /**
     * 修改分类。
     */
    @Transactional
    public Category updateCategory(String id, String name, String parentId, Integer sortOrder) {
        String tenantId = tenantProvider.getTenantId();
        Category category = categoryRepository.findById(id)
                .filter(c -> c.getTenantId().equals(tenantId))
                .orElseThrow(() -> new RuntimeException("Category not found: " + id));

        if (name != null) category.setName(name);
        if (parentId != null) category.setParentId(parentId);
        if (sortOrder != null) category.setSortOrder(sortOrder);
        return categoryRepository.save(category);
    }

    /**
     * 删除分类（有子分类时拒绝）。
     */
    @Transactional
    public void deleteCategory(String id) {
        String tenantId = tenantProvider.getTenantId();
        Category category = categoryRepository.findById(id)
                .filter(c -> c.getTenantId().equals(tenantId))
                .orElseThrow(() -> new RuntimeException("Category not found: " + id));

        List<Category> children = categoryRepository.findByParentId(id);
        if (!children.isEmpty()) {
            throw new RuntimeException("请先删除子分类");
        }

        categoryRepository.delete(category);
    }

    private List<Category> buildTree(List<Category> all, String parentId) {
        return all.stream()
                .filter(c -> Objects.equals(c.getParentId(), parentId))
                .peek(c -> {
                    // children 由前端根据 parentId 构建，后端只返回扁平列表
                })
                .collect(Collectors.toList());
    }
}
