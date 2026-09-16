/**
 * notification.ts — 用户端消息中心 + SSE + 通知内部 API（Task 13-7）
 *
 * 对齐 Java：
 *  - NotificationController（/api/v1/notifications，9 端点：list/getById/markAsRead/
 *    batchMarkAsRead/toggleRead/markAllAsRead/delete/getUnreadCount/sse）
 *  - InternalNotificationController（/api/v1/internal/notifications/send|send-by-template）
 *  - MessageServiceImpl / MessageSender / TemplateService / MessageDispatcher 语义
 *
 * 契约来源（全部为 8080 实测金标准，Task 13-7 采集）：
 *  - Message 行 JSON 字段序（运行期 jar 与当前源码声明序不同，以实测为准）：
 *      id, tenantId, templateCode, senderId, senderType, title, content, linkJson,
 *      priority, category, messageType, status, createdAt, contentType, eventCode, readStatus
 *  - content/linkJson 为 JSON 文本列：/send 原样保留客户端键序（Hibernate 读回为
 *    LinkedHashMap，实测）；send-by-template 走 HashMap 桶序（javaHashMapOrdered，实测
 *    {variables, text} 与内层 {processName, initiatorName, taskName} 一致）
 *  - readStatus：PENDING=未读 / SENT=已读（msg_recipient.STATUS），列表/详情回填、SSE 推送为 null
 *  - 未读数 = MSG_RECIPIENT WHERE USER_ID AND STATUS='PENDING' 计数
 *  - 标量 @RequestParam 转换失败 → HTTP 500 + "Method parameter 'x': Failed to convert ..."
 *    （区别于 system 模块 @ModelAttribute 的 200+400 语义，Task 13-4 params.ts 早已区分）
 *  - SSE：唯一 permitAll + query token 端点；无效 token → 400 "无效的访问令牌"；
 *    类型非 access_token → 400 "令牌类型必须是访问令牌"；缺 token → 500（MissingServletRequestParameter
 *    落入 generic handler，实测消息逐字对齐）；推送帧 `event:new-message\ndata:{...}\n\n`
 */
import { Router } from 'express';
import { all, one, run } from '../lib/db';
import { R, BusinessException, IllegalArgumentError, TenantNotSetError } from '../lib/errors';
import { authGuard, ah, ok, type AuthedRequest } from '../lib/http';
import { pathId, bodyLong, hasText, nowText } from '../lib/params';
import { pageResult } from '../lib/page';
import { toIsoText, javaHashMapOrdered } from '../lib/serialize';
import { registerSse, publishToUser } from '../lib/sse-bus';
import { verifyToken } from '../lib/jwt';

export const notificationRouter = Router();

// ---------------------------------------------------------------- Java 枚举

const CHANNEL_TYPES = ['IN_APP', 'SMS', 'WECHAT_WORK', 'WECHAT_MINIPROGRAM', 'APP'] as const;
const MESSAGE_CATEGORIES = ['WORKFLOW', 'SYSTEM', 'NOTIFICATION', 'TASK', 'APPROVAL'] as const;
const MESSAGE_TYPES = ['PRIVATE', 'PUBLIC', 'SYSTEM'] as const;
const MESSAGE_PRIORITIES = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
const TEMPLATE_CONTENT_TYPES = ['TEXT', 'MARKDOWN'] as const;
const MESSAGE_STATUSES = ['PENDING', 'SENT', 'READ', 'DELETED', 'FAILED'] as const;

const PKG = 'com.workflow.notification.model';

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

/** int @RequestParam（defaultValue 由调用方处理） */
function intParam(q: Record<string, unknown>, key: string): number | null {
  const s = rawQuery(q, key);
  if (s == null) return null;
  if (!/^[+-]?\d+$/.test(s)) scalarParam500(key, 'int', s);
  return Number(s);
}

/** Boolean @RequestParam（Spring StringToBooleanConverter：true/on/yes/1、false/off/no/0，实测 unread=1 通过） */
function boolParam(q: Record<string, unknown>, key: string): boolean | null {
  const s = rawQuery(q, key);
  if (s == null) return null;
  const v = s.trim().toLowerCase();
  if (['true', 'on', 'yes', '1'].includes(v)) return true;
  if (['false', 'off', 'no', '0'].includes(v)) return false;
  scalarParam500(key, 'java.lang.Boolean', s, `Invalid boolean value [${s}]`);
}

