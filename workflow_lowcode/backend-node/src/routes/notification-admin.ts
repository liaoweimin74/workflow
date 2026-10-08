/**
 * notification-admin.ts — 通知管理端 25 端点（Task 13-7）
 *
 * 对齐 Java admin 包 7 个 Controller（/api/v1/admin/notification/*，全部 requireAdmin）：
 *  StatsController(1) / ChannelController(5) / AnnouncementController(4) / DeliveryController(2)
 *  EventDefinitionController(5) / SubscriptionController(4) / TemplateController(4)
 *
 * 权限：NotificationAdminAuthorization.requireAdmin —— 角色 ROLE_ADMIN 或 admin（BusinessException
 * 403 "需要管理员权限" → HTTP 200 + R.fail(403,...)，实测逐字）；非管理员先于租户校验。
 *
 * 关键契约（8080 实测金标准）：
 *  - stats/overview 键序（java.util.Map.of 固定桶序实测）：failedRetries, totalRecipients, totalMessages
 *  - 渠道固定 5 条，ID 稳定：1 站内信 / 2 短信 / 3 企业微信 / 4 小程序 / 5 APP；
 *    successRate：站内信 100；外部=无重试记录时 isConfigured?100:null，有 FAILED→0，有 PENDING→50
 *  - 渠道配置存 MSG_CHANNEL_CONFIG，__enabled 键控启停；敏感键（含 key/secret/password/token）
 *    加密落库——Java 未配 notification.encryption.key 时每次用随机密钥加密（解密必失败的原版行为，
 *    本实现忠实复刻：AES-256-GCM 随机 key，密文=base64(iv+ct+tag)）
 *  - 事件定义/模板行 JSON 字段序以 8080 运行期 jar 实测为准（与当前源码声明序不同）
 *  - events 列表 size 由 Math.max(size,1) 归一（size=0 不报 400）；deliveries/announcements/
 *    subscriptions 列表走 PageRequest.of（size<1 → 400）——语义不同，须分端点对齐
 *  - 公告/渠道测试正文 content 为 java.util.Map.of(...) 固定桶序（实测 variables 在前 text 在后）
 *  - 事件 create 缺事件名 → code 500；代码非法 → code 400；重复 → code 409；update 不存在 → code 404
 */
import { Router } from 'express';
import { createCipheriv, randomBytes } from 'node:crypto';
import { all, one, run, type Row } from '../lib/db';
import { R, BusinessException, IllegalArgumentError, TenantNotSetError } from '../lib/errors';
import { authGuard, ah, ok, type AuthedRequest } from '../lib/http';
import { pathId, hasText } from '../lib/params';
import { toIsoText } from '../lib/serialize';
import { publishToUser } from '../lib/sse-bus';
import type { NextFunction, Response } from 'express';

function nowText(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export const notificationAdminRouter = Router();

// ---------------------------------------------------------------- 枚举与常量

const CHANNEL_TYPES = ['IN_APP', 'SMS', 'WECHAT_WORK', 'WECHAT_MINIPROGRAM', 'APP'] as const;
const MESSAGE_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
const TEMPLATE_CONTENT_TYPES = ['TEXT', 'MARKDOWN'] as const;
const RULE_ACTIONS = ['ALLOW', 'DENY', 'FORCE'] as const;
const PKG = 'com.workflow.notification.model';

/** ChannelController.CHANNEL_BY_ID（ID 稳定供前端引用） */
const CHANNEL_BY_ID: ReadonlyArray<readonly [number, string]> = [
  [1, 'IN_APP'], [2, 'SMS'], [3, 'WECHAT_WORK'], [4, 'WECHAT_MINIPROGRAM'], [5, 'APP'],
];
const CHANNEL_NAMES: Record<string, string> = {
  IN_APP: '站内信', SMS: '短信', WECHAT_WORK: '企业微信', WECHAT_MINIPROGRAM: '小程序', APP: 'APP',
};
const ANNOUNCEMENT_TEMPLATE = 'ANNOUNCEMENT';
const TEST_TEMPLATE_CODE = 'CHANNEL_TEST';

// @RequestBody 缺失时 Spring 的 "Required request body is missing: <方法签名>"（500，与 read-batch 实测同族）
const SIG_CHANNEL_CONFIG =
  'public com.workflow.common.domain.R<java.lang.Void> com.workflow.notification.admin.ChannelController.updateConfig(java.lang.Long,java.util.Map<java.lang.String, java.lang.String>)';
const SIG_EVENT_CREATE =
  'public com.workflow.common.domain.R<com.workflow.notification.model.NotificationEventDefinition> com.workflow.notification.admin.EventDefinitionController.create(java.util.Map<java.lang.String, java.lang.String>)';
const SIG_EVENT_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.notification.model.NotificationEventDefinition> com.workflow.notification.admin.EventDefinitionController.update(java.lang.Long,java.util.Map<java.lang.String, java.lang.String>)';
const SIG_SUB_CREATE =
  'public com.workflow.common.domain.R<java.lang.Void> com.workflow.notification.admin.SubscriptionController.create(java.util.Map<java.lang.String, java.lang.Object>)';
const SIG_SUB_UPDATE =
  'public com.workflow.common.domain.R<java.lang.Void> com.workflow.notification.admin.SubscriptionController.update(java.lang.Long,java.util.Map<java.lang.String, java.lang.Object>)';
const SIG_TPL_CREATE =
  'public com.workflow.common.domain.R<com.workflow.notification.model.MessageTemplate> com.workflow.notification.admin.TemplateController.create(com.workflow.notification.model.MessageTemplate)';
const SIG_TPL_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.notification.model.MessageTemplate> com.workflow.notification.admin.TemplateController.update(java.lang.Long,com.workflow.notification.model.MessageTemplate)';

/** @RequestBody Map/实体绑定：缺失（Content-Length 0）→ 500（对齐 read-batch 实测） */
function requireBodyObject(req: AuthedRequest, signature: string): Record<string, unknown> {
  const b: unknown = req.body;
  const cl = req.headers['content-length'];
  const isEmptyObject = typeof b === 'object' && b !== null && !Array.isArray(b) && Object.keys(b as object).length === 0;
  if (b == null || (isEmptyObject && (cl === undefined || cl === '' || cl === '0'))) {
    throw new Error(`Required request body is missing: ${signature}`);
  }
  if (typeof b !== 'object' || b === null || Array.isArray(b)) {
    throw new Error('JSON parse error: Cannot deserialize instance of object out of VALUE token');
  }
  return b as Record<string, unknown>;
}

// ---------------------------------------------------------------- 权限与租户

function loadRoleCodes(userId: number): string[] {
  return all(
    'SELECT r.ROLE_CODE AS CODE FROM SYS_ROLE r JOIN SYS_USER_ROLE ur ON ur.ROLE_ID = r.ID WHERE ur.USER_ID = ?',
    [userId],
  ).map((r) => String(r['CODE']));
}

/** 对齐 NotificationAdminAuthorization.requireAdmin（BusinessException 403 → HTTP 200 + R.fail） */
function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  const userId = req.userId;
  const roles = userId == null ? [] : loadRoleCodes(userId);
  if (!roles.includes('ROLE_ADMIN') && !roles.includes('admin')) {
    res.status(200).json(R.fail(403, '需要管理员权限'));
    return;
  }
  next();
}

