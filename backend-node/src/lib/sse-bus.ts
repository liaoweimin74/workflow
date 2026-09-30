/**
 * sse-bus.ts — SSE 连接注册表（对齐 Java SseEmitterManager 语义 + 任务要求的心跳增强）
 *
 * Java 原型（notification/sse/SseEmitterManager.java）：
 *  - userId → SseEmitter 单连接；同一用户重复注册时旧连接 complete() 关闭（最新连接获胜）
 *  - sendToUser(userId, eventName, data)：不在线则跳过；推送格式
 *      `event:<name>\ndata:<json>\n\n`（Spring SseEmitter 输出，冒号后无空格，8080 实测）
 *  - Java 无心跳（连接静默直到首条推送）；Node 端按任务要求加 15s 心跳注释行
 *    `: ping\n\n`（SSE 规范注释行，EventSource 自动忽略，不影响契约）
 *
 * 供内部发送 API（/api/v1/internal/notifications/*）、管理端公告/渠道测试
 * 以及未来工作流桥接（13-6b WorkflowNotifier 等价物）调用 publishToUser。
 */
import type { Request, Response } from 'express';

interface SseConnection {
  userId: number;
  res: Response;
  /** 心跳定时器（连接关闭时清理） */
  timer: ReturnType<typeof setInterval>;
}

/** 心跳间隔（任务要求 15s） */
const HEARTBEAT_MS = 15_000;

declare global {
  // eslint-disable-next-line no-var
  var __sseConnections: Map<number, SseConnection> | undefined;
}

function connections(): Map<number, SseConnection> {
  if (!globalThis.__sseConnections) globalThis.__sseConnections = new Map();
  return globalThis.__sseConnections;
}

/**
 * 注册 SSE 长连接：
 *  - 写响应头（text/event-stream; charset=UTF-8 + no-cache，对齐 Spring SseEmitter）
 *  - 同一用户旧连接直接 end()（对齐 Java register 的 old.complete()）
 *  - 15s 心跳 `: ping\n\n`（Node 侧增强，Java 原版无心跳）
 *  - req.on('close') / res 'close' 清理注册表与定时器（对齐 onCompletion/onError/onTimeout）
 */
export function registerSse(userId: number, req: Request, res: Response): void {
  // 关闭旧连接（Java：同一用户新连接顶替旧连接）
  const old = connections().get(userId);
  if (old && !old.res.writableEnded) {
    connections().delete(userId);
    clearInterval(old.timer);
    old.res.end();
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=UTF-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const timer = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      cleanup();
    }
  }, HEARTBEAT_MS);
  // 不阻塞进程退出
  if (typeof timer.unref === 'function') timer.unref();

  const cleanup = (): void => {
    clearInterval(timer);
    const cur = connections().get(userId);
    // 仅当仍是本连接时移除（新连接可能已顶替）
    if (cur && cur.res === res) connections().delete(userId);
  };

  const conn: SseConnection = { userId, res, timer };
  connections().set(userId, conn);

  req.on('close', cleanup);
  res.on('close', cleanup);
  res.on('error', cleanup);
}

/**
 * 向指定用户推送事件（用户不在线则跳过，对齐 Java sendToUser）。
 * 帧格式（8080 实测）：`event:<name>\ndata:<json>\n\n`
 */
export function publishToUser(userId: number, event: string, data: unknown): void {
  const conn = connections().get(userId);
  if (!conn) return; // 用户不在线，跳过推送
  try {
    conn.res.write(`event:${event}\ndata:${JSON.stringify(data)}\n\n`);
  } catch {
    // 推送失败：清理连接（对齐 Java catch IOException → remove）
    clearInterval(conn.timer);
    if (connections().get(conn.userId) === conn) connections().delete(conn.userId);
  }
}

/** 当前在线连接数（诊断用，对齐 Java getOnlineCount） */
export function onlineCount(): number {
  return connections().size;
}

/** 供测试/关停时清理全部连接 */
export function closeAllSse(): void {
  for (const conn of connections().values()) {
    clearInterval(conn.timer);
    try {
      conn.res.end();
    } catch {
      /* ignore */
    }
  }
  connections().clear();
}
