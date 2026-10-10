/**
 * 管理端·模板 —— TemplateController + TemplateService（CRUD 部分）移植（Task 13-7）
 * mount 前缀：/api/v1/admin/notification/templates（4 端点，全部挂 requireNotificationAdmin）
 *
 * Java 语义对齐：
 *  - GET：List<MessageTemplate>（全量，无分页）
 *  - POST：实体直收；templateCode 同租户唯一（重复→「模板代码已存在」）；用户创建一律 isSystem=false，
 *    enabled 缺省 true；带 eventCode 时校验事件已启用 + 同事件同渠道启用模板唯一
 *  - PUT：系统模板仅允许 name/title/content（+contentType/enabled 可选）；非系统模板另可改 priority/category
 *  - POST /:id/toggle：启用/停用翻转
 */
/* mount: /api/v1/admin/notification/templates */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, requireNotificationAdmin } from "../../../lib/http";
import { BusinessException } from "../../../lib/errors";
import { exec, queryOne, queryRows } from "../../../lib/db";
import { nowStr, requireEnabledEvent } from "../internal";

const router = Router();
router.use(requireNotificationAdmin);

function tenantOf(req: Request): string {
  return (req.headers["x-tenant-id"] as string) || "default";
}

function loadRow(id: number): Record<string, unknown> {
  const rows = queryRows("MSG_TEMPLATE", "SELECT * FROM MSG_TEMPLATE WHERE ID = ?", [id]);
  if (!rows.length) throw new BusinessException("模板不存在");
  return rows[0];
}

/** GET / —— 模板列表 */
router.get("/", (_req: Request, res: Response) => {
  ok(res, queryRows("MSG_TEMPLATE", "SELECT * FROM MSG_TEMPLATE ORDER BY ID", []));
});

/** POST / —— 创建模板 */
router.post("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const body = (req.body ?? {}) as Record<string, unknown>;
  const templateCode = body.templateCode ? String(body.templateCode) : "";
  if (!templateCode) throw new BusinessException("templateCode 不能为空", 400);
  if (!body.name) throw new BusinessException("name 不能为空", 400);
  const dup = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM MSG_TEMPLATE WHERE TEMPLATE_CODE = ? AND TENANT_ID = ?",
    [templateCode, tenantId],
  )!;
  if (dup.c > 0) throw new BusinessException("模板代码已存在: " + templateCode);
  const eventCode = body.eventCode ? String(body.eventCode).trim() : "";
  if (eventCode) requireEnabledEvent(tenantId, eventCode);
  const enabled = body.enabled == null ? true : body.enabled === true || body.enabled === "true";
  const channel = body.channel ? String(body.channel) : null;
  if (enabled && eventCode && channel) {
    const dupEnabled = queryOne<{ c: number }>(
      "SELECT COUNT(1) AS c FROM MSG_TEMPLATE WHERE TENANT_ID = ? AND EVENT_CODE = ? AND CHANNEL = ? AND ENABLED = 1",
      [tenantId, eventCode, channel],
    )!;
    if (dupEnabled.c > 0) throw new BusinessException("同一事件和渠道已有启用模板");
  }
  const r = exec(
    "INSERT INTO MSG_TEMPLATE (TENANT_ID, TEMPLATE_CODE, EVENT_CODE, NAME, TITLE, CONTENT, CONTENT_TYPE, CHANNEL, PRIORITY, CATEGORY, IS_SYSTEM, ENABLED, CREATED_AT) VALUES (?,?,?,?,?,?,?,?,?,?, 0, ?, ?)",
    [tenantId, templateCode, eventCode || null, String(body.name), body.title ? String(body.title) : null,
      body.content ? String(body.content) : null, body.contentType ? String(body.contentType) : "TEXT",
      channel, body.priority ? String(body.priority) : null, body.category ? String(body.category) : null,
      enabled ? 1 : 0, nowStr()],
  );
  ok(res, loadRow(Number(r.lastInsertRowid)));
});

/** PUT /:id —— 更新模板（系统模板限制结构性字段） */
router.put("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = loadRow(id);
  const isSystem = existing.isSystem === true;
  const body = (req.body ?? {}) as Record<string, unknown>;
  exec(
    "UPDATE MSG_TEMPLATE SET NAME = ?, TITLE = ?, CONTENT = ?, CONTENT_TYPE = COALESCE(?, CONTENT_TYPE), ENABLED = COALESCE(?, ENABLED), PRIORITY = ?, CATEGORY = ? WHERE ID = ?",
    [body.name != null ? String(body.name) : null, body.title != null ? String(body.title) : null,
      body.content != null ? String(body.content) : null, body.contentType != null ? String(body.contentType) : null,
      body.enabled != null ? (body.enabled === true || body.enabled === "true" ? 1 : 0) : null,
      isSystem ? null : body.priority != null ? String(body.priority) : null,
      isSystem ? null : body.category != null ? String(body.category) : null,
      id],
  );
  ok(res, loadRow(id));
});

/** POST /:id/toggle —— 启用/停用 */
router.post("/:id/toggle", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const existing = loadRow(id);
  const next = existing.enabled === true ? 0 : 1;
  exec("UPDATE MSG_TEMPLATE SET ENABLED = ? WHERE ID = ?", [next, id]);
  ok(res);
});

export default router;
