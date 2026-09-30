/**
 * 表单实例数据模块 —— FormDataController + FormDataService 移植（Task 13-5）
 * mount 前缀：/api/v1/form-data（11 端点）
 *
 * 语义对齐（Java: engine/form/FormDataService.java）：
 *  - save：同 (tenant, processInstanceId, formDefId, isSnapshot=false) upsert 单条当前数据，form_version 同步定义版本
 *  - saveSnapshot：每次新建不可变快照行
 *  - saveDraft/findDraft/clearDraft：processInstanceId 为 null 的发起页草稿，每 formDef 一条
 *  - 表单定义不存在 → RuntimeException → HTTP 500 + R.fail(500)（与 Java 一致）
 */
/* mount: /api/v1/form-data */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { queryOne, queryRows, exec } from "../../lib/db";
import { nowStr, uuid32 } from "../../lib/dialect";
import { tenantOf } from "./form-definition";

const router = Router();

// ==================== 行映射（FormData 实体 / FormDataDTO） ====================

/** WF_FORM_DATA 原始行 → FormData 实体 JSON（Jackson 契约：Long→string、ts 归一） */
function formDataJSON(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id as string,
    tenantId: r.tenantId as string,
    formDefId: r.formDefId as string,
    formVersion: r.formVersion as number,
    processInstanceId: (r.processInstanceId as string | null) ?? null,
    taskId: (r.taskId as string | null) ?? null,
    dataJson: (r.dataJson as string | null) ?? null,
    isSnapshot: r.isSnapshot === true || r.isSnapshot === 1,
    createdBy: (r.createdBy as string | null) ?? null,
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
  };
}

/** FormDataDTO：不含 tenantId（Java DTO 字段面） */
function formDataDTO(r: Record<string, unknown>): Record<string, unknown> {
  const { tenantId: _tenantId, ...dto } = formDataJSON(r);
  return dto;
}

function rawById(tenantId: string, id: string): Record<string, unknown> | null {
  const rows = queryRows("WF_FORM_DATA", "SELECT * FROM WF_FORM_DATA WHERE ID = ? AND TENANT_ID = ? LIMIT 1", [id, tenantId]);
  return rows.length ? rows[0] : null;
}

function formDefVersion(tenantId: string, formDefId: string): Record<string, unknown> {
  const rows = queryRows("WF_FORM_DEF", "SELECT * FROM WF_FORM_DEF WHERE ID = ? AND TENANT_ID = ? LIMIT 1", [formDefId, tenantId]);
  if (!rows.length) throw new Error("Form definition not found: " + formDefId);
  return rows[0];
}

// ==================== 端点 ====================

