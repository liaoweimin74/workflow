/** 共享用户查询工具（供 auth/task/instance/notification 等模块使用） */
import { query, queryOne, queryRows, mapRow } from "./db";

export interface UserLite {
  id: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
  email: string | null;
  phone: string | null;
  orgId: string | null;
  status: number;
}

export function findUserById(id: string): UserLite | null {
  const raw = queryOne<Record<string, unknown>>(
    "SELECT * FROM SYS_USER WHERE ID = ? AND IS_DELETED = 0",
    [id],
  );
  if (!raw) return null;
  const r = mapRow("SYS_USER", raw) as Record<string, unknown>;
  return {
    id: String(r.id),
    username: String(r.username),
    nickname: (r.nickname as string) ?? null,
    avatar: (r.avatar as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    orgId: r.orgId != null ? String(r.orgId) : null,
    status: Number(r.status),
  };
}

export function findUserByUsername(username: string): (UserLite & { password: string }) | null {
  const raw = queryOne<Record<string, unknown>>(
    "SELECT * FROM SYS_USER WHERE USERNAME = ? AND IS_DELETED = 0",
    [username],
  );
  if (!raw) return null;
  const r = mapRow("SYS_USER", raw) as Record<string, unknown>;
  return {
    id: String(r.id),
    username: String(r.username),
    nickname: (r.nickname as string) ?? null,
    avatar: (r.avatar as string) ?? null,
    email: (r.email as string) ?? null,
    phone: (r.phone as string) ?? null,
    orgId: r.orgId != null ? String(r.orgId) : null,
    status: Number(r.status),
    password: String(r.password),
  };
}

/** 批量取 id → 用户显示信息映射（审批人渲染用） */
export function userNameMap(ids: string[]): Record<string, { username: string; nickname: string | null; avatar: string | null }> {
  const uniq = [...new Set(ids.filter(Boolean))];
  const map: Record<string, { username: string; nickname: string | null; avatar: string | null }> = {};
  if (!uniq.length) return map;
  const placeholders = uniq.map(() => "?").join(",");
  const rows = queryRows(
    "SYS_USER",
    `SELECT * FROM SYS_USER WHERE ID IN (${placeholders})`,
    uniq,
  );
  for (const r of rows) {
    map[String(r.id)] = {
      username: String(r.username),
      nickname: (r.nickname as string) ?? null,
      avatar: (r.avatar as string) ?? null,
    };
  }
  return map;
}

/** 用户角色 code 列表 */
export function roleCodesOfUser(userId: string): string[] {
  return query<{ ROLE_CODE: string }>(
    `SELECT r.ROLE_CODE FROM SYS_ROLE r
     JOIN SYS_USER_ROLE ur ON ur.ROLE_ID = r.ID
     WHERE ur.USER_ID = ? AND r.IS_DELETED = 0`,
    [userId],
  ).map((r) => r.ROLE_CODE);
}

/** 某角色下全部启用用户 id（任务分配用） */
export function userIdsOfRoleCode(roleCode: string): string[] {
  return query<{ ID: number }>(
    `SELECT u.ID FROM SYS_USER u
     JOIN SYS_USER_ROLE ur ON ur.USER_ID = u.ID
     JOIN SYS_ROLE r ON r.ID = ur.ROLE_ID
     WHERE r.ROLE_CODE = ? AND u.IS_DELETED = 0 AND u.STATUS = 1`,
    [roleCode],
  ).map((r) => String(r.ID));
}

export function allActiveUsers(): UserLite[] {
  return (queryRows("SYS_USER", "SELECT * FROM SYS_USER WHERE IS_DELETED = 0 AND STATUS = 1") as Record<string, unknown>[]).map(
    (r) => ({
      id: String(r.id),
      username: String(r.username),
      nickname: (r.nickname as string) ?? null,
      avatar: (r.avatar as string) ?? null,
      email: (r.email as string) ?? null,
      phone: (r.phone as string) ?? null,
      orgId: r.orgId != null ? String(r.orgId) : null,
      status: Number(r.status),
    }),
  );
}

export { query };
