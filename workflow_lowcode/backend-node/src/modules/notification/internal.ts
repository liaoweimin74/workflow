/**
 * 消息发送链路 + 内部 API —— MessageDispatcher/MessageSender/MessageServiceImpl.send/
 * TemplateService/NotificationEventService(requireEnabled) 移植（Task 13-7）
 * mount 前缀：/api/v1/internal/notifications（2 端点）
 *
 * Java 语义对齐（dispatch/MessageDispatcher + api/InternalNotificationController）：
 *  - POST /send：body 完整 Message + query recipientIds/channels → 走完整分发链路
 *  - POST /send-by-template：body TemplateSendRequest → 事件启用校验 → 模板加载/变量校验/渲染
 *    → 组装 Message → 走完整分发链路
 *  - 分发：IN_APP 同步写 MSG_MESSAGE + MSG_RECIPIENT（PENDING=未读）+ SSE new-message；
 *    外部渠道（SMS/WECHAT_WORK/WECHAT_MINIPROGRAM/APP）沙箱内无真实网关 → 消息照常标记 SENT，
 *    投递失败写入 MSG_DELIVERY_RETRY（PENDING + nextRetryAt=now，按 Java DeliveryRetry 语义，
 *    同一 (recipientId,channel) 已有 PENDING 记录时跳过判重）
 *  - 渠道启用状态取 MSG_CHANNEL_CONFIG 的 __enabled 行；无该行时 IN_APP 恒可用，
 *    外部渠道看是否已有配置（对齐 ChannelConfigService.isEnabled）
 * 注：该路径仍在 JWT 保护下（Java SecurityConfig anyRequest.authenticated），非无鉴权内部口。
 */
/* mount: /api/v1/internal/notifications */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, query, queryOne, queryRows } from "../../lib/db";
import { notifyUser } from "./sse";

const router = Router();

// ==================== 公共工具 ====================

export function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const CHANNELS = ["IN_APP", "SMS", "WECHAT_WORK", "WECHAT_MINIPROGRAM", "APP"] as const;
export type ChannelType = (typeof CHANNELS)[number];

function requireTenant(req: Request): string {
  return (req.headers["x-tenant-id"] as string) || "default";
}

/** 渠道是否启用（对齐 ChannelConfigService.isEnabled：__enabled 行优先，否则 IN_APP/已配置放行） */
export function channelEnabled(channel: string): boolean {
  const row = queryOne<{ CONFIG_VALUE: string }>(
    "SELECT CONFIG_VALUE FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY = '__enabled'",
    [channel],
  );
  if (row) return String(row.CONFIG_VALUE).toLowerCase() === "true";
  if (channel === "IN_APP") return true;
  const configured = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY != '__enabled' AND CONFIG_VALUE IS NOT NULL AND CONFIG_VALUE != ''",
    [channel],
  );
  return !!configured && configured.c > 0;
}

// ==================== MessageService.send（站内信落库原语） ====================

export interface MessageInput {
  id?: string | number | null;
  tenantId?: string | null;
  templateCode?: string | null;
  eventCode?: string | null;
  senderId?: string | number | null;
  senderType?: string | null;
  title?: string | null;
  content?: unknown;
  linkJson?: unknown;
  priority?: string | null;
  category?: string | null;
  messageType?: string | null;
  contentType?: string | null;
}

/**
 * 创建/更新消息 + 收件人记录（对齐 MessageServiceImpl.send）：
 * status=SENT、createdAt=now；IN_APP 渠道被禁用时只落消息不写收件人（Java 同分支）。
 * 收件人快照用户信息（username/nickname/email/phone），缺失用户回退 user_<id>。
 */
