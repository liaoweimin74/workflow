/**
 * 用户端消息 API —— NotificationController + MessageServiceImpl（查询/已读部分）移植（Task 13-7）
 * mount 前缀：/api/v1/notifications（8 端点）
 *
 * Java 语义对齐：
 *  - 列表：按当前用户 MSG_RECIPIENT（unread=true→PENDING / false→SENT）取消息 ID 集合，
 *    再按 keyword(标题模糊)/category/messageType/start·end(CREATED_AT) 过滤，CREATED_AT 倒序分页，
 *    返回 PageResult{total,page,size,rows}，rows 每条回填 readStatus（PENDING=未读，SENT=已读）
 *  - 详情：消息不存在→500「消息不存在」；非收件人且非发送者→403
 *  - 已读单条：UPDATE 收件人 SET STATUS='SENT', SENT_AT=now；无匹配行→「消息不存在或已读」
 *  - 批量已读：body 直接是 ID 数组
 *  - toggle-read：PENDING↔SENT，未读置已读写 SENT_AT，反向清空
 *  - 全部已读：仅 PENDING → SENT
 *  - 删除：仅删当前用户收件人记录（消息本体保留）
 *  - 未读数：COUNT(MSG_RECIPIENT WHERE USER_ID=? AND STATUS='PENDING')，Long→string
 *  路由顺序：/unread-count、/read-batch、/read-all 必须先于 /:id 注册。
 */
/* mount: /api/v1/notifications */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, queryOne, queryRows } from "../../lib/db";
import { nowStr } from "./internal";

const router = Router();

/** 数字路径参数（对齐 Spring @PathVariable Long 类型转换：非法 → 400） */
function numParam(raw: string): number {
  const n = Number(raw);
  if (Number.isNaN(n)) throw new BusinessException("路径参数必须为数字: " + raw, 400);
  return n;
}

function uid(req: Request): string {
  return req.loginUser!.userId;
}

