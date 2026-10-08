/**
 * menu-tree.ts — 菜单树构建（自 auth.ts 原样抽取，Task 13-4）
 *
 * 来源：AuthServiceImpl 的菜单树逻辑（Task 12-b 已与 8080 逐字段对齐验证）。
 * routes/auth.ts 改为从本文件 import，行为保持不变。
 *
 * 注意：这里只服务「当前用户菜单」（visible = 未删除且启用）；
 * MenuController 的 /api/menus/tree 只过滤 isDeleted（不含 status），
 * 由 routes/menus.ts 另行实现，勿混用。
 */
import { all, type Row } from './db';

export interface MenuRow {
  ID: number;
  PARENT_ID: number | null;
  MENU_NAME: string;
  MENU_TYPE: number;
  PATH: string | null;
  COMPONENT: string | null;
  PERMISSION: string | null;
  ICON: string | null;
  SORT_ORDER: number;
  IS_DELETED: number;
  STATUS: number;
}

function loadRoles(userId: number): { id: number; code: string }[] {
  return all(
    'SELECT r.ID, r.ROLE_CODE FROM SYS_ROLE r JOIN SYS_USER_ROLE ur ON ur.ROLE_ID = r.ID WHERE ur.USER_ID = ?',
    [userId],
  ).map((r) => ({ id: Number(r['ID']), code: String(r['ROLE_CODE']) }));
}

export function menuRow(r: Row): MenuRow {
  return {
    ID: Number(r['ID']),
    PARENT_ID: r['PARENT_ID'] == null ? null : Number(r['PARENT_ID']),
    MENU_NAME: String(r['MENU_NAME']),
    MENU_TYPE: Number(r['MENU_TYPE']),
    PATH: (r['PATH'] as string | null) ?? null,
    COMPONENT: (r['COMPONENT'] as string | null) ?? null,
    PERMISSION: (r['PERMISSION'] as string | null) ?? null,
    ICON: (r['ICON'] as string | null) ?? null,
    SORT_ORDER: Number(r['SORT_ORDER'] ?? 0),
    IS_DELETED: Number(r['IS_DELETED'] ?? 0),
    STATUS: Number(r['STATUS'] ?? 1),
  };
}

export function visible(m: MenuRow): boolean {
  return m.IS_DELETED === 0 && m.STATUS === 1;
}

/** 对齐 AuthServiceImpl.toMenuTree：children 为空时输出 null */
export function toMenuTree(m: MenuRow, authorized: Set<number> | null): Record<string, unknown> {
  const childRows = all(
    'SELECT * FROM SYS_MENU WHERE PARENT_ID = ? ORDER BY SORT_ORDER',
    [m.ID],
  ).map(menuRow);
  const children = childRows
    .filter(visible)
    .filter((c) => authorized == null || authorized.has(c.ID))
    .map((c) => toMenuTree(c, authorized));
  return {
    id: m.ID,
    parentId: m.PARENT_ID,
    menuName: m.MENU_NAME,
    menuType: m.MENU_TYPE,
    path: m.PATH,
    component: m.COMPONENT,
    permission: m.PERMISSION,
    icon: m.ICON,
    sortOrder: m.SORT_ORDER,
    children: children.length === 0 ? null : children,
  };
}

/** 对齐 AuthServiceImpl.getCurrentUserMenus：admin 全量，非 admin 授权菜单 + 祖先回溯 */
export function currentUserMenus(userId: number): Record<string, unknown>[] {
  const roles = loadRoles(userId);
  const isAdmin = roles.some((r) => r.code === 'ROLE_ADMIN');

  if (isAdmin) {
    const roots = all(
      'SELECT * FROM SYS_MENU WHERE PARENT_ID IS NULL ORDER BY SORT_ORDER',
    ).map(menuRow);
    return roots.filter(visible).map((m) => toMenuTree(m, null));
  }

  const roleIds = roles.map((r) => r.id);
  if (roleIds.length === 0) return [];
  const placeholders = roleIds.map(() => '?').join(',');
  const menuIdRows = all(`SELECT DISTINCT MENU_ID FROM SYS_ROLE_MENU WHERE ROLE_ID IN (${placeholders})`, roleIds);
  const menuCache = new Map<number, MenuRow>();
  const allMenuById = new Map<number, MenuRow>();
  for (const r of all('SELECT * FROM SYS_MENU')) {
    const m = menuRow(r);
    allMenuById.set(m.ID, m);
  }
  const rootMenuIds: number[] = [];
  for (const row of menuIdRows) {
    const menuId = Number(row['MENU_ID']);
    const menu = allMenuById.get(menuId);
    if (!menu) continue;
    menuCache.set(menu.ID, menu);
    // 向上回溯祖先
    let current = menu;
    while (current.PARENT_ID != null) {
      const pid = current.PARENT_ID;
      if (menuCache.has(pid)) break;
      const parent = allMenuById.get(pid);
      if (!parent) break;
      menuCache.set(parent.ID, parent);
      current = parent;
    }
    if (current.PARENT_ID == null && !rootMenuIds.includes(current.ID)) {
      rootMenuIds.push(current.ID);
    }
  }
  const authorized = new Set(menuCache.keys());
  const roots = rootMenuIds
    .map((id) => menuCache.get(id))
    .filter((m): m is MenuRow => m != null)
    .sort((a, b) => a.SORT_ORDER - b.SORT_ORDER);
  return roots.map((m) => toMenuTree(m, authorized));
}
