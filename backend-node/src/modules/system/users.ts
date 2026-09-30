/**
 * 用户管理 —— 1:1 移植 UserController + UserServiceImpl（Task 13-4）
 * 8 端点：GET list / GET batch / GET {id} / POST / PUT {id} / DELETE {id} / PUT {id}/status / PUT {id}/reset-password
 * 语义要点（对齐 Java 源码）：
 *  - 分页 PageResult{total,page,size,rows}，page 1-based，排序 createdAt DESC；total 为 long → Jackson 序列化为字符串
 *  - list：username 模糊、nickname 与 phone 二选一模糊（OR）、status/orgId 精确、orgIds 与 roleIds 合并 OR（roleIds 走 SYS_USER_ROLE 子查询）
 *  - findAllById / findById 均不过滤 IS_DELETED → 已软删用户仍可被 {id} 与 /batch 查到（列表过滤软删，详情不滤，Java 就是这样）
 *  - 用户名唯一校验不过滤软删（findByUsername 含已删用户 → 软删用户名仍占用）
 *  - 创建默认密码 123456（BCrypt cost 10，与 BCryptPasswordEncoder 互相可验证）；roleIds 顺序插入；不校验角色存在性（无外键）
 *  - 更新：nickname/email/phone 走 hasText（空串不覆盖）、orgId/status 走 null 判断；roleIds 传入才比对（numeric 排序后比较，变化才删全量重插且按排序插入）
 *  - 删除/改状态/重置密码：仅 findById + 软删/更新，无管理员保护（Java 源码无此规则）
 *  - VO 字段差异：TreeNode 系不涉及；UserVO 含 orgName 与 roleIds（Long[] → string 数组）
 */
/* mount: /api/users */
import { Router } from "express";
import bcrypt from "bcryptjs";
import type { Request, Response } from "express";
import { ok, h } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, query, queryOne, queryRows, tx } from "../../lib/db";
import { config } from "../../config";
import {
  bodyInt,
  bodyLong,
  bodyLongList,
  hasText,
  nowStr,
  pageOf,
  parseId,
  parseLongList,
  parseLongOpt,
  vNotBlank,
  vSize,
} from "./shared";

const router = Router();

type Row = Record<string, unknown>;

/** UserVO 组装（对齐 UserServiceImpl.toVO：orgName 查 SYS_ORGANIZATION 不滤软删；roleIds 来自 SYS_USER_ROLE 全量） */
function toVO(u: Row): Row {
  const orgId = (u.orgId as string | null) ?? null;
  let orgName: string | null = null;
  if (orgId != null) {
    const org = queryOne<{ ORG_NAME: string }>("SELECT ORG_NAME FROM SYS_ORGANIZATION WHERE ID = ?", [orgId]);
    orgName = org?.ORG_NAME ?? null;
  }
  const roleIds = query<{ ROLE_ID: number }>("SELECT ROLE_ID FROM SYS_USER_ROLE WHERE USER_ID = ?", [u.id]).map((r) =>
    String(r.ROLE_ID),
  );
  return {
    id: String(u.id),
    username: u.username ?? null,
    nickname: (u.nickname as string | null) ?? null,
    email: (u.email as string | null) ?? null,
    phone: (u.phone as string | null) ?? null,
    avatar: (u.avatar as string | null) ?? null,
    orgId,
    orgName,
    status: Number(u.status),
    createdAt: (u.createdAt as string | null) ?? null,
    roleIds,
  };
}

function findRaw(id: string): Row | null {
  return queryRows("SYS_USER", "SELECT * FROM SYS_USER WHERE ID = ?", [id])[0] ?? null;
}

/** GET /api/users — 分页 + Specification 过滤 */
router.get(
  "/",
  h((req: Request, res: Response) => {
    const q = req.query as Record<string, unknown>;
    const { page, size, offset } = pageOf(q);
    const where: string[] = ["IS_DELETED = 0"];
    const params: unknown[] = [];
    if (hasText(q.username)) {
      where.push("USERNAME LIKE ?");
      params.push(`%${q.username}%`);
    }
    if (hasText(q.nickname)) {
      // nickname/phone 模糊 OR 搜索
      where.push("(NICKNAME LIKE ? OR PHONE LIKE ?)");
      params.push(`%${q.nickname}%`, `%${q.nickname}%`);
    }
    const status = parseLongOpt(q.status);
    if (status != null) {
      where.push("STATUS = ?");
      params.push(status);
    }
    const orgId = parseLongOpt(q.orgId);
    if (orgId != null) {
      where.push("ORG_ID = ?");
      params.push(orgId);
    }
    // orgIds/roleIds 合并 OR 查询
    const orParts: string[] = [];
    const orgIds = parseLongList(q.orgIds);
    if (orgIds.length) {
      orParts.push(`ORG_ID IN (${orgIds.map(() => "?").join(",")})`);
      params.push(...orgIds);
    }
    const roleIds = parseLongList(q.roleIds);
    if (roleIds.length) {
      orParts.push(`ID IN (SELECT USER_ID FROM SYS_USER_ROLE WHERE ROLE_ID IN (${roleIds.map(() => "?").join(",")}))`);
      params.push(...roleIds);
    }
    if (orParts.length) where.push(`(${orParts.join(" OR ")})`);

    const whereSql = where.join(" AND ");
    const total = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM SYS_USER WHERE ${whereSql}`, params)!.c;
    const rows = queryRows(
      "SYS_USER",
      `SELECT * FROM SYS_USER WHERE ${whereSql} ORDER BY CREATED_AT DESC, ID DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    );
    ok(res, { total: String(total), page, size, rows: rows.map(toVO) });
  }),
);