/** 对齐 TenantProvider.getTenantId（缺失 → 400 "Tenant ID is not set..."，实测逐字） */
function tenantRequired(req: AuthedRequest): string {
  const h = req.headers['x-tenant-id'];
  const v = Array.isArray(h) ? h[0] : h;
  if (v == null || String(v).trim() === '') {
    throw new TenantNotSetError('Tenant ID is not set. Ensure X-Tenant-Id header is provided.');
  }
  return String(v);
}

function currentUser(req: AuthedRequest): { userId: number; username: string } {
  return { userId: req.userId as number, username: String(req.auth?.username ?? 'system') };
}

// ---------------------------------------------------------------- 参数绑定（标量 @RequestParam：失败 → 500，实测语义）

function rawQuery(q: Record<string, unknown>, key: string): string | null {
  const v = q[key];
  if (v == null) return null;
  return Array.isArray(v) ? String(v[0]) : String(v);
}

function scalarParam500(param: string, type: string, raw: string, extra?: string): never {
  const tail = extra ?? `For input string: "${raw}"`;
  throw new Error(
    `Method parameter '${param}': Failed to convert value of type 'java.lang.String' to required type '${type}'; ${tail}`,
  );
}

function intParam(q: Record<string, unknown>, key: string): number | null {
  const s = rawQuery(q, key);
  if (s == null) return null;
  if (!/^[+-]?\d+$/.test(s)) scalarParam500(key, 'int', s);
  return Number(s);
}

function boolParam(q: Record<string, unknown>, key: string): boolean | null {
  const s = rawQuery(q, key);
  if (s == null) return null;
  const v = s.trim().toLowerCase();
  if (['true', 'on', 'yes', '1'].includes(v)) return true;
  if (['false', 'off', 'no', '0'].includes(v)) return false;
  scalarParam500(key, 'java.lang.Boolean', s, `Invalid boolean value [${s}]`);
}

function enumParam(q: Record<string, unknown>, key: string, values: readonly string[], cls: string): string | null {
  const s = rawQuery(q, key);
  if (s == null || s === '') return null;
  if (!values.includes(s)) {
    scalarParam500(
      key,
      `${PKG}.${cls}`,
      s,
      `Failed to convert from type [java.lang.String] to type [@org.springframework.web.bind.annotation.RequestParam ${PKG}.${cls}] for value [${s}]`,
    );
  }
  return s;
}

function dateTimeParam(q: Record<string, unknown>, key: string): string | null {
  const s = rawQuery(q, key);
  if (s == null || s === '') return null;
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    scalarParam500(
      key,
      'java.time.LocalDateTime',
      s,
      `Failed to convert from type [java.lang.String] to type [@org.springframework.web.bind.annotation.RequestParam @org.springframework.format.annotation.DateTimeFormat java.time.LocalDateTime] for value [${s}]`,
    );
  }
  return s;
}

function requiredParam500(param: string, type: string): never {
  throw new Error(`Required request parameter '${param}' for method parameter type ${type} is not present`);
}

function requiredStringParam(q: Record<string, unknown>, key: string): string {
  const s = rawQuery(q, key);
  if (s == null) requiredParam500(key, 'String');
  return s!;
}

function longListParam(q: Record<string, unknown>, key: string): number[] {
  const v = q[key];
  if (v == null) requiredParam500(key, 'List');
  const pieces = (Array.isArray(v) ? v : [v]).map((x) => String(x));
  const out: number[] = [];
  for (const piece of pieces) {
    for (const tok of piece.split(',')) {
      if (tok === '') continue;
      if (!/^[+-]?\d+$/.test(tok) || !Number.isFinite(Number(tok))) {
        throw new Error(
          `Method parameter '${key}': Failed to convert value of type 'java.lang.String' to required type 'java.util.List'; Failed to convert from type [java.lang.String] to type [@org.springframework.web.bind.annotation.RequestParam java.lang.Long] for value [${tok}]`,
        );
      }
      out.push(Number(tok));
    }
  }
  return out;
}

// ---------------------------------------------------------------- 序列化（8080 实测字段序）

interface MessageRow extends Record<string, unknown> {
  ID: number; TENANT_ID: string; TEMPLATE_CODE: string; EVENT_CODE: string | null;
  SENDER_ID: number; SENDER_TYPE: string; TITLE: string; CONTENT: string | null;
  LINK_JSON: string | null; PRIORITY: string | null; CATEGORY: string | null;
  MESSAGE_TYPE: string | null; CONTENT_TYPE: string | null; STATUS: string | null; CREATED_AT: string | null;
}

function parseJsonCol(v: unknown): unknown {
  if (v == null) return null;
  if (typeof v === 'string' && v !== '') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}

function messageJson(r: MessageRow, readStatus: string | null): Record<string, unknown> {
  return {
    id: Number(r.ID), tenantId: r.TENANT_ID, templateCode: r.TEMPLATE_CODE,
    senderId: Number(r.SENDER_ID), senderType: r.SENDER_TYPE, title: r.TITLE,
    content: parseJsonCol(r.CONTENT), linkJson: parseJsonCol(r.LINK_JSON),
    priority: r.PRIORITY, category: r.CATEGORY, messageType: r.MESSAGE_TYPE, status: r.STATUS,
    createdAt: r.CREATED_AT == null ? null : toIsoText(r.CREATED_AT),
    contentType: r.CONTENT_TYPE, eventCode: r.EVENT_CODE, readStatus,
  };
}

function loadMessageRow(id: number): MessageRow | null {
  return (one('SELECT * FROM MSG_MESSAGE WHERE ID = ?', [id]) as unknown as MessageRow | null) ?? null;
}

/** NotificationEventDefinition 行（字段序=8080 运行期 jar 实测：businessDomain 在首） */
function eventJson(r: Row): Record<string, unknown> {
  return {
    businessDomain: r['BUSINESS_DOMAIN'] ?? null,
    createdAt: r['CREATED_AT'] == null ? null : toIsoText(r['CREATED_AT']),
    createdBy: r['CREATED_BY'] ?? null,
    description: r['DESCRIPTION'] ?? null,
    enabled: Number(r['ENABLED']) === 1,
    eventCode: r['EVENT_CODE'] ?? null,
    eventName: r['EVENT_NAME'] ?? null,
    id: Number(r['ID']),
    tenantId: r['TENANT_ID'] ?? null,
    updatedAt: r['UPDATED_AT'] == null ? null : toIsoText(r['UPDATED_AT']),
    updatedBy: r['UPDATED_BY'] ?? null,
  };
}

/** MessageTemplate 行（字段序=8080 运行期 jar 实测：字母序风格） */
function templateJson(r: Row): Record<string, unknown> {
  return {
    category: r['CATEGORY'] ?? null,
    channel: r['CHANNEL'] ?? null,
    content: r['CONTENT'] ?? null,
    contentType: r['CONTENT_TYPE'] ?? null,
    createdAt: r['CREATED_AT'] == null ? null : toIsoText(r['CREATED_AT']),
    enabled: Number(r['ENABLED']) === 1,
    eventCode: r['EVENT_CODE'] ?? null,
    id: Number(r['ID']),
    isSystem: Number(r['IS_SYSTEM']) === 1,
    name: r['NAME'] ?? null,
    priority: r['PRIORITY'] ?? null,
    templateCode: r['TEMPLATE_CODE'] ?? null,
    tenantId: r['TENANT_ID'] ?? null,
    title: r['TITLE'] ?? null,
  };
}

