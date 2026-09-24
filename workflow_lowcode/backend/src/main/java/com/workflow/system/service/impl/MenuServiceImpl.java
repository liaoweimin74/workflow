package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.dto.MenuCreateRequest;
import com.workflow.system.domain.dto.MenuUpdateRequest;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.service.MenuService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class MenuServiceImpl implements MenuService {
    private final SysMenuRepository menuRepository;

    public MenuServiceImpl(SysMenuRepository menuRepository) {
        this.menuRepository = menuRepository;
    }

    @Override
    public List<MenuTree> tree() {
        List<SysMenu> roots = menuRepository.findByParentIdIsNullOrderBySortOrder();
        return roots.stream()
                .filter(m -> m.getIsDeleted() == 0)
                .map(this::toMenuTree)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public MenuTree create(MenuCreateRequest request) {
        SysMenu menu = new SysMenu();
        menu.setParentId(request.parentId());
        menu.setMenuName(request.menuName());
        menu.setMenuType(request.menuType());
        menu.setPath(request.path());
        menu.setComponent(request.component());
        menu.setPermission(request.permission());
        menu.setIcon(request.icon());
        menu.setSortOrder(request.sortOrder() != null ? request.sortOrder() : 0);
        menu.setStatus(request.status() != null ? request.status() : 1);
        menu = menuRepository.save(menu);
        return toMenuTree(menu);
    }

    @Override
    @Transactional
    public MenuTree update(Long id, MenuUpdateRequest request) {
        SysMenu menu = menuRepository.findById(id)
                .orElseThrow(() -> new BusinessException("菜单不存在"));
        if (StringUtils.hasText(request.menuName())) menu.setMenuName(request.menuName());
        if (request.menuType() != null) menu.setMenuType(request.menuType());
        if (request.path() != null) menu.setPath(request.path());
        if (request.component() != null) menu.setComponent(request.component());
        if (request.permission() != null) menu.setPermission(request.permission());
        if (request.icon() != null) menu.setIcon(request.icon());
        if (request.sortOrder() != null) menu.setSortOrder(request.sortOrder());
        if (request.status() != null) menu.setStatus(request.status());
        menu = menuRepository.save(menu);
        return toMenuTree(menu);
    }

    @Override
    @Transactional
    public void delete(Long id) {
        if (!menuRepository.existsById(id)) {
            throw new BusinessException("菜单不存在");
        }
        if (menuRepository.countByParentId(id) > 0) {
            throw new BusinessException("存在子菜单，无法删除");
        }
        SysMenu menu = menuRepository.findById(id).orElseThrow();
        menu.setIsDeleted(GlobalConstant.DELETED_YES);
        menuRepository.save(menu);
    }

    private MenuTree toMenuTree(SysMenu menu) {
        List<SysMenu> children = menuRepository.findByParentIdOrderBySortOrder(menu.getId());
        List<MenuTree> childTrees = children.stream()
                .filter(c -> c.getIsDeleted() == 0)
                .map(this::toMenuTree)
                .collect(Collectors.toList());
        return new MenuTree(menu.getId(), menu.getParentId(), menu.getMenuName(),
                menu.getMenuType(), menu.getPath(), menu.getComponent(),
                menu.getPermission(), menu.getIcon(), menu.getSortOrder(),
                childTrees.isEmpty() ? null : childTrees);
    }
}