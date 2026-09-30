/**
 * 数据源模块 —— DataSourceController + DataSourceDefinitionService + UnifiedDataSourceAdapter +
 * SortableResolver / WorkflowFormDataQueryService 移植（Task 13-5）
 * mount 前缀：/api/v1/data-sources（14 端点）
 *
 * 语义对齐（Java: engine/datasource/*）：
 *  - create：FORM/WORKFLOW sourceKey≡formKey；FORM/SYSTEM params 自动生成端点；API/SQL 创建即 ENABLED
 *  - enable：按类型校验（FORM 须绑定已发布表单；WORKFLOW 非 BUSINESS）；disable 任意可
 *  - delete：被页面引用（dataSourceId 列 + PAGE schema dataSources[].refId，排除 ARCHIVED）拒绝
 *  - data 端点：统一走 adapter（FORM→bizdata 三模式；WORKFLOW→跨实例聚合；SYSTEM→internal；API→HTTP；SQL→querySqlRaw）
 *  - VISUAL SQL（VisualSqlGenerator.generate 保存侧翻译）未移植：params.queryMode=visual 时 query 已生成语义不变
 */
/* mount: /api/v1/data-sources */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, query, queryOne, queryRows, tx } from "../../lib/db";
import { nowStr, normTs, translateSql, uuid32 } from "../../lib/dialect";
import { ColumnConfig, tableExists } from "../form/dynamic-table";
import { extractSchemaColumns, getBusinessColumnsByKey, parseColumnConfig, tenantOf } from "../form/form-definition";
import {
  bizCreate, bizDelete, bizGetById, bizQuery, bizQueryJoin, bizQuerySql, bizQuerySqlRaw, bizUpdate,
  parseFormQueryConfig, resolveByFormKey, FormQueryConfig, BizQueryRequest,
} from "../form/bizdata";
import { flattenDeptTree, userGetById, usersPage, bizPage } from "../system-internal";

const router = Router();

type Row = Record<string, unknown>;
type Data = Record<string, unknown>;

const SUPPORTED_TYPES = new Set(["FORM", "SYSTEM", "API", "WORKFLOW", "SQL"]);
const SYSTEM_SOURCE_KEYS = new Set(["dept-tree", "user-tree"]);

// ==================== DTO / 基础 ====================

function dsJSON(r: Row): Row {
  return {
    id: r.id as string,
    tenantId: r.tenantId as string,
    name: r.name as string,
    type: r.type as string,
    formKey: (r.formKey as string | null) ?? null,
    sourceKey: (r.sourceKey as string | null) ?? null,
    params: (r.params as string | null) ?? null,
    status: r.status as string,
    createdBy: (r.createdBy as string | null) ?? null,
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
  };
}

function dsById(tenantId: string, id: string): Row {
  const rows = queryRows("WF_DATA_SOURCE", "SELECT * FROM WF_DATA_SOURCE WHERE ID = ? AND TENANT_ID = ? LIMIT 1", [id, tenantId]);
  if (!rows.length) throw new BusinessException("数据源不存在: " + id, 404);
  return rows[0];
}

function requireEnabled(ds: Row): void {
  if (ds.status !== "ENABLED") throw new BusinessException("数据源未启用，无法访问: " + ds.name, 400);
}

/** params 解析（非法 JSON / 非对象 → 400） */
function parseParams(paramsJson: string | null | undefined, allowNull = false): Data | null {
  if (!paramsJson || paramsJson.trim() === "") {
    if (allowNull) return null;
    throw new BusinessException("数据源参数 params 必须是 JSON 对象", 400);
  }
  let node: unknown;
  try {
    node = JSON.parse(paramsJson);
  } catch (e) {
    throw new BusinessException("数据源参数 params 必须是合法 JSON: " + (e instanceof Error ? e.message : String(e)), 400);
  }
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new BusinessException("数据源参数 params 必须是 JSON 对象", 400);
  }
  return node as Data;
}

// ==================== params 自动生成（FORM/SYSTEM） ====================

function generateParams(type: string, formKey: string | null, sourceKey: string | null): string {
  const params: Data = {};
  if (type === "FORM") {
    const base = "/api/v1/biz-data/" + formKey;
    params.list = { action: base, method: "GET", parse: "records", totalParse: "total" };
    params.create = { action: base, method: "POST" };
    params.get = { action: base + "/{id}", method: "GET" };
    params.update = { action: base + "/{id}", method: "PUT" };
    params.delete = { action: base + "/{id}", method: "DELETE" };
  } else if (type === "SYSTEM") {
    params.list = { action: "/api/v1/internal/system/" + mapSystemInternalKey(sourceKey!), method: "GET" };
  }
  return JSON.stringify(params);
}

function mapSystemInternalKey(sourceKey: string): string {
  if (sourceKey === "dept-tree") return "dept-tree";
  if (sourceKey === "user-tree") return "users";
  throw new BusinessException("未注册的系统数据源: " + sourceKey, 400);
}