// ---------------------------------------------------------------- 渠道配置（ChannelConfigService + EncryptionUtil）

function channelRows(channel: string): Row[] {
  return all('SELECT * FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ?', [channel]);
}

function isConfigured(channel: string): boolean {
  return channelRows(channel).some(
    (r) => String(r['CONFIG_KEY']) !== '__enabled' && r['CONFIG_VALUE'] != null && String(r['CONFIG_VALUE']) !== '',
  );
}

function channelEnabled(channel: string): boolean {
  const row = channelRows(channel).find((r) => String(r['CONFIG_KEY']) === '__enabled');
  if (row) return String(row['CONFIG_VALUE']).toLowerCase() === 'true';
  return channel === 'IN_APP' || isConfigured(channel);
}

function setChannelEnabled(channel: string, enabled: boolean): void {
  const now = nowText();
  const row = channelRows(channel).find((r) => String(r['CONFIG_KEY']) === '__enabled');
  if (row) {
    run('UPDATE MSG_CHANNEL_CONFIG SET CONFIG_VALUE = ?, IS_ENCRYPTED = 0, UPDATED_AT = ? WHERE ID = ?', [
      String(enabled), now, Number(row['ID']),
    ]);
  } else {
    run(
      'INSERT INTO MSG_CHANNEL_CONFIG (CHANNEL, CONFIG_KEY, CONFIG_VALUE, IS_ENCRYPTED, CREATED_AT, UPDATED_AT) VALUES (?,?,?,?,?,?)',
      [channel, '__enabled', String(enabled), 0, now, now],
    );
  }
}

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes('key') || lower.includes('secret') || lower.includes('password') || lower.includes('token');
}

/**
 * 敏感字段加密——忠实复刻 Java EncryptionUtil 在未配置 notification.encryption.key 时的
 * 运行期行为：每次加密用全新随机密钥（getSecretKey 每次 new SecureRandom 32 字节），
 * 因此密文不可还原（解密必抛"解密失败"）。密文布局与 Java 一致：base64(iv[12] + ciphertext+tag[16])。
 */
function encryptLikeJava(plain: string): string {
  const iv = randomBytes(12);
  const key = randomBytes(32);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return Buffer.concat([iv, ct]).toString('base64');
}

/** ChannelConfigService.save：整批覆盖（保留 __enabled），敏感键加密 */
function saveChannelConfig(channel: string, config: Record<string, unknown>): void {
  run(`DELETE FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY != '__enabled'`, [channel]);
  const now = nowText();
  for (const [key, rawValue] of Object.entries(config)) {
    if (key == null || key.trim() === '') continue;
    if (rawValue == null) continue;
    const sensitive = isSensitiveKey(key);
    let value: string | null = null;
    if (typeof rawValue === 'string') value = rawValue;
    else if (typeof rawValue === 'number' || typeof rawValue === 'boolean') value = String(rawValue);
    else continue; // Map<String,String> 非标量在 Jackson 阶段即失败，此处防御性跳过
    const stored = sensitive ? encryptLikeJava(value) : value;
    run(
      'INSERT INTO MSG_CHANNEL_CONFIG (CHANNEL, CONFIG_KEY, CONFIG_VALUE, IS_ENCRYPTED, CREATED_AT, UPDATED_AT) VALUES (?,?,?,?,?,?)',
      [channel, key.trim(), stored, sensitive ? 1 : 0, now, now],
    );
  }
}

// ---------------------------------------------------------------- 发送链路（与 notification.ts 同语义）

function loadSysUser(userId: number): { username: string | null; nickname: string | null; email: string | null; phone: string | null } | null {
  const row = one('SELECT USERNAME, NICKNAME, EMAIL, PHONE FROM SYS_USER WHERE ID = ?', [userId]);
  if (!row) return null;
  return {
    username: (row['USERNAME'] as string | null) ?? null,
    nickname: (row['NICKNAME'] as string | null) ?? null,
    email: (row['EMAIL'] as string | null) ?? null,
    phone: (row['PHONE'] as string | null) ?? null,
  };
}

interface AdminMsgPayload {
  tenantId: string | null;
  templateCode: string | null;
  eventCode: string | null;
  senderId: number | null;
  senderType: string | null;
  title: string | null;
  content: Record<string, unknown> | null;
  linkJson: Record<string, unknown> | null;
  priority: string | null;
  category: string | null;
  messageType: string | null;
  contentType: string | null;
  createdAt: string | null;
}

function insertMessage(m: AdminMsgPayload): number {
  const createdAt = m.createdAt ?? nowText();
  const info = run(
    `INSERT INTO MSG_MESSAGE (TENANT_ID, TEMPLATE_CODE, EVENT_CODE, SENDER_ID, SENDER_TYPE, TITLE, CONTENT, LINK_JSON,
       PRIORITY, CATEGORY, MESSAGE_TYPE, CONTENT_TYPE, STATUS, CREATED_AT)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      m.tenantId, m.templateCode, m.eventCode, m.senderId, m.senderType, m.title,
      m.content == null ? null : JSON.stringify(m.content),
      m.linkJson == null ? null : JSON.stringify(m.linkJson),
      m.priority, m.category, m.messageType, m.contentType, 'SENT', createdAt,
    ],
  );
  return Number(info.lastInsertRowid);
}

function insertRecipients(messageId: number, tenantId: string | null, recipientIds: number[]): void {
  const now = nowText();
  for (const userId of recipientIds) {
    const user = loadSysUser(userId);
    run(
      `INSERT INTO MSG_RECIPIENT (TENANT_ID, MESSAGE_ID, USER_ID, USERNAME, NICKNAME, EMAIL, PHONE, CHANNEL, STATUS, SENT_AT, CREATED_AT)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        tenantId, messageId, userId,
        user?.username ?? `user_${userId}`,
        user?.nickname ?? null, user?.email ?? null, user?.phone ?? null,
        'IN_APP', 'PENDING', null, now,
      ],
    );
  }
}

/** MessageService.send + SSE 推送（公告/渠道测试路径：不走 dispatcher 直连站内信） */
function sendInAppAndPush(message: AdminMsgPayload, recipientIds: number[], knownId?: number): void {
  const id = knownId ?? insertMessage(message);
  insertRecipients(id, message.tenantId, recipientIds);
  const payload: Record<string, unknown> = {
    id,
    tenantId: message.tenantId,
    templateCode: message.templateCode,
    senderId: message.senderId,
    senderType: message.senderType,
    title: message.title,
    content: message.content,
    linkJson: message.linkJson,
    priority: message.priority,
    category: message.category,
    messageType: message.messageType,
    status: 'SENT',
    createdAt: toIsoText(message.createdAt ?? nowText()),
    contentType: message.contentType,
    eventCode: message.eventCode,
    readStatus: null,
  };
  for (const userId of recipientIds) {
    publishToUser(userId, 'new-message', payload);
  }
}