/** GET /api/users/batch?ids=1,2 — findAllById（不滤软删） */
router.get(
  "/batch",
  h((req: Request, res: Response) => {
    const ids = parseLongList(req.query.ids);
    const rows = ids.length
      ? queryRows("SYS_USER", `SELECT * FROM SYS_USER WHERE ID IN (${ids.map(() => "?").join(",")}) ORDER BY ID`, ids)
      : [];
    ok(res, rows.map(toVO));
  }),
);

/** GET /api/users/{id} — findById（不过滤 IS_DELETED，Java 语义） */
router.get(
  "/:id",
  h((req: Request, res: Response) => {
    const row = findRaw(parseId(req.params.id));
    if (!row) throw new BusinessException("用户不存在");
    ok(res, toVO(row));
  }),
);

/** POST /api/users — 创建（默认密码 123456） */
router.post(
  "/",
  h((req: Request, res: Response) => {
    const b = (req.body ?? {}) as Row;
    vNotBlank(b.username);
    vSize(b.username, 50, 2);
    vNotBlank(b.nickname);
    vSize(b.nickname, 50);
    // findByUsername不过滤软删：软删用户名仍视为已占用
    const dup = queryOne("SELECT ID FROM SYS_USER WHERE USERNAME = ?", [String(b.username)]);
    if (dup) throw new BusinessException("用户名已存在");
    const roleIds = bodyLongList(b.roleIds);
    const now = nowStr();
    const userId = tx(() => {
      const r = exec(
        `INSERT INTO SYS_USER (USERNAME, NICKNAME, PASSWORD, EMAIL, PHONE, ORG_ID, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          String(b.username),
          String(b.nickname),
          bcrypt.hashSync(config.defaultPassword, 10),
          b.email != null ? String(b.email) : null,
          b.phone != null ? String(b.phone) : null,
          bodyLong(b.orgId),
          bodyInt(b.status) ?? 1,
          now,
          now,
        ],
      );
      const uid = Number(r.lastInsertRowid);
      if (roleIds) {
        for (const rid of roleIds) exec("INSERT INTO SYS_USER_ROLE (USER_ID, ROLE_ID) VALUES (?, ?)", [uid, rid]);
      }
      return uid;
    });
    ok(res, toVO(findRaw(String(userId))!));
  }),
);

/** PUT /api/users/{id} — 更新（roleIds 未传不动；传入则比对变化后删全量重插） */
router.put(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const b = (req.body ?? {}) as Row;
    vSize(b.nickname, 50);
    const row = findRaw(id);
    if (!row) throw new BusinessException("用户不存在");
    const sets: string[] = ["UPDATED_AT = ?"];
    const params: unknown[] = [nowStr()];
    if (hasText(b.nickname)) {
      sets.push("NICKNAME = ?");
      params.push(String(b.nickname));
    }
    if (hasText(b.email)) {
      sets.push("EMAIL = ?");
      params.push(String(b.email));
    }
    if (hasText(b.phone)) {
      sets.push("PHONE = ?");
      params.push(String(b.phone));
    }
    const orgId = bodyLong(b.orgId);
    if (orgId != null) {
      sets.push("ORG_ID = ?");
      params.push(orgId);
    }
    const status = bodyInt(b.status);
    if (status != null) {
      sets.push("STATUS = ?");
      params.push(status);
    }
    const roleIds = bodyLongList(b.roleIds);
    tx(() => {
      exec(`UPDATE SYS_USER SET ${sets.join(", ")} WHERE ID = ?`, [...params, id]);
      if (roleIds != null) {
        const existing = query<{ ROLE_ID: number }>("SELECT ROLE_ID FROM SYS_USER_ROLE WHERE USER_ID = ?", [id])
          .map((r) => Number(r.ROLE_ID))
          .sort((a, z) => a - z);
        const next = [...roleIds].sort((a, z) => a - z);
        if (existing.join(",") !== next.join(",")) {
          exec("DELETE FROM SYS_USER_ROLE WHERE USER_ID = ?", [id]);
          for (const rid of next) exec("INSERT INTO SYS_USER_ROLE (USER_ID, ROLE_ID) VALUES (?, ?)", [Number(id), rid]);
        }
      }
    });
    ok(res, toVO(findRaw(id)!));
  }),
);

/** DELETE /api/users/{id} — 软删（无管理员保护，Java 源码无此规则） */
router.delete(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (!findRaw(id)) throw new BusinessException("用户不存在");
    exec("UPDATE SYS_USER SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), id]);
    ok(res);
  }),
);

/** PUT /api/users/{id}/status — status 传 null → SQLite NOT NULL 约束失败（与 Java H2 一致 → HTTP 500） */
router.put(
  "/:id/status",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (!findRaw(id)) throw new BusinessException("用户不存在");
    const status = bodyInt(((req.body ?? {}) as Row).status);
    exec("UPDATE SYS_USER SET STATUS = ?, UPDATED_AT = ? WHERE ID = ?", [status, nowStr(), id]);
    ok(res);
  }),
);

/** PUT /api/users/{id}/reset-password — 重置为默认密码 123456 */
router.put(
  "/:id/reset-password",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    if (!findRaw(id)) throw new BusinessException("用户不存在");
    exec("UPDATE SYS_USER SET PASSWORD = ?, UPDATED_AT = ? WHERE ID = ?", [
      bcrypt.hashSync(config.defaultPassword, 10),
      nowStr(),
      id,
    ]);
    ok(res);
  }),
);

export default router;
