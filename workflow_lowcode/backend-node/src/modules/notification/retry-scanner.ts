/**
 * 投递重试扫描器（Task R4b）：对齐 Java RetryTask 定时重发语义。
 * 每 60s 扫描 MSG_DELIVERY_RETRY 中 PENDING 且到期的记录：
 *  - 站内信（IN_APP/APP）：重新投递 → 收件人置 SENT + SSE 实时推送 → 重试记录置 SENT
 *  - 外部渠道（SMS/WECHAT_WORK/WECHAT_MINIPROGRAM）：沙箱无真实网关 → 直接 FAILED（可观测）
 *  - 失败：RETRY_COUNT+1，指数退避 60s→2m→4m→…上限 1h；超过 MAX_RETRY → FAILED
 */
import { exec, query, queryOne } from "../../lib/db";
import { nowStr } from "../../lib/dialect";
import { notifyUser } from "./sse";

const SCAN_INTERVAL_MS = 60_000;
const BATCH_LIMIT = 20;
const MAX_BACKOFF_MS = 3_600_000;

let running = false;
let timer: ReturnType<typeof setInterval> | null = null;

function backoffMs(retryCount: number): number {
  return Math.min(60_000 * Math.pow(2, Math.max(0, retryCount - 1)), MAX_BACKOFF_MS);
}

function scanOnce(): { attempted: number; delivered: number; failed: number; deferred: number } {
  const now = nowStr();
  const rows = query<{ ID: number; CHANNEL: string; MESSAGE_ID: number; RECIPIENT_ID: number; RETRY_COUNT: number; MAX_RETRY: number }>(
    `SELECT "ID","CHANNEL","MESSAGE_ID","RECIPIENT_ID","RETRY_COUNT","MAX_RETRY"
     FROM MSG_DELIVERY_RETRY WHERE STATUS = 'PENDING' AND NEXT_RETRY_AT IS NOT NULL AND NEXT_RETRY_AT <= ?
     ORDER BY NEXT_RETRY_AT LIMIT ?`,
    [now, BATCH_LIMIT],
  );
  let delivered = 0;
  let failed = 0;
  let deferred = 0;
  for (const r of rows) {
    const msg = queryOne<{ TITLE: string | null; CONTENT: string | null; CONTENT_TYPE: string | null; CATEGORY: string | null }>(
      `SELECT "TITLE","CONTENT","CONTENT_TYPE","CATEGORY" FROM MSG_MESSAGE WHERE "ID" = ?`,
      [r.MESSAGE_ID],
    );
    const recipient = queryOne<{ USER_ID: number; CHANNEL: string }>(
      `SELECT "USER_ID","CHANNEL" FROM MSG_RECIPIENT WHERE "ID" = ?`,
      [r.RECIPIENT_ID],
    );
    if (!msg || !recipient) {
      exec(`UPDATE MSG_DELIVERY_RETRY SET "STATUS" = 'FAILED', "LAST_ERROR" = ?, "UPDATED_AT" = ? WHERE "ID" = ?`,
        ["message/recipient missing", now, r.ID]);
      failed++;
      continue;
    }
    try {
      if (r.CHANNEL === "IN_APP" || r.CHANNEL === "APP") {
        // 站内信投递：收件人置 SENT + SSE 实时推送
        exec(`UPDATE MSG_RECIPIENT SET "STATUS" = 'SENT', "SENT_AT" = ? WHERE "ID" = ?`, [now, r.RECIPIENT_ID]);
        notifyUser(recipient.USER_ID, "new-message", {
          messageId: String(r.MESSAGE_ID),
          title: msg.TITLE,
          category: msg.CATEGORY,
          contentType: msg.CONTENT_TYPE,
        });
        exec(`UPDATE MSG_DELIVERY_RETRY SET "STATUS" = 'SENT', "LAST_ERROR" = NULL, "UPDATED_AT" = ? WHERE "ID" = ?`, [now, r.ID]);
        delivered++;
      } else {
        // 沙箱无外部网关：直接失败（与迁移期"失败入重试表"语义闭环）
        exec(`UPDATE MSG_RECIPIENT SET "STATUS" = 'FAILED' WHERE "ID" = ?`, [r.RECIPIENT_ID]);
        exec(`UPDATE MSG_DELIVERY_RETRY SET "STATUS" = 'FAILED', "LAST_ERROR" = ?, "UPDATED_AT" = ? WHERE "ID" = ?`,
          [`sandbox: channel ${r.CHANNEL} unavailable`, now, r.ID]);
        failed++;
      }
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      const nextCount = r.RETRY_COUNT + 1;
      if (nextCount >= r.MAX_RETRY) {
        exec(`UPDATE MSG_DELIVERY_RETRY SET "RETRY_COUNT" = ?, "STATUS" = 'FAILED', "LAST_ERROR" = ?, "UPDATED_AT" = ? WHERE "ID" = ?`,
          [nextCount, err, now, r.ID]);
        failed++;
      } else {
        const nextAt = new Date(Date.now() + backoffMs(nextCount)).toISOString().slice(0, 19).replace("T", " ");
        exec(`UPDATE MSG_DELIVERY_RETRY SET "RETRY_COUNT" = ?, "NEXT_RETRY_AT" = ?, "LAST_ERROR" = ?, "UPDATED_AT" = ? WHERE "ID" = ?`,
          [nextCount, nextAt, err, now, r.ID]);
        deferred++;
      }
    }
  }
  return { attempted: rows.length, delivered, failed, deferred };
}

/** 启动定时扫描（幂等；unref 不阻止进程退出） */
export function startRetryScanner(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (running) return;
    running = true;
    try {
      const s = scanOnce();
      if (s.attempted > 0) {
        console.log(`[retry-scanner] attempted=${s.attempted} delivered=${s.delivered} failed=${s.failed} deferred=${s.deferred}`);
      }
    } catch (e) {
      console.error("[retry-scanner] scan error:", e);
    } finally {
      running = false;
    }
  }, SCAN_INTERVAL_MS);
  timer.unref?.();
  console.log("[retry-scanner] started (60s interval)");
}
