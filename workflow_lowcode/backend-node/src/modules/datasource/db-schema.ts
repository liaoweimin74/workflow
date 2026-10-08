/**
 * 数据库 Schema 浏览 —— DbSchemaController 移植（Task 13-5）
 * mount 前缀：/api/v1/data-sources/db（2 端点，只读）
 *
 * 语义对齐（Java: api/controller/DbSchemaController.java + DynamicTableManager）：
 *  - GET /tables：全部基础表名（排除 flyway_schema_history；SQLite 侧同时排除 sqlite_% 内部表）
 *  - GET /tables/{table}/columns：表不存在返回 []（information_schema 语义 = 空列表）
 */
/* mount: /api/v1/data-sources/db */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { listTableNames, findTableColumns } from "../form/dynamic-table";

const router = Router();

const FLYWAY_HISTORY_TABLE = "flyway_schema_history";

/** GET /api/v1/data-sources/db/tables */
router.get("/tables", (_req: Request, res: Response) => {
  const names = listTableNames().filter((n) => n.toLowerCase() !== FLYWAY_HISTORY_TABLE);
  ok(res, names);
});

/** GET /api/v1/data-sources/db/tables/{table}/columns */
router.get("/tables/:table/columns", (req: Request, res: Response) => {
  ok(res, findTableColumns(req.params.table));
});

export default router;