/** 合并：生成端点 params 之上叠加 queryMode 配置段（仅 queryMode/joins/query/columns/params 五字段） */
function mergeQueryConfig(generated: string, params: string): string {
  const base = JSON.parse(generated) as Data;
  const input = JSON.parse(params) as Data;
  for (const field of ["queryMode", "joins", "query", "columns", "params"]) {
    if (field in input) base[field] = input[field];
  }
  return JSON.stringify(base);
}

function hasQueryModeSegment(params: string | null | undefined): boolean {
  if (!params || params.trim() === "") return false;
  try {
    const root = JSON.parse(params);
    return root && typeof root === "object" && !Array.isArray(root) && "queryMode" in root;
  } catch {
    return false;
  }
}

// ==================== 校验 ====================

function validateRequiredFields(type: string, formKey: string | null, sourceKey: string | null, params: string | null): void {
  if (type === "FORM" || type === "WORKFLOW") {
    if (!formKey || formKey.trim() === "") throw new BusinessException(type + " 类型数据源必须绑定表单 formKey", 400);
    return;
  }
  if (!sourceKey || sourceKey.trim() === "") throw new BusinessException(type + " 类型数据源必须填写 sourceKey", 400);
  if (type === "SYSTEM" && !SYSTEM_SOURCE_KEYS.has(sourceKey)) throw new BusinessException("未注册的系统数据源: " + sourceKey, 400);
  if (type === "API") {
    if (!params || params.trim() === "") throw new BusinessException("API 数据源参数 params 必须包含 action（API 路径）", 400);
    const node = parseParams(params);
    if (!node!.action || String(node!.action).trim() === "") {
      throw new BusinessException("API 数据源参数 params 必须包含 action（API 路径）", 400);
    }
  }
  // SQL：仅要求 sourceKey（query 配置在 params 中）
}

function requirePublishedForm(tenantId: string, formKey: string): void {
  const row = queryOne(
    'SELECT ID FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? AND STATUS = ? ORDER BY VERSION DESC LIMIT 1',
    [tenantId, formKey, "PUBLISHED"],
  );
  if (!row) throw new BusinessException("绑定的表单未发布，无法启用: " + formKey, 400);
}

function requireWorkflowForm(tenantId: string, formKey: string): void {
  const rows = queryRows(
    'SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? AND STATUS = ? ORDER BY VERSION DESC LIMIT 1',
    [tenantId, formKey, "PUBLISHED"],
  );
  if (!rows.length) throw new BusinessException("工作流表单必须先发布: " + formKey, 400);
  if (rows[0].type === "BUSINESS") throw new BusinessException("业务表单不可配置为工作流表单数据源: " + formKey, 400);
}

// ==================== SortableResolver ====================

function resolveSortable(columns: ColumnConfig[]): ColumnConfig[] {
  for (const c of columns) {
    if (c.sortable == null) {
      c.sortable = isSortable(c);
    }
  }
  return columns;
}

function isSortable(c: ColumnConfig): boolean {
  if (Array.isArray(c.subColumns) && c.subColumns.length > 0) return false;
  const type = (c.columnType ?? "").toUpperCase();
  if (type === "JSON" || type === "TEXT") return false;
  return !c.componentType || c.componentType !== "colorPicker";
}

function copySortableFalse(columns: ColumnConfig[]): ColumnConfig[] {
  return (columns ?? []).map((c) => ({ ...c, sortable: false }));
}

// ==================== 元数据（UnifiedDataSourceAdapter.metadata） ====================

const DEPT_COLUMNS: ColumnConfig[] = [
  { key: "id", label: "ID", columnType: "VARCHAR" },
  { key: "parentId", label: "父节点", columnType: "VARCHAR" },
  { key: "label", label: "名称", columnType: "VARCHAR" },
  { key: "code", label: "编码", columnType: "VARCHAR" },
];
const USER_COLUMNS: ColumnConfig[] = [
  { key: "id", label: "ID", columnType: "VARCHAR" },
  { key: "username", label: "用户名", columnType: "VARCHAR" },
  { key: "nickname", label: "昵称", columnType: "VARCHAR" },
  { key: "orgId", label: "组织ID", columnType: "VARCHAR" },
  { key: "orgName", label: "组织名称", columnType: "VARCHAR" },
  { key: "status", label: "状态", columnType: "TINYINT" },
];