/** 枚举 @RequestParam（@RequestParam 枚举转换失败消息，实测捕获） */
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

/** LocalDateTime @RequestParam（@DateTimeFormat pattern="yyyy-MM-dd HH:mm:ss"，实测捕获） */
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

/** 必填标量 @RequestParam 缺失（MissingServletRequestParameter → generic 500，实测逐字） */
function requiredParam500(param: string, type: string): never {
  throw new Error(`Required request parameter '${param}' for method parameter type ${type} is not present`);
}

/** List<Long> @RequestParam（required）；元素失败 → 与 channels 枚举同族消息（实测） */
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

/** List<枚举> @RequestParam（required）；实测 channels=BOGUS 消息逐字对齐 */
function enumListParam(q: Record<string, unknown>, key: string, values: readonly string[], cls: string): string[] {
  const v = q[key];
  if (v == null) requiredParam500(key, 'List');
  const pieces = (Array.isArray(v) ? v : [v]).map((x) => String(x));
  const out: string[] = [];
  for (const piece of pieces) {
    for (const tok of piece.split(',')) {
      if (tok === '') continue;
      if (!values.includes(tok)) {
        throw new Error(
          `Method parameter '${key}': Failed to convert value of type 'java.lang.String' to required type 'java.util.List'; Failed to convert from type [java.lang.String] to type [@org.springframework.web.bind.annotation.RequestParam ${PKG}.${cls}] for value [${tok}]`,
        );
      }
      out.push(tok);
    }
  }
  return out;
}

// ---------------------------------------------------------------- 序列化（8080 实测字段序）

