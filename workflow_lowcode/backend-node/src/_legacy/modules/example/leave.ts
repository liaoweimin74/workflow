/**
 * 业务扩展示例·请假单 —— LeaveBillController + LeaveBillBizService + LeaveBillHandler 移植（Task 13-7）
 * mount 前缀：/api/v1/example/leave（3 端点）
 *
 * Java 语义对齐：
 *  - 存储：Java LeaveBillHandler 无专用 @Table，走 BizDataService 动态表（WF_BIZ_<FORM_KEY 大写>，
 *    表单发布时由 ensureTable 建表）。本模块复用 form/dynamic-table 的 ensureTable（只 import 不改）
 *    惰性建表 WF_BIZ_LEAVE_BILL，与 Java 动态表形态一致（差异：Java 表结构由表单定义列配置驱动，
 *    此处按 LeaveBillHandler 涉及字段预置 status/reason/days/leaveType/startDate/endDate/comment）
 *  - POST /submit {id}：startProcess(leave-bill, businessKey=id, {initiator,submitterId,manager:"manager"})
 *    → 状态置「待审批」（对齐 updateGeneric 无守卫通道：直接 UPDATE + VERSION 自增乐观锁）
 *  - POST /approve {taskId}：task → 运行时实例 businessKey → completeTask → 状态置「已批准」
 *  - POST /reject {taskId,reason?}：task → 实例 → terminateInstance(reason) → 状态置「已驳回」
 *  - LeaveBillHandler.beforeCreate（days>5 必填 reason）注册为 bean（见 registerExampleBeans）
 *  返回 BizDataVO{id,data,version,createdAt,updatedAt}，对齐 BizDataController R<BizDataVO>。
 */
/* mount: /api/v1/example/leave */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, queryOne } from "../../lib/db";
import { ensureTable, tableNameOf, tableExists, type ColumnConfig } from "../form/dynamic-table";
import { completeTask, getInst, getTask, startProcess, terminateInstance } from "../../lib/engine/engine";

export const LEAVE_FORM_KEY = "leave_bill";
export const LEAVE_PROCESS_KEY = "leave-bill";
/** 动态表名（对齐 dynamic-table.tableNameOf） */
export const LEAVE_TABLE = tableNameOf(LEAVE_FORM_KEY);

const LEAVE_COLUMNS: ColumnConfig[] = [
  { key: "status", label: "状态", columnType: "VARCHAR", length: 64 },
  { key: "reason", label: "请假事由", columnType: "VARCHAR", length: 255 },
  { key: "leaveType", label: "请假类型", columnType: "VARCHAR", length: 32 },
  { key: "days", label: "请假天数", columnType: "INT" },
  { key: "startDate", label: "开始日期", columnType: "DATE" },
  { key: "endDate", label: "结束日期", columnType: "DATE" },
  { key: "comment", label: "备注", columnType: "TEXT" },
];

/** 惰性建表（对齐 BizDataService 动态表：WF_BIZ_LEAVE_BILL） */
export function ensureLeaveTable(): void {
  if (!tableExists(tableNameOf(LEAVE_FORM_KEY))) {
    ensureTable(LEAVE_FORM_KEY, LEAVE_COLUMNS);
  }
}

interface BizRow {
  ID: string; TENANT_ID: string; VERSION: number; CREATED_AT: string | null; UPDATED_AT: string | null;
  [col: string]: unknown;
}

/** 行 → BizDataVO（data 键回映射为表单字段 key，对齐 Java BizDataVO.data 形态） */
function rowToVO(row: BizRow): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const c of LEAVE_COLUMNS) data[c.key] = row[c.key.toUpperCase()] ?? null;
  return { id: row.ID, data, version: row.VERSION, createdAt: row.CREATED_AT, updatedAt: row.UPDATED_AT };
}

function requireRow(id: string): BizRow {
  ensureLeaveTable();
  const row = queryOne<BizRow>(
    `SELECT * FROM ${tableNameOf(LEAVE_FORM_KEY)} WHERE ID = ?`,
    [id],
  );
  if (!row) throw new BusinessException("业务数据不存在: " + id, 404);
  return row;
}