function dsMetadata(tenantId: string, ds: Row): Row {
  const params = parseFormQueryConfig((ds.params as string | null) ?? "{}");
  const type = ds.type as string;
  if (type === "FORM") {
    const cols = [...getBusinessColumnsByKey(tenantId, ds.formKey as string)];
    if (params.queryMode === "config" && params.joins.length > 0) {
      const mainKeys = new Set(cols.map((c) => c.key));
      for (const j of params.joins) {
        if (!mainKeys.has(j.virtualKey)) {
          cols.push({ key: j.virtualKey, label: j.label ?? j.virtualKey, columnType: "VARCHAR", sortable: j.sortable, filterable: j.filterable });
        }
      }
    } else if (params.queryMode === "sql" && params.query) {
      const mainKeys = new Set(cols.map((c) => c.key));
      for (const c of params.columns) if (!mainKeys.has(c.key)) cols.push(c);
    }
    resolveSortable(cols);
    return { columns: cols, writable: true, formKey: ds.formKey };
  }
  if (type === "WORKFLOW") {
    const cols = workflowColumnsFor(tenantId, ds.formKey as string);
    resolveSortable(cols);
    return { columns: cols, writable: false, formKey: ds.formKey };
  }
  if (type === "SYSTEM") {
    return { columns: copySortableFalse(ds.sourceKey === "user-tree" ? USER_COLUMNS : DEPT_COLUMNS), writable: false, formKey: null };
  }
  if (type === "API") {
    const p = parseParams(ds.params as string, true);
    const declared = Array.isArray(p?.columns) ? (p!.columns as ColumnConfig[]) : [];
    const writable = ["create", "update", "delete"].some((op) => op in (p ?? {}));
    return { columns: copySortableFalse(declared), writable, formKey: null };
  }
  if (type === "SQL") {
    const cols = params.queryMode === "config" ? [] : params.columns;
    const writable = !!(ds.formKey && String(ds.formKey).trim() !== "");
    return { columns: cols, writable, formKey: writable ? ds.formKey : null };
  }
  throw new BusinessException("数据源类型未启用: " + type, 400);
}

// ==================== WORKFLOW 跨实例聚合（WorkflowFormDataQueryService） ====================

const WF_SYSTEM_KEYS = new Set(["instanceId", "processStatus", "initiatorName", "currentNodeName"]);

function workflowColumnsFor(tenantId: string, formKey: string): ColumnConfig[] {
  const latest = queryRows(
    'SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? AND STATUS = ? ORDER BY VERSION DESC LIMIT 1',
    [tenantId, formKey, "PUBLISHED"],
  );
  if (!latest.length) throw new BusinessException("表单不存在或未发布: " + formKey, 404);
  const def = latest[0];
  const extracted = def.type === "WORKFLOW" ? extractSchemaColumns(def.schema as string) : parseColumnConfig(def.columnConfig as string);
  const map = new Map<string, ColumnConfig>();
  for (const c of extracted) {
    if (!c.key || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(c.key)) continue;
    if (!map.has(c.key)) map.set(c.key, c);
  }
  return [...map.values()];
}

function versionIds(tenantId: string, formKey: string): string[] {
  return queryRows(
    'SELECT ID FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? ORDER BY VERSION DESC',
    [tenantId, formKey],
  ).map((r) => String(r.ID));
}

