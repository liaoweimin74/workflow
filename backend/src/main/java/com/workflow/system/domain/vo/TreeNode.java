package com.workflow.system.domain.vo;

public record TreeNode(
        Long id,
        Long parentId,
        String label,
        String code,
        Integer sortOrder,
        Integer status,
        java.util.List<TreeNode> children) {
}