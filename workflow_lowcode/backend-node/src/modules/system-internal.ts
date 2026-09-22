/**
 * 低代码内部数据源对接 —— SystemInternalController 移植（Task 13-5）
 * mount 前缀：/api/v1/internal（9 端点）
 *
 * 语义对齐（Java: api/controller/SystemInternalController.java）：
 *  - 部门树扁平化（BizDataPageVO，page=0/size=N，根 parentId=""）；keyword 匹配 label/code
 *  - 用户分页（keyword 匹配 username/nickname）；metadata 固定列
 *  - dept/user 的 create/delete 复用 system 模块语义（软删、默认密码 123456）
 */
/* mount: /api/v1/internal */
import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { ok } from "../lib/http";
import { BusinessException } from "../lib/errors";
import { exec, query, queryOne, queryRows } from "../lib/db";
import { nowStr } from "../lib/dialect";

const router = Router();

// ==================== BizDataVO / BizDataPageVO 组装 ====================

export function bizVO(id: string, data: Record<string, unknown>): Record<string, unknown> {
  return { id, data, version: null, createdAt: null, updatedAt: null };
}

export function bizPage(records: Record<string, unknown>[], total: number, page: number, size: number) {
  return { records, total, page, size };
}

function col(key: string, label: string, columnType?: string): Record<string, unknown> {
  const c: Record<string, unknown> = { key, label, required: false, unique: false, indexed: false, hidden: false };
  if (columnType) c.columnType = columnType;
  return c;
}

// ==================== 部门（SYS_ORGANIZATION） ====================

interface OrgNode {
  id: string;
  parentId: string;
  label: string;
  code: string;
}

function orgNodes(): OrgNode[] {
  const rows = queryRows(
    "SYS_ORGANIZATION",
    "SELECT * FROM SYS_ORGANIZATION WHERE IS_DELETED = 0 ORDER BY SORT_ORDER, ID",
  );
  return rows.map((r) => ({
    id: String(r.id),
    parentId: r.parentId == null ? "" : String(r.parentId),
    label: String(r.orgName ?? ""),
    code: String(r.orgCode ?? ""),
  }));
}

/** 扁平化部门树（根 parentId=""；pre-order：父先于子） */
export function flattenDeptTree(keyword: string | null): Record<string, unknown>[] {
  const nodes = orgNodes();
  const byParent = new Map<string, OrgNode[]>();
  for (const n of nodes) {
    const list = byParent.get(n.parentId) ?? [];
    list.push(n);
    byParent.set(n.parentId, list);
  }
  const roots = byParent.get("") ?? nodes.filter((n) => !nodes.some((m) => m.id === n.parentId));
  const out: Record<string, unknown>[] = [];
  const walk = (list: OrgNode[]): void => {
    for (const n of list) {
      if (!keyword || n.label.includes(keyword) || n.code.includes(keyword)) {
        out.push(bizVO(n.id, { id: n.id, parentId: n.parentId, label: n.label, code: n.code }));
      }
      walk(byParent.get(n.id) ?? []);
    }
  };
  walk(roots);
  return out;
}

function deptById(id: string): Record<string, unknown> | null {
  const row = queryOne<{ ID: number; PARENT_ID: number | null; ORG_NAME: string; ORG_CODE: string }>(
    "SELECT * FROM SYS_ORGANIZATION WHERE ID = ? AND IS_DELETED = 0",
    [Number(id)],
  );
  if (!row) return null;
  return bizVO(String(row.ID), {
    id: String(row.ID),
    parentId: row.PARENT_ID == null ? "" : String(row.PARENT_ID),
    label: row.ORG_NAME,
    code: row.ORG_CODE,
  });
}

// ==================== 用户（SYS_USER） ====================

/** 单用户 → BizDataVO（nickname 缺省 username 兜底逻辑不适用于此处，Java toUserRow 直出字段） */
export function userBizVO(u: Record<string, unknown>): Record<string, unknown> {
  return bizVO(String(u.id), {
    id: String(u.id),
    username: (u.username as string | null) ?? null,
    nickname: (u.nickname as string | null) ?? null,
    orgId: u.orgId == null ? null : String(u.orgId),
    orgName: (u.orgName as string | null) ?? null,
    status: Number(u.status ?? 0),
  });
}

/** 用户分页（keyword 匹配 username/nickname；page 1-based） */
export function usersPage(keyword: string | null, page: number, size: number) {
  const where: string[] = ["IS_DELETED = 0"];
  const params: unknown[] = [];
  if (keyword) {
    where.push("(USERNAME LIKE ? OR NICKNAME LIKE ?)");
    params.push("%" + keyword + "%", "%" + keyword + "%");
  }
  const totalRow = queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM SYS_USER WHERE ${where.join(" AND ")}`, params);
  const rows = queryRows(
    "SYS_USER",
    `SELECT * FROM SYS_USER WHERE ${where.join(" AND ")} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (Math.max(page, 1) - 1) * size],
  );
  const records = rows.map((u) => {
    let orgName: string | null = null;
    if (u.orgId != null) {
      const org = queryOne<{ ORG_NAME: string }>("SELECT ORG_NAME FROM SYS_ORGANIZATION WHERE ID = ?", [u.orgId]);
      orgName = org?.ORG_NAME ?? null;
    }
    return userBizVO({ ...u, orgName });
  });
  return bizPage(records, totalRow?.c ?? 0, Math.max(page, 1), size);
}

