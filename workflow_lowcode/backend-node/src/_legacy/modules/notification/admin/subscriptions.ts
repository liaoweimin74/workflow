/**
 * 管理端·订阅规则 —— SubscriptionController 移植（Task 13-7）
 * mount 前缀：/api/v1/admin/notification/subscriptions（4 端点，全部挂 requireNotificationAdmin）
 * 返回裸 Map{rows,total,page,size}（Java Map<String,Object> 形态；行字段 condition 来自 CONDITION_EXPR）。
 */
/* mount: /api/v1/admin/notification/subscriptions */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, requireNotificationAdmin } from "../../../lib/http";
import { BusinessException } from "../../../lib/errors";
import { exec, queryOne, queryRows } from "../../../lib/db";
import { nowStr } from "../internal";

const router = Router();
router.use(requireNotificationAdmin);

function tenantOf(req: Request): string {
  return (req.headers["x-tenant-id"] as string) || "default";
}

const VALID_CHANNELS = ["IN_APP", "SMS", "WECHAT_WORK", "WECHAT_MINIPROGRAM", "APP"];
const VALID_ACTIONS = ["ALLOW", "DENY", "FORCE"];
const VALID_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"];

function applyFields(entity: Record<string, unknown>, body: Record<string, unknown>): void {
  if (body.eventCode != null) entity.EVENT_CODE = String(body.eventCode);
  if (body.channel != null) {
    const ch = String(body.channel);
    if (!VALID_CHANNELS.includes(ch)) throw new BusinessException("未知渠道类型: " + ch, 400);
    entity.CHANNEL = ch;
  }
  if (body.priority != null) {
    const p = String(body.priority);
    if (!VALID_PRIORITIES.includes(p)) throw new BusinessException("未知优先级: " + p, 400);
    entity.PRIORITY = p;
  }
  if (body.enable != null) entity.ENABLE = String(body.enable) === "true" || body.enable === true ? 1 : 0;
  if (body.action != null) {
    const a = String(body.action);
    if (!VALID_ACTIONS.includes(a)) throw new BusinessException("未知规则动作: " + a, 400);
    entity.ACTION = a;
  }
  if (body.condition != null) entity.CONDITION_EXPR = String(body.condition);
  else if (body.conditionExpr != null) entity.CONDITION_EXPR = String(body.conditionExpr);
}

/** GET / —— 列表（eventCode 模糊，CREATED_AT 倒序） */
router.get("/", (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const size = Math.max(1, Number(req.query.size ?? 20) || 20);
  const eventCode = req.query.eventCode ? String(req.query.eventCode).trim() : null;
  const where: string[] = [];
  const params: unknown[] = [];
  if (eventCode) {
    where.push("EVENT_CODE LIKE ?");
    params.push(`%${eventCode}%`);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM MSG_SUBSCRIPTION_RULE ${whereSql}`, params)!.c;
  const raw = queryRows(
    "MSG_SUBSCRIPTION_RULE",
    `SELECT * FROM MSG_SUBSCRIPTION_RULE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  const rows = raw.map((r) => ({
    id: r.id,
    eventCode: r.eventCode,
    channel: r.channel,
    priority: r.priority,
    enable: r.enable,
    action: r.action,
    condition: r.conditionExpr,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
  }));
  ok(res, { rows, total, page, size });
});

/** POST / —— 创建 */
router.post("/", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (body.eventCode == null || String(body.eventCode).trim() === "") throw new BusinessException("eventCode 不能为空", 400);
  const entity: Record<string, unknown> = {
    TENANT_ID: tenantOf(req),
    ACTION: "ALLOW",
    ENABLE: 0,
    CREATED_AT: nowStr(),
    CREATED_BY: req.loginUser!.username,
  };
  applyFields(entity, body);
  if (!entity.CHANNEL) throw new BusinessException("channel 不能为空", 400);
  const r = exec(
    "INSERT INTO MSG_SUBSCRIPTION_RULE (TENANT_ID, EVENT_CODE, CHANNEL, PRIORITY, ENABLE, ACTION, CONDITION_EXPR, CREATED_BY, CREATED_AT) VALUES (?,?,?,?,?,?,?,?,?)",
    [entity.TENANT_ID, entity.EVENT_CODE, entity.CHANNEL, entity.PRIORITY ?? null, entity.ENABLE, entity.ACTION, entity.CONDITION_EXPR ?? null, entity.CREATED_BY, entity.CREATED_AT],
  );
  ok(res, { id: String(r.lastInsertRowid) });
});

/** PUT /:id —— 更新 */
router.put("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = queryOne<{ ID: number }>("SELECT ID FROM MSG_SUBSCRIPTION_RULE WHERE ID = ?", [id]);
  if (!existing) throw new BusinessException("订阅规则不存在: " + id);
  const entity: Record<string, unknown> = {};
  applyFields(entity, (req.body ?? {}) as Record<string, unknown>);
  exec(
    "UPDATE MSG_SUBSCRIPTION_RULE SET EVENT_CODE = COALESCE(?, EVENT_CODE), CHANNEL = COALESCE(?, CHANNEL), PRIORITY = ?, ENABLE = COALESCE(?, ENABLE), ACTION = COALESCE(?, ACTION), CONDITION_EXPR = ? WHERE ID = ?",
    [entity.EVENT_CODE ?? null, entity.CHANNEL ?? null, entity.PRIORITY ?? null, entity.ENABLE ?? null,
      entity.ACTION ?? null, entity.CONDITION_EXPR !== undefined ? entity.CONDITION_EXPR : null, id],
  );
  ok(res);
});

/** DELETE /:id —— 删除 */
router.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = queryOne<{ ID: number }>("SELECT ID FROM MSG_SUBSCRIPTION_RULE WHERE ID = ?", [id]);
  if (!existing) throw new BusinessException("订阅规则不存在: " + id);
  exec("DELETE FROM MSG_SUBSCRIPTION_RULE WHERE ID = ?", [id]);
  ok(res);
});

export default router;
