package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.dto.MenuCreateRequest;
import com.workflow.system.domain.dto.MenuMoveRequest;
import com.workflow.system.domain.dto.MenuUpdateRequest;
import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.repository.SysMenuRepository;
import com.workflow.system.service.MenuService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class MenuServiceImpl implements MenuService {
    /** sys_menu.menu_type：0 目录 / 1 菜单 / 2 按钮 */
    private static final int TYPE_DIRECTORY = 0;
    private static final int TYPE_MENU = 1;
    private static final int TYPE_BUTTON = 2;
    /** 向上找父级时的成环保护深度 */
    private static final int MAX_DEPTH = 32;

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
    public List<MenuTree> tree(Long clientId) {
        long client = clientId != null ? clientId : SysClient.PORTAL_CLIENT_ID;
        List<SysMenu> roots = menuRepository.findByClientIdAndParentIdIsNullOrderBySortOrder(client);
        return roots.stream()
                .filter(m -> m.getIsDeleted() == 0)
                .map(m -> toMenuTreeScoped(m, client))
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public MenuTree create(MenuCreateRequest request) {
        Long parentId = normalizeParentId(request.parentId());
        Integer parentType = null;
        if (parentId != null) {
            SysMenu parent = liveMenu(parentId);
            parentType = parent.getMenuType();
        }
        validatePlacement(request.menuType(), parentType);

        SysMenu menu = new SysMenu();
        menu.setParentId(parentId);
        menu.setMenuName(request.menuName());
        menu.setMenuType(request.menuType());
        menu.setPath(request.path());
        menu.setComponent(request.component());
        menu.setPermission(request.permission());
        menu.setIcon(request.icon());
        menu.setSortOrder(request.sortOrder() != null ? request.sortOrder() : nextSortOrder(parentId));
        menu.setStatus(request.status() != null ? request.status() : 1);
        // 按端新建（Task 8 A3 前端已携带）：非 portal 端作用域落库，缺省由实体初始值 portal(1) 兜底
        if (request.clientId() != null) {
            menu.setClientId(request.clientId());
        }
        menu = menuRepository.save(menu);
        return toMenuTree(menu);
    }

    @Override
    @Transactional
    public MenuTree update(Long id, MenuUpdateRequest request) {
        SysMenu menu = menuRepository.findById(id)
                .orElseThrow(() -> new BusinessException("菜单不存在"));
        if (request.menuType() != null && !request.menuType().equals(menu.getMenuType())) {
            // 改类型要与现有父级重新校验，否则能改出不合法的组合（如目录下的菜单被改成按钮）
            Long parentId = normalizeParentId(menu.getParentId());
            Integer parentType = parentId == null ? null : liveMenu(parentId).getMenuType();
            validatePlacement(request.menuType(), parentType);
        }
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
    public MenuTree move(Long id, MenuMoveRequest request) {
        SysMenu menu = liveMenu(id);
        Long targetParentId = normalizeParentId(request.parentId());
        Long originParentId = normalizeParentId(menu.getParentId());

        if (targetParentId != null) {
            if (targetParentId.equals(menu.getId())) {
                throw new BusinessException("不能把菜单移动到自己的子菜单之下");
            }
            requireNotInSubtree(menu.getId(), targetParentId);
            validatePlacement(menu.getMenuType(), liveMenu(targetParentId).getMenuType());
        } else {
            validatePlacement(menu.getMenuType(), null);
        }

        List<SysMenu> originSiblings = liveChildren(originParentId);
        originSiblings.removeIf(item -> item.getId().equals(menu.getId()));

        boolean sameParent = Objects.equals(targetParentId, originParentId);
        List<SysMenu> targetSiblings = sameParent ? originSiblings : liveChildren(targetParentId);
        if (!sameParent) {
            targetSiblings.removeIf(item -> item.getId().equals(menu.getId()));
        }

        int index = request.index() == null
                ? targetSiblings.size()
                : Math.max(0, Math.min(request.index(), targetSiblings.size()));
        menu.setParentId(targetParentId);
        targetSiblings.add(index, menu);

        List<SysMenu> toSave = new ArrayList<>(targetSiblings);
        renumber(targetSiblings);
        if (!sameParent) {
            renumber(originSiblings);
            toSave.addAll(originSiblings);
        }
        menuRepository.saveAll(toSave);
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
        return toVo(menu, childTrees);
    }

    /** 端作用域递归：子级同样只认本端行（历史脏数据里挂错端的子节点被过滤，对齐登录树口径） */
    private MenuTree toMenuTreeScoped(SysMenu menu, long clientId) {
        List<SysMenu> children = menuRepository.findByParentIdOrderBySortOrder(menu.getId());
        List<MenuTree> childTrees = children.stream()
                .filter(c -> c.getIsDeleted() == 0)
                .filter(c -> c.getClientId() != null && c.getClientId() == clientId)
                .map(c -> toMenuTreeScoped(c, clientId))
                .collect(Collectors.toList());
        return toVo(menu, childTrees);
    }

    private static MenuTree toVo(SysMenu menu, List<MenuTree> childTrees) {
        return new MenuTree(menu.getId(), menu.getParentId(), menu.getMenuName(),
                menu.getMenuType(), menu.getPath(), menu.getComponent(),
                menu.getPermission(), menu.getIcon(), menu.getSortOrder(),
                menu.getStatus(), menu.getClientId(),
                childTrees.isEmpty() ? null : childTrees);
    }

    /** 兼容历史数据：parentId 为 0 视同根级 */
    private static Long normalizeParentId(Long parentId) {
        return parentId == null || parentId == 0L ? null : parentId;
    }

    private SysMenu liveMenu(Long id) {
        return menuRepository.findById(id)
                .filter(m -> m.getIsDeleted() == 0)
                .orElseThrow(() -> new BusinessException("菜单不存在"));
    }

    /** 某父级下的在册子项（可变列表，便于就地重排；parentId=null 取根级） */
    private List<SysMenu> liveChildren(Long parentId) {
        List<SysMenu> children = parentId == null
                ? menuRepository.findByParentIdIsNullOrderBySortOrder()
                : menuRepository.findByParentIdOrderBySortOrder(parentId);
        return children.stream()
                .filter(m -> m.getIsDeleted() == 0)
                .collect(Collectors.toCollection(ArrayList::new));
    }

    /** 同级内按当前顺序归一化为 0..n-1 */
    private static void renumber(List<SysMenu> siblings) {
        for (int i = 0; i < siblings.size(); i++) {
            SysMenu menu = siblings.get(i);
            if (!Objects.equals(menu.getSortOrder(), i)) {
                menu.setSortOrder(i);
            }
        }
    }

    /** 未指定排序号时追加到同级末尾 */
    private int nextSortOrder(Long parentId) {
        return liveChildren(parentId).stream()
                .map(SysMenu::getSortOrder)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(-1) + 1;
    }

    /**
     * 层级规则（parentType=null 表示根级）：
     * 目录可放在根级或其他目录下；菜单必须放在目录下；按钮必须放在菜单下。
     */
    private static void validatePlacement(Integer childType, Integer parentType) {
        if (childType == null) {
            throw new BusinessException("菜单类型不能为空");
        }
        if (childType == TYPE_DIRECTORY) {
            if (parentType != null && parentType != TYPE_DIRECTORY) {
                throw new BusinessException("目录只能放在根级或其他目录下");
            }
            return;
        }
        if (childType == TYPE_MENU) {
            if (parentType == null || parentType != TYPE_DIRECTORY) {
                throw new BusinessException("菜单必须放在目录下");
            }
            return;
        }
        if (childType == TYPE_BUTTON) {
            if (parentType == null || parentType != TYPE_MENU) {
                throw new BusinessException("按钮必须放在菜单下");
            }
            return;
        }
        throw new BusinessException("未知的菜单类型");
    }

    /** 沿 parentId 上溯，途中命中被移动节点即成环 */
    private void requireNotInSubtree(Long nodeId, Long targetParentId) {
        Set<Long> visited = new HashSet<>();
        Long cursor = targetParentId;
        for (int depth = 0; cursor != null && depth < MAX_DEPTH && visited.add(cursor); depth++) {
            if (cursor.equals(nodeId)) {
                throw new BusinessException("不能把菜单移动到自己的子菜单之下");
            }
            cursor = normalizeParentId(menuRepository.findById(cursor)
                    .map(SysMenu::getParentId).orElse(null));
        }
    }
}