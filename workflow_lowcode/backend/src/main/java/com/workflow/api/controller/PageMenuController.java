package com.workflow.api.controller;

import com.workflow.api.dto.MountMenuRequest;
import com.workflow.api.dto.PageMenuResponse;
import com.workflow.common.domain.R;
import com.workflow.common.exception.BusinessException;
import com.workflow.engine.page.PageDefinitionService;
import com.workflow.engine.page.entity.PageDefinition;
import com.workflow.framework.security.domain.LoginUser;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.entity.SysRole;
import com.workflow.system.domain.entity.SysRoleMenu;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.repository.SysRoleMenuRepository;
import com.workflow.system.repository.SysRoleRepository;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 页面挂接菜单 Controller。
 * 管理页面（VIEW/PAGE）与系统菜单（sys_menu）的挂接关系：
 * - mount-menu：每次调用为已发布页面创建一条新菜单（支持多挂接，不查重）
 * - overwrite：把一条已有菜单的指向切换为当前页面（入口复用，不新增菜单）
 * - getMenus：按 key 返回该页面全部关联菜单
 * - unmountMenu：软删指定菜单，解除挂接
 * 管理员挂接时自动将新菜单授权给 ROLE_ADMIN 角色，保证挂接者立即可用。
 */
@RestController
@RequestMapping("/api/v1/pages")
public class PageMenuController {

    /** sys_menu.menu_type：1 菜单（目录 0 / 按钮 2 不可作为覆盖目标）。 */
    private static final int TYPE_MENU = 1;

    /** 内置首页菜单名：侧栏固定渲染 /dashboard，覆盖该入口会出现两个「首页」。 */
    private static final String BUILTIN_HOME_MENU = "首页";

    private final PageDefinitionService pageDefService;
    private final SysMenuRepository menuRepository;
    private final SysRoleRepository roleRepository;
    private final SysRoleMenuRepository roleMenuRepository;

    public PageMenuController(PageDefinitionService pageDefService,
                              SysMenuRepository menuRepository,
                              SysRoleRepository roleRepository,
                              SysRoleMenuRepository roleMenuRepository) {
        this.pageDefService = pageDefService;
        this.menuRepository = menuRepository;
        this.roleRepository = roleRepository;
        this.roleMenuRepository = roleMenuRepository;
    }

    /**
     * 挂接菜单：每次调用创建一条新菜单（多挂接，不要求同 path 唯一）。
     * 仅已发布（PUBLISHED）页面可挂接；DRAFT/ARCHIVED → 400。
     * 当前用户为管理员时，新菜单自动授权给 ROLE_ADMIN。
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
        grantAdminRoleIfAdmin(saved);
        return R.ok(toItem(saved));
    }

    /**
     * 覆盖已有菜单：把目标菜单的入口指向改为当前页面。
     *
     * <p>菜单行本身不动（id / 名称 / 目录 / 排序 / 状态 / 角色授权全部保留），
     * 只重写 path、component、permission——原先通过角色授权看到该入口的人，
     * 覆盖后跟随新页面的权限串继续可见。仅覆盖 menuType=1 的菜单；
     * 目标已指向当前页面 → 400，避免无意义覆盖。
     */
    @PutMapping("/{id}/mount-menu/{menuId}")
    public R<PageMenuResponse.MenuItem> overwriteMenu(@PathVariable String id,
                                                      @PathVariable Long menuId) {
        PageDefinition page = pageDefService.getById(id);
        if (!"PUBLISHED".equals(page.getStatus())) {
            throw new BusinessException(400, "仅可挂接已发布的页面");
        }
        SysMenu menu = menuRepository.findById(menuId)
                .orElseThrow(() -> new BusinessException(404, "菜单不存在或已删除"));
        if (menu.getIsDeleted() != null && menu.getIsDeleted() == 1) {
            throw new BusinessException(404, "菜单不存在或已删除");
        }
        if (menu.getMenuType() == null || menu.getMenuType() != TYPE_MENU) {
            throw new BusinessException(400, "仅支持覆盖菜单类型的入口");
        }
        if (BUILTIN_HOME_MENU.equals(menu.getMenuName())) {
            throw new BusinessException(400, "首页为内置固定入口，不支持覆盖；如需替换首页内容请使用 key=dashboard 的页面");
        }
        String path = "/page/" + page.getKey();
        if (path.equals(menu.getPath())) {
            throw new BusinessException(400, "该菜单已指向当前页面");
        }
        menu.setPath(path);
        menu.setComponent("page/PageRenderer");
        menu.setPermission("page:read:" + page.getKey());
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

    /**
     * 当前用户为管理员（ROLE_ADMIN/admin）时，将新菜单授权给 ROLE_ADMIN 角色。
     * 保证管理员挂接后立即可访问；非管理员挂接不自动授权（由角色管理分配）。
     */
    private void grantAdminRoleIfAdmin(SysMenu menu) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof LoginUser loginUser)) {
            return;
        }
        boolean isAdmin = loginUser.getRoles().stream()
                .anyMatch(r -> "admin".equals(r) || "ROLE_ADMIN".equals(r));
        if (!isAdmin) {
            return;
        }
        SysRole adminRole = roleRepository.findByRoleCode("ROLE_ADMIN").orElse(null);
        if (adminRole == null) {
            return;
        }
        boolean exists = roleMenuRepository.findByRoleId(adminRole.getId()).stream()
                .anyMatch(rm -> menu.getId().equals(rm.getMenuId()));
        if (exists) {
            return;
        }
        SysRoleMenu roleMenu = new SysRoleMenu();
        roleMenu.setRoleId(adminRole.getId());
        roleMenu.setMenuId(menu.getId());
        roleMenuRepository.save(roleMenu);
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