/** java.util.Map.of("text", v, "variables", Map.of()) 的实测桶序（8080 公告/渠道测试消息一致） */
function textVariablesContent(text: string): Record<string, unknown> {
  return { variables: {}, text };
}

// ---------------------------------------------------------------- 1. StatsController — GET /stats/overview

notificationAdminRouter.get(
  '/api/v1/admin/notification/stats/overview',
  authGuard,
  requireAdmin,
  ah(async (_req: AuthedRequest, res) => {
    const totalMessages = Number(one('SELECT COUNT(*) AS C FROM MSG_MESSAGE')?.['C'] ?? 0);
    const totalRecipients = Number(one('SELECT COUNT(*) AS C FROM MSG_RECIPIENT')?.['C'] ?? 0);
    const failedRetries = Number(one('SELECT COUNT(*) AS C FROM MSG_DELIVERY_RETRY')?.['C'] ?? 0);
    // Map.of("totalMessages",..,"totalRecipients",..,"failedRetries",..) 的实测迭代序
    ok(res, { failedRetries, totalRecipients, totalMessages });
  }),
);

// ---------------------------------------------------------------- 2. ChannelController — 5 端点

function successRate(channel: string): number | null {
  if (channel === 'IN_APP') return 100;
  const retries = all('SELECT STATUS FROM MSG_DELIVERY_RETRY WHERE CHANNEL = ?', [channel]);
  if (retries.length === 0) return isConfigured(channel) ? 100 : null;
  if (retries.some((r) => String(r['STATUS']) === 'FAILED')) return 0;
  if (retries.some((r) => String(r['STATUS']) === 'PENDING')) return 50;
  return 100;
}

/** GET /api/v1/admin/notification/channels */
notificationAdminRouter.get(
  '/api/v1/admin/notification/channels',
  authGuard,
  requireAdmin,
  ah(async (_req: AuthedRequest, res) => {
    const rows = CHANNEL_BY_ID.map(([id, type]) => ({
      id,
      name: CHANNEL_NAMES[type],
      type,
      enabled: channelEnabled(type),
      successRate: successRate(type),
    }));
    ok(res, rows);
  }),
);

function channelTypeOf(idRaw: string): string | null {
  const id = Number(pathId(idRaw));
  return CHANNEL_BY_ID.find(([k]) => k === id)?.[1] ?? null;
}

function enableDisableRoute(path: string, enabled: boolean): void {
  notificationAdminRouter.post(
    path,
    authGuard,
    requireAdmin,
    ah(async (req: AuthedRequest, res) => {
      const type = channelTypeOf(String(req.params['id'] ?? ''));
      if (type == null) {
        res.json(R.fail(500, `未知渠道 ID: ${String(req.params['id'] ?? '')}`));
        return;
      }
      setChannelEnabled(type, enabled);
      ok(res);
    }),
  );
}

/** POST /api/v1/admin/notification/channels/{id}/enable */
enableDisableRoute('/api/v1/admin/notification/channels/:id/enable', true);
/** POST /api/v1/admin/notification/channels/{id}/disable */
enableDisableRoute('/api/v1/admin/notification/channels/:id/disable', false);

/** PUT /api/v1/admin/notification/channels/{id}/config */
notificationAdminRouter.put(
  '/api/v1/admin/notification/channels/:id/config',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const type = channelTypeOf(String(req.params['id'] ?? ''));
    if (type == null) {
      res.json(R.fail(500, `未知渠道 ID: ${String(req.params['id'] ?? '')}`));
      return;
    }
    const b: unknown = req.body;
    if (b == null || (Array.isArray(b) ? false : Object.keys(b as object).length === 0 && req.headers['content-length'] == null)) {
      throw new Error(`Required request body is missing: ${SIG_CHANNEL_CONFIG}`);
    }
    if (typeof b !== 'object' || b === null || Array.isArray(b)) {
      throw new Error('JSON parse error: Cannot deserialize instance of `java.util.HashMap<java.lang.String,java.lang.String>` out of VALUE token');
    }
    const config = b as Record<string, unknown>;
    saveChannelConfig(type, config);
    ok(res);
  }),
);

/** POST /api/v1/admin/notification/channels/{id}/test — 站内信真发一条给当前用户 */
notificationAdminRouter.post(
  '/api/v1/admin/notification/channels/:id/test',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const { userId } = currentUser(req);
    const type = channelTypeOf(String(req.params['id'] ?? ''));
    if (type == null) {
      res.json(R.fail(500, `未知渠道 ID: ${String(req.params['id'] ?? '')}`));
      return;
    }
    if (type === 'IN_APP') {
      const message: AdminMsgPayload = {
        tenantId: 'default',
        templateCode: TEST_TEMPLATE_CODE,
        eventCode: null,
        senderId: userId,
        senderType: 'SYSTEM',
        title: '【渠道测试】站内信连通性测试',
        content: textVariablesContent('这是一条渠道连通性**测试消息**，收到即表示站内信渠道正常。'),
        linkJson: null,
        priority: 'NORMAL',
        category: 'SYSTEM',
        messageType: 'PRIVATE',
        contentType: 'MARKDOWN',
        createdAt: null,
      };
      sendInAppAndPush(message, [userId]);
      ok(res);
      return;
    }
    // 外部渠道适配器依赖 yml 静态配置（本部署未配置）→ adapter.test() 失败分支
    res.json(R.fail(500, '渠道测试失败: 渠道未配置或配置不完整'));
  }),
);

// ---------------------------------------------------------------- 3. AnnouncementController — 4 端点

/** POST /api/v1/admin/notification/announcements?title=&content=&recipientIds= */
notificationAdminRouter.post(
  '/api/v1/admin/notification/announcements',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const title = requiredStringParam(q, 'title');
    const content = requiredStringParam(q, 'content');
    const recipientIds = longListParam(q, 'recipientIds');
    const { userId } = currentUser(req);
    const message: AdminMsgPayload = {
      tenantId: 'default', // AnnouncementController 硬编码
      templateCode: ANNOUNCEMENT_TEMPLATE,
      eventCode: null,
      senderId: userId,
      senderType: 'SYSTEM',
      title,
      content: textVariablesContent(content),
      linkJson: null,
      priority: 'NORMAL',
      category: 'SYSTEM',
      messageType: 'PUBLIC',
      contentType: 'MARKDOWN',
      createdAt: null,
    };
    sendInAppAndPush(message, recipientIds);
    ok(res);
  }),
);

