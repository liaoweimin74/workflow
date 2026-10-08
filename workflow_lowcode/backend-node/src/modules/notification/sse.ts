/**
 * SSE 实时推送 —— NotificationSseController + SseEmitterManager 移植（Task 13-7）
 * mount 前缀：/api/v1/notifications/sse（1 端点：GET /，permitAll + ?token= 自行认证）
 *
 * Java 语义对齐：
 *  - SecurityConfig permitAll（EventSource 无法带 header），本模块用 http.ts 的 sseAuthGuard
 *    做 ?token= query 认证（必须 access_token 类型），等价 NotificationSseController 手动校验
 *  - SseEmitterManager：userId → 连接集合；推送事件名 new-message；断连/错误清理
 *    （Java 为单连接 Map<Long,SseEmitter> 且新连接关闭旧连接；此处按任务要求用
 *     Map<userId, Set<Response>> 支持多连接，推送失败/关闭即剔除）
 *  - 心跳 25s（Java 靠 SseEmitter 30min timeout；Node 显式心跳防代理断连）
 */
/* mount: /api/v1/notifications/sse */
import { Router } from "express";
import type { Request, Response } from "express";
import { sseAuthGuard } from "../../lib/http";

const router = Router();

/** 内存连接表：userId → 该用户全部活跃 SSE 响应 */
const connections = new Map<string, Set<Response>>();

/** 心跳间隔（毫秒） */
const HEARTBEAT_MS = 25_000;

function removeConnection(userId: string, res: Response): void {
  const set = connections.get(userId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) connections.delete(userId);
}

/**
 * 向指定用户推送 SSE 事件（对齐 SseEmitterManager.sendToUser）。
 * 事件帧格式：`event: <name>\ndata: <json>\n\n`
 */
export function notifyUser(userId: string | number, event: string, data: unknown): void {
  const set = connections.get(String(userId));
  if (!set || set.size === 0) return; // 用户不在线，跳过推送（Java 同语义）
  const frame = `event: ${event}\ndata: ${JSON.stringify(data ?? null)}\n\n`;
  for (const res of [...set]) {
    try {
      res.write(frame);
    } catch {
      removeConnection(String(userId), res);
    }
  }
}

/** 向多个用户推送（供其他模块复用，如公告/工作流桥接） */
export function notifyUsers(userIds: Array<string | number>, event: string, data: unknown): void {
  for (const id of userIds) notifyUser(id, event, data);
}

/** 当前在线用户数（对齐 SseEmitterManager.getOnlineCount） */
export function onlineCount(): number {
  return connections.size;
}

/**
 * GET /api/v1/notifications/sse?token=<access_token>
 * 建立 EventSource 长连接；连接后立即下发 connected 事件并按 25s 心跳保活。
 */
router.get("/", sseAuthGuard, (req: Request, res: Response) => {
  const userId = req.loginUser!.userId;
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ userId })}\n\n`);

  let set = connections.get(userId);
  if (!set) {
    set = new Set<Response>();
    connections.set(userId, set);
  }
  set.add(res);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      /* 写失败由 close 分支清理 */
    }
  }, HEARTBEAT_MS);

  req.on("close", () => {
    clearInterval(heartbeat);
    removeConnection(userId, res);
  });
});

export default router;
