package com.workflow.system.domain.vo;

import java.util.List;

public record MenuTree(
        Long id,
        Long parentId,
        String menuName,
        Integer menuType,
        String path,
        String component,
        String permission,
        String icon,
        Integer sortOrder,
        List<MenuTree> children) {
}