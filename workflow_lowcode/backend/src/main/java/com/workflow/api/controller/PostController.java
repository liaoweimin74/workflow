package com.workflow.api.controller;

import com.workflow.common.domain.R;
import com.workflow.system.domain.entity.SysPost;
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

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 岗位管理（V43 对位）。
 * 前端 {@code PostPage.vue} 契约：GET 列表返回 {@code {rows,total,page,size}}；
 * 注意本控制器挂 {@code /api/posts}（不带 /v1 前缀，与前端 http baseURL='/api' 直拼一致）。
 */
@RestController
@RequestMapping("/api/posts")
public class PostController {

    private final PostService postService;

    public PostController(PostService postService) {
        this.postService = postService;
    }

    /** 分页列表（keyword 模糊匹配名称/编码；status 过滤 1 启用 0 停用）。 */
    @GetMapping
    public R<Map<String, Object>> page(@RequestParam(defaultValue = "1") int page,
                                       @RequestParam(defaultValue = "20") int size,
                                       @RequestParam(required = false) String keyword,
                                       @RequestParam(required = false) Integer status) {
        List<SysPost> all = postService.listAll();
        List<SysPost> filtered = all.stream()
                .filter(p -> status == null || status.equals(p.getStatus()))
                .filter(p -> matchKeyword(p, keyword))
                .toList();

        int safePage = Math.max(page, 1);
        int safeSize = Math.max(size, 1);
        int from = Math.min((safePage - 1) * safeSize, filtered.size());
        int to = Math.min(from + safeSize, filtered.size());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("rows", filtered.subList(from, to));
        body.put("total", filtered.size());
        body.put("page", safePage);
        body.put("size", safeSize);
        return R.ok(body);
    }

    /** 启用岗位下拉选项（用户表单 / 成员组规则用）。 */
    @GetMapping("/options")
    public R<List<Map<String, Object>>> options() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (SysPost p : postService.options()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", p.getId());
            row.put("postCode", p.getPostCode());
            row.put("postName", p.getPostName());
            rows.add(row);
        }
        return R.ok(rows);
    }

    @PostMapping
    public R<SysPost> create(@RequestBody PostSaveRequest form) {
        return R.ok(postService.create(form.postCode(), form.postName(),
                form.description(), form.sortOrder(), form.status()));
    }

    @PutMapping("/{id}")
    public R<SysPost> update(@PathVariable Long id, @RequestBody PostSaveRequest form) {
        return R.ok(postService.update(id, form.postCode(), form.postName(),
                form.description(), form.sortOrder(), form.status()));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        postService.delete(id);
        return R.ok();
    }

    private boolean matchKeyword(SysPost p, String keyword) {
        if (keyword == null || keyword.isBlank()) {
            return true;
        }
        String k = keyword.toLowerCase();
        return (p.getPostName() != null && p.getPostName().toLowerCase().contains(k))
                || (p.getPostCode() != null && p.getPostCode().toLowerCase().contains(k));
    }

    /** 保存表单（create/update 共用；字段全部可选，服务端按语义校验）。 */
    public record PostSaveRequest(String postCode, String postName, String description,
                                  Integer sortOrder, Integer status) {
    }
}
