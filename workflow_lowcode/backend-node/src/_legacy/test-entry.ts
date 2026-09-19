/**
 * 临时测试入口（Task 13-5）：把本次新写的 7 个路由全部挂载后启动，供 curl 冒烟。
 * 主控接线 src/index.ts 时按同样顺序挂载（探测路由与 data-sources 同前缀，须先挂 db-schema/probe 再挂 datasource）。
 */
import express from "express";
import type { Request, Response } from "express";
import { globalAuth, errorMiddleware } from "./lib/http";
import authRouter from "./modules/auth";
import formDataRouter from "./modules/form/form-data";
import bizDataRouter from "./modules/form/bizdata";
import dataSourceRouter from "./modules/datasource/datasource";
import dbSchemaRouter from "./modules/datasource/db-schema";
import probeRouter from "./modules/datasource/metadata-probe";
import pageRouter from "./modules/page/page";
import systemInternalRouter from "./modules/system-internal";

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Tenant-Id");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, _res, next) => {
  (req as Request & { tenantId?: string }).tenantId = (req.headers["x-tenant-id"] as string) || "default";
  next();
});
app.get("/api/health", (_req, res) => res.json({ code: 200, msg: "ok", data: null }));
app.use(globalAuth);
app.use("/api/auth", authRouter);

app.use("/api/v1/data-sources/db", dbSchemaRouter);
app.use("/api/v1/data-sources", probeRouter); // explore-sql / explore-api（同前缀，先挂探测后挂资源）
app.use("/api/v1/data-sources", dataSourceRouter);
app.use("/api/v1/form-definitions", (await import("./modules/form/form-definition")).default);
app.use("/api/v1/form-data", formDataRouter);
app.use("/api/v1/biz-data", bizDataRouter);
app.use("/api/v1/pages", pageRouter);
app.use("/api/v1/internal", systemInternalRouter);

app.use((_req, res) => res.json({ code: 404, msg: "接口不存在", data: null }));
app.use(errorMiddleware);

const PORT = Number(process.env.BACKEND_NODE_PORT ?? 8092);
app.listen(PORT, "0.0.0.0", () => {
  console.log(`[backend-node:test] listening on :${PORT}`);
});
