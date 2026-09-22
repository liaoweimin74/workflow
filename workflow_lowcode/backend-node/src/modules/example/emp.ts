/**
 * 业务扩展示例·员工档案 —— EmpProfileController + EmpProfileBizService + EmpProfileHandler 移植（Task 13-7）
 * mount 前缀：/api/v1/example/emp（2 端点）
 *
 * Java 语义对齐：
 *  - 存储：Java EmpProfileHandler 无专用 @Table，走 BizDataService 动态表 WF_BIZ_EMP_PROFILE；
 *    本模块复用 form/dynamic-table 的 ensureTable 惰性建表（预置 name/phone/dept/salary/hireDate/status/reason）
 *  - POST /adjust-salary {id, amount}：amount 缺失→400「amount 不能为空」；乐观锁更新 salary
 *  - POST /resign {id, reason?}：status=离职（+reason 非空时写入）；此后 beforeDelete 放行
 *  - EmpProfileHandler 钩子（phone 正则校验/在职禁删/在职天数补全）注册进 bean registry（registerExampleBeans）
 */
/* mount: /api/v1/example/emp */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, queryOne } from "../../lib/db";
import { ensureTable, tableNameOf, tableExists, type ColumnConfig } from "../form/dynamic-table";

export const EMP_FORM_KEY = "emp_profile";
/** 动态表名（对齐 dynamic-table.tableNameOf） */
export const EMP_TABLE = tableNameOf(EMP_FORM_KEY);

const EMP_COLUMNS: ColumnConfig[] = [
  { key: "name", label: "姓名", columnType: "VARCHAR", length: 64 },
  { key: "phone", label: "手机号", columnType: "VARCHAR", length: 20 },
  { key: "dept", label: "部门ID", columnType: "INT" },
  { key: "salary", label: "薪资", columnType: "DECIMAL" },
  { key: "hireDate", label: "入职日期", columnType: "DATE" },
  { key: "status", label: "状态", columnType: "VARCHAR", length: 32 },
  { key: "reason", label: "离职原因", columnType: "VARCHAR", length: 255 },
];

/** 惰性建表（对齐 BizDataService 动态表：WF_BIZ_EMP_PROFILE） */
export function ensureEmpTable(): void {
  if (!tableExists(tableNameOf(EMP_FORM_KEY))) {
    ensureTable(EMP_FORM_KEY, EMP_COLUMNS);
  }
}

interface EmpRow {
  ID: string; TENANT_ID: string; VERSION: number; CREATED_AT: string | null; UPDATED_AT: string | null;
  [col: string]: unknown;
}

/** 行 → BizDataVO（data 键回映射为表单字段 key，对齐 Java BizDataVO.data 形态） */
function rowToVO(row: EmpRow): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const c of EMP_COLUMNS) data[c.key] = row[c.key.toUpperCase()] ?? null;
  return { id: row.ID, data, version: row.VERSION, createdAt: row.CREATED_AT, updatedAt: row.UPDATED_AT };
}

function requireRow(id: string): EmpRow {
  ensureEmpTable();
  const row = queryOne<EmpRow>(`SELECT * FROM ${tableNameOf(EMP_FORM_KEY)} WHERE ID = ?`, [id]);
  if (!row) throw new BusinessException("业务数据不存在: " + id, 404);
  return row;
}

/** 乐观锁更新（对齐 BizDataService.update：version 不匹配 409） */
function updateRow(id: string, currentVersion: number, patch: Record<string, unknown>): Record<string, unknown> {
  const cols = Object.keys(patch);
  const setSql = cols.map((c) => `"${c}" = ?`).join(", ") + ', "VERSION" = "VERSION" + 1, "UPDATED_AT" = ?';
  const params = cols.map((c) => (patch[c] == null ? null : patch[c]));
  const r = exec(
    `UPDATE ${tableNameOf(EMP_FORM_KEY)} SET ${setSql} WHERE "ID" = ? AND "VERSION" = ?`,
    [...params, nowStr(), id, currentVersion],
  );
  if (r.changes === 0) throw new BusinessException("数据已被他人修改，请刷新后重试", 409);
  return rowToVO(requireRow(id));
}

function nowStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const router = Router();

/** POST /adjust-salary —— 调薪（乐观锁更新 salary） */
router.post("/adjust-salary", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = body.id == null ? "null" : String(body.id);
  if (body.amount == null) throw new BusinessException("amount 不能为空", 400);
  const amount = Number(body.amount);
  if (Number.isNaN(amount)) throw new BusinessException("amount 格式非法: " + String(body.amount), 400);
  const current = requireRow(id);
  ok(res, updateRow(id, current.VERSION, { salary: amount }));
});

/** POST /resign —— 离职（status=离职，此后 beforeDelete 放行） */
router.post("/resign", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const id = body.id == null ? "null" : String(body.id);
  const reason = body.reason == null ? null : String(body.reason).trim();
  const current = requireRow(id);
  const patch: Record<string, unknown> = { status: "离职" };
  if (reason) patch.reason = reason;
  ok(res, updateRow(id, current.VERSION, patch));
});

export default router;

// ==================== BackendLogic registry 注册 ====================
// 复用 ./leave 的 EXAMPLE_BIZ_BEANS registry（backend-logic.ts 未导出注册 API，见其文件头注释）
import { EXAMPLE_BIZ_BEANS } from "./leave";

/** EmpProfileHandler（BizDataHandler）：phone 正则校验/在职禁删/在职天数补全 */
EXAMPLE_BIZ_BEANS.push({
  beanName: "empProfileHandler",
  beanClass: "example.emp.EmpProfileHandler",
  description: "员工档案（emp_profile）业务钩子：手机号 ^1\\d{10}$ 校验；在职员工禁删（409）；查询补全在职天数",
  methods: [
    { methodName: "beforeCreate", paramCount: 1, description: "手机号格式非法抛 400" },
    { methodName: "beforeDelete", paramCount: 1, description: "在职员工（status≠离职）禁删抛 409" },
    { methodName: "adjustSalary", paramCount: 2, description: "乐观锁更新 salary" },
    { methodName: "resign", paramCount: 2, description: "置 status=离职" },
  ],
});
