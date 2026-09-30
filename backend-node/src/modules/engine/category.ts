/**
 * 流程分类——CategoryController 移植（Task 13-6）
 * mount 前缀：/api/v1/categories（5 端点）；表 WF_CATEGORY（ID/NAME/PARENT_ID/SORT_ORDER/TENANT_ID）
 */
/* mount: /api/v1/categories */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, mapRow, query, queryOne, tx } from "../../lib/db";
import { nowStr, uuid32 } from "../../lib/dialect";

const router = Router();
const T = "WF_CATEGORY";

function view(r: Record<string, unknown>) {
  const v = mapRow(T, r) as Record<string, unknown>;
  return { id: v.id, name: v.name, parentId: v.parentId, sortOrder: v.sortOrder, createdAt: v.createdAt };
}

/** GET /：平铺列表 */
router.get("/", (_req: Request, res: Response) => {
  ok(res, query(`SELECT * FROM ${T} ORDER BY SORT_ORDER, CREATED_AT`).map(view));
});

/** GET /tree：树形 */
router.get("/tree", (_req: Request, res: Response) => {
  const all = query(`SELECT * FROM ${T} ORDER BY SORT_ORDER, CREATED_AT`).map(view) as Array<Record<string, unknown> & { id: string; parentId: string | null; children?: unknown[] }>;
  const byId = new Map(all.map((c) => [c.id, c]));
  const roots: unknown[] = [];
  for (const c of all) {
    if (c.parentId && byId.has(c.parentId)) (byId.get(c.parentId)!.children ??= []).push(c);
    else roots.push(c);
  }
  ok(res, roots);
});

/** POST /：新建 { name, parentId?, sortOrder? } */
router.post("/", (req: Request, res: Response) => {
  const body = req.body as { name?: string; parentId?: string; sortOrder?: number };
  if (!body.name) throw new BusinessException("分类名称不能为空", 400);
  const id = uuid32();
  exec(`INSERT INTO ${T} (ID, CREATED_AT, NAME, PARENT_ID, SORT_ORDER, TENANT_ID) VALUES (?,?,?,?,?,?)`,
    [id, nowStr(), body.name, body.parentId ?? null, body.sortOrder ?? 0, req.headers["x-tenant-id"] as string || "default"]);
  ok(res, view(queryOne(`SELECT * FROM ${T} WHERE ID = ?`, [id])!));
});

/** PUT /{id}：更新 { name?, parentId?, sortOrder? } */
router.put("/:id", (req: Request, res: Response) => {
  const cur = queryOne<Record<string, unknown>>(`SELECT * FROM ${T} WHERE ID = ?`, [req.params.id]);
  if (!cur) throw new BusinessException("分类不存在", 404);
  const body = req.body as { name?: string; parentId?: string; sortOrder?: number };
  tx(() => {
    if (body.name !== undefined) exec(`UPDATE ${T} SET NAME = ? WHERE ID = ?`, [body.name, req.params.id]);
    if (body.parentId !== undefined) exec(`UPDATE ${T} SET PARENT_ID = ? WHERE ID = ?`, [body.parentId, req.params.id]);
    if (body.sortOrder !== undefined) exec(`UPDATE ${T} SET SORT_ORDER = ? WHERE ID = ?`, [body.sortOrder, req.params.id]);
  });
  ok(res, view(queryOne(`SELECT * FROM ${T} WHERE ID = ?`, [req.params.id])!));
});

/** DELETE /{id}：删除（叶子校验） */
router.delete("/:id", (req: Request, res: Response) => {
  const cur = queryOne<Record<string, unknown>>(`SELECT * FROM ${T} WHERE ID = ?`, [req.params.id]);
  if (!cur) throw new BusinessException("分类不存在", 404);
  const child = queryOne<{ C: number }>(`SELECT COUNT(*) C FROM ${T} WHERE PARENT_ID = ?`, [req.params.id]);
  if ((child?.C ?? 0) > 0) throw new BusinessException("存在子分类，不能删除", 400);
  exec(`DELETE FROM ${T} WHERE ID = ?`, [req.params.id]);
  ok(res, null);
});

export default router;
