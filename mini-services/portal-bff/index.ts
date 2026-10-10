/**
 * portal-bff — 门户 BFF（D+ 方案，Task D+ 2026-10-06）
 *
 * 职责：承接原 Next.js route handlers 的 3 个 API 端点。
 * 核心逻辑直接复用主项目 src/lib/service-supervisor.ts（纯 Node 实现，零 Next 依赖）。
 *
 * ⚠ 运行时：node >= 24（原生 TS 类型剥离）。
 *   历史：首版用 Bun.serve，实测处理 /api/portal/services 后进程静默死亡
 *   （无崩溃栈、oom_kill 不增，高度疑似 bun child_process 兼容层原生崩溃），
 *   故改写为纯 node:http，与 supervisor 的 Node 标准库血统对齐。
 *
 * 端点清单（与原 Next 行为对齐，响应形状不变）：
 *   GET  /api                    → { message: "Hello, world!" }
 *   GET  /api/portal/engine      → 引擎状态
 *   POST /api/portal/engine      → action: switch / build-java
 *   GET  /api/portal/services    → 服务状态
 *   POST /api/portal/services    → 幂等拉起并返回状态
 *   GET  /health                 → BFF 自身探活
 *
 * 由 vite（3000）以 /api 前缀反代到本服务（127.0.0.1:3010）。
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  getEngineStatus,
  switchBackendEngine,
  startJavaBuild,
  collectStatus,
  ensureAllServices,
  type EngineChoice,
} from "../../src/lib/service-supervisor.ts";

const PORT = 3010;

const json = (res: ServerResponse, data: unknown, status = 200) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data));
};

const readJson = async (req: IncomingMessage): Promise<any> => {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const p = url.pathname;
  const method = req.method ?? "GET";
  try {
    // ---- health ----
    if (p === "/health") {
      return json(res, { code: 200, msg: "ok", data: { port: PORT, ts: Date.now() } });
    }

    // ---- GET /api ----
    if (p === "/api" && method === "GET") {
      return json(res, { message: "Hello, world!" });
    }

    // ---- /api/portal/engine ----
    if (p === "/api/portal/engine") {
      if (method === "GET") {
        return json(res, { code: 200, msg: "ok", data: getEngineStatus() });
      }
      if (method === "POST") {
        let body: { action?: string; engine?: string } = {};
        try {
          body = await readJson(req);
        } catch {
          return json(res, { code: 400, msg: "请求体必须是 JSON", data: null }, 400);
        }
        if (body.action === "build-java") {
          const r = startJavaBuild();
          return json(res, {
            code: r.started ? 200 : 400,
            msg: r.started
              ? "Java 版构建已启动（后台进行，约 10~20 分钟），可稍后刷新查看进度"
              : (r.reason ?? "无法启动构建"),
            data: getEngineStatus(),
          });
        }
        if (body.action === "switch") {
          const engine = body.engine as EngineChoice | undefined;
          if (engine !== "node" && engine !== "java") {
            return json(res, { code: 400, msg: "engine 必须是 node 或 java", data: null }, 400);
          }
          const r = await switchBackendEngine(engine);
          const services = await collectStatus();
          return json(res, {
            code: r.ok ? 200 : 400,
            msg: r.message,
            data: { services, engine: getEngineStatus() },
          });
        }
        return json(res, { code: 400, msg: "未知 action，支持 switch / build-java", data: null }, 400);
      }
    }

    // ---- /api/portal/services ----
    if (p === "/api/portal/services") {
      if (method === "GET") {
        const status = await collectStatus();
        return json(res, { code: 200, msg: "ok", data: status });
      }
      if (method === "POST") {
        const { services, actions } = await ensureAllServices();
        return json(res, { code: 200, msg: "ok", data: { services, actions } });
      }
    }

    return json(res, { code: 404, msg: "not found", data: null }, 404);
  } catch (e) {
    console.error("[portal-bff] handler error:", e);
    return json(res, { code: 500, msg: String(e), data: null }, 500);
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[portal-bff] listening on http://127.0.0.1:${PORT} (node ${process.version})`);
});

// 优雅退出：supervisor 拉起的子进程随进程树清理
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
