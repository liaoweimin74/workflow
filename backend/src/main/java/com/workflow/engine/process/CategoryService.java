package com.workflow.engine.process;

import com.workflow.engine.process.entity.Category;
import com.workflow.engine.process.repository.CategoryRepository;
import com.workflow.engine.process.repository.ProcessDraftRepository;
import com.workflow.engine.tenant.TenantProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * 流程分类服务。
 * Task 105 起为扁平结构（取消树形）：无 parentId、无分类树；
 * sortOrder 缺省时自动「排到最后」（当前租户 max + 1），
 * 支撑前端胶囊内联新建（无排序输入框）。
 */
@Service
public class CategoryService {

    private final CategoryRepository categoryRepository;
    private final ProcessDraftRepository processDraftRepository;
    private final TenantProvider tenantProvider;

    public CategoryService(CategoryRepository categoryRepository,
                           ProcessDraftRepository processDraftRepository,
                           TenantProvider tenantProvider) {
        this.categoryRepository = categoryRepository;
        this.processDraftRepository = processDraftRepository;
        this.tenantProvider = tenantProvider;
    }

    /**
     * 查询所有分类（扁平列表，按 sort_order 升序）。
     */
    public List<Category> listAll() {
        String tenantId = tenantProvider.getTenantId();
        return categoryRepository.findByTenantIdOrderBySortOrderAsc(tenantId);
    }

    /**
     * 创建分类。sortOrder 为空时落「当前租户最大 sort_order + 1」。
     */
    @Transactional
    public Category createCategory(String name, Integer sortOrder) {
        String tenantId = tenantProvider.getTenantId();
        Category category = new Category();
        category.setId(UUID.randomUUID().toString().replace("-", ""));
        category.setTenantId(tenantId);
        category.setName(name);
        if (sortOrder != null) {
            category.setSortOrder(sortOrder);
        } else {
            Integer max = categoryRepository.findMaxSortOrder(tenantId);
            category.setSortOrder((max != null ? max : 0) + 1);
        }
        return categoryRepository.save(category);
    }

    /**
     * 修改分类。
     */
    @Transactional
    public Category updateCategory(String id, String name, Integer sortOrder) {
        String tenantId = tenantProvider.getTenantId();
        Category category = categoryRepository.findById(id)
                .filter(c -> c.getTenantId().equals(tenantId))
                .orElseThrow(() -> new RuntimeException("Category not found: " + id));

        if (name != null) category.setName(name);
        if (sortOrder != null) category.setSortOrder(sortOrder);
        return categoryRepository.save(category);
    }

    /**
     * 删除分类（分类下存在流程草稿时拒绝，避免孤儿 category_id）。
     */
    @Transactional
    public void deleteCategory(String id) {
        String tenantId = tenantProvider.getTenantId();
        Category category = categoryRepository.findById(id)
                .filter(c -> c.getTenantId().equals(tenantId))
                .orElseThrow(() -> new RuntimeException("Category not found: " + id));

        if (processDraftRepository.existsByCategoryId(id)) {
            throw new RuntimeException("该分类下存在流程，请先移除或转移后再删除");
        }

        categoryRepository.delete(category);
    }
}
