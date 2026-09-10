package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.engine.process.CategoryService;
import com.workflow.engine.process.entity.Category;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 流程分类 Controller。
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
     * 获取分类树。
     */
    @GetMapping("/tree")
    public R<List<Category>> tree() {
        List<Category> tree = categoryService.getCategoryTree();
        return R.ok(tree);
    }

    /**
     * 新建分类。
     */
    @PostMapping
    public R<Category> create(@RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        String parentId = (String) body.get("parentId");
        Integer sortOrder = body.get("sortOrder") != null
                ? ((Number) body.get("sortOrder")).intValue() : null;
        Category category = categoryService.createCategory(name, parentId, sortOrder);
        return R.ok(category);
    }

    /**
     * 修改分类。
     */
    @PutMapping("/{id}")
    public R<Category> update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        String name = (String) body.get("name");
        String parentId = (String) body.get("parentId");
        Integer sortOrder = body.get("sortOrder") != null
                ? ((Number) body.get("sortOrder")).intValue() : null;
        Category category = categoryService.updateCategory(id, name, parentId, sortOrder);
        return R.ok(category);
    }

    /**
     * 删除分类。
     */
    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable String id) {
        categoryService.deleteCategory(id);
        return R.ok();
    }
}