/** GET /api/v1/admin/notification/announcements?page=&size=&keyword= */
notificationAdminRouter.get(
  '/api/v1/admin/notification/announcements',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const page = intParam(q, 'page') ?? 1;
    const size = intParam(q, 'size') ?? 20;
    const keyword = rawQuery(q, 'keyword');
    if (size < 1) throw new IllegalArgumentError('Page size must not be less than one');
    const normalizedPage = Math.max(page, 1);
    const where: string[] = ['TEMPLATE_CODE = ?'];
    const params: unknown[] = [ANNOUNCEMENT_TEMPLATE];
    if (hasText(keyword)) {
      where.push('TITLE LIKE ?');
      params.push(`%${keyword!.trim()}%`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM MSG_MESSAGE ${whereSql}`, params)?.['C'] ?? 0);
    const messages = all(
      `SELECT * FROM MSG_MESSAGE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
      [...params, size, (normalizedPage - 1) * size],
    ) as unknown as MessageRow[];
    const rows = messages.map((m) => {
      const count = Number(one('SELECT COUNT(*) AS C FROM MSG_RECIPIENT WHERE MESSAGE_ID = ?', [Number(m.ID)])?.['C'] ?? 0);
      return {
        id: Number(m.ID),
        title: m.TITLE,
        senderId: Number(m.SENDER_ID),
        recipientCount: count,
        createdAt: m.CREATED_AT == null ? null : toIsoText(m.CREATED_AT),
      };
    });
    ok(res, { rows, total, page: normalizedPage, size: Math.max(size, 1) });
  }),
);

/** GET /api/v1/admin/notification/announcements/{id} — 详情（完整 Markdown） */
notificationAdminRouter.get(
  '/api/v1/admin/notification/announcements/:id',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const message = loadMessageRow(id);
    if (!message) throw new BusinessException(`公告不存在: ${id}`);
    if (message.TEMPLATE_CODE !== ANNOUNCEMENT_TEMPLATE) throw new BusinessException(`非公告消息: ${id}`);
    ok(res, messageJson(message, null));
  }),
);

/** DELETE /api/v1/admin/notification/announcements/{id} — 撤回（删收件人+消息） */
notificationAdminRouter.delete(
  '/api/v1/admin/notification/announcements/:id',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const message = loadMessageRow(id);
    if (!message) throw new BusinessException(`公告不存在: ${id}`);
    if (message.TEMPLATE_CODE !== ANNOUNCEMENT_TEMPLATE) throw new BusinessException(`非公告消息，不可撤回: ${id}`);
    run('DELETE FROM MSG_RECIPIENT WHERE MESSAGE_ID = ?', [id]);
    run('DELETE FROM MSG_MESSAGE WHERE ID = ?', [id]);
    ok(res);
  }),
);

// ---------------------------------------------------------------- 4. DeliveryController — 2 端点

function deliveryStatus(m: MessageRow): string {
  const retries = all('SELECT STATUS FROM MSG_DELIVERY_RETRY WHERE MESSAGE_ID = ?', [Number(m.ID)]);
  if (retries.some((r) => String(r['STATUS']) === 'FAILED')) return 'FAILED';
  if (retries.some((r) => String(r['STATUS']) === 'PENDING')) return 'PENDING';
  return m.STATUS ?? 'SENT';
}

