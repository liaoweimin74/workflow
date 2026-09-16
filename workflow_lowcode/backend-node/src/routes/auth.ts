/**
 * auth.ts — /api/auth/*（对齐 AuthController + AuthServiceImpl）
 *  POST /api/auth/login     登录（BCrypt + STATUS==1）
 *  POST /api/auth/logout    登出（no-op，Redis 已禁用）
 *  POST /api/auth/refresh   刷新双 token
 *  GET  /api/auth/userinfo  当前用户（authGuard）
 *  GET  /api/auth/menus    当前用户菜单树（admin 全量 / 非管理员回溯祖先）
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { all, one, type Row } from '../lib/db';
import { R, BusinessException } from '../lib/errors';
import { ok, authGuard, ah, requireBody, type AuthedRequest } from '../lib/http';
import { createAccessToken, createRefreshToken, verifyToken } from '../lib/jwt';

export const authRouter = Router();

// ---------------------------------------------------------------- UserInfo

interface UserRow {
  ID: number;
  USERNAME: string;
  NICKNAME: string | null;
  EMAIL: string | null;
  PHONE: string | null;
  AVATAR: string | null;
  ORG_ID: number | null;
  STATUS: number;
  IS_DELETED: number;
  PASSWORD: string;
}

function loadUserById(id: number): UserRow | null {
  return (one('SELECT ID, USERNAME, NICKNAME, EMAIL, PHONE, AVATAR, ORG_ID, STATUS, IS_DELETED, PASSWORD FROM SYS_USER WHERE ID = ?', [id]) as unknown as UserRow | null) ?? null;
}

function loadUserByUsername(username: string): UserRow | null {
  return (one('SELECT ID, USERNAME, NICKNAME, EMAIL, PHONE, AVATAR, ORG_ID, STATUS, IS_DELETED, PASSWORD FROM SYS_USER WHERE USERNAME = ? AND IS_DELETED = 0', [username]) as unknown as UserRow | null) ?? null;
}

function loadRoles(userId: number): { id: number; code: string }[] {
  return all(
    'SELECT r.ID, r.ROLE_CODE FROM SYS_ROLE r JOIN SYS_USER_ROLE ur ON ur.ROLE_ID = r.ID WHERE ur.USER_ID = ?',
    [userId],
  ).map((r) => ({ id: Number(r['ID']), code: String(r['ROLE_CODE']) }));
}

function loadPermissions(userId: number): string[] {
  const rows = all(
    `SELECT DISTINCT m.PERMISSION AS P FROM SYS_MENU m
     JOIN SYS_ROLE_MENU rm ON rm.MENU_ID = m.ID
     JOIN SYS_USER_ROLE ur ON ur.ROLE_ID = rm.ROLE_ID
     WHERE ur.USER_ID = ? AND m.PERMISSION IS NOT NULL AND m.PERMISSION != ''`,
    [userId],
  );
  return rows.map((r) => String(r['P']));
}

function orgNameOf(orgId: number | null): string | null {
  if (orgId == null) return null;
  const row = one('SELECT ORG_NAME FROM SYS_ORGANIZATION WHERE ID = ?', [orgId]);
  return row ? String(row['ORG_NAME']) : null;
}

/** 对齐 AuthServiceImpl.buildUserInfo —— 字段名与 Long→Number（MVC 实测）精确对齐 */
function buildUserInfo(user: UserRow) {
  const roles = loadRoles(user.ID);
  const orgId = user.ORG_ID;
  return {
    id: user.ID,
    username: user.USERNAME,
    nickname: user.NICKNAME,
    email: user.EMAIL,
    phone: user.PHONE,
    avatar: user.AVATAR,
    orgId: orgId == null ? null : orgId,
    orgName: orgNameOf(orgId),
    roles: roles.map((r) => r.code),
    permissions: loadPermissions(user.ID),
  };
}

// ---------------------------------------------------------------- 菜单树

interface MenuRow {
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

function menuRow(r: Row): MenuRow {
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

function visible(m: MenuRow): boolean {
  return m.IS_DELETED === 0 && m.STATUS === 1;
}

/** 对齐 toMenuTree：children 为空时输出 null */
function toMenuTree(m: MenuRow, authorized: Set<number> | null): Record<string, unknown> {
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

/** 对齐 getCurrentUserMenus：admin 全量，非 admin 授权菜单 + 祖先回溯 */
function currentUserMenus(userId: number): Record<string, unknown>[] {
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

// ---------------------------------------------------------------- 路由

/** POST /api/auth/login */
authRouter.post(
  '/login',
  ah(async (req, res) => {
    const body = requireBody(req.body);
    const username = body['username'];
    const password = body['password'];
    if (typeof username !== 'string' || !username) throw new BusinessException('用户名或密码错误');
    if (typeof password !== 'string' || !password) throw new BusinessException('用户名或密码错误');

    const user = loadUserByUsername(username);
    if (!user) throw new BusinessException('用户名或密码错误');
    if (!bcrypt.compareSync(password, user.PASSWORD)) throw new BusinessException('用户名或密码错误');
    if (user.STATUS !== 1) throw new BusinessException('账号已被禁用');

    const accessToken = createAccessToken(user.ID, user.USERNAME);
    const refreshToken = createRefreshToken(user.ID, user.USERNAME);
    ok(res, { accessToken, refreshToken, user: buildUserInfo(user) });
  }),
);

/** POST /api/auth/logout —— no-op（Redis 已禁用） */
authRouter.post(
  '/logout',
  ah(async (_req, res) => {
    ok(res);
  }),
);

/** POST /api/auth/refresh */
authRouter.post(
  '/refresh',
  ah(async (req, res) => {
    const body = requireBody(req.body);
    const token = body['refreshToken'];
    if (typeof token !== 'string' || !token) throw new BusinessException('Refresh Token 无效或已过期');
    const claims = verifyToken(token);
    if (!claims || claims.type !== 'refresh_token') {
      throw new BusinessException('Refresh Token 无效或已过期');
    }
    const user = loadUserById(Number(claims.sub));
    if (!user) throw new BusinessException('用户不存在');
    ok(res, {
      accessToken: createAccessToken(user.ID, user.USERNAME),
      refreshToken: createRefreshToken(user.ID, user.USERNAME),
      user: buildUserInfo(user),
    });
  }),
);

/** GET /api/auth/userinfo —— LoginResponse(null, null, userInfo) */
authRouter.get(
  '/userinfo',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const user = loadUserById(req.userId as number);
    if (!user) throw new BusinessException('用户不存在');
    ok(res, { accessToken: null, refreshToken: null, user: buildUserInfo(user) });
  }),
);

/** GET /api/auth/menus */
authRouter.get(
  '/menus',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    ok(res, currentUserMenus(req.userId as number));
  }),
);

// 语义化占位：auth 模块全部对齐后可移除
export const _internal = { R };
