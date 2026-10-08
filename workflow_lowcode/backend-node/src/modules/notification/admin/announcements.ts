/**
 * 管理端·公告 —— AnnouncementController 移植（Task 13-7）
 * mount 前缀：/api/v1/admin/notification/announcements（4 端点，全部挂 requireNotificationAdmin）
 *
 * Java 语义对齐：
 *  - POST（query 参数 title/content/recipientIds）：PUBLIC+SYSTEM 消息，templateCode=ANNOUNCEMENT，
 *    contentType=MARKDOWN，content={text,variables:{}}，priority=NORMAL，tenantId 固定 "default"，
 *    逐用户写 MSG_RECIPIENT（复用 messageService.send 链路）+ SSE new-message 逐用户推送
 *  - GET：裸 Map{rows[{id,title,senderId,recipientCount,createdAt}],total,page,size}，仅 ANNOUNCEMENT
 *  - GET /:id：完整 Message；非公告 400
 *  - DELETE /:id：撤回 = 删收件人记录 + 消息本体；非公告 400
 */
/* mount: /api/v1/admin/notification/announcements */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, requireNotificationAdmin } from "../../../lib/http";
import { BusinessException } from "../../../lib/errors";
import { exec, queryOne, queryRows } from "../../../lib/db";
import { messageSend } from "../internal";
import { notifyUser } from "../sse";

const router = Router();
router.use(requireNotificationAdmin);

const ANNOUNCEMENT_TEMPLATE = "ANNOUNCEMENT";

/** POST / —— 发布公告（参数在 query，对齐 @RequestParam） */
router.post("/", (req: Request, res: Response) => {
  const title = req.query.title ? String(req.query.title) : null;
  const content = req.query.content != null ? String(req.query.content) : null;
  const rv = req.query.recipientIds;
  if (!title) throw new BusinessException("title 不能为空", 400);
  if (content == null) throw new BusinessException("content 不能为空", 400);
  const recipientIds = (Array.isArray(rv) ? rv : String(rv ?? "").split(","))
    .map((s) => String(s).trim())
    .filter((s) => s !== "");
  if (!recipientIds.length) throw new BusinessException("recipientIds 不能为空", 400);

  const message = messageSend(
    {
      tenantId: "default",
      templateCode: ANNOUNCEMENT_TEMPLATE,
      senderId: req.loginUser!.userId,
      senderType: "SYSTEM",
      title,
      content: { text: content, variables: {} },
      priority: "NORMAL",
      category: "SYSTEM",
      messageType: "PUBLIC",
      contentType: "MARKDOWN",
    },
    recipientIds,
  );
  for (const targetId of recipientIds) notifyUser(targetId, "new-message", message);
  ok(res);
});

/** GET / —— 公告列表 */
router.get("/", (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const size = Math.max(1, Number(req.query.size ?? 20) || 20);
  const keyword = req.query.keyword ? String(req.query.keyword).trim() : null;
  const where = ["TEMPLATE_CODE = ?"];
  const params: unknown[] = [ANNOUNCEMENT_TEMPLATE];
  if (keyword) {
    where.push("TITLE LIKE ?");
    params.push(`%${keyword}%`);
  }
  const whereSql = "WHERE " + where.join(" AND ");
  const total = queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM MSG_MESSAGE ${whereSql}`, params)!.c;
  const messages = queryRows(
    "MSG_MESSAGE",
    `SELECT * FROM MSG_MESSAGE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  const rows = messages.map((m) => ({
    id: m.id,
    title: m.title,
    senderId: m.senderId,
    recipientCount: (queryOne<{ c: number }>(
      "SELECT COUNT(1) AS c FROM MSG_RECIPIENT WHERE MESSAGE_ID = ?",
      [Number(m.id)],
    ) as { c: number }).c,
    createdAt: m.createdAt,
  }));
  ok(res, { rows, total, page, size });
});

/** GET /:id —— 公告详情（完整 Markdown 内容） */
router.get("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const rows = queryRows("MSG_MESSAGE", "SELECT * FROM MSG_MESSAGE WHERE ID = ?", [id]);
  if (!rows.length) throw new BusinessException("公告不存在: " + id);
  if (rows[0].templateCode !== ANNOUNCEMENT_TEMPLATE) throw new BusinessException("非公告消息: " + id);
  ok(res, rows[0]);
});

/** DELETE /:id —— 撤回公告 */
router.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const rows = queryRows("MSG_MESSAGE", "SELECT * FROM MSG_MESSAGE WHERE ID = ?", [id]);
  if (!rows.length) throw new BusinessException("公告不存在: " + id);
  if (rows[0].templateCode !== ANNOUNCEMENT_TEMPLATE) throw new BusinessException("非公告消息，不可撤回: " + id);
  exec("DELETE FROM MSG_RECIPIENT WHERE MESSAGE_ID = ?", [id]);
  exec("DELETE FROM MSG_MESSAGE WHERE ID = ?", [id]);
  ok(res);
});

export default router;