/** GET /api/v1/admin/notification/deliveries — 发送记录（消息+收件人聚合） */
notificationAdminRouter.get(
  '/api/v1/admin/notification/deliveries',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const page = intParam(q, 'page') ?? 1;
    const size = intParam(q, 'size') ?? 20;
    const keyword = rawQuery(q, 'keyword');
    const recipient = rawQuery(q, 'recipient');
    const channel = enumParam(q, 'channel', CHANNEL_TYPES, 'ChannelType');
    const start = dateTimeParam(q, 'start');
    const end = dateTimeParam(q, 'end');
    if (size < 1) throw new IllegalArgumentError('Page size must not be less than one');
    const normalizedPage = Math.max(page, 1);

    // 1. 收件人/渠道过滤：收件人表反查消息 ID（UNION 语义，对齐 Java matched.addAll）
    let filteredMessageIds: number[] | null = null;
    if (hasText(recipient) || channel != null) {
      const matched: number[] = [];
      if (hasText(recipient)) {
        matched.push(...all('SELECT MESSAGE_ID FROM MSG_RECIPIENT WHERE USERNAME LIKE ?', [`%${recipient!.trim()}%`]).map((r) => Number(r['MESSAGE_ID'])));
      }
      if (channel != null) {
        matched.push(...all('SELECT MESSAGE_ID FROM MSG_RECIPIENT WHERE CHANNEL = ?', [channel]).map((r) => Number(r['MESSAGE_ID'])));
      }
      filteredMessageIds = [...new Set(matched)];
      if (filteredMessageIds.length === 0) {
        ok(res, { rows: [], total: 0, page: normalizedPage, size: Math.max(size, 1) });
        return;
      }
    }

    const where: string[] = [];
    const params: unknown[] = [];
    if (hasText(keyword)) {
      where.push('TITLE LIKE ?');
      params.push(`%${keyword!.trim()}%`);
    }
    if (start != null) {
      where.push('CREATED_AT >= ?');
      params.push(start);
    }
    if (end != null) {
      where.push('CREATED_AT <= ?');
      params.push(end);
    }
    if (filteredMessageIds != null) {
      where.push(`ID IN (${filteredMessageIds.map(() => '?').join(',')})`);
      params.push(...filteredMessageIds);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(one(`SELECT COUNT(*) AS C FROM MSG_MESSAGE ${whereSql}`, params)?.['C'] ?? 0);
    const messages = all(
      `SELECT * FROM MSG_MESSAGE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
      [...params, size, (normalizedPage - 1) * size],
    ) as unknown as MessageRow[];

    const rows = messages.map((m) => {
      const recips = all('SELECT * FROM MSG_RECIPIENT WHERE MESSAGE_ID = ?', [Number(m.ID)]);
      return {
        id: Number(m.ID),
        title: m.TITLE,
        recipientCount: recips.length,
        recipients: recips.map((r) => ({
          userId: Number(r['USER_ID']),
          username: r['USERNAME'] == null ? null : String(r['USERNAME']),
          status: r['STATUS'] == null ? 'PENDING' : String(r['STATUS']),
        })),
        channel: recips.length === 0 ? 'IN_APP' : String((recips[0] as Row)['CHANNEL']),
        status: deliveryStatus(m),
        createdAt: m.CREATED_AT == null ? null : toIsoText(m.CREATED_AT),
      };
    });
    ok(res, { rows, total, page: normalizedPage, size: Math.max(size, 1) });
  }),
);

/** POST /api/v1/admin/notification/deliveries/{id}/retry — 手动重发（重新走完整发送链路） */
notificationAdminRouter.post(
  '/api/v1/admin/notification/deliveries/:id/retry',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const message = loadMessageRow(id);
    if (!message) throw new BusinessException(`消息不存在: ${id}`);
    const recips = all('SELECT * FROM MSG_RECIPIENT WHERE MESSAGE_ID = ?', [id]);
    if (recips.length === 0) {
      res.json(R.fail(500, '该消息无收件人记录，无法重发'));
      return;
    }
    const recipientIds = [...new Set(recips.map((r) => Number(r['USER_ID'])))];
    let channels = [...new Set(recips.map((r) => String(r['CHANNEL'])))];
    if (channels.length === 0) channels = ['IN_APP'];
    // 重发：消息行已存在（JPA merge no-op），补建收件人 + SSE 推送（对齐 MessageDispatcher）
    const payload: AdminMsgPayload = {
      tenantId: message.TENANT_ID,
      templateCode: message.TEMPLATE_CODE,
      eventCode: message.EVENT_CODE,
      senderId: Number(message.SENDER_ID),
      senderType: message.SENDER_TYPE,
      title: message.TITLE,
      content: parseJsonCol(message.CONTENT) as Record<string, unknown> | null,
      linkJson: parseJsonCol(message.LINK_JSON) as Record<string, unknown> | null,
      priority: message.PRIORITY,
      category: message.CATEGORY,
      messageType: message.MESSAGE_TYPE,
      contentType: message.CONTENT_TYPE,
      createdAt: message.CREATED_AT,
    };
    if (channels.includes('IN_APP') && channelEnabled('IN_APP')) {
      insertRecipients(id, message.TENANT_ID, recipientIds);
      const push: Record<string, unknown> = {
        ...messageJson(message, null),
        status: 'SENT',
      };
      for (const userId of recipientIds) {
        publishToUser(userId, 'new-message', push);
      }
    }
    // 外部渠道：本部署适配器不可用 → 跳过（对齐 Java）
    ok(res);
  }),
);

// ---------------------------------------------------------------- 5. EventDefinitionController — 5 端点

const EVENT_CODE_REGEX = /^[A-Z][A-Z0-9_]{0,63}$/;

/** GET /api/v1/admin/notification/events（size 由 Math.max(size,1) 归一，size=0 不报错） */
notificationAdminRouter.get(
  '/api/v1/admin/notification/events',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const tenantId = tenantRequired(req);
    const page = intParam(q, 'page') ?? 1;
    const size = intParam(q, 'size') ?? 20;
    const keyword = rawQuery(q, 'keyword');
    const enabled = boolParam(q, 'enabled');
    const normalizedPage = Math.max(page, 1);
    const normalizedSize = Math.max(size, 1);

    const where: string[] = ['TENANT_ID = ?'];
    const params: unknown[] = [tenantId];
    if (enabled != null) {
      where.push('ENABLED = ?');
      params.push(enabled ? 1 : 0);
    }
    if (hasText(keyword)) {
      where.push('(EVENT_CODE LIKE ? OR EVENT_NAME LIKE ?)');
      params.push(`%${keyword!.trim()}%`, `%${keyword!.trim()}%`);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM MSG_EVENT_DEFINITION ${whereSql}`, params)?.['C'] ?? 0);
    const rows = all(
      `SELECT * FROM MSG_EVENT_DEFINITION ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
      [...params, normalizedSize, (normalizedPage - 1) * normalizedSize],
    );
    ok(res, { total, page: normalizedPage, size: normalizedSize, rows: rows.map(eventJson) });
  }),
);

function eventBodyStrings(b: Record<string, unknown>): { eventCode: string | null; eventName: string | null; description: string | null; businessDomain: string | null } {
  const str = (v: unknown): string | null => {
    if (v == null) return null;
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    throw new Error('Cannot deserialize value of type `java.lang.String` from Object value');
  };
  return { eventCode: str(b['eventCode']), eventName: str(b['eventName']), description: str(b['description']), businessDomain: str(b['businessDomain']) };
}

/** POST /api/v1/admin/notification/events */
notificationAdminRouter.post(
  '/api/v1/admin/notification/events',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantRequired(req);
    const { username } = currentUser(req);
    const body = requireBodyObject(req, SIG_EVENT_CREATE);
    const { eventCode, eventName, description, businessDomain } = eventBodyStrings(body);
    if (eventCode == null || !EVENT_CODE_REGEX.test(eventCode)) {
      throw new BusinessException('事件代码必须为大写字母、数字和下划线，且首字符为大写字母', 400);
    }
    if (eventName == null || eventName.trim().length === 0) throw new BusinessException('事件名称不能为空');
    const dup = one('SELECT ID FROM MSG_EVENT_DEFINITION WHERE TENANT_ID = ? AND EVENT_CODE = ?', [tenantId, eventCode]);
    if (dup) throw new BusinessException(`事件代码已存在: ${eventCode}`, 409);
    const now = nowText();
    run(
      `INSERT INTO MSG_EVENT_DEFINITION (TENANT_ID, EVENT_CODE, EVENT_NAME, DESCRIPTION, BUSINESS_DOMAIN, ENABLED, CREATED_BY, CREATED_AT, UPDATED_BY, UPDATED_AT)
       VALUES (?,?,?,?,?,1,?,?,?,?)`,
      [tenantId, eventCode, eventName, description, businessDomain, username, now, username, now],
    );
    const row = one('SELECT * FROM MSG_EVENT_DEFINITION WHERE TENANT_ID = ? AND EVENT_CODE = ?', [tenantId, eventCode]) as Row;
    ok(res, eventJson(row));
  }),
);

function loadEventForTenant(id: number, tenantId: string): Row {
  const row = one('SELECT * FROM MSG_EVENT_DEFINITION WHERE ID = ? AND TENANT_ID = ?', [id, tenantId]);
  if (!row) throw new BusinessException(`事件不存在: ${id}`, 404);
  return row;
}

/** PUT /api/v1/admin/notification/events/{id} */
notificationAdminRouter.put(
  '/api/v1/admin/notification/events/:id',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantRequired(req);
    const { username } = currentUser(req);
    const id = pathId(req.params['id']);
    loadEventForTenant(id, tenantId);
    const body = requireBodyObject(req, SIG_EVENT_UPDATE);
    const { eventName, description, businessDomain } = eventBodyStrings(body);
    if (eventName == null || eventName.trim().length === 0) throw new BusinessException('事件名称不能为空');
    run(
      'UPDATE MSG_EVENT_DEFINITION SET EVENT_NAME = ?, DESCRIPTION = ?, BUSINESS_DOMAIN = ?, UPDATED_BY = ?, UPDATED_AT = ? WHERE ID = ? AND TENANT_ID = ?',
      [eventName, description, businessDomain, username, nowText(), id, tenantId],
    );
    ok(res, eventJson(loadEventForTenant(id, tenantId)));
  }),
);

/** DELETE /api/v1/admin/notification/events/{id} */
notificationAdminRouter.delete(
  '/api/v1/admin/notification/events/:id',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantRequired(req);
    const id = pathId(req.params['id']);
    const ev = loadEventForTenant(id, tenantId);
    const eventCode = String(ev['EVENT_CODE']);
    const referenced =
      one('SELECT ID FROM MSG_TEMPLATE WHERE TENANT_ID = ? AND EVENT_CODE = ? LIMIT 1', [tenantId, eventCode]) ??
      one('SELECT ID FROM MSG_SUBSCRIPTION_RULE WHERE TENANT_ID = ? AND EVENT_CODE = ? LIMIT 1', [tenantId, eventCode]);
    if (referenced) throw new BusinessException('事件已被模板或订阅规则引用，不能删除', 409);
    run('DELETE FROM MSG_EVENT_DEFINITION WHERE ID = ?', [id]);
    ok(res);
  }),
);

/** POST /api/v1/admin/notification/events/{id}/toggle */
notificationAdminRouter.post(
  '/api/v1/admin/notification/events/:id/toggle',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantRequired(req);
    const { username } = currentUser(req);
    const id = pathId(req.params['id']);
    const ev = loadEventForTenant(id, tenantId);
    const nextEnabled = Number(ev['ENABLED']) === 1 ? 0 : 1;
    run(
      'UPDATE MSG_EVENT_DEFINITION SET ENABLED = ?, UPDATED_BY = ?, UPDATED_AT = ? WHERE ID = ?',
      [nextEnabled, username, nowText(), id],
    );
    ok(res);
  }),
);

// ---------------------------------------------------------------- 6. SubscriptionController — 4 端点

function ruleJson(r: Row): Record<string, unknown> {
  return {
    id: Number(r['ID']),
    eventCode: r['EVENT_CODE'] ?? null,
    channel: r['CHANNEL'] ?? null,
    priority: r['PRIORITY'] ?? null,
    enable: Number(r['ENABLE']) === 1,
    action: r['ACTION'] ?? null,
    condition: r['CONDITION_EXPR'] ?? null,
    createdBy: r['CREATED_BY'] ?? null,
    createdAt: r['CREATED_AT'] == null ? null : toIsoText(r['CREATED_AT']),
  };
}

/** GET /api/v1/admin/notification/subscriptions?page=&size=&eventCode= */
notificationAdminRouter.get(
  '/api/v1/admin/notification/subscriptions',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const page = intParam(q, 'page') ?? 1;
    const size = intParam(q, 'size') ?? 20;
    const eventCode = rawQuery(q, 'eventCode');
    if (size < 1) throw new IllegalArgumentError('Page size must not be less than one');
    const normalizedPage = Math.max(page, 1);
    const where: string[] = [];
    const params: unknown[] = [];
    if (hasText(eventCode)) {
      where.push('EVENT_CODE LIKE ?');
      params.push(`%${eventCode!.trim()}%`);
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const total = Number(one(`SELECT COUNT(*) AS C FROM MSG_SUBSCRIPTION_RULE ${whereSql}`, params)?.['C'] ?? 0);
    const rules = all(
      `SELECT * FROM MSG_SUBSCRIPTION_RULE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
      [...params, size, (normalizedPage - 1) * size],
    );
    ok(res, { rows: rules.map(ruleJson), total, page: normalizedPage, size: Math.max(size, 1) });
  }),
);