function workflowQuery(tenantId: string, formKey: string, req: BizQueryRequest): Row {
  const bizCols = workflowColumnsFor(tenantId, formKey);
  const filters: Array<[string, string]> = [];
  if (req.filter) {
    let parsed: Data;
    try {
      parsed = JSON.parse(req.filter);
    } catch {
      throw new BusinessException("筛选参数 filter 格式非法，应为 JSON 对象", 400);
    }
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      // WORKFLOW 查询仅支持旧格式 {col:v} 等值（对齐 Java parseFilters）
      if (Array.isArray(parsed.conditions)) {
        for (const c of parsed.conditions as Data[]) {
          const col = String(c.column ?? "");
          if (!bizCols.some((b) => b.key === col)) throw new BusinessException("非法筛选字段: " + col, 400);
          if (c.value != null) filters.push([col, String(c.value)]);
        }
      } else {
        for (const [col, v] of Object.entries(parsed)) {
          if (!bizCols.some((b) => b.key === col)) throw new BusinessException("非法筛选字段: " + col, 400);
          if (v != null) filters.push([col, String(v)]);
        }
      }
    }
  }
  let keywordColumn: string | null = null;
  if (req.keyword && req.keywordColumn) {
    for (const col of req.keywordColumn.split(",").map((s) => s.trim())) {
      if (bizCols.some((b) => b.key === col)) {
        keywordColumn = col;
        break;
      }
    }
    if (!keywordColumn) throw new BusinessException("关键词匹配列不在表单字段中", 400);
  }

  const ids = versionIds(tenantId, formKey);
  const size = Math.max(1, req.size);
  const page = Math.max(req.page, 1);
  if (ids.length === 0) return bizPage([], 0, page, size);

  const where: string[] = [
    " FROM WF_FORM_DATA f LEFT JOIN WF_PROC_INST p ON p.ID = f.PROCESS_INSTANCE_ID",
    " WHERE f.TENANT_ID = ? AND f.FORM_DEF_ID IN (" + ids.map(() => "?").join(",") + ") AND f.IS_SNAPSHOT = 0 AND f.PROCESS_INSTANCE_ID IS NOT NULL",
  ];
  const params: unknown[] = [tenantId, ...ids];
  for (const [col, v] of filters) {
    where.push(" AND JSON_UNQUOTE(JSON_EXTRACT(f.DATA_JSON, '$." + col + "')) = ?");
    params.push(v);
  }
  if (keywordColumn) {
    where.push(" AND JSON_UNQUOTE(JSON_EXTRACT(f.DATA_JSON, '$." + keywordColumn + "')) LIKE CONCAT('%', ?, '%')");
    params.push(req.keyword!.trim());
  }

  const countSql = translateSql("SELECT COUNT(*)" + where.join(""));
  const total = Number(queryOne<{ c: number }>(countSql, params)?.c ?? 0);

  // 排序（startTime→START_TIME；派生列不可排；数值列先 CAST）
  let orderBy: string;
  if (!req.sort || req.sort.trim() === "") {
    orderBy = " ORDER BY COALESCE(p.START_TIME, f.CREATED_AT) DESC";
  } else if (req.sort === "startTime") {
    orderBy = " ORDER BY p.START_TIME " + (String(req.order).toLowerCase() === "asc" ? "ASC" : "DESC");
  } else if (WF_SYSTEM_KEYS.has(req.sort)) {
    throw new BusinessException("排序字段不可排序: " + req.sort, 400);
  } else {
    const col = bizCols.find((b) => b.key === req.sort);
    if (!col || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(req.sort)) throw new BusinessException("排序字段不在表单字段中: " + req.sort, 400);
    const type = (col.columnType ?? "VARCHAR").toUpperCase();
    const dir = String(req.order ?? "").toLowerCase() === "asc" ? "ASC" : "DESC";
    if (type.includes("INT") || type.includes("DECIMAL")) {
      const cast = type.includes("DECIMAL") ? "REAL" : "INTEGER";
      orderBy = " ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(f.DATA_JSON, '$." + req.sort + "')) AS " + cast + ") " + dir;
    } else {
      orderBy = " ORDER BY JSON_UNQUOTE(JSON_EXTRACT(f.DATA_JSON, '$." + req.sort + "')) " + dir;
    }
  }

  const rowsSql = translateSql(
    "SELECT f.ID AS FID, f.DATA_JSON, f.PROCESS_INSTANCE_ID, p.START_TIME, p.START_USER, p.END_TIME, p.STATUS AS PSTATUS" +
      where.join("") + orderBy + " LIMIT ? OFFSET ?",
  );
  const rawRows = query(rowsSql, [...params, size, (page - 1) * size]) as Row[];

  const records = rawRows.map((r) => {
    let raw: Data = {};
    try {
      raw = r.DATA_JSON ? JSON.parse(String(r.DATA_JSON)) : {};
    } catch {
      raw = {};
    }
    const pid = r.PROCESS_INSTANCE_ID == null ? "" : String(r.PROCESS_INSTANCE_ID);
    const startUser = r.START_USER == null ? null : String(r.START_USER);
    let initiatorName: string | null = null;
    if (startUser != null && /^\d+$/.test(startUser)) {
      const u = queryOne<{ NICKNAME: string | null; USERNAME: string }>("SELECT NICKNAME, USERNAME FROM SYS_USER WHERE ID = ?", [Number(startUser)]);
      initiatorName = u ? (u.NICKNAME || u.USERNAME) : null;
    }
    let currentNodeName: string | null = null;
    if (r.END_TIME == null && pid) {
      const tasks = query("SELECT NODE_NAME FROM WF_TASK_INST WHERE PROC_INST_ID = ? AND END_TIME IS NULL AND NODE_NAME IS NOT NULL", [pid]) as Array<{ NODE_NAME: string }>;
      const names = [...new Set(tasks.map((t) => t.NODE_NAME).filter((n) => n && n.trim() !== ""))].join("、");
      if (names) currentNodeName = names;
    }
    const data: Data = {
      instanceId: pid === "" ? null : pid,
      processStatus: r.END_TIME == null ? (r.PSTATUS === "suspended" ? "suspended" : "running") : "completed",
      initiatorName,
      startTime: normTs(r.START_TIME),
      currentNodeName,
    };
    for (const b of bizCols) data[b.key] = raw[b.key] ?? null;
    return { id: String(r.FID), data, version: null, createdAt: null, updatedAt: null };
  });
  return bizPage(records, total, page, size);
}

function workflowGetById(tenantId: string, formKey: string, id: string): Row {
  const ids = versionIds(tenantId, formKey);
  if (!ids.length) throw new BusinessException("数据不存在: " + id, 404);
  const exists = queryOne(
    "SELECT ID FROM WF_FORM_DATA WHERE ID = ? AND TENANT_ID = ? AND FORM_DEF_ID IN (" + ids.map(() => "?").join(",") + ") AND IS_SNAPSHOT = 0 AND PROCESS_INSTANCE_ID IS NOT NULL",
    [id, tenantId, ...ids],
  );
  if (!exists) throw new BusinessException("数据不存在: " + id, 404);
  const page = workflowQuery(tenantId, formKey, { filter: null, keyword: null, keywordColumn: null, sort: null, order: null, params: null, page: 1, size: 100000 });
  const hit = (page.records as Row[]).find((r) => String(r.id) === id);
  if (!hit) throw new BusinessException("数据不存在: " + id, 404);
  return hit;
}

// ==================== SYSTEM 查询/详情 ====================

function systemQuery(ds: Row, req: BizQueryRequest): Row {
  const keyword = req.keyword;
  if (ds.sourceKey === "dept-tree") {
    const records = flattenDeptTree(keyword);
    return bizPage(records, records.length, 0, records.length);
  }
  return usersPage(keyword, Math.max(req.page, 1), req.size <= 0 ? 20 : req.size);
}

