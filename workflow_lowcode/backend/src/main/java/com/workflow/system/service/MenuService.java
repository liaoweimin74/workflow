package com.workflow.system.service;

import com.workflow.system.domain.vo.MenuTree;

import java.util.List;

public interface MenuService {
    /** 全端混合树（内置数据源等内部消费方使用，非 HTTP 契约端点）。 */
    List<MenuTree> tree();

    /**
     * 管理端按端取树（对齐 node menuTree 与登录树 J4 裁定③口径）：
     * clientId 为 null 归一 portal(1)；只返回该端的根与该端子树，他端节点不泄漏。
     */
    List<MenuTree> tree(Long clientId);

    MenuTree create(com.workflow.system.domain.dto.MenuCreateRequest request);

    MenuTree update(Long id, com.workflow.system.domain.dto.MenuUpdateRequest request);

    /** 拖动调整层级与排序（parentId=null 表示根级）。 */
    MenuTree move(Long id, com.workflow.system.domain.dto.MenuMoveRequest request);

    void delete(Long id);
}