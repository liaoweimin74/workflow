/**
 * 角色管理 —— 1:1 移植 RoleController + RoleServiceImpl（Task 13-4）
 * 6 端点：GET list / POST / PUT {id} / DELETE {id} / GET {id}/menus / PUT {id}/menus
 * 语义要点（对齐 Java 源码）：
 *  - 分页同 users：PageResult{total,page,size,rows}（total 字符串），排序 createdAt DESC
 *  - 创建唯一校验 findByRoleCode 不过滤软删（软删角色编码仍占用）；roleName/roleCode @NotBlank
 *  - 更新：roleName 走 hasText、description 走 null 判断（空串可清空描述，Java 就是这样）、status 走 null 判断
 *  - 删除：existsById（含软删行）→ 角色不存在；countByRoleId>0 → 该角色下存在用户，无法删除；无管理员角色保护（源码无此规则）
 *  - GET {id}/menus：不校验角色存在性，直接返回 SYS_ROLE_MENU 关联 id（Long → string 数组）
 *  - PUT {id}/menus：menuIds 为 null/缺省 → Java NPE → HTTP 500（R.msg "NullPointerException"）；先删全量再逐条插入
 */
/* mount: /api/roles */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, h } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, queryOne, queryRows, tx } from "../../lib/db";
import {
  bodyInt,
  hasText,
  nowStr,
  pageOf,
  parseId,
  parseLongOpt,
  vNotBlank,
  vSize,
} from "./shared";

const router = Router();

type Row = Record<string, unknown>;

/** RoleVO 组装（id/createdAt 经 queryRows 已是 string/ts 归一） */
function toVO(r: Row): Row {
  return {
    id: String(r.id),
    roleName: (r.roleName as string | null) ?? null,
    roleCode: (r.roleCode as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    status: Number(r.status),
    createdAt: (r.createdAt as string | null) ?? null,
  };
}

function findRaw(id: string): Row | null {
  return queryRows("SYS_ROLE", "SELECT * FROM SYS_ROLE WHERE ID = ?", [id])[0] ?? null;
}

/** GET /api/roles — 分页 + roleName/roleCode 模糊 + status 精确 */
router.get(
  "/",
  h((req: Request, res: Response) => {
    const q = req.query as Record<string, unknown>;
    const { page, size, offset } = pageOf(q);
    const where: string[] = ["IS_DELETED = 0"];
    const params: unknown[] = [];
    if (hasText(q.roleName)) {
      where.push("ROLE_NAME LIKE ?");
      params.push(`%${q.roleName}%`);
    }
    if (hasText(q.roleCode)) {
      where.push("ROLE_CODE LIKE ?");
      params.push(`%${q.roleCode}%`);
    }
    const status = parseLongOpt(q.status);
    if (status != null) {
      where.push("STATUS = ?");
      params.push(status);
    }
    const whereSql = where.join(" AND ");
    const total = queryOne<{ c: number }>(`SELECT COUNT(*) AS c FROM SYS_ROLE WHERE ${whereSql}`, params)!.c;
    const rows = queryRows(
      "SYS_ROLE",
      `SELECT * FROM SYS_ROLE WHERE ${whereSql} ORDER BY CREATED_AT DESC, ID DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    );
    ok(res, { total: String(total), page, size, rows: rows.map(toVO) });
  }),
);

/** POST /api/roles — 创建（编码唯一，含软删占用） */
router.post(
  "/",
  h((req: Request, res: Response) => {
    const b = (req.body ?? {}) as Row;
    vNotBlank(b.roleName);
    vSize(b.roleName, 100);
    vNotBlank(b.roleCode);
    vSize(b.roleCode, 50);
    const dup = queryOne("SELECT ID FROM SYS_ROLE WHERE ROLE_CODE = ?", [String(b.roleCode)]);
    if (dup) throw new BusinessException("角色编码已存在");
    const now = nowStr();
    const r = exec(
      `INSERT INTO SYS_ROLE (ROLE_NAME, ROLE_CODE, DESCRIPTION, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, 0, ?, ?)`,
      [
        String(b.roleName),
        String(b.roleCode),
        b.description != null ? String(b.description) : null,
        bodyInt(b.status) ?? 1,
        now,
        now,
      ],
    );
    ok(res, toVO(findRaw(String(Number(r.lastInsertRowid)))!));
  }),
);

/** PUT /api/roles/{id} — 更新（description 传 null 才不动，空串清空） */
router.put(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const b = (req.body ?? {}) as Row;
    vSize(b.roleName, 100);
    const row = findRaw(id);
    if (!row) throw new BusinessException("角色不存在");
    const sets: string[] = ["UPDATED_AT = ?"];
    const params: unknown[] = [nowStr()];
    if (hasText(b.roleName)) {
      sets.push("ROLE_NAME = ?");
      params.push(String(b.roleName));
    }
    if (b.description != null) {
      sets.push("DESCRIPTION = ?");
      params.push(String(b.description));
    }
    const status = bodyInt(b.status);
    if (status != null) {
      sets.push("STATUS = ?");
      params.push(status);
    }
    exec(`UPDATE SYS_ROLE SET ${sets.join(", ")} WHERE ID = ?`, [...params, id]);
    ok(res, toVO(findRaw(id)!));
  }),
);

/** DELETE /api/roles/{id} — 用户占用检查后软删 */
router.delete(
  "/:id",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const exists = queryOne("SELECT ID FROM SYS_ROLE WHERE ID = ?", [id]);
    if (!exists) throw new BusinessException("角色不存在");
    const users = queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM SYS_USER_ROLE WHERE ROLE_ID = ?", [id])!.c;
    if (users > 0) throw new BusinessException("该角色下存在用户，无法删除");
    exec("UPDATE SYS_ROLE SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), id]);
    ok(res);
  }),
);

/** GET /api/roles/{id}/menus — 角色-菜单关联 id 列表（不校验角色存在性，Java 语义） */
router.get(
  "/:id/menus",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const rows = queryRows("SYS_ROLE_MENU", "SELECT * FROM SYS_ROLE_MENU WHERE ROLE_ID = ?", [id]);
    ok(res, rows.map((r) => String(r.menuId)));
  }),
);

/** PUT /api/roles/{id}/menus — 全量重设角色菜单；menuIds 缺省/null → Java NPE → HTTP 500 */
router.put(
  "/:id/menus",
  h((req: Request, res: Response) => {
    const id = parseId(req.params.id);
    const b = (req.body ?? {}) as Row;
    // Java 顺序：先 existsById（角色不存在），再 deleteByRoleId，循环插入时才因 menuIds==null NPE → HTTP 500
    const exists = queryOne("SELECT ID FROM SYS_ROLE WHERE ID = ?", [id]);
    if (!exists) throw new BusinessException("角色不存在");
    if (!Array.isArray(b.menuIds)) throw new Error("NullPointerException");
    const menuIds = b.menuIds.map((m) => Number(m));
    tx(() => {
      exec("DELETE FROM SYS_ROLE_MENU WHERE ROLE_ID = ?", [id]);
      for (const mid of menuIds) {
        exec("INSERT INTO SYS_ROLE_MENU (ROLE_ID, MENU_ID) VALUES (?, ?)", [Number(id), mid]);
      }
    });
    ok(res);
  }),
);

export default router;