interface MessageRow extends Record<string, unknown> {
  ID: number;
  TENANT_ID: string;
  TEMPLATE_CODE: string;
  EVENT_CODE: string | null;
  SENDER_ID: number;
  SENDER_TYPE: string;
  TITLE: string;
  CONTENT: string | null;
  LINK_JSON: string | null;
  PRIORITY: string | null;
  CATEGORY: string | null;
  MESSAGE_TYPE: string | null;
  CONTENT_TYPE: string | null;
  STATUS: string | null;
  CREATED_AT: string | null;
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

/** Message 行 → JSON（字段序=8080 实测运行期 jar 顺序；readStatus 由调用方回填） */
function messageJson(r: MessageRow, readStatus: string | null): Record<string, unknown> {
  return {
    id: Number(r.ID),
    tenantId: r.TENANT_ID,
    templateCode: r.TEMPLATE_CODE,
    senderId: Number(r.SENDER_ID),
    senderType: r.SENDER_TYPE,
    title: r.TITLE,
    content: parseJsonCol(r.CONTENT),
    linkJson: parseJsonCol(r.LINK_JSON),
    priority: r.PRIORITY,
    category: r.CATEGORY,
    messageType: r.MESSAGE_TYPE,
    status: r.STATUS,
    createdAt: r.CREATED_AT == null ? null : toIsoText(r.CREATED_AT),
    contentType: r.CONTENT_TYPE,
    eventCode: r.EVENT_CODE,
    readStatus,
  };
}

function loadMessageRow(id: number): MessageRow | null {
  return (one('SELECT * FROM MSG_MESSAGE WHERE ID = ?', [id]) as unknown as MessageRow | null) ?? null;
}

// ---------------------------------------------------------------- 渠道启停（ChannelConfigService 语义）

function isConfigured(channel: string): boolean {
  const rows = all(`SELECT CONFIG_VALUE FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY != '__enabled'`, [channel]);
  return rows.some((r) => r['CONFIG_VALUE'] != null && String(r['CONFIG_VALUE']) !== '');
}

function channelEnabled(channel: string): boolean {
  const row = one(`SELECT CONFIG_VALUE FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY = '__enabled' LIMIT 1`, [channel]);
  if (row) return String(row['CONFIG_VALUE']).toLowerCase() === 'true';
  return channel === 'IN_APP' || isConfigured(channel);
}

// ---------------------------------------------------------------- 发送链路（MessageService.send + MessageDispatcher）

interface MsgPayload {
  id?: number | null;
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
  status?: string | null;
  createdAt: string | null; // "yyyy-MM-dd HH:mm:ss"；null → 发送时补 now
}

function insertMessage(m: MsgPayload, explicitId?: number | null, createdAtOverride?: string | null): number {
  const createdAt = createdAtOverride ?? m.createdAt ?? nowText();
  const content = m.content == null ? null : JSON.stringify(m.content);
  const linkJson = m.linkJson == null ? null : JSON.stringify(m.linkJson);
  const info = run(
    `INSERT INTO MSG_MESSAGE (ID, TENANT_ID, TEMPLATE_CODE, EVENT_CODE, SENDER_ID, SENDER_TYPE, TITLE, CONTENT, LINK_JSON,
       PRIORITY, CATEGORY, MESSAGE_TYPE, CONTENT_TYPE, STATUS, CREATED_AT)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      explicitId ?? null, m.tenantId, m.templateCode, m.eventCode, m.senderId, m.senderType, m.title,
      content, linkJson, m.priority, m.category, m.messageType, m.contentType, 'SENT', createdAt,
    ],
  );
  return explicitId ?? Number(info.lastInsertRowid);
}

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

/** 创建收件人记录（MessageServiceImpl.send；IN_APP + PENDING） */
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
        user?.nickname ?? null,
        user?.email ?? null,
        user?.phone ?? null,
        'IN_APP', 'PENDING', null, now,
      ],
    );
  }
}

/** X-Tenant-Id 必填（TenantProvider.getTenantId 语义：缺失 → 400 "Tenant ID is not set..."，实测） */
function tenantRequired(req: AuthedRequest): string {
  const h = req.headers['x-tenant-id'];
  const v = Array.isArray(h) ? h[0] : h;
  if (v == null || String(v).trim() === '') {
    throw new TenantNotSetError('Tenant ID is not set. Ensure X-Tenant-Id header is provided.');
  }
  return String(v);
}

/**
 * MessageDispatcher.handleMessageEvent 等价物：
 *  - IN_APP + 渠道启用 → 写消息 + 收件人 + SSE 逐个推送 "new-message"
 *  - 外部渠道：本部署无 notification.* 配置 → 适配器 isAvailable=false → 跳过（无重试记录，对齐 Java）
 * existingId 非 null（重发场景）：消息已存在，仅补建收件人 + 推送（Java 为 JPA merge no-op）；
 *   若 id 不存在（/send 显式带 id）→ 按该 id 落库（对齐 JPA save 新增）。
 */
function dispatchMessage(message: MsgPayload, recipientIds: number[], channels: string[], existingId?: number | null): void {
  if (channels.includes('IN_APP') && channelEnabled('IN_APP')) {
    if (recipientIds.length > 0) {
      const createdAt = message.createdAt ?? nowText();
      let id: number;
      if (existingId != null && loadMessageRow(existingId) != null) {
        id = existingId; // JPA merge：行已存在，仅原值重发
      } else {
        id = insertMessage(message, existingId ?? null, createdAt);
      }
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
        createdAt: toIsoText(createdAt),
        contentType: message.contentType,
        eventCode: message.eventCode,
        readStatus: null,
      };
      for (const userId of recipientIds) {
        publishToUser(userId, 'new-message', payload);
      }
    }
  }
  // 外部渠道（SMS/WECHAT_WORK/WECHAT_MINIPROGRAM/APP）：适配器依赖 yml 静态配置，
  // 本部署未配置 → isAvailable=false → 跳过投递（Java MessageDispatcher 日志"渠道不可用"）。
}

// ---------------------------------------------------------------- 模板渲染（TemplateService）

const VARIABLE_RE = /\$\{([^}]+)\}/g;

/** 校验必填变量（标题先于内容，首个缺失即抛，实测消息） */
function validateVariables(template: string | null, variables: Record<string, unknown> | null): void {
  if (template == null) return;
  const vars = variables ?? {};
  for (const match of template.matchAll(VARIABLE_RE)) {
    const name = match[1] ?? '';
    if (name === '' || !(name in vars) || vars[name] == null) {
      throw new BusinessException(`缺少必填变量: ${name}`);
    }
  }
}

/** 渲染 ${var} → value.toString()；值为 null → 空串（对齐 Java render） */
function renderTemplate(template: string | null, variables: Record<string, unknown> | null): string | null {
  if (template == null || variables == null) return template;
  return template.replace(VARIABLE_RE, (_m, name: string) => {
    const value = variables[name];
    return value == null ? '' : String(value);
  });
}

// ---------------------------------------------------------------- 用户端消息中心（8 + SSE）

const SIG_BATCH_READ =
  'public com.workflow.common.domain.R<java.lang.Void> com.workflow.notification.api.NotificationController.batchMarkAsRead(java.util.List<java.lang.Long>)';

/** GET /api/v1/notifications — 消息列表（分页 + keyword/category/unread/start/end/messageType） */
notificationRouter.get(
  '/api/v1/notifications',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const page = intParam(q, 'page') ?? 1;
    const size = intParam(q, 'size') ?? 20;
    const keyword = rawQuery(q, 'keyword');
    const category = enumParam(q, 'category', MESSAGE_CATEGORIES, 'MessageCategory');
    const unread = boolParam(q, 'unread');
    const start = dateTimeParam(q, 'start');
    const end = dateTimeParam(q, 'end');
    const messageType = enumParam(q, 'messageType', MESSAGE_TYPES, 'MessageType');

    const userId = req.userId as number;
    // 1. 收件人记录过滤（unread=true→PENDING 未读 / false→SENT 已读）
    const recipients = all(
      unread == null
        ? 'SELECT * FROM MSG_RECIPIENT WHERE USER_ID = ?'
        : 'SELECT * FROM MSG_RECIPIENT WHERE USER_ID = ? AND STATUS = ?',
      unread == null ? [userId] : [userId, unread ? 'PENDING' : 'SENT'],
    );
    const normalizedPage = Math.max(page, 1);
    if (recipients.length === 0) {
      // Java 早返回：PageResult(0, max(page,1), max(size,1), [])（此时不触发 PageRequest.of 校验）
      ok(res, pageResult(0, normalizedPage, Math.max(size, 1), []));
      return;
    }
    const messageIds = [...new Set(recipients.map((r) => Number(r['MESSAGE_ID'])))];
    // 2. PageRequest.of(page-1, size)：size<1 → 400（实测）
    if (size < 1) throw new IllegalArgumentError('Page size must not be less than one');

    const where: string[] = [`ID IN (${messageIds.map(() => '?').join(',')})`];
    const params: unknown[] = [...messageIds];
    if (hasText(keyword)) {
      where.push('TITLE LIKE ?');
      params.push(`%${keyword!.trim()}%`);
    }
    if (category != null) {
      where.push('CATEGORY = ?');
      params.push(category);
    }
    if (messageType != null) {
      where.push('MESSAGE_TYPE = ?');
      params.push(messageType);
    }
    if (start != null) {
      where.push('CREATED_AT >= ?');
      params.push(start);
    }
    if (end != null) {
      where.push('CREATED_AT <= ?');
      params.push(end);
    }
    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM MSG_MESSAGE ${whereSql}`, params)?.['C'] ?? 0);
    const rows = all(
      `SELECT * FROM MSG_MESSAGE ${whereSql} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
      [...params, size, (normalizedPage - 1) * size],
    ) as unknown as MessageRow[];
    // 3. 回填当前用户已读状态（同 messageId 多收件行时首行获胜，对齐 toMap merge (a,b)->a）
    const statusByMessage = new Map<number, string>();
    for (const r of recipients) {
      const mid = Number(r['MESSAGE_ID']);
      if (!statusByMessage.has(mid)) statusByMessage.set(mid, String(r['STATUS']));
    }
    ok(res, pageResult(total, normalizedPage, size, rows.map((m) => messageJson(m, statusByMessage.get(Number(m.ID)) ?? null))));
  }),
);

/** GET /api/v1/notifications/unread-count — 铃铛角标（字面量路径先于 /:id 注册） */
notificationRouter.get(
  '/api/v1/notifications/unread-count',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const userId = req.userId as number;
    const row = one(`SELECT COUNT(*) AS C FROM MSG_RECIPIENT WHERE USER_ID = ? AND STATUS = 'PENDING'`, [userId]);
    ok(res, Number(row?.['C'] ?? 0));
  }),
);

/** GET /api/v1/notifications/{id} — 消息详情（归属校验 + readStatus 回填） */
/** GET /api/v1/notifications/sse — 唯一 permitAll + query token 端点（原始 SSE，不走 authGuard） */
notificationRouter.get(
  '/api/v1/notifications/sse',
  ah(async (req: AuthedRequest, res) => {
    const token = req.query['token'];
    if (token == null || (Array.isArray(token) && token.length === 0)) {
      res.status(500).json(R.fail(500, "Required request parameter 'token' for method parameter type String is not present"));
      return;
    }
    const claims = verifyToken(String(token));
    if (!claims) {
      res.status(400).json(R.fail(400, '无效的访问令牌'));
      return;
    }
    if (claims.type !== 'access_token') {
      res.status(400).json(R.fail(400, '令牌类型必须是访问令牌'));
      return;
    }
    registerSse(Number(claims.sub), req, res);
  }),
);

notificationRouter.get(
  '/api/v1/notifications/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const userId = req.userId as number;
    const message = loadMessageRow(id);
    if (!message) throw new BusinessException('消息不存在');
    const isRecipient = one('SELECT ID FROM MSG_RECIPIENT WHERE MESSAGE_ID = ? AND USER_ID = ? LIMIT 1', [id, userId]);
    if (!isRecipient && Number(message.SENDER_ID) !== userId) {
      throw new BusinessException('无权查看此消息', 403);
    }
    const mine = one('SELECT STATUS FROM MSG_RECIPIENT WHERE MESSAGE_ID = ? AND USER_ID = ? LIMIT 1', [id, userId]);
    ok(res, messageJson(message, mine ? String(mine['STATUS']) : null));
  }),
);

/** PUT /api/v1/notifications/{id}/read — 标记已读 */
notificationRouter.put(
  '/api/v1/notifications/:id/read',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const userId = req.userId as number;
    const info = run(`UPDATE MSG_RECIPIENT SET STATUS = 'SENT', SENT_AT = ? WHERE MESSAGE_ID = ? AND USER_ID = ?`, [nowText(), id, userId]);
    if (info.changes === 0) throw new BusinessException('消息不存在或已读');
    ok(res);
  }),
);

/** POST /api/v1/notifications/read-batch — 批量已读（body = List<Long>） */
notificationRouter.post(
  '/api/v1/notifications/read-batch',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b: unknown = req.body;
    const cl = req.headers['content-length'];
    const isEmptyObject = typeof b === 'object' && b !== null && !Array.isArray(b) && Object.keys(b as object).length === 0;
    if (b == null || (isEmptyObject && (cl === undefined || cl === '' || cl === '0'))) {
      throw new Error(`Required request body is missing: ${SIG_BATCH_READ}`);
    }
    if (!Array.isArray(b)) {
      throw new Error('JSON parse error: Cannot deserialize value of type `java.util.ArrayList<java.lang.Long>` from Object value (token `JsonToken.START_OBJECT`)');
    }
    const ids = b.map((e) => (e == null ? null : bodyLong(e)));
    const userId = req.userId as number;
    if (ids.length === 0) {
      ok(res);
      return;
    }
    run(
      `UPDATE MSG_RECIPIENT SET STATUS = 'SENT', SENT_AT = ? WHERE USER_ID = ? AND MESSAGE_ID IN (${ids.map(() => '?').join(',')})`,
      [nowText(), userId, ...ids],
    );
    ok(res);
  }),
);

/** POST /api/v1/notifications/{id}/toggle-read — 已读/未读切换 */
notificationRouter.post(
  '/api/v1/notifications/:id/toggle-read',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const userId = req.userId as number;
    const recipient = one('SELECT * FROM MSG_RECIPIENT WHERE MESSAGE_ID = ? AND USER_ID = ? LIMIT 1', [id, userId]);
    if (!recipient) throw new BusinessException('消息不存在');
    const unread = String(recipient['STATUS']) === 'PENDING';
    run('UPDATE MSG_RECIPIENT SET STATUS = ?, SENT_AT = ? WHERE ID = ?', [
      unread ? 'SENT' : 'PENDING',
      unread ? nowText() : null,
      Number(recipient['ID']),
    ]);
    ok(res, unread ? 'SENT' : 'PENDING');
  }),
);

/** POST /api/v1/notifications/read-all — 全部已读 */
notificationRouter.post(
  '/api/v1/notifications/read-all',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const userId = req.userId as number;
    run(`UPDATE MSG_RECIPIENT SET STATUS = 'SENT', SENT_AT = ? WHERE USER_ID = ? AND STATUS = 'PENDING'`, [nowText(), userId]);
    ok(res);
  }),
);

/** DELETE /api/v1/notifications/{id} — 删除（仅移除当前用户收件记录，对齐 Java） */
notificationRouter.delete(
  '/api/v1/notifications/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const id = pathId(req.params['id']);
    const userId = req.userId as number;
    const isRecipient = one('SELECT ID FROM MSG_RECIPIENT WHERE MESSAGE_ID = ? AND USER_ID = ? LIMIT 1', [id, userId]);
    if (!isRecipient) throw new BusinessException('无权删除此消息', 403);
    run('DELETE FROM MSG_RECIPIENT WHERE USER_ID = ? AND MESSAGE_ID = ?', [userId, id]);
    ok(res);
  }),
);

// ---------------------------------------------------------------- 内部 API（供工作流等模块调用，13-6b 桥接入口）

const SIG_INTERNAL_SEND =
  'public com.workflow.common.domain.R<java.lang.Void> com.workflow.notification.api.InternalNotificationController.send(com.workflow.notification.model.Message,java.util.List<java.lang.Long>,java.util.List<com.workflow.notification.model.ChannelType>)';
const SIG_INTERNAL_SEND_BY_TEMPLATE =
  'public com.workflow.common.domain.R<java.lang.Void> com.workflow.notification.api.InternalNotificationController.sendByTemplate(com.workflow.notification.api.TemplateSendRequest,java.util.List<java.lang.Long>,java.util.List<com.workflow.notification.model.ChannelType>)';

function requireJsonObjectBody(req: AuthedRequest, signature: string): Record<string, unknown> {
  const b: unknown = req.body;
  const cl = req.headers['content-length'];
  const isEmptyObject = typeof b === 'object' && b !== null && !Array.isArray(b) && Object.keys(b as object).length === 0;
  if (b == null || (isEmptyObject && (cl === undefined || cl === '' || cl === '0'))) {
    throw new Error(`Required request body is missing: ${signature}`);
  }
  if (Array.isArray(b)) {
    throw new Error(`JSON parse error: Cannot deserialize instance of \`java.lang.Object\` out of START_ARRAY token`);
  }
  if (typeof b !== 'object' || b === null) {
    throw new Error('JSON parse error: Cannot deserialize instance of object out of VALUE token');
  }
  return b as Record<string, unknown>;
}

