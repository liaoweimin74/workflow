package com.workflow.system.controller;

import com.workflow.common.domain.R;
import com.workflow.system.service.PostService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 岗位接口（V43 对位；路径对齐 Node `@Controller('api/posts')`——前端
 * http baseURL=/api + '/posts'，即 /api/posts，不带 v1 段）。
 *
 * <p>⚠️ `options` 端点声明在 `:id` 之前（Spring 精确路径优先于模板变量，
 * 这里保持与 Node 相同的声明顺序以便阅读）。
 */
@RestController
@RequestMapping("/api/posts")
public class PostController {

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    @GetMapping
    public R<Map<String, Object>> list(@RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "20") int size,
                                       @RequestParam(required = false) String keyword,
                                       @RequestParam(required = false) Integer status) {
        return R.ok(postService.list(page, size, keyword, status));
    }

    /** 启用岗位下拉选项（用户表单/成员组规则用）。 */
    @GetMapping("/options")
    public R<List<Map<String, Object>>> options() {
        return R.ok(postService.listOptions());
    }

    @PostMapping
    public R<Map<String, Object>> create(@RequestBody PostSaveRequest body) {
        return R.ok(postService.create(
                body.postCode, body.postName, body.description, body.sortOrder, body.status));
    }

    @PutMapping("/{id}")
    public R<Map<String, Object>> update(@PathVariable Long id, @RequestBody PostSaveRequest body) {
        return R.ok(postService.update(
                id, body.postCode, body.postName, body.description, body.sortOrder, body.status));
    }

    @DeleteMapping("/{id}")
    public R<Void> remove(@PathVariable Long id) {
        postService.delete(id);
        return R.ok();
    }

    /** 岗位保存请求体（create 全量 / update 部分，null 字段不更新）。 */
    public static class PostSaveRequest {
        public String postCode;
        public String postName;
        public String description;
        public Integer sortOrder;
        public Integer status;

        public String getPostCode() { return postCode; }
        public String getPostName() { return postName; }
        public String getDescription() { return description; }
        public Integer getSortOrder() { return sortOrder; }
        public Integer getStatus() { return status; }
    }
}
