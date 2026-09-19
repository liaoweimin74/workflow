/**
 * 临时测试入口（Task 13-7）：仅挂载 notification + example 模块路由，用于 E2E 链路验证。
 * 用法：BACKEND_NODE_PORT=8094 BACKEND_NODE_DB=/tmp/t137.db bun run tmp-test-137.ts
 * （一次性脚手架，测完可删；正式入口 index.ts 由主控统一接线）
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

app.get("/", (_req, res) => res.json({ code: 200, msg: "ok", data: { entry: "notification-example-test" } }));
app.get("/api/health", (_req, res) => res.json({ code: 200, msg: "ok", data: null }));
app.use(globalAuth);

import messagesRouter from "./src/modules/notification/messages";
import sseRouter from "./src/modules/notification/sse";
import internalRouter from "./src/modules/notification/internal";
import subscriptionsRouter from "./src/modules/notification/admin/subscriptions";
import announcementsRouter from "./src/modules/notification/admin/announcements";
import channelsRouter from "./src/modules/notification/admin/channels";
import statsRouter from "./src/modules/notification/admin/stats";
import deliveriesRouter from "./src/modules/notification/admin/deliveries";
import templatesRouter from "./src/modules/notification/admin/templates";
import eventsRouter from "./src/modules/notification/admin/events";
import leaveRouter from "./src/modules/example/leave";
import empRouter from "./src/modules/example/emp";
import { EXAMPLE_BIZ_BEANS } from "./src/modules/example/leave";
import backendLogicRouter from "./src/modules/engine/backend-logic";

app.use("/api/v1/notifications/sse", sseRouter); // 必须先于 messagesRouter（/:id 会吞掉 /sse）
app.use("/api/v1/notifications", messagesRouter);
app.use("/api/v1/internal/notifications", internalRouter);
app.use("/api/v1/admin/notification/subscriptions", subscriptionsRouter);
app.use("/api/v1/admin/notification/announcements", announcementsRouter);
app.use("/api/v1/admin/notification/channels", channelsRouter);
app.use("/api/v1/admin/notification/stats", statsRouter);
app.use("/api/v1/admin/notification/deliveries", deliveriesRouter);
app.use("/api/v1/admin/notification/templates", templatesRouter);
app.use("/api/v1/admin/notification/events", eventsRouter);
app.use("/api/v1/example/leave", leaveRouter);
app.use("/api/v1/example/emp", empRouter);
app.use("/api/v1/backend-logic", backendLogicRouter);

app.get("/api/v1/example/beans", (_req, res) => res.json({ code: 200, msg: "success", data: EXAMPLE_BIZ_BEANS }));

app.use((_req, res) => failBiz(res, 404, "接口不存在"));
app.use(errorMiddleware);

const PORT = Number(process.env.BACKEND_NODE_PORT ?? 8094);
app.listen(PORT, "0.0.0.0", () => console.log(`[t137-test] listening on :${PORT}, beans=${EXAMPLE_BIZ_BEANS.length}`));
