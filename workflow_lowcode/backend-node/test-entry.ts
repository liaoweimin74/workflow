/**
 * 临时测试入口（Task 13-6）：仅挂载 engine 模块路由，用于 E2E 链路验证。
 * 用法：BACKEND_NODE_PORT=8093 BACKEND_NODE_DB=/tmp/t136.db bun run test-entry.ts
 * （测完可保留；正式入口 index.ts 由主控统一接线，本文件不改动 index.ts）
 */
import express from "express";
import { globalAuth, errorMiddleware, failBiz } from "./src/lib/http";

const app = express();
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Tenant-Id");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use((req, _res, next) => {
  (req as { tenantId?: string }).tenantId = (req.headers["x-tenant-id"] as string) || "default";
  next();
});

app.get("/", (_req, res) => res.json({ code: 200, msg: "ok", data: { entry: "engine-test" } }));
app.get("/api/health", (_req, res) => res.json({ code: 200, msg: "ok", data: null }));
app.use(globalAuth);

import processDesignRouter from "./src/modules/engine/process-design";
import processDefinitionRouter from "./src/modules/engine/process-definition";
import processInstanceRouter from "./src/modules/engine/process-instance";
import taskRouter from "./src/modules/engine/task";
import categoryRouter from "./src/modules/engine/category";
import dashboardRouter from "./src/modules/engine/dashboard";
import backendLogicRouter from "./src/modules/engine/backend-logic";

app.use("/api/v1/process-definitions", processDesignRouter);
app.use("/api/v1/deployed-processes", processDefinitionRouter);
app.use("/api/v1/process-instances", processInstanceRouter);
app.use("/api/v1/tasks", taskRouter);
app.use("/api/v1/categories", categoryRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/backend-logic", backendLogicRouter);

app.use((_req, res) => failBiz(res, 404, "接口不存在"));
app.use(errorMiddleware);

const PORT = Number(process.env.BACKEND_NODE_PORT ?? 8093);
app.listen(PORT, "0.0.0.0", () => console.log(`[engine-test] listening on :${PORT}`));