function intParam(req: Request, key: string): number | null {
  const v = req.query[key];
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** 1. GET / —— 消息列表（分页 + 筛选） */
router.get("/", (req: Request, res: Response) => {
  const userId = uid(req);
  const page = Math.max(1, intParam(req, "page") ?? 1);
  const size = Math.max(1, intParam(req, "size") ?? 20);
  const keyword = req.query.keyword ? String(req.query.keyword).trim() : null;
  const category = req.query.category ? String(req.query.category) : null;
  const messageType = req.query.messageType ? String(req.query.messageType) : null;
  const unreadRaw = req.query.unread;
  const start = req.query.start ? String(req.query.start) : null;
  const end = req.query.end ? String(req.query.end) : null;

  // 1. 收件人记录（unread → PENDING/SENT 过滤）
  let recipients;
  if (unreadRaw === "true" || unreadRaw === "false") {
    recipients = queryRows(
      "MSG_RECIPIENT",
      "SELECT * FROM MSG_RECIPIENT WHERE USER_ID = ? AND STATUS = ?",
      [Number(userId), unreadRaw === "true" ? "PENDING" : "SENT"],
    );
  } else {
    recipients = queryRows("MSG_RECIPIENT", "SELECT * FROM MSG_RECIPIENT WHERE USER_ID = ?", [Number(userId)]);
  }
  if (!recipients.length) {
    ok(res, { total: 0, page, size, rows: [] });
    return;
  }
  const statusByMessage = new Map<string, string>();
  const ids: string[] = [];
  for (const r of recipients) {
    const mid = String(r.messageId);
    if (!statusByMessage.has(mid)) statusByMessage.set(mid, String(r.status));
    if (!ids.includes(mid)) ids.push(mid);
  }

  // 2. 消息过滤 + 分页
  const where: string[] = [];
  const params: unknown[] = [];
  where.push(`ID IN (${ids.map(() => "?").join(",")})`);
  params.push(...ids);
  if (keyword) {
    where.push("TITLE LIKE ?");
    params.push(`%${keyword}%`);
  }
  if (category) {
    where.push("CATEGORY = ?");
    params.push(category);
  }
  if (messageType) {
    where.push("MESSAGE_TYPE = ?");
    params.push(messageType);
  }
  if (start) {
    where.push("CREATED_AT >= ?");
    params.push(start);
  }
  if (end) {
    where.push("CREATED_AT <= ?");
    params.push(end);
  }
  const whereSql = where.join(" AND ");
  const total = (queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM MSG_MESSAGE WHERE ${whereSql}`, params) as { c: number }).c;
  const rows = queryRows(
    "MSG_MESSAGE",
    `SELECT * FROM MSG_MESSAGE WHERE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  for (const row of rows) {
    row.readStatus = statusByMessage.get(String(row.id)) ?? null;
  }
  ok(res, { total, page, size, rows });
});

/** 2. GET /unread-count —— 未读数（先于 /:id 注册） */
router.get("/unread-count", (req: Request, res: Response) => {
  const row = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM MSG_RECIPIENT WHERE USER_ID = ? AND STATUS = 'PENDING'",
    [Number(uid(req))],
  );
  ok(res, String(row?.c ?? 0)); // Jackson Long→string 契约
});

/** 3. POST /read-batch —— 批量已读（body 直接是 ID 数组） */
router.post("/read-batch", (req: Request, res: Response) => {
  const body = req.body;
  if (!Array.isArray(body)) throw new BusinessException("请求体必须为消息 ID 数组", 400);
  const ids = body.map((x) => Number(x)).filter((n) => !Number.isNaN(n));
  if (ids.length) {
    exec(
      `UPDATE MSG_RECIPIENT SET STATUS = 'SENT', SENT_AT = ? WHERE USER_ID = ? AND MESSAGE_ID IN (${ids.map(() => "?").join(",")})`,
      [nowStr(), Number(uid(req)), ...ids],
    );
  }
  ok(res);
});

/** 4. POST /read-all —— 全部已读（先于 /:id 注册） */
router.post("/read-all", (req: Request, res: Response) => {
  exec(
    "UPDATE MSG_RECIPIENT SET STATUS = 'SENT', SENT_AT = ? WHERE USER_ID = ? AND STATUS = 'PENDING'",
    [nowStr(), Number(uid(req))],
  );
  ok(res);
});

/** 5. GET /:id —— 消息详情 */
router.get("/:id", (req: Request, res: Response) => {
  const userId = uid(req);
  const id = numParam(req.params.id);
  const rows = queryRows("MSG_MESSAGE", "SELECT * FROM MSG_MESSAGE WHERE ID = ?", [id]);
  if (!rows.length) throw new BusinessException("消息不存在");
  const message = rows[0];
  const isRecipient = !!queryOne(
    "SELECT ID FROM MSG_RECIPIENT WHERE MESSAGE_ID = ? AND USER_ID = ?",
    [id, Number(userId)],
  );
  if (!isRecipient && String(message.senderId) !== userId) {
    throw new BusinessException("无权查看此消息", 403);
  }
  const own = queryRows(
    "MSG_RECIPIENT",
    "SELECT * FROM MSG_RECIPIENT WHERE MESSAGE_ID = ? AND USER_ID = ?",
    [id, Number(userId)],
  );
  if (own.length) message.readStatus = own[0].status;
  ok(res, message);
});

/** 6. PUT /:id/read —— 标记已读 */
router.put("/:id/read", (req: Request, res: Response) => {
  const r = exec(
    "UPDATE MSG_RECIPIENT SET STATUS = 'SENT', SENT_AT = ? WHERE MESSAGE_ID = ? AND USER_ID = ?",
    [nowStr(), numParam(req.params.id), Number(uid(req))],
  );
  if (r.changes === 0) throw new BusinessException("消息不存在或已读");
  ok(res);
});

/** 7. POST /:id/toggle-read —— 未读↔已读 */
router.post("/:id/toggle-read", (req: Request, res: Response) => {
  const userId = Number(uid(req));
  const id = numParam(req.params.id);
  const row = queryOne<{ STATUS: string }>(
    "SELECT STATUS FROM MSG_RECIPIENT WHERE MESSAGE_ID = ? AND USER_ID = ?",
    [id, userId],
  );
  if (!row) throw new BusinessException("消息不存在");
  const unread = row.STATUS === "PENDING";
  const next = unread ? "SENT" : "PENDING";
  exec(
    "UPDATE MSG_RECIPIENT SET STATUS = ?, SENT_AT = ? WHERE MESSAGE_ID = ? AND USER_ID = ?",
    [next, unread ? nowStr() : null, id, userId],
  );
  ok(res, next);
});

/** 8. DELETE /:id —— 删除当前用户收件记录 */
router.delete("/:id", (req: Request, res: Response) => {
  const userId = Number(uid(req));
  const id = numParam(req.params.id);
  const isRecipient = !!queryOne(
    "SELECT ID FROM MSG_RECIPIENT WHERE MESSAGE_ID = ? AND USER_ID = ?",
    [id, userId],
  );
  if (!isRecipient) throw new BusinessException("无权删除此消息", 403);
  exec("DELETE FROM MSG_RECIPIENT WHERE USER_ID = ? AND MESSAGE_ID = ?", [userId, id]);
  ok(res);
});

export default router;