/** Map/枚举/时间字段反序列化（Jackson 宽松语义近似，非法值 → generic 500） */
function bodyStringField(v: unknown, field: string): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  throw new Error(`Cannot deserialize value of type \`java.lang.String\` from Object value (token \`${field}\`)`);
}

function bodyEnumField(v: unknown, values: readonly string[], cls: string): string | null {
  if (v == null) return null;
  if (typeof v === 'number') return values[v] ?? null; // Jackson 枚举按序数绑定
  const s = String(v);
  if (!values.includes(s)) {
    throw new Error(`Cannot deserialize value of type \`${PKG}.${cls}\` from String "${s}": not one of the values accepted for Enum class: [${values.join(', ')}]`);
  }
  return s;
}

function bodyJsonObject(v: unknown, field: string): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  throw new Error(`JSON parse error: Cannot deserialize value of type \`java.util.Map<java.lang.String,java.lang.Object>\` from ${Array.isArray(v) ? 'Array' : 'Scalar'} value (token \`${field}\`)`);
}

function bodyCreatedAt(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) throw new Error(`JSON parse error: Cannot deserialize value of type \`java.time.LocalDateTime\` from String "${s}"`);
  return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

/** @RequestBody Message → MsgPayload */
function parseMessageBody(b: Record<string, unknown>): MsgPayload {
  return {
    id: b['id'] == null ? null : bodyLong(b['id']),
    tenantId: bodyStringField(b['tenantId'], 'tenantId'),
    templateCode: bodyStringField(b['templateCode'], 'templateCode'),
    eventCode: bodyStringField(b['eventCode'], 'eventCode'),
    senderId: bodyLong(b['senderId']),
    senderType: bodyStringField(b['senderType'], 'senderType'),
    title: bodyStringField(b['title'], 'title'),
    content: bodyJsonObject(b['content'], 'content'),
    linkJson: bodyJsonObject(b['linkJson'], 'linkJson'),
    priority: bodyEnumField(b['priority'], MESSAGE_PRIORITIES, 'MessagePriority'),
    category: bodyEnumField(b['category'], MESSAGE_CATEGORIES, 'MessageCategory'),
    messageType: bodyEnumField(b['messageType'], MESSAGE_TYPES, 'MessageType'),
    contentType: bodyEnumField(b['contentType'], TEMPLATE_CONTENT_TYPES, 'TemplateContentType'),
    status: bodyEnumField(b['status'], MESSAGE_STATUSES, 'MessageStatus'),
    createdAt: bodyCreatedAt(b['createdAt']),
  };
}

