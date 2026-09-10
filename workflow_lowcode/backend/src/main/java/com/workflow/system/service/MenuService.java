package com.workflow.system.service;

import com.workflow.system.domain.vo.MenuTree;

import java.util.List;

public interface MenuService {
    List<MenuTree> tree();

    MenuTree create(com.workflow.system.domain.dto.MenuCreateRequest request);

    MenuTree update(Long id, com.workflow.system.domain.dto.MenuUpdateRequest request);

    void delete(Long id);
}