function systemGet(ds: Row, id: string): Row {
  if (ds.sourceKey === "user-tree") {
    try {
      return userGetById(id);
    } catch {
      throw new BusinessException("系统数据不存在: " + id, 404);
    }
  }
  if (ds.sourceKey === "dept-tree") {
    const hit = flattenDeptTree(null).find((r) => String(r.id) === id);
    if (!hit) throw new BusinessException("系统数据不存在: " + id, 404);
    return hit;
  }
  throw new BusinessException("未注册的系统数据源: " + ds.sourceKey, 400);
}

// ==================== 统一数据访问（adapter 分发） ====================

function queryRequestOf(req: Request): BizQueryRequest {
  const q = req.query as Record<string, unknown>;
  return {
    filter: q.filter == null ? null : String(q.filter),
    keyword: q.keyword == null ? null : String(q.keyword),
    keywordColumn: q.keywordColumn == null ? null : String(q.keywordColumn),
    sort: q.sort == null ? null : String(q.sort),
    order: q.order == null ? null : String(q.order),
    params: q.params == null ? null : String(q.params),
    page: Number(q.page ?? 1) || 1,
    size: Number(q.size ?? 20) || 20,
  };
}

function requireFormKey(ds: Row, op: string): string {
  const fk = ds.formKey as string | null;
  if (!fk || fk.trim() === "") throw new BusinessException("SQL 数据源未绑定表单，不支持" + op + "操作: " + ds.name, 400);
  return fk;
}

function adapterQuery(tenantId: string, ds: Row, req: BizQueryRequest): Row {
  const type = ds.type as string;
  const fk = ds.formKey as string | null;
  if (type === "FORM") {
    const cfg = parseFormQueryConfig((ds.params as string | null) ?? "{}");
    if (cfg.queryMode === "config" && cfg.joins.length > 0) return bizQueryJoin(tenantId, fk!, req, cfg.joins);
    if (cfg.queryMode === "sql" && cfg.query) return bizQuerySql(tenantId, fk!, req, cfg);
    return bizQuery(tenantId, null, fk!, req);
  }
  if (type === "WORKFLOW") return workflowQuery(tenantId, fk!, req);
  if (type === "SYSTEM") return systemQuery(ds, req);
  if (type === "API") return apiQuery(ds, req);
  if (type === "SQL") {
    const cfg = parseFormQueryConfig((ds.params as string | null) ?? "{}");
    if (cfg.queryMode === "visual" || cfg.queryMode === "sql") return bizQuerySqlRaw(tenantId, fk!, req, cfg);
    throw new BusinessException("SQL 数据源缺少查询配置", 400);
  }
  throw new BusinessException("数据源类型未启用: " + type, 400);
}

function adapterGet(tenantId: string, ds: Row, id: string): Row {
  const type = ds.type as string;
  if (type === "FORM") return bizGetById(tenantId, ds.formKey as string, id);
  if (type === "WORKFLOW") return workflowGetById(tenantId, ds.formKey as string, id);
  if (type === "SYSTEM") return systemGet(ds, id);
  if (type === "SQL") return bizGetById(tenantId, requireFormKey(ds, "get"), id);
  if (type === "API") throw new BusinessException("该数据源不支持get: " + ds.name, 400);
  throw new BusinessException("数据源类型未启用: " + type, 400);
}

function adapterCreate(tenantId: string, ds: Row, data: Data): string {
  const type = ds.type as string;
  if (type === "WORKFLOW") throw new BusinessException("工作流表单数据源为只读，不支持该操作", 400);
  if (type === "FORM") return String(bizCreate(tenantId, null, ds.formKey as string, data).id);
  if (type === "SQL") return String(bizCreate(tenantId, null, requireFormKey(ds, "create"), data).id);
  if (type === "API") throw new BusinessException("该数据源不支持create: " + ds.name, 400);
  throw new BusinessException("该数据源不支持create: " + ds.name, 400);
}

function adapterUpdate(tenantId: string, ds: Row, id: string, data: Data, version: number | null): void {
  const type = ds.type as string;
  if (type === "WORKFLOW") throw new BusinessException("工作流表单数据源为只读，不支持该操作", 400);
  if (type === "FORM") {
    bizUpdate(tenantId, null, ds.formKey as string, id, data, version);
    return;
  }
  if (type === "SQL") {
    bizUpdate(tenantId, null, requireFormKey(ds, "update"), id, data, version);
    return;
  }
  throw new BusinessException("该数据源不支持update: " + ds.name, 400);
}

function adapterDelete(tenantId: string, ds: Row, id: string): void {
  const type = ds.type as string;
  if (type === "WORKFLOW") throw new BusinessException("工作流表单数据源为只读，不支持该操作", 400);
  if (type === "SYSTEM") throw new BusinessException("该数据源不支持delete: " + ds.name, 400);
  if (type === "FORM") {
    bizDelete(tenantId, null, ds.formKey as string, id);
    return;
  }
  if (type === "SQL") {
    bizDelete(tenantId, null, requireFormKey(ds, "delete"), id);
    return;
  }
  throw new BusinessException("该数据源不支持delete: " + ds.name, 400);
}

