// ---------------------------------------------------------------------
// 认证中间件：对齐 JwtAuthenticationFilter + SecurityConfig
//  - 白名单：POST /api/auth/login、GET /api/v1/notifications/sse
//  - Authorization: Bearer <access_token>；type 必须 = access_token
//  - 未认证 → HTTP 401 {code:401, msg:"未登录或Token已过期", data:null}
//  - 每次请求重建 LoginUser（roles + permissions = 角色菜单 permission 集合）
//  - 租户：X-Tenant-Id header（可选，存 res.locals.tenantId）
// ---------------------------------------------------------------------
import type { Request, Response, NextFunction } from 'express'
import { verifyToken } from './jwt'
import { BizError } from '../contract'
import { one, all } from '../db'

export interface AuthUser {
  id: string
  username: string
  nickname: string
  roles: string[]
  permissions: string[]
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser?: AuthUser
    }
  }
}

/** 免认证白名单（对齐 SecurityConfig permitAll） */
const WHITELIST: Array<{ method: string; path: RegExp }> = [
  { method: 'POST', path: /^\/api\/auth\/login$/ },
  { method: 'GET', path: /^\/api\/v1\/notifications\/sse$/ },
]

/** 提取角色权限（对齐 buildLoginUser：permissions = 角色可见菜单 permission 非空集合） */
export function buildAuthUser(userId: string): AuthUser | null {
  const u = one<any>(
    'SELECT id, username, nickname, status FROM sys_user WHERE id = ? AND is_deleted = 0',
    Number(userId),
  )
  if (!u || u.status !== 1) return null
  const roles = all<{ role_code: string }>(
    `SELECT r.role_code FROM sys_role r
     JOIN sys_user_role ur ON ur.role_id = r.id
     WHERE ur.user_id = ? AND r.status = 1`,
    Number(userId),
  ).map((r) => r.role_code)
  const permissions = roles.length
    ? all<{ permission: string }>(
        `SELECT DISTINCT m.permission FROM sys_menu m
         JOIN sys_role_menu rm ON rm.menu_id = m.id
         JOIN sys_role r ON r.id = rm.role_id
         JOIN sys_user_role ur ON ur.role_id = r.id
         WHERE ur.user_id = ? AND m.permission IS NOT NULL AND m.permission != ''`,
        Number(userId),
      ).map((r) => r.permission)
    : []
  return { id: String(u.id), username: u.username, nickname: u.nickname, roles, permissions }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 白名单放行
  if (WHITELIST.some((w) => w.method === req.method && w.path.test(req.path))) {
    next()
    return
  }
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  const payload = token ? verifyToken(token, 'access_token') : null
  if (!payload) {
    res.status(401).json({ code: 401, msg: '未登录或Token已过期', data: null })
    return
  }
  const user = buildAuthUser(payload.sub)
  if (!user) {
    res.status(401).json({ code: 401, msg: '未登录或Token已过期', data: null })
    return
  }
  req.authUser = user
  // 租户（可选）
  const tenant = req.headers['x-tenant-id']
  if (tenant) (res.locals as any).tenantId = String(tenant)
  next()
}

/** 当前登录用户（无则 401 语义） */
export function currentUser(req: Request): AuthUser {
  if (!req.authUser) throw new BizError(401, '未登录或Token已过期')
  return req.authUser
}

/** 管理员判定（对齐 NotificationAdminAuthorization.requireAdmin：ROLE_ADMIN 或 admin） */
export function requireAdmin(req: Request): AuthUser {
  const u = currentUser(req)
  if (!u.roles.includes('ROLE_ADMIN') && !u.roles.includes('admin')) {
    throw new BizError(403, '需要管理员权限')
  }
  return u
}

/** 必填租户（对齐 TenantProvider.getTenantId 强制场景） */
export function requireTenant(req: Request): string {
  const t = (res4tenant(req) as string) || ''
  if (!t) {
    const err = new Error('Tenant ID is not set') as any
    err.tenantMissing = true
    throw err
  }
  return t
}

function res4tenant(_req: Request): unknown {
  return undefined
}