export function messageSend(message: MessageInput, recipientIds: string[]): Record<string, unknown> {
  const now = nowStr();
  const tenant = message.tenantId ?? "default";
  let id = message.id ? String(message.id) : null;
  const contentJson = message.content == null ? null : JSON.stringify(message.content);
  const linkJson = message.linkJson == null ? null : JSON.stringify(message.linkJson);
  if (id) {
    exec(
      "UPDATE MSG_MESSAGE SET TENANT_ID=?, TEMPLATE_CODE=?, EVENT_CODE=?, SENDER_ID=?, SENDER_TYPE=?, TITLE=?, CONTENT=?, LINK_JSON=?, PRIORITY=?, CATEGORY=?, MESSAGE_TYPE=?, CONTENT_TYPE=?, STATUS='SENT', CREATED_AT=? WHERE ID=?",
      [tenant, message.templateCode ?? "", message.eventCode ?? null, Number(message.senderId ?? 0),
        message.senderType ?? "SYSTEM", message.title ?? "", contentJson, linkJson,
        message.priority ?? null, message.category ?? null, message.messageType ?? null,
        message.contentType ?? null, now, id],
    );
  } else {
    const r = exec(
      "INSERT INTO MSG_MESSAGE (TENANT_ID, TEMPLATE_CODE, EVENT_CODE, SENDER_ID, SENDER_TYPE, TITLE, CONTENT, LINK_JSON, PRIORITY, CATEGORY, MESSAGE_TYPE, CONTENT_TYPE, STATUS, CREATED_AT) VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'SENT', ?)",
      [tenant, message.templateCode ?? "", message.eventCode ?? null, Number(message.senderId ?? 0),
        message.senderType ?? "SYSTEM", message.title ?? "", contentJson, linkJson,
        message.priority ?? null, message.category ?? null, message.messageType ?? null,
        message.contentType ?? null, now],
    );
    id = String(r.lastInsertRowid);
  }

  if (!channelEnabled("IN_APP")) {
    return loadMessage(id);
  }

  for (const userId of recipientIds) {
    const user = queryOne<{ USERNAME: string; NICKNAME: string | null; EMAIL: string | null; PHONE: string | null }>(
      "SELECT USERNAME, NICKNAME, EMAIL, PHONE FROM SYS_USER WHERE ID = ?", [Number(userId)]);
    exec(
      "INSERT INTO MSG_RECIPIENT (TENANT_ID, MESSAGE_ID, USER_ID, USERNAME, NICKNAME, EMAIL, PHONE, CHANNEL, STATUS, SENT_AT, CREATED_AT) VALUES (?,?,?,?,?,?,?, 'IN_APP', 'PENDING', NULL, ?)",
      [tenant, id, Number(userId),
        user?.USERNAME ?? `user_${userId}`, user?.NICKNAME ?? null, user?.EMAIL ?? null, user?.PHONE ?? null, now],
    );
  }
  return loadMessage(id);
}

function loadMessage(id: string): Record<string, unknown> {
  const rows = queryRows("MSG_MESSAGE", "SELECT * FROM MSG_MESSAGE WHERE ID = ?", [id]);
  if (!rows.length) throw new BusinessException("消息不存在");
  return rows[0];
}

// ==================== 重试入队（对齐 MessageDispatcher.saveRetry） ====================

export function saveRetry(message: Record<string, unknown>, userId: string, channel: string, error: string): void {
  const dup = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM MSG_DELIVERY_RETRY WHERE RECIPIENT_ID = ? AND CHANNEL = ? AND STATUS = 'PENDING'",
    [Number(userId), channel],
  );
  if (dup && dup.c > 0) return; // 已有待重试记录，跳过重复入队
  const now = nowStr();
  exec(
    "INSERT INTO MSG_DELIVERY_RETRY (TENANT_ID, MESSAGE_ID, RECIPIENT_ID, CHANNEL, RETRY_COUNT, MAX_RETRY, LAST_ERROR, NEXT_RETRY_AT, STATUS, CREATED_AT, UPDATED_AT) VALUES (?,?,?,?, 0, 3, ?, ?, 'PENDING', ?, ?)",
    [String(message.tenantId ?? "default"), String(message.id), Number(userId), channel, error, now, now, now],
  );
}

// ==================== MessageDispatcher.handleMessageEvent（完整分发链路） ====================

export function dispatchMessageEvent(
  message: MessageInput,
  recipientIds: string[],
  channels: string[],
): Record<string, unknown> {
  const saved = messageSend(message, recipientIds);

  // 1. 站内信 → SSE new-message 逐用户推送
  if (channels.includes("IN_APP") && channelEnabled("IN_APP") && recipientIds.length > 0) {
    for (const userId of recipientIds) notifyUser(userId, "new-message", saved);
  }

  // 2. 外部渠道：启用则模拟投递（沙箱无真实网关 → 失败入重试表，按 Java DeliveryRetry 语义）
  for (const channel of channels) {
    if (channel === "IN_APP") continue;
    if (!channelEnabled(channel)) continue; // 渠道已禁用，跳过新消息投递
    for (const userId of recipientIds) {
      saveRetry(saved, userId, channel, `渠道适配器沙箱内不可用，真实外发未执行: ${channel}`);
    }
  }
  return saved;
}

// ==================== TemplateService（加载/校验/渲染） ====================

const VARIABLE_PATTERN = /\$\{([^}]+)\}/g;

export function renderTemplate(template: string | null, variables: Record<string, unknown> | null): string | null {
  if (template == null || !variables) return template;
  return template.replace(VARIABLE_PATTERN, (_m, name: string) => {
    const v = variables[name];
    return v == null ? "" : String(v);
  });
}

export function validateVariables(template: string | null, variables: Record<string, unknown> | null): void {
  if (!template) return;
  const vars = variables ?? {};
  for (const m of template.matchAll(VARIABLE_PATTERN)) {
    const name = m[1];
    if (!(name in vars) || vars[name] == null) throw new BusinessException("缺少必填变量: " + name);
  }
}

