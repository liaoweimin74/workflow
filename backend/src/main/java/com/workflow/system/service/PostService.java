package com.workflow.system.service;

import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.entity.SysPost;
import com.workflow.system.repository.SysPostRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 岗位服务（V43 对位；语义对齐 Node system.service.ts PostController）。
 *
 * <p>对外 DTO 用 Map 承载（字段面：id/postCode/postName/description/sortOrder/status/createdAt），
 * 避免为单一实体引入 VO 层；camelCase 键与 Node 契约逐字段一致。
 */
@Service
public class PostService {

    private final SysPostRepository postRepository;

    public PostService(SysPostRepository postRepository) {
        this.postRepository = postRepository;
    }

    /** 分页列表（keyword 匹配名称/编码；status 可选；对齐 Node listPosts）。 */
    public Map<String, Object> list(int page, int size, String keyword, Integer status) {
        int safePage = Math.max(page, 1);
        int safeSize = Math.max(size, 1);
        String kw = keyword != null && !keyword.isBlank() ? keyword.trim() : null;

        List<SysPost> rows = postRepository.search(kw, status);
        int from = Math.min((safePage - 1) * safeSize, rows.size());
        int to = Math.min(from + safeSize, rows.size());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("rows", rows.subList(from, to).stream().map(PostService::toVO).toList());
        result.put("total", rows.size());
        result.put("page", safePage);
        result.put("size", safeSize);
        return result;
    }

    /** 启用岗位下拉选项（用户表单/成员组规则用；对齐 Node listPostOptions）。 */
    public List<Map<String, Object>> listOptions() {
        return postRepository.listEnabled().stream()
                .map(p -> {
                    Map<String, Object> vo = new LinkedHashMap<String, Object>();
                    vo.put("id", p.getId());
                    vo.put("postCode", p.getPostCode());
                    vo.put("postName", p.getPostName());
                    return vo;
                })
                .toList();
    }

    @Transactional
    public Map<String, Object> create(String postCode, String postName,
                                      String description, Integer sortOrder, Integer status) {
        if (postCode == null || postCode.isBlank()) {
            throw new BusinessException(400, "岗位编码不能为空");
        }
        if (postName == null || postName.isBlank()) {
            throw new BusinessException(400, "岗位名称不能为空");
        }
        if (postRepository.countByCodeExcluding(postCode.trim(), null) > 0) {
            throw new BusinessException(400, "岗位编码已存在: " + postCode.trim());
        }
        SysPost post = new SysPost();
        post.setPostCode(postCode.trim());
        post.setPostName(postName.trim());
        post.setDescription(description);
        post.setSortOrder(sortOrder != null ? sortOrder : 0);
        post.setStatus(status != null ? status : 1);
        return toVO(postRepository.save(post));
    }

    @Transactional
    public Map<String, Object> update(Long id, String postCode, String postName,
                                      String description, Integer sortOrder, Integer status) {
        SysPost post = requirePost(id);
        if (postCode != null && !postCode.isBlank()) {
            String code = postCode.trim();
            if (postRepository.countByCodeExcluding(code, id) > 0) {
                throw new BusinessException(400, "岗位编码已存在: " + code);
            }
            post.setPostCode(code);
        }
        if (postName != null && !postName.isBlank()) post.setPostName(postName.trim());
        if (description != null) post.setDescription(description);
        if (sortOrder != null) post.setSortOrder(sortOrder);
        if (status != null) post.setStatus(status);
        return toVO(postRepository.save(post));
    }

    /** 删除岗位（软删除）；有用户归属时拒绝（对齐 Node deletePost）。 */
    @Transactional
    public void delete(Long id) {
        SysPost post = requirePost(id);
        if (postRepository.countUsersByPostId(id) > 0) {
            throw new BusinessException(400, "该岗位下存在用户，无法删除");
        }
        post.setIsDeleted(1);
        postRepository.save(post);
    }

    private SysPost requirePost(Long id) {
        return postRepository.findByIdAndIsDeleted(id, 0)
                .orElseThrow(() -> new BusinessException(404, "岗位不存在: " + id));
    }

    private static Map<String, Object> toVO(SysPost p) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("id", p.getId());
        vo.put("postCode", p.getPostCode());
        vo.put("postName", p.getPostName());
        vo.put("description", p.getDescription());
        vo.put("sortOrder", p.getSortOrder());
        vo.put("status", p.getStatus());
        vo.put("createdAt", p.getCreatedAt());
        return vo;
    }
}