/** java.lang.Enum.valueOf 对齐：非法 → IllegalArgumentException("No enum constant ...") → HTTP 400 */
function enumValueOf(body: Record<string, unknown>, key: string, values: readonly string[], cls: string): string | null {
  const v = body[key];
  if (v == null) return null;
  const s = String(v);
  if (!values.includes(s)) {
    throw new IllegalArgumentError(`No enum constant ${PKG}.${cls}.${s}`);
  }
  return s;
}

/** Boolean.valueOf(String.valueOf(v))：仅 "true"（忽略大小写）为 true，其余一律 false */
function booleanValueOf(body: Record<string, unknown>, key: string): boolean | null {
  const v = body[key];
  if (v == null) return null;
  return String(v).toLowerCase() === 'true';
}

function applyRuleFields(entity: Record<string, unknown>, body: Record<string, unknown>): void {
  if (body['eventCode'] != null) entity['eventCode'] = body['eventCode'] == null ? null : String(body['eventCode']);
  const channel = enumValueOf(body, 'channel', CHANNEL_TYPES, 'ChannelType');
  if (channel != null) entity['channel'] = channel;
  const priority = enumValueOf(body, 'priority', MESSAGE_PRIORITIES, 'MessagePriority');
  if (priority != null) entity['priority'] = priority;
  const enable = booleanValueOf(body, 'enable');
  if (enable != null) entity['enable'] = enable;
  const action = enumValueOf(body, 'action', RULE_ACTIONS, 'SubscriptionRuleAction');
  if (action != null) entity['action'] = action;
  if (body['condition'] != null) entity['condition'] = String(body['condition']);
  else if (body['conditionExpr'] != null) entity['condition'] = String(body['conditionExpr']);
}

function readRuleBody(req: AuthedRequest): Record<string, unknown> {
  const b: unknown = req.body;
  return typeof b === 'object' && b !== null && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

/** POST /api/v1/admin/notification/subscriptions */
notificationAdminRouter.post(
  '/api/v1/admin/notification/subscriptions',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantRequired(req);
    const { username } = currentUser(req);
    const body = requireBodyObject(req, SIG_SUB_CREATE);
    const fields: Record<string, unknown> = {};
    applyRuleFields(fields, body);
    run(
      `INSERT INTO MSG_SUBSCRIPTION_RULE (TENANT_ID, EVENT_CODE, CHANNEL, PRIORITY, ENABLE, ACTION, CONDITION_EXPR, CREATED_BY, CREATED_AT)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        tenantId,
        fields['eventCode'] ?? null,
        fields['channel'] ?? null,
        fields['priority'] ?? null,
        fields['enable'] == null ? null : fields['enable'] ? 1 : 0,
        fields['action'] ?? 'ALLOW', // 实体字段默认 ALLOW
        fields['condition'] ?? null,
        username,
        nowText(),
      ],
    );
    ok(res);
  }),
);

/** PUT /api/v1/admin/notification/subscriptions/{id} */
notificationAdminRouter.put(
  '/api/v1/admin/notification/subscriptions/:id',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const existing = one('SELECT * FROM MSG_SUBSCRIPTION_RULE WHERE ID = ?', [id]);
    if (!existing) throw new BusinessException(`订阅规则不存在: ${id}`);
    const body = requireBodyObject(req, SIG_SUB_UPDATE);
    const fields: Record<string, unknown> = {
      eventCode: existing['EVENT_CODE'] == null ? null : String(existing['EVENT_CODE']),
      channel: existing['CHANNEL'] == null ? null : String(existing['CHANNEL']),
      priority: existing['PRIORITY'] == null ? null : String(existing['PRIORITY']),
      enable: Number(existing['ENABLE']) === 1,
      action: existing['ACTION'] == null ? null : String(existing['ACTION']),
      condition: existing['CONDITION_EXPR'] == null ? null : String(existing['CONDITION_EXPR']),
    };
    applyRuleFields(fields, body);
    run(
      `UPDATE MSG_SUBSCRIPTION_RULE SET EVENT_CODE = ?, CHANNEL = ?, PRIORITY = ?, ENABLE = ?, ACTION = ?, CONDITION_EXPR = ? WHERE ID = ?`,
      [
        fields['eventCode'] ?? null,
        fields['channel'] ?? null,
        fields['priority'] ?? null,
        fields['enable'] ? 1 : 0,
        fields['action'] ?? null,
        fields['condition'] ?? null,
        id,
      ],
    );
    ok(res);
  }),
);

/** DELETE /api/v1/admin/notification/subscriptions/{id} */
notificationAdminRouter.delete(
  '/api/v1/admin/notification/subscriptions/:id',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    if (!one('SELECT ID FROM MSG_SUBSCRIPTION_RULE WHERE ID = ?', [id])) {
      throw new BusinessException(`订阅规则不存在: ${id}`);
    }
    run('DELETE FROM MSG_SUBSCRIPTION_RULE WHERE ID = ?', [id]);
    ok(res);
  }),
);

// ---------------------------------------------------------------- 7. TemplateController — 4 端点

/** GET /api/v1/admin/notification/templates — 全量列表（Java findAll 不过滤租户/启用） */
notificationAdminRouter.get(
  '/api/v1/admin/notification/templates',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    tenantRequired(req); // Java list() 调用 getTenantId()（即便未使用）
    const rows = all('SELECT * FROM MSG_TEMPLATE ORDER BY ID');
    ok(res, rows.map(templateJson));
  }),
);

/** 模板实体 Jackson 绑定校验（枚举/布尔字段非法 → generic 500） */
function templateEnumCheck(body: Record<string, unknown>): void {
  // 枚举字段先行校验（Jackson 绑定失败 → 500）
  const enumOf = (key: string, values: readonly string[], cls: string): void => {
    const v = body[key];
    if (v == null) return;
    if (typeof v === 'number') {
      if (values[v] == null) throw new Error(`Cannot deserialize value of type \`${PKG}.${cls}\` from number ${v}`);
      return;
    }
    const s = String(v);
    if (!values.includes(s)) {
      throw new Error(`Cannot deserialize value of type \`${PKG}.${cls}\` from String "${s}": not one of the values accepted for Enum class: [${values.join(', ')}]`);
    }
  };
  enumOf('channel', CHANNEL_TYPES, 'ChannelType');
  enumOf('priority', MESSAGE_PRIORITIES, 'MessagePriority');
  enumOf('contentType', TEMPLATE_CONTENT_TYPES, 'TemplateContentType');
  // Boolean 字段（Jackson：true/false 或 "true"/"false" 字符串）
  const boolOf = (key: string): void => {
    const v = body[key];
    if (v == null) return;
    if (typeof v === 'boolean') return;
    if (typeof v === 'string' && ['true', 'false'].includes(v.toLowerCase())) return;
    throw new Error(`Cannot deserialize value of type \`java.lang.Boolean\` from String "${String(v)}"`);
  };
  boolOf('isSystem');
  boolOf('enabled');
}

