/** 认证模块 —— 1:1 移植 AuthController + AuthServiceImpl（Task 13-4） */
import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { ok } from "../lib/http";
import { BusinessException } from "../lib/errors";
import { createAccessToken, createRefreshToken, verifyToken, REFRESH_TOKEN } from "../lib/jwt";
import { query, queryOne, queryRows } from "../lib/db";
import { findUserByUsername, findUserById } from "../lib/users";

const router = Router();

// ---- UserInfo / MenuTree 组装（对齐 AuthServiceImpl.buildUserInfo / getCurrentUserMenus）----

function buildUserInfo(userId: string): Record<string, unknown> {
  const user = findUserById(userId);
  if (!user) throw new BusinessException("用户不存在");
  const roleRows = query<{ ID: number; ROLE_CODE: string }>(
    `SELECT r.ID, r.ROLE_CODE FROM SYS_ROLE r JOIN SYS_USER_ROLE ur ON ur.ROLE_ID = r.ID WHERE ur.USER_ID = ?`,
    [userId],
  );
  const roleIds = roleRows.map((r) => r.ID);
  const permissions = new Set<string>();
  if (roleIds.length) {
    const ph = roleIds.map(() => "?").join(",");
    const menuIds = query<{ MENU_ID: number }>(`SELECT MENU_ID FROM SYS_ROLE_MENU WHERE ROLE_ID IN (${ph})`, roleIds).map(
      (m) => m.MENU_ID,
    );
    if (menuIds.length) {
      const ph2 = menuIds.map(() => "?").join(",");
      for (const m of query<{ PERMISSION: string | null }>(`SELECT PERMISSION FROM SYS_MENU WHERE ID IN (${ph2})`, menuIds)) {
        if (m.PERMISSION) permissions.add(m.PERMISSION);
      }
    }
  }
  let orgName: string | null = null;
  if (user.orgId) {
    const org = queryOne<{ ORG_NAME: string }>("SELECT ORG_NAME FROM SYS_ORGANIZATION WHERE ID = ?", [user.orgId]);
    orgName = org?.ORG_NAME ?? null;
  }
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
    avatar: user.avatar,
    orgId: user.orgId,
    orgName,
    roles: roleRows.map((r) => r.ROLE_CODE),
    permissions: [...permissions],
  };
}

interface MenuRow {
  id: number;
  parentId: number | null;
  menuName: string;
  menuType: number;
  path: string | null;
  component: string | null;
  permission: string | null;
  icon: string | null;
  sortOrder: number;
  status: number;
  isDeleted: number;
}

function toMenuTree(m: MenuRow, authorized: Set<number> | null, all: Map<number, MenuRow>): Record<string, unknown> {
  const children = [...all.values()]
    .filter((c) => c.parentId === m.id)
    .filter((c) => !authorized || authorized.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => toMenuTree(c, authorized, all));
  return {
    id: String(m.id),
    parentId: m.parentId != null ? String(m.parentId) : null,
    menuName: m.menuName,
    menuType: m.menuType,
    path: m.path,
    component: m.component,
    permission: m.permission,
    icon: m.icon,
    sortOrder: m.sortOrder,
    children: children.length ? children : null,
  };
}

function buildMenuTreeRows(userId: string): Record<string, unknown>[] {
  const roleIds = query<{ ROLE_ID: number }>("SELECT ROLE_ID FROM SYS_USER_ROLE WHERE USER_ID = ?", [userId]).map(
    (r) => r.ROLE_ID,
  );
  const isAdmin = roleIds.length
    ? query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM SYS_ROLE WHERE ID IN (${roleIds.map(() => "?").join(",")}) AND ROLE_CODE = 'ROLE_ADMIN'`,
        roleIds,
      )[0].c > 0
    : false;
  // queryRows 已映射为 camelCase（isDeleted/status/sortOrder…）
  const allRows = queryRows("SYS_MENU", "SELECT * FROM SYS_MENU") as unknown as MenuRow[];
  const visible = allRows.filter((m) => m.isDeleted === 0 && m.status === 1);
  const all = new Map<number, MenuRow>(visible.map((m) => [m.id, m]));

  if (isAdmin) {
    return visible
      .filter((m) => m.parentId == null)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => toMenuTree(m, null, all));
  }
  const menuIds = new Set<number>();
  if (roleIds.length) {
    for (const rm of query<{ MENU_ID: number }>(
      `SELECT MENU_ID FROM SYS_ROLE_MENU WHERE ROLE_ID IN (${roleIds.map(() => "?").join(",")})`,
      roleIds,
    )) {
      menuIds.add(rm.MENU_ID);
    }
  }
  // 回溯祖先（对齐 Java 实现）：可见集合 = 授权菜单 + 全部祖先
  const authorized = new Set<number>(menuIds);
  for (const id of menuIds) {
    let cur = all.get(id);
    while (cur?.parentId != null) {
      if (authorized.has(cur.parentId)) break;
      authorized.add(cur.parentId);
      cur = all.get(cur.parentId);
    }
  }
  const roots = [...authorized].map((id) => all.get(id)).filter((m): m is MenuRow => !!m && m.parentId == null);
  return roots
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => toMenuTree(m, authorized, all));
}

// ---- 端点 ----

/** POST /api/auth/login（白名单） */
router.post("/login", (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) throw new BusinessException("用户名或密码错误");
  const user = findUserByUsername(String(username));
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    throw new BusinessException("用户名或密码错误");
  }
  if (user.status !== 1) throw new BusinessException("账号已被禁用");
  ok(res, {
    accessToken: createAccessToken(user.id, user.username),
    refreshToken: createRefreshToken(user.id, user.username),
    userInfo: buildUserInfo(user.id),
  });
});

/** POST /api/auth/logout（Redis 已禁用 → no-op，同 Java） */
router.post("/logout", (_req, res) => ok(res));

/** POST /api/auth/refresh */
router.post("/refresh", (req: Request, res: Response) => {
  const token = String(req.body?.refreshToken ?? "");
  const payload = verifyToken(token);
  if (!payload || payload.type !== REFRESH_TOKEN) throw new BusinessException("Refresh Token 无效或已过期");
  const user = findUserById(payload.sub);
  if (!user) throw new BusinessException("用户不存在");
  ok(res, {
    accessToken: createAccessToken(user.id, user.username),
    refreshToken: createRefreshToken(user.id, user.username),
    userInfo: buildUserInfo(user.id),
  });
});

/** GET /api/auth/userinfo */
router.get("/userinfo", (req, res) => {
  ok(res, { accessToken: null, refreshToken: null, userInfo: buildUserInfo(req.loginUser!.userId) });
});

/** GET /api/auth/menus */
router.get("/menus", (req, res) => {
  ok(res, buildMenuTreeRows(req.loginUser!.userId));
});

export default router;
