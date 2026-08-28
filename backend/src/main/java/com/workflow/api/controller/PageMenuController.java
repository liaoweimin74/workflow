package com.workflow.api.controller;

import com.workflow.api.dto.MountMenuRequest;
import com.workflow.api.dto.PageMenuResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.repository.SysMenuRepository;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 页面挂接菜单 Controller。
 * 管理页面（VIEW/PAGE）与系统菜单（sys_menu）的挂接关系：
 * - mount-menu：每次调用为已发布页面创建一条新菜单（支持多挂接，不查重）
 * - getMenus：按 key 返回该页面全部关联菜单
 * - unmountMenu：软删指定菜单，解除挂接
 */
@RestController
@RequestMapping("/api/v1/pages")
public class PageMenuController {

    private final PageDefinitionService pageDefService;
    private final SysMenuRepository menuRepository;

    public PageMenuController(PageDefinitionService pageDefService,
                              SysMenuRepository menuRepository) {
        this.pageDefService = pageDefService;
        this.menuRepository = menuRepository;
    }

    /**
     * 挂接菜单：每次调用创建一条新菜单（多挂接，不要求同 path 唯一）。
     * 仅已发布（PUBLISHED）页面可挂接；DRAFT/ARCHIVED → 400。
     */
    @PostMapping("/{id}/mount-menu")
    public R<PageMenuResponse.MenuItem> mountMenu(@PathVariable String id,
                                                  @RequestBody(required = false) MountMenuRequest request) {
        PageDefinition page = pageDefService.getById(id);
        if (!"PUBLISHED".equals(page.getStatus())) {
            throw new BusinessException(400, "仅可挂接已发布的页面");
        }
        SysMenu menu = new SysMenu();
        menu.setMenuName(request != null && request.getName() != null ? request.getName() : page.getName());
        menu.setPath("/page/" + page.getKey());
        menu.setComponent("page/PageRenderer");
        menu.setPermission("page:read:" + page.getKey());
        menu.setMenuType(1);
        menu.setParentId(request != null ? request.getParentId() : null);
        menu.setSortOrder(0);
        menu.setStatus(1);
        menu.setIsDeleted(0);
        SysMenu saved = menuRepository.save(menu);
        return R.ok(toItem(saved));
    }

    /**
     * 挂接菜单列表查询：按 key 取已发布页面（404 兜底），
     * 按 path（/page/{key}）反查全部未删除菜单。
     */
    @GetMapping("/{key}/menus")
    public R<PageMenuResponse> getMenus(@PathVariable String key) {
        PageDefinition page = pageDefService.getPublishedByKey(key);
        List<SysMenu> menus = menuRepository.findByPathAndIsDeleted("/page/" + page.getKey(), 0);
        List<PageMenuResponse.MenuItem> items = menus.stream().map(this::toItem).toList();
        return R.ok(new PageMenuResponse(items));
    }

    /**
     * 解除挂接：软删指定菜单（is_deleted=1）。
     * 不存在或已软删 → 404。
     */
    @DeleteMapping("/menus/{menuId}")
    public R<Void> unmountMenu(@PathVariable Long menuId) {
        SysMenu menu = menuRepository.findById(menuId)
                .orElseThrow(() -> new BusinessException(404, "菜单不存在或已解除"));
        menu.setIsDeleted(1);
        menuRepository.save(menu);
        return R.ok();
    }

    private PageMenuResponse.MenuItem toItem(SysMenu menu) {
        PageMenuResponse.MenuItem item = new PageMenuResponse.MenuItem();
        item.setMenuId(menu.getId());
        item.setMenuName(menu.getMenuName());
        item.setPath(menu.getPath());
        item.setParentId(menu.getParentId());
        item.setPermission(menu.getPermission());
        item.setStatus(menu.getStatus());
        return item;
    }
}