function templateField(body: Record<string, unknown>, key: string): string | null {
  const v = body[key];
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new Error(`Cannot deserialize value of type \`java.lang.String\` from Object value (token \`${key}\`)`);
}

/** POST /api/v1/admin/notification/templates（tenantId 由后端注入；isSystem 强制 false） */
notificationAdminRouter.post(
  '/api/v1/admin/notification/templates',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantRequired(req);
    const body = requireBodyObject(req, SIG_TPL_CREATE);
    templateEnumCheck(body);
    const templateCode = templateField(body, 'templateCode');
    if (templateCode != null && one('SELECT ID FROM MSG_TEMPLATE WHERE TENANT_ID = ? AND TEMPLATE_CODE = ?', [tenantId, templateCode])) {
      throw new BusinessException(`模板代码已存在: ${templateCode}`);
    }
    const eventCode = templateField(body, 'eventCode');
    const enabled = body['enabled'] == null ? true : String(body['enabled']).toLowerCase() === 'true';
    if (eventCode != null && eventCode.trim().length > 0) {
      const ev = one('SELECT ID FROM MSG_EVENT_DEFINITION WHERE TENANT_ID = ? AND EVENT_CODE = ? AND ENABLED = 1', [tenantId, eventCode]);
      if (!ev) throw new BusinessException(`事件不存在或已停用: ${eventCode}`, 400);
      const channel = templateField(body, 'channel');
      if (enabled && channel != null && one(
        'SELECT ID FROM MSG_TEMPLATE WHERE TENANT_ID = ? AND EVENT_CODE = ? AND CHANNEL = ? AND ENABLED = 1 LIMIT 1',
        [tenantId, eventCode, channel],
      )) {
        throw new BusinessException('同一事件和渠道已有启用模板');
      }
    }
    const createdAtRaw = body['createdAt'] == null ? null : String(body['createdAt']).replace('T', ' ').slice(0, 19);
    run(
      `INSERT INTO MSG_TEMPLATE (TENANT_ID, TEMPLATE_CODE, EVENT_CODE, NAME, TITLE, CONTENT, CONTENT_TYPE, CHANNEL, PRIORITY, CATEGORY, IS_SYSTEM, ENABLED, CREATED_AT)
       VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?)`,
      [
        tenantId,
        templateCode,
        eventCode,
        templateField(body, 'name'),
        templateField(body, 'title'),
        templateField(body, 'content'),
        templateField(body, 'contentType'),
        templateField(body, 'channel'),
        templateField(body, 'priority'),
        templateField(body, 'category'),
        enabled ? 1 : 0,
        createdAtRaw ?? nowText(),
      ],
    );
    const row = one('SELECT * FROM MSG_TEMPLATE WHERE TENANT_ID = ? AND TEMPLATE_CODE = ? ORDER BY ID DESC LIMIT 1', [tenantId, templateCode]) as Row;
    ok(res, templateJson(row));
  }),
);

/** PUT /api/v1/admin/notification/templates/{id}（系统模板仅允许改 name/title/content/contentType/enabled） */
notificationAdminRouter.put(
  '/api/v1/admin/notification/templates/:id',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const existing = one('SELECT * FROM MSG_TEMPLATE WHERE ID = ?', [id]) as Row | null;
    if (!existing) throw new BusinessException('模板不存在');
    const body = requireBodyObject(req, SIG_TPL_UPDATE);
    templateEnumCheck(body);
    const isSystem = Number(existing['IS_SYSTEM']) === 1;
    const contentType = templateField(body, 'contentType');
    const enabledRaw = body['enabled'] == null ? null : String(body['enabled']).toLowerCase() === 'true';
    const name = templateField(body, 'name');
    const title = templateField(body, 'title');
    const content = templateField(body, 'content');
    let priority: string | null = existing['PRIORITY'] == null ? null : String(existing['PRIORITY']);
    let category: string | null = existing['CATEGORY'] == null ? null : String(existing['CATEGORY']);
    if (!isSystem) {
      priority = templateField(body, 'priority');
      category = templateField(body, 'category');
    }
    run(
      `UPDATE MSG_TEMPLATE SET NAME = ?, TITLE = ?, CONTENT = ?, CONTENT_TYPE = ?, ENABLED = ?, PRIORITY = ?, CATEGORY = ? WHERE ID = ?`,
      [
        name,
        title,
        content,
        contentType ?? (existing['CONTENT_TYPE'] == null ? null : String(existing['CONTENT_TYPE'])),
        enabledRaw == null ? Number(existing['ENABLED']) : enabledRaw ? 1 : 0,
        priority,
        category,
        id,
      ],
    );
    ok(res, templateJson(one('SELECT * FROM MSG_TEMPLATE WHERE ID = ?', [id]) as Row));
  }),
);

/** POST /api/v1/admin/notification/templates/{id}/toggle */
notificationAdminRouter.post(
  '/api/v1/admin/notification/templates/:id/toggle',
  authGuard,
  requireAdmin,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const existing = one('SELECT * FROM MSG_TEMPLATE WHERE ID = ?', [id]);
    if (!existing) throw new BusinessException('模板不存在');
    const next = Number(existing['ENABLED']) === 1 ? 0 : 1;
    run('UPDATE MSG_TEMPLATE SET ENABLED = ? WHERE ID = ?', [next, id]);
    ok(res);
  }),
);
