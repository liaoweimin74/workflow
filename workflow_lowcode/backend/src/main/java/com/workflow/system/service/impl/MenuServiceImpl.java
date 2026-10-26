package com.workflow.system.service.impl;

import com.workflow.common.constant.GlobalConstant;
import com.workflow.common.exception.BusinessException;
import com.workflow.system.domain.dto.MenuCreateRequest;
import com.workflow.system.domain.dto.MenuMoveRequest;
import com.workflow.system.domain.dto.MenuUpdateRequest;
import com.workflow.system.domain.entity.SysClient;
import com.workflow.system.domain.entity.SysClientChannel;
import com.workflow.system.domain.entity.SysMenu;
import com.workflow.system.domain.vo.MenuTree;
import com.workflow.system.repository.SysClientChannelRepository;
import com.workflow.system.repository.SysClientRepository;
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
    /** sys_menu.menu_type：2 按钮（BUTTON 区分流判定；0 目录 / 1 菜单的三层规则见 MenuShape） */
    private static final int TYPE_BUTTON = 2;
    /** 向上找父级时的成环保护深度 */
    private static final int MAX_DEPTH = 32;
    /** 移动形态判定：H5/APP/MP 任一 enabled（对齐 node isMobileClient，渠道矩阵 J1） */
    private static final Set<String> MOBILE_CHANNEL_TYPES = Set.of("H5", "APP", "MP");

    private final SysMenuRepository menuRepository;
    private final SysClientRepository clientRepository;
    private final SysClientChannelRepository channelRepository;

    public MenuServiceImpl(SysMenuRepository menuRepository,
                           SysClientRepository clientRepository,
                           SysClientChannelRepository channelRepository) {
        this.menuRepository = menuRepository;
        this.clientRepository = clientRepository;
        this.channelRepository = channelRepository;
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
        long clientId = request.clientId() != null ? request.clientId() : SysClient.PORTAL_CLIENT_ID;
        assertPlacement(clientId, request.menuType(), parentId, null);

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
        // 按端新建（Task 8 A3 前端已携带）：非 portal 端作用域落库，缺省归一 portal(1)
        menu.setClientId(clientId);
        menu = menuRepository.save(menu);
        return toMenuTree(menu);
    }

    @Override
    @Transactional
    public MenuTree update(Long id, MenuUpdateRequest request) {
        SysMenu menu = menuRepository.findById(id)
                .orElseThrow(() -> new BusinessException("菜单不存在"));
        // zone 根 locked：带改名内容的 PUT 一律拒绝（其余字段补丁不受影响，对齐 node updateMenu）
        if (StringUtils.hasText(request.menuName())) {
            MenuShape.assertZoneRootEditable(menu.getComponent(), MenuShape.ZoneRootAction.RENAME);
        }
        if (request.menuType() != null && !request.menuType().equals(menu.getMenuType())) {
            // 改类型要与现有落点重新校验，否则能改出不合法的组合（如 TAB 区菜单被改成目录）
            assertPlacement(clientIdOf(menu), request.menuType(), menu.getParentId(), null);
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
        // zone 根 locked：分区根本身不可移动（对齐 node moveMenu 第一道闸）
        MenuShape.assertZoneRootEditable(menu.getComponent(), MenuShape.ZoneRootAction.MOVE);
        Long targetParentId = normalizeParentId(request.parentId());
        Long originParentId = normalizeParentId(menu.getParentId());

        if (targetParentId != null && targetParentId.equals(menu.getId())) {
            throw new BusinessException("不能把菜单移动到自己的子菜单之下");
        }
        if (targetParentId != null) {
            requireNotInSubtree(menu.getId(), targetParentId);
        }
        assertPlacement(clientIdOf(menu), menu.getMenuType(), targetParentId, menu.getId());

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
        SysMenu menu = liveMenu(id);
        // zone 根 locked：先于子项计数判定（分区根的文案指向「锁定」而非「有子项」）
        MenuShape.assertZoneRootEditable(menu.getComponent(), MenuShape.ZoneRootAction.DELETE);
        if (menuRepository.countByParentId(id) > 0) {
            throw new BusinessException("存在子菜单，无法删除");
        }
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
     * 多端落点校验组装（移植 node system.service.ts assertPlacement）：
     * 沿 parent 链解析 zone/depth/parentType/tabSiblingCount，再调 MenuShape 纯函数。
     *
     * <p>移动形态：目录/菜单必须上溯命中 mzone 分区根（找不到=拒绝"必须挂在…之下"）；
     * 按钮跟随菜单（BUTTON 区不占形态层级，design D5，不做上溯）。
     * 链上任一节点 client 不符=跨端拒绝；途中撞见被移动节点自身=子树拒绝。
     *
     * @param movingId move 场景下被移动节点 id（Tab 计数排除自身 + 子树检测）；create/update 传 null
     */
    private void assertPlacement(long clientId, Integer nodeType, Long rawParentId, Long movingId) {
        Long parentId = normalizeParentId(rawParentId);
        if (!isMobileClient(clientId)) {
            // WEB：现状三层规则只需要 parentType（父级归属端在取父时把关）
            Integer parentType = null;
            if (parentId != null) {
                SysMenu parent = liveMenu(parentId);
                if (!Objects.equals(clientIdOf(parent), clientId)) {
                    throw new BusinessException("不能跨客户端移动菜单");
                }
                parentType = parent.getMenuType();
            }
            MenuShape.assertPlacement(MenuShape.Zone.WEB, nodeType, 1, parentType, 0, false);
            return;
        }

        // 移动端：直接父类型先定位（BUTTON 区判定与 GRID 深度都依赖它）。
        Integer directParentType = parentId == null ? null : liveMenu(parentId).getMenuType();
        if (nodeType != null && nodeType == TYPE_BUTTON) {
            MenuShape.assertPlacement(MenuShape.Zone.BUTTON, nodeType, 1, directParentType, 0, true);
            return;
        }

        // 目录/菜单：沿 parentId 链上溯找 zone 根（component=mzone:tabs|mzone:grid）。
        MenuShape.Zone zone = null;
        Long zoneRootId = null;
        int depth = 1;
        Long cursorId = parentId;
        int hops = 0;
        while (cursorId != null) {
            SysMenu node = liveMenu(cursorId);
            if (!Objects.equals(clientIdOf(node), clientId)) {
                throw new BusinessException("不能跨客户端移动菜单");
            }
            if (movingId != null && movingId.equals(node.getId())) {
                throw new BusinessException("不能把菜单移动到自己的子菜单之下");
            }
            if (MenuShape.isZoneRootComponent(node.getComponent())) {
                zone = MenuShape.ZONE_ROOT_TABS.equals(node.getComponent())
                        ? MenuShape.Zone.TAB : MenuShape.Zone.GRID;
                zoneRootId = node.getId();
                break;
            }
            depth += 1;
            cursorId = normalizeParentId(node.getParentId());
            if (++hops > MAX_DEPTH) {
                throw new BusinessException("菜单层级过深");
            }
        }
        if (zone == null) {
            throw new BusinessException("移动端菜单必须挂在底部 Tab 区或工作台宫格区之下");
        }

        int tabSiblingCount = 0;
        if (zone == MenuShape.Zone.TAB) {
            // Tab 子项是 zone 根直接子级；计数排除被移动节点自身（对齐 node/Java removeIf）。
            List<SysMenu> tabChildren = liveChildren(zoneRootId);
            tabChildren.removeIf(item -> item.getId().equals(movingId));
            tabSiblingCount = tabChildren.size();
        }
        MenuShape.assertPlacement(zone, nodeType, depth, directParentType, tabSiblingCount, true);
    }

    /**
     * 该客户端是否移动形态：H5/APP/MP 任一 enabled（渠道矩阵 J1）。
     * portal 为 seed 内置桌面端（WEB），短路放行避免每笔存量管理端操作查库。
     */
    private boolean isMobileClient(long clientId) {
        if (clientId == SysClient.PORTAL_CLIENT_ID) {
            return false;
        }
        if (!clientRepository.existsById(clientId)) {
            throw new BusinessException("客户端不存在");
        }
        List<SysClientChannel> channels = channelRepository.findByClientIdIn(List.of(clientId));
        return channels.stream().anyMatch(c -> c.getEnabled() != null && c.getEnabled() == 1
                && MOBILE_CHANNEL_TYPES.contains(c.getChannelType()));
    }

    /** 历史行 client_id 缺失时归一 portal（对齐 tree(clientId) 与实体初始值口径） */
    private static long clientIdOf(SysMenu menu) {
        return menu.getClientId() != null ? menu.getClientId() : SysClient.PORTAL_CLIENT_ID;
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