package com.workflow.system.service;

import com.workflow.system.domain.vo.MenuTree;

import java.util.List;

public interface MenuService {
    List<MenuTree> tree();

    MenuTree create(com.workflow.system.domain.dto.MenuCreateRequest request);

    MenuTree update(Long id, com.workflow.system.domain.dto.MenuUpdateRequest request);

    /** 拖动调整层级与排序（parentId=null 表示根级）。 */
    MenuTree move(Long id, com.workflow.system.domain.dto.MenuMoveRequest request);

    void delete(Long id);
}