/** POST /api/v1/form-data —— 保存当前数据（upsert） */
router.post("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const body = req.body ?? {};
  const formDefId = String(body.formDefId ?? "");
  const processInstanceId = body.processInstanceId == null ? null : String(body.processInstanceId);
  const taskId = body.taskId == null ? null : String(body.taskId);
  const dataJson = body.dataJson == null ? null : String(body.dataJson);

  const formDef = formDefVersion(tenantId, formDefId);
  const existing = queryOne<{ ID: string }>(
    "SELECT ID FROM WF_FORM_DATA WHERE TENANT_ID = ? AND PROCESS_INSTANCE_ID IS ? AND FORM_DEF_ID = ? AND IS_SNAPSHOT = 0 LIMIT 1",
    [tenantId, processInstanceId, formDefId],
  );
  if (existing) {
    exec(
      "UPDATE WF_FORM_DATA SET DATA_JSON = ?, TASK_ID = ?, FORM_VERSION = ?, UPDATED_AT = ? WHERE ID = ?",
      [dataJson, taskId, formDef.VERSION as number, nowStr(), existing.ID],
    );
  } else {
    exec(
      `INSERT INTO WF_FORM_DATA (ID, TENANT_ID, FORM_DEF_ID, FORM_VERSION, PROCESS_INSTANCE_ID, TASK_ID, DATA_JSON, IS_SNAPSHOT, CREATED_BY, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [uuid32(), tenantId, formDefId, formDef.VERSION as number, processInstanceId, taskId, dataJson, req.loginUser?.username ?? null, nowStr(), nowStr()],
    );
  }
  const rows = queryRows(
    "WF_FORM_DATA",
    "SELECT * FROM WF_FORM_DATA WHERE TENANT_ID = ? AND PROCESS_INSTANCE_ID IS ? AND FORM_DEF_ID = ? AND IS_SNAPSHOT = 0 LIMIT 1",
    [tenantId, processInstanceId, formDefId],
  );
  ok(res, formDataJSON(rows[0]));
});

/** POST /api/v1/form-data/snapshot —— 审批快照（不可变） */
router.post("/snapshot", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const body = req.body ?? {};
  const formDef = formDefVersion(tenantId, String(body.formDefId ?? ""));
  const id = uuid32();
  const now = nowStr();
  exec(
    `INSERT INTO WF_FORM_DATA (ID, TENANT_ID, FORM_DEF_ID, FORM_VERSION, PROCESS_INSTANCE_ID, TASK_ID, DATA_JSON, IS_SNAPSHOT, CREATED_BY, CREATED_AT, UPDATED_AT)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
    [
      id, tenantId, String(body.formDefId ?? ""), formDef.VERSION as number,
      body.processInstanceId == null ? null : String(body.processInstanceId),
      body.taskId == null ? null : String(body.taskId),
      body.dataJson == null ? null : String(body.dataJson),
      req.loginUser?.username ?? null, now, now,
    ],
  );
  ok(res, formDataJSON(rawById(tenantId, id)!));
});

/** POST /api/v1/form-data/draft —— 发起页草稿（processInstanceId=null，每 formDef 一条） */
router.post("/draft", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const body = req.body ?? {};
  const formDefId = String(body.formDefId ?? "");
  const formDef = formDefVersion(tenantId, formDefId);
  const dataJson = body.dataJson == null ? null : String(body.dataJson);
  const existing = queryOne<{ ID: string }>(
    "SELECT ID FROM WF_FORM_DATA WHERE TENANT_ID = ? AND FORM_DEF_ID = ? AND PROCESS_INSTANCE_ID IS NULL AND IS_SNAPSHOT = 0 LIMIT 1",
    [tenantId, formDefId],
  );
  if (existing) {
    exec("UPDATE WF_FORM_DATA SET DATA_JSON = ?, FORM_VERSION = ?, UPDATED_AT = ? WHERE ID = ?", [
      dataJson, formDef.VERSION as number, nowStr(), existing.ID,
    ]);
  } else {
    exec(
      `INSERT INTO WF_FORM_DATA (ID, TENANT_ID, FORM_DEF_ID, FORM_VERSION, PROCESS_INSTANCE_ID, TASK_ID, DATA_JSON, IS_SNAPSHOT, CREATED_BY, CREATED_AT, UPDATED_AT)
       VALUES (?, ?, ?, ?, NULL, NULL, ?, 0, ?, ?, ?)`,
      [uuid32(), tenantId, formDefId, formDef.VERSION as number, dataJson, req.loginUser?.username ?? null, nowStr(), nowStr()],
    );
  }
  const rows = queryRows(
    "WF_FORM_DATA",
    "SELECT * FROM WF_FORM_DATA WHERE TENANT_ID = ? AND FORM_DEF_ID = ? AND PROCESS_INSTANCE_ID IS NULL AND IS_SNAPSHOT = 0 LIMIT 1",
    [tenantId, formDefId],
  );
  ok(res, formDataJSON(rows[0]));
});

/** GET /api/v1/form-data/draft/{formDefId} —— 查草稿（无则 data=null） */
router.get("/draft/:formDefId", (req: Request, res: Response) => {
  const rows = queryRows(
    "WF_FORM_DATA",
    "SELECT * FROM WF_FORM_DATA WHERE TENANT_ID = ? AND FORM_DEF_ID = ? AND PROCESS_INSTANCE_ID IS NULL AND IS_SNAPSHOT = 0 LIMIT 1",
    [tenantOf(req), req.params.formDefId],
  );
  ok(res, rows.length ? formDataDTO(rows[0]) : null);
});

