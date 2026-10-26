package com.workflow.system.controller;

import com.workflow.common.domain.R;
import com.workflow.system.domain.dto.MenuCreateRequest;
import com.workflow.system.domain.dto.MenuMoveRequest;
import com.workflow.system.domain.dto.MenuUpdateRequest;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.service.MenuService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/menus")
public class MenuController {
    private final MenuService menuService;

    public MenuController(MenuService menuService) {
        this.menuService = menuService;
    }

    @GetMapping("/tree")
    public R<List<MenuTree>> tree(@RequestParam(required = false) Long clientId) {
        return R.ok(menuService.tree(clientId));
    }

    @PostMapping
    public R<MenuTree> create(@Valid @RequestBody MenuCreateRequest request) {
        return R.ok(menuService.create(request));
    }

    @PutMapping("/{id}")
    public R<MenuTree> update(@PathVariable Long id, @Valid @RequestBody MenuUpdateRequest request) {
        return R.ok(menuService.update(id, request));
    }

    /** 列表拖动调整层级与排序：校验层级规则并重排相关兄弟节点的 sortOrder */
    @PutMapping("/{id}/move")
    public R<MenuTree> move(@PathVariable Long id, @RequestBody MenuMoveRequest request) {
        return R.ok(menuService.move(id, request));
    }

    @DeleteMapping("/{id}")
    public R<Void> delete(@PathVariable Long id) {
        menuService.delete(id);
        return R.ok();
    }
}