/** 状态回写（对齐 BizDataSupport.updateGeneric：无守卫通道 + 乐观锁版本自增） */
function updateGenericStatus(id: string, currentVersion: number, patch: Record<string, unknown>): Record<string, unknown> {
  const cols = Object.keys(patch);
  const setSql = cols.map((c) => `"${c}" = ?`).join(", ") + ', "VERSION" = "VERSION" + 1, "UPDATED_AT" = ?';
  const params = cols.map((c) => (patch[c] == null ? null : patch[c]));
  const r = exec(
    `UPDATE ${tableNameOf(LEAVE_FORM_KEY)} SET ${setSql} WHERE "ID" = ? AND "VERSION" = ?`,
    [...params, nowStr(), id, currentVersion],
  );
  if (r.changes === 0) throw new BusinessException("数据已被他人修改，请刷新后重试", 409);
  return rowToVO(requireRow(id));
}

/** 运行中任务 → 业务行 id（task → processInstanceId → businessKey，对齐 requireRunningBizKey） */
function requireRunningBizKey(taskId: string): { bizKey: string; instId: string } {
  const task = getTask(taskId);
  const inst = getInst(task.PROC_INST_ID); // 不存在时 engine 抛错
  if (!inst.BUSINESS_KEY) throw new BusinessException("流程实例未关联业务数据", 404);
  return { bizKey: String(inst.BUSINESS_KEY), instId: String(inst.ID) };
}

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const router = Router();

/** POST /submit —— 提交审批（启动流程 + 置「待审批」） */
router.post("/submit", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = body.id == null ? "null" : String(body.id);
  const current = requireRow(id);
  const submitter = req.loginUser?.username ?? "system";
  startProcess({
    procKey: LEAVE_PROCESS_KEY,
    starter: submitter,
    businessKey: id,
    variables: { submitterId: submitter, manager: "manager" }, // 示例简化：审批人取固定变量
  });
  ok(res, updateGenericStatus(id, current.VERSION, { status: "待审批" }));
});

/** POST /approve —— 审批通过（完成任务 + 置「已批准」） */
router.post("/approve", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const taskId = body.taskId == null ? "null" : String(body.taskId);
  const { bizKey } = requireRunningBizKey(taskId); // 必须在 complete 之前取（complete 后运行时查不到）
  const current = requireRow(bizKey);
  completeTask({ taskId, userId: req.loginUser?.userId ?? "0", variables: {}, comment: null, action: "approve" });
  ok(res, updateGenericStatus(bizKey, current.VERSION, { status: "已批准" }));
});

/** POST /reject —— 驳回（终止流程（历史保留）+ 置「已驳回」） */
router.post("/reject", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const taskId = body.taskId == null ? "null" : String(body.taskId);
  const reason = body.reason == null ? null : String(body.reason);
  const { bizKey, instId } = requireRunningBizKey(taskId);
  const current = requireRow(bizKey);
  terminateInstance(instId, reason); // 历史保留，运行时实例终止
  ok(res, updateGenericStatus(bizKey, current.VERSION, { status: "已驳回" }));
});

export default router;

// ==================== BackendLogic registry 注册 ====================
// 对齐 modules/engine/backend-logic.ts 的 BackendBean 形态。注：该文件为静态 BEANS 常量数组、
// 未导出注册 API；按「只 import 使用、不修改」约定，此处以同构形态维护 EXAMPLE_BIZ_BEANS
// 模块级 registry（启动时 import 即注册），主控接线时可并入 GET /api/v1/backend-logic/beans 输出。
export interface BizHandlerBean {
  beanName: string; beanClass: string; description: string;
  methods: Array<{ methodName: string; paramCount: number; description: string }>;
}

export const EXAMPLE_BIZ_BEANS: BizHandlerBean[] = [];

/** LeaveBillHandler（BizDataHandler）：beforeCreate 请假>5 天必填 reason；afterCreate 置「草稿」 */
EXAMPLE_BIZ_BEANS.push({
  beanName: "leaveBillHandler",
  beanClass: "example.leave.LeaveBillHandler",
  description: "请假单（leave_bill）业务钩子：>5 天必填理由；创建后置状态「草稿」",
  methods: [
    { methodName: "beforeCreate", paramCount: 1, description: "days>5 时校验 reason 必填（400）" },
    { methodName: "afterCreate", paramCount: 1, description: "置 status=草稿（updateGeneric 通道）" },
    { methodName: "submit", paramCount: 1, description: "启动 leave-bill 流程并置「待审批」" },
  ],
});

/** afterCreate 钩子实现（对齐 LeaveBillHandler.afterCreate：置初始状态「草稿」） */
export function leaveAfterCreate(createdId: string, version: number): Record<string, unknown> {
  return updateGenericStatus(createdId, version, { status: "草稿" });
}
