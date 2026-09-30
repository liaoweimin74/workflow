/**
 * 管理端·消息事件 —— EventDefinitionController + NotificationEventService 移植（Task 13-7）
 * mount 前缀：/api/v1/admin/notification/events（5 端点，全部挂 requireNotificationAdmin）
 *
 * Java 语义对齐：
 *  - GET：PageResult{total,page,size,rows}，租户过滤 + enabled 精确 + keyword（eventCode/eventName OR 模糊），
 *    CREATED_AT 倒序
 *  - POST：eventCode 正则 ^[A-Z][A-Z0-9_]{0,63}$、eventName 必填、(tenant,eventCode) 唯一→409
 *  - PUT：租户过滤 404；eventName 必填
 *  - DELETE：被模板或订阅规则引用→409
 *  - toggle：ENABLED 翻转 + updatedBy
 */
/* mount: /api/v1/admin/notification/events */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, requireNotificationAdmin } from "../../../lib/http";
import { BusinessException } from "../../../lib/errors";
import { exec, queryOne, queryRows } from "../../../lib/db";
import { nowStr } from "../internal";

const router = Router();
router.use(requireNotificationAdmin);

const CODE_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/;

function tenantOf(req: Request): string {
  return (req.headers["x-tenant-id"] as string) || "default";
}

function loadByTenant(id: number, tenantId: string): void {
  const row = queryOne<{ ID: number }>(
    "SELECT ID FROM MSG_EVENT_DEFINITION WHERE ID = ? AND TENANT_ID = ?",
    [id, tenantId],
  );
  if (!row) throw new BusinessException("事件不存在: " + id, 404);
}

/** GET / —— 事件分页列表 */
router.get("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const size = Math.max(1, Number(req.query.size ?? 20) || 20);
  const keyword = req.query.keyword ? String(req.query.keyword).trim() : null;
  const enabledRaw = req.query.enabled;
  const where = ["TENANT_ID = ?"];
  const params: unknown[] = [tenantId];
  if (enabledRaw === "true" || enabledRaw === "false") {
    where.push("ENABLED = ?");
    params.push(enabledRaw === "true" ? 1 : 0);
  }
  if (keyword) {
    where.push("(EVENT_CODE LIKE ? OR EVENT_NAME LIKE ?)");
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const whereSql = "WHERE " + where.join(" AND ");
  const total = queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM MSG_EVENT_DEFINITION ${whereSql}`, params)!.c;
  const rows = queryRows(
    "MSG_EVENT_DEFINITION",
    `SELECT * FROM MSG_EVENT_DEFINITION ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  ok(res, { total, page, size, rows });
});

/** POST / —— 创建事件 */
router.post("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const operator = req.loginUser!.username;
  const body = (req.body ?? {}) as Record<string, string>;
  const eventCode = body.eventCode ?? "";
  const eventName = body.eventName ?? "";
  if (!eventCode || !CODE_REGEX.test(eventCode)) {
    throw new BusinessException("事件代码必须为大写字母、数字和下划线，且首字符为大写字母", 400);
  }
  if (!eventName || !eventName.trim()) throw new BusinessException("事件名称不能为空");
  const dup = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM MSG_EVENT_DEFINITION WHERE TENANT_ID = ? AND EVENT_CODE = ?",
    [tenantId, eventCode],
  )!;
  if (dup.c > 0) throw new BusinessException("事件代码已存在: " + eventCode, 409);
  const now = nowStr();
  const r = exec(
    "INSERT INTO MSG_EVENT_DEFINITION (TENANT_ID, EVENT_CODE, EVENT_NAME, DESCRIPTION, BUSINESS_DOMAIN, ENABLED, CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT) VALUES (?,?,?,?,?, 1, ?, ?, ?, ?)",
    [tenantId, eventCode, eventName, body.description ?? null, body.businessDomain ?? null,
      operator, now, operator, now],
  );
  const rows = queryRows("MSG_EVENT_DEFINITION", "SELECT * FROM MSG_EVENT_DEFINITION WHERE ID = ?", [Number(r.lastInsertRowid)]);
  ok(res, rows[0]);
});

/** PUT /:id —— 更新事件 */
router.put("/:id", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const id = Number(req.params.id);
  loadByTenant(id, tenantId);
  const body = (req.body ?? {}) as Record<string, string>;
  const eventName = body.eventName ?? "";
  if (!eventName || !eventName.trim()) throw new BusinessException("事件名称不能为空");
  exec(
    "UPDATE MSG_EVENT_DEFINITION SET EVENT_NAME = ?, DESCRIPTION = ?, BUSINESS_DOMAIN = ?, UPDATED_BY = ?, UPDATED_AT = ? WHERE ID = ? AND TENANT_ID = ?",
    [eventName, body.description ?? null, body.businessDomain ?? null, req.loginUser!.username, nowStr(), id, tenantId],
  );
  const rows = queryRows("MSG_EVENT_DEFINITION", "SELECT * FROM MSG_EVENT_DEFINITION WHERE ID = ?", [id]);
  ok(res, rows[0]);
});

/** DELETE /:id —— 删除事件（被引用→409） */
router.delete("/:id", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const id = Number(req.params.id);
  loadByTenant(id, tenantId);
  const event = queryOne<{ EVENT_CODE: string }>(
    "SELECT EVENT_CODE FROM MSG_EVENT_DEFINITION WHERE ID = ? AND TENANT_ID = ?",
    [id, tenantId],
  )!;
  const refTemplate = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM MSG_TEMPLATE WHERE TENANT_ID = ? AND EVENT_CODE = ?",
    [tenantId, event.EVENT_CODE],
  )!;
  const refRule = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM MSG_SUBSCRIPTION_RULE WHERE TENANT_ID = ? AND EVENT_CODE = ?",
    [tenantId, event.EVENT_CODE],
  )!;
  if (refTemplate.c > 0 || refRule.c > 0) {
    throw new BusinessException("事件已被模板或订阅规则引用，不能删除", 409);
  }
  exec("DELETE FROM MSG_EVENT_DEFINITION WHERE ID = ?", [id]);
  ok(res);
});

/** POST /:id/toggle —— 启用/停用翻转 */
router.post("/:id/toggle", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const id = Number(req.params.id);
  loadByTenant(id, tenantId);
  const row = queryOne<{ ENABLED: number }>(
    "SELECT ENABLED FROM MSG_EVENT_DEFINITION WHERE ID = ? AND TENANT_ID = ?",
    [id, tenantId],
  )!;
  exec(
    "UPDATE MSG_EVENT_DEFINITION SET ENABLED = ?, UPDATED_BY = ?, UPDATED_AT = ? WHERE ID = ?",
    [row.ENABLED ? 0 : 1, req.loginUser!.username, nowStr(), id],
  );
  ok(res);
});

export default router;
