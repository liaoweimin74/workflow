package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.process.CategoryService;
import com.workflow.engine.process.entity.Category;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 流程分类 Controller。
 * Task 105：取消树形结构——parentId 字段与 /tree 端点移除。
 */
@RestController
@RequestMapping("/api/v1/categories")
public class CategoryController {

    private final CategoryService categoryService;

    public CategoryController(CategoryService categoryService) {
        this.categoryService = categoryService;
    }

    /**
     * 获取分类列表。
     */
    @GetMapping
    public R<List<Category>> list() {
        List<Category> categories = categoryService.listAll();
        return R.ok(categories);
    }

    /**
     * 新建分类。sortOrder 为空时自动排到最后（当前租户 max + 1）。
     */
    @PostMapping
    public R<Category> create(@RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        Integer sortOrder = body.get("sortOrder") != null
                ? ((Number) body.get("sortOrder")).intValue() : null;
        Category category = categoryService.createCategory(name, sortOrder);
        return R.ok(category);
    }

    /**
     * 修改分类。
     */
    @PutMapping("/{id}")
    public R<Category> update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        Integer sortOrder = body.get("sortOrder") != null
                ? ((Number) body.get("sortOrder")).intValue() : null;
        Category category = categoryService.updateCategory(id, name, sortOrder);
        return R.ok(category);
    }

    /**
     * 删除分类（分类下存在流程草稿时拒绝）。
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable String id) {
        categoryService.deleteCategory(id);
        return R.ok();
    }
}