/** POST /api/v1/internal/notifications/send — 自由内容发送（事件驱动入口） */
notificationRouter.post(
  '/api/v1/internal/notifications/send',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const message = parseMessageBody(requireJsonObjectBody(req, SIG_INTERNAL_SEND));
    // Java 端 Message.tenantId 由 TenantContext 填充（TenantInterceptor）——body 未带时取请求头
    if (message.tenantId == null) message.tenantId = tenantRequired(req);
    const recipientIds = longListParam(q, 'recipientIds');
    const channels = enumListParam(q, 'channels', CHANNEL_TYPES, 'ChannelType');
    dispatchMessage(message, recipientIds, channels, message.id ?? null);
    ok(res);
  }),
);

/** POST /api/v1/internal/notifications/send-by-template — 按模板发送（MessageSender.sendByTemplate） */
notificationRouter.post(
  '/api/v1/internal/notifications/send-by-template',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const q = req.query as Record<string, unknown>;
    const b = requireJsonObjectBody(req, SIG_INTERNAL_SEND_BY_TEMPLATE);
    const senderId = bodyLong(b['senderId']);
    const templateCode = bodyStringField(b['templateCode'], 'templateCode');
    const variables = bodyJsonObject(b['variables'], 'variables');
    const messageType = bodyEnumField(b['messageType'], MESSAGE_TYPES, 'MessageType') ?? 'PRIVATE';
    const eventCode = bodyStringField(b['eventCode'], 'eventCode');
    const recipientIds = longListParam(q, 'recipientIds');
    const channels = enumListParam(q, 'channels', CHANNEL_TYPES, 'ChannelType');

    // MessageSender.sendByTemplate：先取租户（缺失 → 400），事件必须存在且启用
    const tenantId = tenantRequired(req);
    if (eventCode != null && eventCode.trim().length > 0) {
      const ev = one('SELECT ID FROM MSG_EVENT_DEFINITION WHERE TENANT_ID = ? AND EVENT_CODE = ? AND ENABLED = 1', [
        tenantId, eventCode,
      ]);
      if (!ev) throw new BusinessException(`事件不存在或已停用: ${eventCode}`, 400);
    }
    // 加载模板（租户 + 代码）
    const tpl = one('SELECT * FROM MSG_TEMPLATE WHERE TENANT_ID = ? AND TEMPLATE_CODE = ?', [tenantId, templateCode]);
    if (!tpl) throw new BusinessException(`模板不存在: ${templateCode}`);
    if (Number(tpl['ENABLED']) !== 1) throw new BusinessException(`模板已停用: ${templateCode}`);

    // 校验必填变量（标题 → 内容，首个缺失即抛）并渲染
    validateVariables((tpl['TITLE'] as string | null) ?? null, variables);
    validateVariables((tpl['CONTENT'] as string | null) ?? null, variables);
    const title = renderTemplate((tpl['TITLE'] as string | null) ?? null, variables);
    const text = renderTemplate((tpl['CONTENT'] as string | null) ?? null, variables);

    // content = HashMap{text, variables}（桶序，实测 {variables, text}；内层同规则）
    const content = javaHashMapOrdered({
      text: text,
      variables: variables == null ? {} : javaHashMapOrdered(variables),
    });

    const message: MsgPayload = {
      tenantId,
      templateCode,
      eventCode: eventCode != null && eventCode.trim().length > 0 ? eventCode : null,
      senderId,
      senderType: 'SYSTEM',
      title,
      content,
      linkJson: null,
      priority: (tpl['PRIORITY'] as string | null) ?? null,
      category: (tpl['CATEGORY'] as string | null) ?? null,
      messageType,
      contentType: (tpl['CONTENT_TYPE'] as string | null) ?? null,
      createdAt: null,
    };
    dispatchMessage(message, recipientIds, channels);
    ok(res);
  }),
);
