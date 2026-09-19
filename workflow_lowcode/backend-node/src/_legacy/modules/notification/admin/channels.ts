/**
 * 管理端·渠道 —— ChannelController + ChannelConfigService（启停/配置/加密）移植（Task 13-7）
 * mount 前缀：/api/v1/admin/notification/channels（5 端点，全部挂 requireNotificationAdmin）
 *
 * Java 语义对齐：
 *  - 渠道固定 5 个：1站内信 2短信 3企业微信 4小程序 5APP（ID 稳定）
 *  - enabled：__enabled 行优先；无该行时站内信恒可用，外部渠道看是否已有配置
 *  - successRate：站内信 100；外部渠道按 MSG_DELIVERY_RETRY 统计——有 FAILED 记 0、
 *    有 PENDING 记 50、无记录且已配置记 100、否则 null
 *  - enable/disable：未知 ID 返回 R.fail（HTTP200+code500）
 *  - config：整批覆盖（先删后插），键名含 key/secret/password/token 视为敏感 → AES-256-GCM 加密
 *    （对齐 EncryptionUtil：base64(iv||ciphertext+tag)，密钥缺省每进程随机）
 *  - test：站内信真实发测试消息（CHANNEL_TEST）给当前用户 + SSE；外部渠道沙箱不可用 → R.fail
 */
/* mount: /api/v1/admin/notification/channels */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, requireNotificationAdmin, failBiz } from "../../../lib/http";
import { exec, query, queryOne } from "../../../lib/db";
import { messageSend, nowStr } from "../internal";
import { notifyUser } from "../sse";
import crypto from "crypto";

const router = Router();
router.use(requireNotificationAdmin);

/** 渠道 ID → 类型映射（对齐 CHANNEL_BY_ID，按 ID 有序） */
const CHANNEL_BY_ID: Array<{ id: number; type: string; name: string }> = [
  { id: 1, type: "IN_APP", name: "站内信" },
  { id: 2, type: "SMS", name: "短信" },
  { id: 3, type: "WECHAT_WORK", name: "企业微信" },
  { id: 4, type: "WECHAT_MINIPROGRAM", name: "小程序" },
  { id: 5, type: "APP", name: "APP" },
];

const ENABLED_KEY = "__enabled";
const TEST_TEMPLATE_CODE = "CHANNEL_TEST";

// ---- EncryptionUtil（AES-256-GCM，密文 = base64(iv + cipher + tag)） ----
const ENCRYPTION_KEY_ENV = "NOTIFICATION_ENCRYPTION_KEY";
const KEY_BYTES = (() => {
  const env = process.env[ENCRYPTION_KEY_ENV];
  if (env) return Buffer.from(env, "base64");
  return crypto.randomBytes(32); // Java 默认分支：未配置则随机（仅开发环境）
})();

function encryptValue(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY_BYTES, iv);
  const enc = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  return Buffer.concat([iv, enc, cipher.getAuthTag()]).toString("base64");
}

function decryptValue(cipherText: string): string {
  const combined = Buffer.from(cipherText, "base64");
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(combined.length - 16);
  const data = combined.subarray(12, combined.length - 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY_BYTES, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function isSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.includes("key") || lower.includes("secret") || lower.includes("password") || lower.includes("token");
}

function isConfigured(type: string): boolean {
  const rows = query(
    "SELECT CONFIG_VALUE FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY != ?",
    [type, ENABLED_KEY],
  );
  return rows.some((r) => r.CONFIG_VALUE != null && String(r.CONFIG_VALUE) !== "");
}

function isEnabled(type: string): boolean {
  const row = queryOne<{ CONFIG_VALUE: string }>(
    "SELECT CONFIG_VALUE FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY = ?",
    [type, ENABLED_KEY],
  );
  if (row) return String(row.CONFIG_VALUE).toLowerCase() === "true";
  return type === "IN_APP" || isConfigured(type);
}

function successRate(type: string): number | null {
  if (type === "IN_APP") return 100;
  const retries = query<{ STATUS: string }>("SELECT STATUS FROM MSG_DELIVERY_RETRY WHERE CHANNEL = ?", [type]);
  if (!retries.length) return isConfigured(type) ? 100 : null;
  if (retries.some((r) => r.STATUS === "FAILED")) return 0;
  return retries.some((r) => r.STATUS === "PENDING") ? 50 : 100;
}

function channelOf(id: number) {
  return CHANNEL_BY_ID.find((c) => c.id === id) ?? null;
}

/** GET / —— 渠道列表 */
router.get("/", (_req: Request, res: Response) => {
  const channels = CHANNEL_BY_ID.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    enabled: isEnabled(c.type),
    successRate: successRate(c.type),
  }));
  ok(res, channels);
});

