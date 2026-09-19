/**
 * 管理端·发送记录 —— DeliveryController 移植（Task 13-7）
 * mount 前缀：/api/v1/admin/notification/deliveries（2 端点，全部挂 requireNotificationAdmin）
 *
 * Java 语义对齐：
 *  - 发送记录 = MSG_MESSAGE + MSG_RECIPIENT 聚合；recipient/channel 过滤从收件人表反查消息 ID；
 *    无匹配收件人/渠道直接返回空结果；状态优先看 MSG_DELIVERY_RETRY（FAILED→FAILED、PENDING→PENDING），
 *    否则回退消息 status
 *  - POST /:id/retry：按消息加载收件人 → 重新走完整分发链路（站内信会新增收件人记录，Java 同语义）；
 *    无收件人 R.fail
 */
/* mount: /api/v1/admin/notification/deliveries */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, requireNotificationAdmin, failBiz } from "../../../lib/http";
import { BusinessException } from "../../../lib/errors";
import { queryOne, queryRows } from "../../../lib/db";
import { dispatchMessageEvent } from "../internal";

const router = Router();
router.use(requireNotificationAdmin);

/** GET / —— 发送记录列表（按消息聚合，时间倒序） */
router.get("/", (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page ?? 1) || 1);
  const size = Math.max(1, Number(req.query.size ?? 20) || 20);
  const keyword = req.query.keyword ? String(req.query.keyword).trim() : null;
  const recipient = req.query.recipient ? String(req.query.recipient).trim() : null;
  const channel = req.query.channel ? String(req.query.channel) : null;
  const start = req.query.start ? String(req.query.start) : null;
  const end = req.query.end ? String(req.query.end) : null;

  // 1. 按收件人/渠道过滤：从收件人表反查消息 ID
  let filteredMessageIds: string[] | null = null;
  if (recipient || channel) {
    const matched: number[] = [];
    if (recipient) {
      for (const r of queryRows(
        "MSG_RECIPIENT",
        "SELECT DISTINCT MESSAGE_ID FROM MSG_RECIPIENT WHERE USERNAME LIKE ?",
        [`%${recipient}%`],
      )) matched.push(Number(r.messageId));
    }
    if (channel) {
      for (const r of queryRows(
        "MSG_RECIPIENT",
        "SELECT DISTINCT MESSAGE_ID FROM MSG_RECIPIENT WHERE CHANNEL = ?",
        [channel],
      )) matched.push(Number(r.messageId));
    }
    filteredMessageIds = [...new Set(matched.map(String))];
    if (!filteredMessageIds.length) {
      ok(res, { rows: [], total: 0, page, size });
      return;
    }
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (keyword) {
    where.push("TITLE LIKE ?");
    params.push(`%${keyword}%`);
  }
  if (start) {
    where.push("CREATED_AT >= ?");
    params.push(start);
  }
  if (end) {
    where.push("CREATED_AT <= ?");
    params.push(end);
  }
  if (filteredMessageIds) {
    where.push(`ID IN (${filteredMessageIds.map(() => "?").join(",")})`);
    params.push(...filteredMessageIds);
  }
  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const total = queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM MSG_MESSAGE ${whereSql}`, params)!.c;
  const messages = queryRows(
    "MSG_MESSAGE",
    `SELECT * FROM MSG_MESSAGE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );

  const rows = messages.map((m) => {
    const recipients = queryRows("MSG_RECIPIENT", "SELECT * FROM MSG_RECIPIENT WHERE MESSAGE_ID = ?", [Number(m.id)]);
    // 投递状态：重试表 FAILED 优先 → PENDING → 消息 status
    const retries = queryRows(
      "MSG_DELIVERY_RETRY",
      "SELECT STATUS FROM MSG_DELIVERY_RETRY WHERE MESSAGE_ID = ?",
      [Number(m.id)],
    );
    let status = String(m.status ?? "SENT");
    if (retries.some((r) => r.STATUS === "FAILED")) status = "FAILED";
    else if (retries.some((r) => r.STATUS === "PENDING")) status = "PENDING";
    return {
      id: m.id,
      title: m.title,
      recipientCount: recipients.length,
      recipients: recipients.map((r) => ({
        userId: r.userId,
        username: r.username,
        status: r.status ?? "PENDING",
      })),
      channel: recipients.length ? String(recipients[0].channel) : "IN_APP",
      status,
      createdAt: m.createdAt,
    };
  });
  ok(res, { rows, total, page, size });
});

/** POST /:id/retry —— 手动重发（走完整分发链路） */
router.post("/:id/retry", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const rows = queryRows("MSG_MESSAGE", "SELECT * FROM MSG_MESSAGE WHERE ID = ?", [id]);
  if (!rows.length) throw new BusinessException("消息不存在: " + id);
  const message = rows[0];
  const recipients = queryRows("MSG_RECIPIENT", "SELECT * FROM MSG_RECIPIENT WHERE MESSAGE_ID = ?", [id]);
  if (!recipients.length) {
    failBiz(res, 500, "该消息无收件人记录，无法重发"); // R.fail 语义
    return;
  }
  const recipientIds = [...new Set(recipients.map((r) => String(r.userId)))];
  let channels = [...new Set(recipients.map((r) => String(r.channel)))];
  if (!channels.length) channels = ["IN_APP"];
  dispatchMessageEvent(
    {
      id: message.id ? String(message.id) : null,
      tenantId: String(message.tenantId),
      templateCode: String(message.templateCode),
      eventCode: message.eventCode ? String(message.eventCode) : null,
      senderId: Number(message.senderId ?? 0),
      senderType: String(message.senderType),
      title: String(message.title),
      content: message.content,
      linkJson: message.linkJson,
      priority: message.priority ? String(message.priority) : null,
      category: message.category ? String(message.category) : null,
      messageType: message.messageType ? String(message.messageType) : null,
      contentType: message.contentType ? String(message.contentType) : null,
    },
    recipientIds,
    channels,
  );
  ok(res);
});

export default router;