/** API 数据源 list 查询（HttpLogicExecutor 直连简化移植：{{var}}/:var 占位 + parse/totalParse 取数） */
function apiQuery(ds: Row, req: BizQueryRequest): Row {
  const params = parseParams(ds.params as string);
  const listOp = params!.list as Data | undefined;
  if (!listOp || !listOp.action) throw new BusinessException("API 数据源未配置 list 操作: " + ds.name, 400);
  throw new BusinessException("API 数据源查询依赖外部 HTTP 执行器，当前环境未启用: " + ds.name, 400);
}

// ==================== 页面引用统计（删除守卫） ====================

function pageRefCount(tenantId: string, dsId: string): number {
  const byColumn = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM WF_PAGE_DEF WHERE TENANT_ID = ? AND DATA_SOURCE_ID = ? AND STATUS <> ?",
    [tenantId, dsId, "ARCHIVED"],
  )?.c ?? 0;
  let bySchema = 0;
  const pages = queryRows(
    "WF_PAGE_DEF",
    "SELECT \"schema\" AS SCHEMA_JSON FROM WF_PAGE_DEF WHERE TENANT_ID = ? AND TYPE = ? AND STATUS <> ? AND DATA_SOURCE_ID IS NULL",
    [tenantId, "PAGE", "ARCHIVED"],
  );
  for (const p of pages) {
    try {
      const schema = JSON.parse(String(p.SCHEMA_JSON ?? "{}"));
      const sources = Array.isArray(schema?.dataSources) ? schema.dataSources : [];
      if (sources.some((s: Data) => String(s?.refId ?? "") === dsId)) bySchema++;
    } catch {
      // 非法 schema 跳过
    }
  }
  return Number(byColumn) + bySchema;
}

// ==================== 端点（14 个） ====================

