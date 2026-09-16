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
import { all, one } from '../lib/db';
import { R, BusinessException } from '../lib/errors';
import { ok, authGuard, ah, requireBody, type AuthedRequest } from '../lib/http';
import { createAccessToken, createRefreshToken, verifyToken } from '../lib/jwt';
import { currentUserMenus } from '../lib/menu-tree';

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