export function requireEnabledEvent(tenantId: string, eventCode: string): void {
  const row = queryOne<{ ENABLED: number }>(
    "SELECT ENABLED FROM MSG_EVENT_DEFINITION WHERE TENANT_ID = ? AND EVENT_CODE = ?",
    [tenantId, eventCode],
  );
  if (!row || !row.ENABLED) throw new BusinessException("事件不存在或已停用: " + eventCode, 400);
}

interface TemplateRow {
  ID: number; TEMPLATE_CODE: string; EVENT_CODE: string | null; NAME: string; TITLE: string | null;
  CONTENT: string | null; CONTENT_TYPE: string | null; CHANNEL: string | null; PRIORITY: string | null;
  CATEGORY: string | null; ENABLED: number;
}

export function loadEnabledTemplate(templateCode: string, tenantId: string): TemplateRow {
  const tpl = queryOne<TemplateRow>(
    "SELECT * FROM MSG_TEMPLATE WHERE TEMPLATE_CODE = ? AND TENANT_ID = ?",
    [templateCode, tenantId],
  );
  if (!tpl) throw new BusinessException("模板不存在: " + templateCode);
  if (!tpl.ENABLED) throw new BusinessException("模板已停用: " + templateCode);
  return tpl;
}

// ==================== 路由 ====================

/** Spring @RequestParam List<Long>：支持重复 key（?a=1&a=2）与逗号分隔（?a=1,2） */
export function queryList(req: Request, key: string): string[] {
  const v = req.query[key];
  if (v == null) return [];
  const arr = Array.isArray(v) ? v : [v];
  return arr.flatMap((x) => String(x).split(",")).map((s) => s.trim()).filter((s) => s !== "");
}

/**
 * POST /send —— 自由内容消息：body 为完整 Message + query recipientIds/channels（必填）
 */
router.post("/send", (req: Request, res: Response) => {
  const recipientIds = queryList(req, "recipientIds");
  const channels = queryList(req, "channels");
  if (!recipientIds.length) throw new BusinessException("recipientIds 不能为空", 400);
  if (!channels.length) throw new BusinessException("channels 不能为空", 400);
  for (const c of channels) {
    if (!(CHANNELS as readonly string[]).includes(c)) throw new BusinessException("未知渠道类型: " + c, 400);
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (!body.templateCode) throw new BusinessException("templateCode 不能为空", 400);
  if (!body.title) throw new BusinessException("title 不能为空", 400);
  const tenantId = (body.tenantId as string) || requireTenant(req);
  dispatchMessageEvent(
    {
      ...body,
      tenantId,
      senderId: Number(body.senderId ?? 0),
      senderType: (body.senderType as string) || "SYSTEM",
    },
    recipientIds,
    channels,
  );
  ok(res);
});

/**
 * POST /send-by-template —— 模板发送：body TemplateSendRequest
 * {senderId?, templateCode, variables?, messageType?(缺省 PRIVATE), eventCode?}
 * 有 eventCode 先走事件启用校验（Java MessageSender.sendByTemplate 同分支）。
 */
router.post("/send-by-template", (req: Request, res: Response) => {
  const tenantId = requireTenant(req);
  const recipientIds = queryList(req, "recipientIds");
  const channels = queryList(req, "channels");
  if (!recipientIds.length) throw new BusinessException("recipientIds 不能为空", 400);
  if (!channels.length) throw new BusinessException("channels 不能为空", 400);
  for (const c of channels) {
    if (!(CHANNELS as readonly string[]).includes(c)) throw new BusinessException("未知渠道类型: " + c, 400);
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const templateCode = String(body.templateCode ?? "");
  if (!templateCode) throw new BusinessException("templateCode 不能为空", 400);
  const eventCode = body.eventCode ? String(body.eventCode).trim() : "";
  if (eventCode) requireEnabledEvent(tenantId, eventCode);
  const messageType = (body.messageType as string) || "PRIVATE";
  const variables = (body.variables ?? null) as Record<string, unknown> | null;

  const tpl = loadEnabledTemplate(templateCode, tenantId);
  validateVariables(tpl.TITLE, variables);
  validateVariables(tpl.CONTENT, variables);

  dispatchMessageEvent(
    {
      tenantId,
      templateCode,
      eventCode: eventCode || null,
      senderId: Number(body.senderId ?? 0),
      senderType: "SYSTEM",
      title: renderTemplate(tpl.TITLE, variables),
      content: {
        text: renderTemplate(tpl.CONTENT, variables),
        variables: variables ?? {},
      },
      contentType: tpl.CONTENT_TYPE ?? "TEXT",
      priority: tpl.PRIORITY,
      category: tpl.CATEGORY,
      messageType,
    },
    recipientIds,
    channels,
  );
  ok(res);
});

export default router;