/** POST /api/v1/data-sources */
router.post("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const body = (req.body ?? {}) as Data;
  const name = body.name == null ? null : String(body.name);
  const type = body.type == null ? null : String(body.type);
  const formKey = body.formKey == null ? null : String(body.formKey);
  const sourceKey = body.sourceKey == null ? null : String(body.sourceKey);
  const params = body.params == null ? null : String(body.params);

  if (!type || type.trim() === "") throw new BusinessException("数据源类型 type 必填", 400);
  if (!SUPPORTED_TYPES.has(type)) throw new BusinessException("不支持的数据源类型: " + type, 400);
  if (!name || name.trim() === "") throw new BusinessException("数据源名称不能为空", 400);
  if (queryOne("SELECT ID FROM WF_DATA_SOURCE WHERE TENANT_ID = ? AND NAME = ?", [tenantId, name])) {
    throw new BusinessException("数据源名称已存在: " + name, 400);
  }
  const formBound = type === "FORM" || type === "WORKFLOW";
  const effSourceKey = formBound ? formKey : sourceKey;
  validateRequiredFields(type, formKey, effSourceKey, params);
  if (formBound && !queryOne('SELECT ID FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? LIMIT 1', [tenantId, formKey])) {
    throw new BusinessException("绑定的表单不存在: " + formKey, 400);
  }
  if (!effSourceKey || effSourceKey.trim() === "") throw new BusinessException("数据源必须填写 sourceKey", 400);
  if (queryOne("SELECT ID FROM WF_DATA_SOURCE WHERE TENANT_ID = ? AND SOURCE_KEY = ?", [tenantId, effSourceKey])) {
    throw new BusinessException("数据源标识 sourceKey 已存在: " + effSourceKey, 400);
  }
  let effParams: string | null;
  if (type === "FORM") {
    if (hasQueryModeSegment(params)) {
      validateFormQueryConfig(tenantId, params!);
      effParams = mergeQueryConfig(generateParams(type, formKey, effSourceKey), params!);
    } else {
      effParams = generateParams(type, formKey, effSourceKey);
    }
  } else if (type === "SYSTEM") {
    effParams = generateParams(type, formKey, effSourceKey);
  } else {
    effParams = params;
  }
  const status = type === "API" || type === "SQL" ? "ENABLED" : "DRAFT";
  const id = uuid32();
  const now = nowStr();
  exec(
    `INSERT INTO WF_DATA_SOURCE (ID, TENANT_ID, NAME, "type", FORM_KEY, SOURCE_KEY, "params", STATUS, CREATED_BY, CREATED_AT, UPDATED_AT)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, name, type, formKey, effSourceKey, effParams, status, req.loginUser?.username ?? null, now, now],
  );
  ok(res, dsJSON(dsById(tenantId, id)));
});

/** FORM 查询配置段保存校验（config→joins 校验；sql→SqlTemplateEngine.validate） */
function validateFormQueryConfig(tenantId: string, params: string): void {
  let root: Data;
  try {
    root = JSON.parse(params);
  } catch (e) {
    throw new BusinessException("数据源参数 params 必须是合法 JSON: " + (e instanceof Error ? e.message : String(e)), 400);
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new BusinessException("数据源参数 params 必须是 JSON 对象", 400);
  }
  const mode = root.queryMode == null ? null : String(root.queryMode);
  if (mode === "config") {
    const joins = Array.isArray(root.joins) ? (root.joins as Data[]) : [];
    if (joins.length === 0) throw new BusinessException("queryMode=config 时必须配置至少一个关联 joins", 400);
    const aliases = new Set<string>();
    const virtualKeys = new Set<string>();
    joins.forEach((j, idx) => {
      const alias = String(j.alias ?? "");
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(alias)) throw new BusinessException(`joins 第 ${idx + 1} 项 alias 非法: ${alias}`, 400);
      if (aliases.has(alias)) throw new BusinessException("关联别名重复: " + alias, 400);
      aliases.add(alias);
      const targetFormKey = String(j.targetFormKey ?? "");
      if (!targetFormKey) throw new BusinessException(`joins 第 ${idx + 1} 项必须指定目标表单 targetFormKey`, 400);
      if (!queryOne('SELECT ID FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? LIMIT 1', [tenantId, targetFormKey])) {
        throw new BusinessException("目标表单不存在: " + targetFormKey, 400);
      }
      if (!tableExists("WF_BIZ_" + targetFormKey.toUpperCase())) throw new BusinessException("关联表单不存在: " + targetFormKey, 400);
      for (const f of ["localField", "foreignField", "joinField", "virtualKey"]) {
        if (!String(j[f] ?? "").trim()) throw new BusinessException(`joins 第 ${idx + 1} 项必须指定${f} ${f}`, 400);
      }
      const vkey = String(j.virtualKey ?? "");
      if (virtualKeys.has(vkey)) throw new BusinessException("虚拟列 virtualKey 重复: " + vkey, 400);
      virtualKeys.add(vkey);
    });
    return;
  }
  if (mode === "sql" || mode === "visual") {
    try {
      // 复用 bizdata 的模板校验语义（经 querySqlTemplate 的 validate 路径）
      const cfg = parseFormQueryConfig(params);
      const cols = cfg.columns.map((c) => ({ key: c.key, ref: c.key, columnType: (c.columnType ?? "").toUpperCase(), sortable: c.sortable === true, filterable: c.filterable === true }));
      validateTemplatePublic(cfg.query, cols, cfg.declaredParams);
    } catch (e) {
      if (e instanceof Error) throw new BusinessException(e.message, 400);
      throw e;
    }
  }
}

// 从 bizdata 导出复用模板校验（避免重复实现）
import { validateSqlTemplate as validateTemplatePublic } from "../form/bizdata";

/** PUT /api/v1/data-sources/{id}（null 字段不更新） */
router.put("/:id", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  const body = (req.body ?? {}) as Data;
  const name = body.name == null ? null : String(body.name);
  const type = body.type == null ? null : String(body.type);
  const formKey = body.formKey == null ? null : String(body.formKey);
  const sourceKey = body.sourceKey == null ? null : String(body.sourceKey);
  const params = body.params == null ? null : String(body.params);

  const newType = !type || type.trim() === "" ? (ds.type as string) : type;
  if (type && !SUPPORTED_TYPES.has(newType)) throw new BusinessException("不支持的数据源类型: " + newType, 400);
  if (name && name !== ds.name && queryOne("SELECT ID FROM WF_DATA_SOURCE WHERE TENANT_ID = ? AND NAME = ?", [tenantId, name])) {
    throw new BusinessException("数据源名称已存在: " + name, 400);
  }
  const newFormKey = body.formKey == null ? (ds.formKey as string | null) : formKey;
  const newSourceKey = body.sourceKey == null ? (ds.sourceKey as string | null) : sourceKey;
  const newParams = body.params == null ? (ds.params as string | null) : params;
  const formBound = newType === "FORM" || newType === "WORKFLOW";
  const effSourceKey = formBound ? newFormKey : newSourceKey;
  validateRequiredFields(newType, newFormKey, effSourceKey, newParams);
  if (formBound && !queryOne('SELECT ID FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? LIMIT 1', [tenantId, newFormKey])) {
    throw new BusinessException("绑定的表单不存在: " + newFormKey, 400);
  }
  if (newType === "FORM" && newParams) validateFormQueryConfig(tenantId, newParams);
  if (effSourceKey !== ds.sourceKey && queryOne("SELECT ID FROM WF_DATA_SOURCE WHERE TENANT_ID = ? AND SOURCE_KEY = ?", [tenantId, effSourceKey])) {
    throw new BusinessException("数据源标识 sourceKey 已存在: " + effSourceKey, 400);
  }
  const bindChanged = ds.type !== "FORM" || (formKey != null && formKey !== ds.formKey);
  if (ds.status === "ENABLED" && bindChanged) {
    if (newType === "FORM") requirePublishedForm(tenantId, newFormKey!);
    else if (newType === "WORKFLOW") requireWorkflowForm(tenantId, newFormKey!);
  }
  exec(
    `UPDATE WF_DATA_SOURCE SET NAME = ?, "type" = ?, FORM_KEY = ?, SOURCE_KEY = ?, "params" = ?, UPDATED_AT = ? WHERE ID = ?`,
    [name ?? ds.name, newType, newFormKey, effSourceKey, newParams, nowStr(), req.params.id],
  );
  ok(res, dsJSON(dsById(tenantId, req.params.id)));
});

/** DELETE /api/v1/data-sources/{id}（被页面引用拒绝） */
router.delete("/:id", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  const refCount = pageRefCount(tenantId, String(ds.id));
  if (refCount > 0) throw new BusinessException("数据源已被 " + refCount + " 个页面引用，无法删除", 400);
  exec("DELETE FROM WF_DATA_SOURCE WHERE ID = ?", [ds.id]);
  ok(res);
});

/** POST /api/v1/data-sources/{id}/enable */
router.post("/:id/enable", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  const type = ds.type as string;
  const formKey = ds.formKey as string | null;
  validateRequiredFields(type, formKey, ds.sourceKey as string | null, ds.params as string | null);
  if (type === "FORM") requirePublishedForm(tenantId, formKey!);
  if (type === "WORKFLOW") requireWorkflowForm(tenantId, formKey!);
  exec("UPDATE WF_DATA_SOURCE SET STATUS = 'ENABLED', UPDATED_AT = ? WHERE ID = ?", [nowStr(), ds.id]);
  ok(res, dsJSON(dsById(tenantId, req.params.id)));
});

/** POST /api/v1/data-sources/{id}/disable */
router.post("/:id/disable", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  dsById(tenantId, req.params.id);
  exec("UPDATE WF_DATA_SOURCE SET STATUS = 'DISABLED', UPDATED_AT = ? WHERE ID = ?", [nowStr(), req.params.id]);
  ok(res, dsJSON(dsById(tenantId, req.params.id)));
});

/** GET /api/v1/data-sources?page=&size=&type=&status= → PageResponse */
router.get("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const page = Math.max(Number(req.query.page ?? 1) || 1, 1);
  const size = Number(req.query.size ?? 20) || 20;
  // 对齐 Java findByAccessibleTenant*：tenant_id = ? OR type = 'SYSTEM'
  const where: string[] = ["(TENANT_ID = ? OR \"type\" = 'SYSTEM')"];
  const params: unknown[] = [tenantId];
  if (req.query.type != null) {
    where.push('"type" = ?');
    params.push(String(req.query.type));
  }
  if (req.query.status != null) {
    where.push("STATUS = ?");
    params.push(String(req.query.status));
  }
  const totalRow = queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM WF_DATA_SOURCE WHERE ${where.join(" AND ")}`, params);
  const rows = queryRows(
    "WF_DATA_SOURCE",
    `SELECT * FROM WF_DATA_SOURCE WHERE ${where.join(" AND ")} ORDER BY CREATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  const totalElements = totalRow?.c ?? 0;
  ok(res, {
    content: rows.map(dsJSON),
    pageNumber: page,
    pageSize: size,
    totalElements,
    totalPages: size > 0 ? Math.ceil(totalElements / size) : 0,
  });
});

/** GET /api/v1/data-sources/enabled（先于 /:id 注册） */
router.get("/enabled", (req: Request, res: Response) => {
  const rows = queryRows("WF_DATA_SOURCE", 'SELECT * FROM WF_DATA_SOURCE WHERE TENANT_ID = ? AND STATUS = ? ORDER BY CREATED_AT DESC', [tenantOf(req), "ENABLED"]);
  ok(res, rows.map(dsJSON));
});

/** GET /api/v1/data-sources/{id}/metadata */
router.get("/:id/metadata", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  ok(res, dsMetadata(tenantId, ds));
});

/** GET /api/v1/data-sources/{id}/data → BizDataPageVO */
router.get("/:id/data", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  requireEnabled(ds);
  ok(res, adapterQuery(tenantId, ds, queryRequestOf(req)));
});

/** POST /api/v1/data-sources/{id}/data → 新 rowId */
router.post("/:id/data", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  requireEnabled(ds);
  ok(res, adapterCreate(tenantId, ds, (req.body ?? {}) as Data));
});

/** GET /api/v1/data-sources/{id}/data/{rowId} */
router.get("/:id/data/:rowId", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  requireEnabled(ds);
  ok(res, adapterGet(tenantId, ds, req.params.rowId));
});

/** PUT /api/v1/data-sources/{id}/data/{rowId}?version= */
router.put("/:id/data/:rowId", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  requireEnabled(ds);
  const version = req.query.version == null ? null : Number(req.query.version);
  adapterUpdate(tenantId, ds, req.params.rowId, (req.body ?? {}) as Data, Number.isNaN(version as number) ? null : version);
  ok(res);
});

/** DELETE /api/v1/data-sources/{id}/data/{rowId} */
router.delete("/:id/data/:rowId", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const ds = dsById(tenantId, req.params.id);
  requireEnabled(ds);
  adapterDelete(tenantId, ds, req.params.rowId);
  ok(res);
});

/** GET /api/v1/data-sources/{id} */
router.get("/:id", (req: Request, res: Response) => {
  ok(res, dsJSON(dsById(tenantOf(req), req.params.id)));
});

export default router;