export function userGetById(id: string): Record<string, unknown> {
  const u = queryRows("SYS_USER", "SELECT * FROM SYS_USER WHERE ID = ? LIMIT 1", [Number(id)])[0];
  if (!u) throw new BusinessException("用户不存在");
  let orgName: string | null = null;
  if (u.orgId != null) {
    const org = queryOne<{ ORG_NAME: string }>("SELECT ORG_NAME FROM SYS_ORGANIZATION WHERE ID = ?", [u.orgId]);
    orgName = org?.ORG_NAME ?? null;
  }
  return userBizVO({ ...u, orgName });
}

// ==================== 端点 ====================

/** GET /api/v1/internal/system/dept-tree?keyword= */
router.get("/system/dept-tree", (req: Request, res: Response) => {
  const keyword = req.query.keyword == null ? null : (String(req.query.keyword).trim() || null);
  const flattened = flattenDeptTree(keyword);
  ok(res, bizPage(flattened, flattened.length, 0, flattened.length));
});

/** GET /api/v1/internal/system/dept-tree/metadata */
router.get("/system/dept-tree/metadata", (_req: Request, res: Response) => {
  ok(res, {
    columns: [col("id", "ID"), col("parentId", "父节点"), col("label", "名称"), col("code", "编码")],
    writable: true,
    formKey: null,
  });
});

/** GET /api/v1/internal/system/users?keyword=&page=&size= */
router.get("/system/users", (req: Request, res: Response) => {
  const keyword = req.query.keyword == null ? null : (String(req.query.keyword).trim() || null);
  const page = Math.max(Number(req.query.page ?? 1) || 1, 1);
  const size = Number(req.query.size ?? 20) || 20;
  ok(res, usersPage(keyword, page, size));
});

/** GET /api/v1/internal/system/users/metadata */
router.get("/system/users/metadata", (_req: Request, res: Response) => {
  ok(res, {
    columns: [
      col("id", "ID"), col("username", "用户名"), col("nickname", "昵称"),
      col("orgId", "组织ID"), col("orgName", "组织名称"), col("status", "状态", "TINYINT"),
    ],
    writable: true,
    formKey: null,
  });
});

/** GET /api/v1/internal/system/users/{id} */
router.get("/system/users/:id", (req: Request, res: Response) => {
  ok(res, userGetById(req.params.id));
});

/** POST /api/v1/internal/system/dept —— body {orgName, orgCode} */
router.post("/system/dept", (req: Request, res: Response) => {
  const orgName = String(req.body?.orgName ?? "");
  const orgCode = String(req.body?.orgCode ?? "");
  if (!orgName) throw new BusinessException("部门名称不能为空");
  if (!orgCode) throw new BusinessException("部门编码不能为空");
  const now = nowStr();
  const r = exec(
    `INSERT INTO SYS_ORGANIZATION (IS_DELETED, UPDATED_AT, CREATED_AT, ORG_CODE, ORG_NAME, PARENT_ID, STATUS)
     VALUES (0, ?, ?, ?, ?, NULL, 1)`,
    [now, now, orgCode, orgName],
  );
  ok(res, deptById(String(r.lastInsertRowid)));
});

/** DELETE /api/v1/internal/system/dept/{id}（软删） */
router.delete("/system/dept/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = queryOne("SELECT ID FROM SYS_ORGANIZATION WHERE ID = ? AND IS_DELETED = 0", [id]);
  if (!row) throw new BusinessException("部门不存在", 404);
  exec("UPDATE SYS_ORGANIZATION SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), id]);
  ok(res);
});

/** POST /api/v1/internal/system/user —— body {username, nickname, orgId?}（默认密码 123456） */
router.post("/system/user", (req: Request, res: Response) => {
  const username = String(req.body?.username ?? "");
  const nickname = req.body?.nickname == null ? null : String(req.body.nickname);
  const orgId = req.body?.orgId == null ? null : Number(req.body.orgId);
  if (!username) throw new BusinessException("用户名不能为空");
  const dup = queryOne("SELECT ID FROM SYS_USER WHERE USERNAME = ?", [username]);
  if (dup) throw new BusinessException("用户名已存在: " + username);
  const now = nowStr();
  const r = exec(
    `INSERT INTO SYS_USER (IS_DELETED, UPDATED_AT, CREATED_AT, USERNAME, NICKNAME, PASSWORD, ORG_ID, STATUS)
     VALUES (0, ?, ?, ?, ?, ?, ?, 1)`,
    [now, now, username, nickname, bcrypt.hashSync("123456", 10), orgId],
  );
  ok(res, userGetById(String(r.lastInsertRowid)));
});

/** DELETE /api/v1/internal/system/user/{id}（软删） */
router.delete("/system/user/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const row = queryOne("SELECT ID FROM SYS_USER WHERE ID = ?", [id]);
  if (!row) throw new BusinessException("用户不存在", 404);
  exec("UPDATE SYS_USER SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), id]);
  ok(res);
});

export default router;