/** DELETE /api/v1/form-data/draft/{formDefId} —— 清草稿 */
router.delete("/draft/:formDefId", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const rows = queryRows(
    "WF_FORM_DATA",
    "SELECT * FROM WF_FORM_DATA WHERE TENANT_ID = ? AND FORM_DEF_ID = ? AND PROCESS_INSTANCE_ID IS NULL AND IS_SNAPSHOT = 0 LIMIT 1",
    [tenantId, req.params.formDefId],
  );
  if (rows.length) exec("DELETE FROM WF_FORM_DATA WHERE ID = ?", [rows[0].id as string]);
  ok(res);
});

/** GET /api/v1/form-data?processInstanceId=&formDefId= —— 当前数据（非快照），无则 data=null */
router.get("/", (req: Request, res: Response) => {
  const processInstanceId = String(req.query.processInstanceId ?? "");
  const formDefId = String(req.query.formDefId ?? "");
  const rows = queryRows(
    "WF_FORM_DATA",
    "SELECT * FROM WF_FORM_DATA WHERE TENANT_ID = ? AND PROCESS_INSTANCE_ID = ? AND FORM_DEF_ID = ? AND IS_SNAPSHOT = 0 LIMIT 1",
    [tenantOf(req), processInstanceId, formDefId],
  );
  ok(res, rows.length ? formDataDTO(rows[0]) : null);
});

/** GET /api/v1/form-data/task/{taskId} —— 按任务查最新快照（无则 data=null） */
router.get("/task/:taskId", (req: Request, res: Response) => {
  const rows = queryRows(
    "WF_FORM_DATA",
    "SELECT * FROM WF_FORM_DATA WHERE TENANT_ID = ? AND TASK_ID = ? AND IS_SNAPSHOT = 1 ORDER BY CREATED_AT DESC LIMIT 1",
    [tenantOf(req), req.params.taskId],
  );
  ok(res, rows.length ? formDataDTO(rows[0]) : null);
});

/** GET /api/v1/form-data/process-instance/{pid}/snapshots —— 全部快照倒序 */
router.get("/process-instance/:processInstanceId/snapshots", (req: Request, res: Response) => {
  const rows = queryRows(
    "WF_FORM_DATA",
    "SELECT * FROM WF_FORM_DATA WHERE TENANT_ID = ? AND PROCESS_INSTANCE_ID = ? AND IS_SNAPSHOT = 1 ORDER BY CREATED_AT DESC",
    [tenantOf(req), req.params.processInstanceId],
  );
  ok(res, rows.map(formDataDTO));
});

/** GET /api/v1/form-data/process-instance/{pid} —— 实例全部表单数据（含快照） */
router.get("/process-instance/:processInstanceId", (req: Request, res: Response) => {
  const rows = queryRows(
    "WF_FORM_DATA",
    "SELECT * FROM WF_FORM_DATA WHERE TENANT_ID = ? AND PROCESS_INSTANCE_ID = ?",
    [tenantOf(req), req.params.processInstanceId],
  );
  ok(res, rows.map(formDataDTO));
});

/** GET /api/v1/form-data/{id} —— 单条（缺失 → RuntimeException → HTTP 500） */
router.get("/:id", (req: Request, res: Response) => {
  const row = rawById(tenantOf(req), req.params.id);
  if (!row) throw new Error("Form data not found: " + req.params.id);
  ok(res, formDataDTO(row));
});

/** PUT /api/v1/form-data/{id} —— 更新 dataJson */
router.put("/:id", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const row = rawById(tenantId, req.params.id);
  if (!row) throw new Error("Form data not found: " + req.params.id);
  const dataJson = req.body?.dataJson == null ? null : String(req.body.dataJson);
  exec("UPDATE WF_FORM_DATA SET DATA_JSON = ?, UPDATED_AT = ? WHERE ID = ?", [dataJson, nowStr(), req.params.id]);
  ok(res, formDataJSON(rawById(tenantId, req.params.id)!));
});

export default router;