function setEnabled(res: Response, id: number, enabled: boolean): void {
  const ch = channelOf(id);
  if (!ch) {
    failBiz(res, 500, "未知渠道 ID: " + id); // R.fail 语义
    return;
  }
  const existing = queryOne<{ ID: number }>(
    "SELECT ID FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY = ?",
    [ch.type, ENABLED_KEY],
  );
  if (existing) {
    exec("UPDATE MSG_CHANNEL_CONFIG SET CONFIG_VALUE = ?, IS_ENCRYPTED = 0, UPDATED_AT = ? WHERE ID = ?",
      [String(enabled), nowStr(), existing.ID]);
  } else {
    exec(
      "INSERT INTO MSG_CHANNEL_CONFIG (CHANNEL, CONFIG_KEY, CONFIG_VALUE, IS_ENCRYPTED, CREATED_AT, UPDATED_AT) VALUES (?,?,?,0,?,?)",
      [ch.type, ENABLED_KEY, String(enabled), nowStr(), nowStr()],
    );
  }
  ok(res);
}

/** POST /:id/enable */
router.post("/:id/enable", (req: Request, res: Response) => setEnabled(res, Number(req.params.id), true));

/** POST /:id/disable */
router.post("/:id/disable", (req: Request, res: Response) => setEnabled(res, Number(req.params.id), false));

/** PUT /:id/config —— 更新渠道配置（敏感字段加密存储） */
router.put("/:id/config", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ch = channelOf(id);
  if (!ch) {
    failBiz(res, 500, "未知渠道 ID: " + id);
    return;
  }
  const config = (req.body ?? {}) as Record<string, string>;
  // 整批覆盖：先删该渠道全部既有配置（保留 __enabled），再写入
  exec("DELETE FROM MSG_CHANNEL_CONFIG WHERE CHANNEL = ? AND CONFIG_KEY != ?", [ch.type, ENABLED_KEY]);
  if (config && typeof config === "object") {
    for (const [rawKey, rawValue] of Object.entries(config)) {
      const key = rawKey?.trim();
      if (!key) continue;
      if (rawValue == null) continue;
      const sensitive = isSensitive(key);
      exec(
        "INSERT INTO MSG_CHANNEL_CONFIG (CHANNEL, CONFIG_KEY, CONFIG_VALUE, IS_ENCRYPTED, CREATED_AT, UPDATED_AT) VALUES (?,?,?,?,?,?)",
        [ch.type, key, sensitive ? encryptValue(String(rawValue)) : String(rawValue), sensitive ? 1 : 0, nowStr(), nowStr()],
      );
    }
  }
  ok(res);
});

/** POST /:id/test —— 渠道连通性测试 */
router.post("/:id/test", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ch = channelOf(id);
  if (!ch) {
    failBiz(res, 500, "未知渠道 ID: " + id);
    return;
  }
  // 站内信：真实创建一条测试消息给当前用户
  if (ch.type === "IN_APP") {
    const userId = req.loginUser!.userId;
    const message = messageSend(
      {
        tenantId: "default",
        templateCode: TEST_TEMPLATE_CODE,
        senderId: userId,
        senderType: "SYSTEM",
        title: "【渠道测试】站内信连通性测试",
        content: { text: "这是一条渠道连通性**测试消息**，收到即表示站内信渠道正常。", variables: {} },
        priority: "NORMAL",
        category: "SYSTEM",
        messageType: "PRIVATE",
        contentType: "MARKDOWN",
      },
      [userId],
    );
    notifyUser(userId, "new-message", message);
    ok(res);
    return;
  }
  // 外部渠道：沙箱内无真实网关，走 adapter.test() 失败语义
  failBiz(res, 500, "渠道测试失败: 渠道适配器沙箱内不可用: " + ch.type);
});

export default router;
