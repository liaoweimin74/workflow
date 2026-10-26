package com.workflow.system.service.impl;

import com.workflow.common.exception.BusinessException;

/**
 * 端形态校验器纯函数（移植 backend-node src/system/service/menu-shape.ts，
 * 2026-10-26 A 组裁定；口径基准 Node menu-shape.spec.ts 与本类 MenuServicePlacementTest）。
 *
 * <ul>
 *   <li>WEB 区沿用现状三层规则（本类是原 MenuServiceImpl.validatePlacement 的归宿，文案逐字不变）；</li>
 *   <li>移动端（H5/APP/MP 任一 enabled）：TAB 区 = 底部 Tab（mzone:tabs 直子级，只放菜单、只认一级、
 *       总数 ≤5——下限 2 是终态完整性要求，不在插入时拦截，首条必须可写）；GRID 区 = 工作台宫格
 *       （mzone:grid 子树，深度 ≤2）；BUTTON 区 = 按钮跟随菜单（不占形态层级）；</li>
 *   <li>mzone 分区根 locked：删除/移动/改名一律拒绝（assertZoneRootEditable）。</li>
 * </ul>
 */
final class MenuShape {

    /** 落点所在形态区域。 */
    enum Zone { WEB, TAB, GRID, BUTTON }

    /** sys_menu.menu_type：0 目录 / 1 菜单 / 2 按钮（与 V1 seed / node 侧一致）。 */
    private static final int TYPE_DIRECTORY = 0;
    private static final int TYPE_MENU = 1;
    private static final int TYPE_BUTTON = 2;

    /** TAB 上限（下限 2 是终态完整性要求，不在插入时拦截——首条必须允许写入）。 */
    private static final int TAB_MAX = 5;
    private static final int GRID_MAX_DEPTH = 2;

    /** zone 根目录的 component 标识（seed 由 V52 落库；此处只认约定值）。 */
    static final String ZONE_ROOT_TABS = "mzone:tabs";
    static final String ZONE_ROOT_GRID = "mzone:grid";

    private MenuShape() {
    }

    /** 分区根 locked 的动作维度。 */
    enum ZoneRootAction {
        DELETE("删除"), MOVE("移动"), RENAME("改名");

        private final String verb;

        ZoneRootAction(String verb) {
            this.verb = verb;
        }
    }

    /**
     * 落点合法性校验；违规抛 BusinessException（对齐现状 MenuServiceImpl 的拒绝语义，
     * J1 裁定 BusinessException(400,msg) ≙ node ValidationError/BusinessException）。
     *
     * @param zone            落点所属形态区域（组装层沿 parent 链推导）
     * @param nodeType        被放置节点的类型 0/1/2
     * @param depth           被放置在第几层（1=区域根直下）
     * @param parentType      落点父节点类型；null=区域根直下
     * @param tabSiblingCount TAB 区现有子项数（判 2~5 上限）；其他区域传 0
     * @param mobile          目标客户端是否移动形态（H5/APP/MP 任一 enabled）
     */
    static void assertPlacement(Zone zone, Integer nodeType, int depth, Integer parentType,
                                int tabSiblingCount, boolean mobile) {
        if (nodeType == null) {
            throw new BusinessException("菜单类型不能为空");
        }
        // 形态与区域必须匹配：WEB 区只属桌面端，TAB/GRID/BUTTON 只属移动端。
        if (zone == Zone.WEB && mobile) {
            throw new BusinessException("移动形态客户端不使用 WEB 三层区域");
        }
        if (zone != Zone.WEB && !mobile) {
            throw new BusinessException("桌面端客户端没有 " + zone + " 形态区域");
        }
        if (nodeType != TYPE_DIRECTORY && nodeType != TYPE_MENU && nodeType != TYPE_BUTTON) {
            throw new BusinessException("未知的菜单类型");
        }

        switch (zone) {
            case WEB -> assertWebPlacement(nodeType, parentType);
            case TAB -> assertTabPlacement(nodeType, depth, tabSiblingCount);
            case GRID -> assertGridPlacement(nodeType, depth);
            case BUTTON -> assertButtonPlacement(nodeType, parentType);
        }
    }

    /** 现状三层规则，文案逐字沿用 MenuServiceImpl.validatePlacement（MoveTest 已逐条钉住）。 */
    private static void assertWebPlacement(int nodeType, Integer parentType) {
        if (nodeType == TYPE_DIRECTORY) {
            if (parentType != null && parentType != TYPE_DIRECTORY) {
                throw new BusinessException("目录只能放在根级或其他目录下");
            }
            return;
        }
        if (nodeType == TYPE_MENU) {
            if (parentType == null || parentType != TYPE_DIRECTORY) {
                throw new BusinessException("菜单必须放在目录下");
            }
            return;
        }
        // 按钮
        if (parentType == null || parentType != TYPE_MENU) {
            throw new BusinessException("按钮必须放在菜单下");
        }
    }

    private static void assertTabPlacement(int nodeType, int depth, int tabSiblingCount) {
        if (nodeType != TYPE_MENU) {
            throw new BusinessException("底部 Tab 区只能放菜单（一级菜单 2~5 个）");
        }
        if (depth != 1) {
            throw new BusinessException("底部 Tab 区只认一级节点");
        }
        if (tabSiblingCount + 1 > TAB_MAX) {
            throw new BusinessException("底部 Tab 最多 " + TAB_MAX + " 个菜单（现有 " + tabSiblingCount + " 个）");
        }
    }

    private static void assertGridPlacement(int nodeType, int depth) {
        if (nodeType == TYPE_BUTTON) {
            // 按钮不占屏：移动端宫格里不放按钮（BUTTON 区语义；组装层已提前分流，此处防御）。
            throw new BusinessException("工作台宫格不放按钮，按钮跟随菜单");
        }
        if (depth > GRID_MAX_DEPTH) {
            throw new BusinessException("工作台内层级最多 " + GRID_MAX_DEPTH + " 层");
        }
    }

    private static void assertButtonPlacement(int nodeType, Integer parentType) {
        if (nodeType != TYPE_BUTTON) {
            throw new BusinessException("按钮区只能放按钮");
        }
        if (parentType == null || parentType != TYPE_MENU) {
            throw new BusinessException("按钮必须放在菜单下");
        }
    }

    /** component 是否为 zone 根标识。 */
    static boolean isZoneRootComponent(String component) {
        return ZONE_ROOT_TABS.equals(component) || ZONE_ROOT_GRID.equals(component);
    }

    /** zone 根目录 locked：对它的删除/移动/改名一律拒绝（对普通节点无操作）。 */
    static void assertZoneRootEditable(String component, ZoneRootAction action) {
        if (!isZoneRootComponent(component)) {
            return;
        }
        String label = ZONE_ROOT_TABS.equals(component) ? "底部 Tab 区" : "工作台宫格区";
        throw new BusinessException(label + "为锁定根目录，不允许" + action.verb);
    }
}
