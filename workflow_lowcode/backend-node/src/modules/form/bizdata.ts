/**
 * 业务数据（底表）模块 —— BizDataController + BizDataService + BizDataSupport +
 * BizDataQueryBuilder / JoinSqlGenerator / SqlTemplateEngine / SqlQueryEngine 移植（Task 13-5）
 * mount 前缀：/api/v1/biz-data（11 端点）
 *
 * 三种查询模式（docs/migration/data-layer-semantics.md §5）：
 *  - 单表 queryGeneric（本模块 /:formKey GET）
 *  - config 声明式 JOIN queryJoin（供数据源模块）
 *  - sql/visual 管理员模板 querySql/querySqlRaw（供数据源模块）
 * filter 7 操作符：eq/ne/like/in/range/isempty/isnotempty；JSON 列走 JSON_CONTAINS/JSON_OVERLAPS，
 * 生成 SQL 统一过 dialect.translateSql 改写为 SQLite json_each 形式。
 * H2/MySQL 语义 SQL（NOW()/CONCAT/JSON_UNQUOTE(JSON_EXTRACT)）均由 translateSql 翻译。
 */
/* mount: /api/v1/biz-data */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, query, queryOne, queryRows, tx } from "../../lib/db";
import { nowStr, normTs, translateSql, uuid32 } from "../../lib/dialect";
import {
  ColumnConfig,
  IllegalArgumentException,
  tableExists,
  tableNameOf,
  subTableNameOf,
} from "./dynamic-table";
import { getBusinessColumnsByKey, parseColumnConfig, tenantOf } from "./form-definition";

const router = Router();

const FORM_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const BUILTIN_COLUMNS = new Set(["id", "created_at", "updated_at"]);
const ALLOWED_ORDER = new Set(["asc", "desc"]);
const MAX_SUB_ROWS = 100;

type Row = Record<string, unknown>;
type Data = Record<string, unknown>;

// ==================== 上下文 ====================

interface SubTableDef {
  tableName: string;
  subMode: string; // embedded | dedicated
  columns: ColumnConfig[];
  subKeys: string[];
}

interface BizContext {
  tableName: string;
  formKey: string;
  columns: ColumnConfig[];
  columnKeys: string[];
  subTables: Map<string, SubTableDef>;
}

function subtableField(c: ColumnConfig): boolean {
  return Array.isArray(c.subColumns) && c.subColumns.length > 0;
}

/** 加载表单运行时上下文（表名 + 列 + 子表元数据） */
export function loadContext(formKey: string): BizContext {
  if (!formKey || !FORM_KEY_PATTERN.test(formKey)) {
    throw new BusinessException("非法表单 key: " + formKey, 400);
  }
  const tableName = tableNameOf(formKey);
  if (!tableExists(tableName)) {
    throw new BusinessException("业务表单数据表不存在: " + formKey, 404);
  }
  const columns = getBusinessColumnsByKey(tenantOfCurrent(), formKey);
  const columnKeys = columns.filter((c) => !subtableField(c)).map((c) => c.key);
  const subTables = new Map<string, SubTableDef>();
  for (const c of columns) {
    if (subtableField(c)) {
      const mode = !c.subMode || c.subMode.trim() === "" ? "embedded" : c.subMode;
      subTables.set(c.key, {
        tableName: subTableNameOf(formKey, c.key),
        subMode: mode,
        columns: c.subColumns!,
        subKeys: c.subColumns!.map((s) => s.key),
      });
    }
  }
  return { tableName, formKey, columns, columnKeys, subTables };
}

/** 租户（route 层运行时注入，全局变量式的取值延迟到调用时刻） */
let CURRENT_TENANT = "default";
function tenantOfCurrent(): string {
  return CURRENT_TENANT || "default";
}
function withTenant<T>(tenantId: string, fn: () => T): T {
  const prev = CURRENT_TENANT;
  CURRENT_TENANT = tenantId || "default";
  try {
    return fn();
  } finally {
    CURRENT_TENANT = prev;
  }
}

// ==================== BizDataQueryBuilder（H2 方言 SQL → translateSql） ====================

function qc(key: string): string {
  return '"' + key.toUpperCase().replace(/"/g, '""') + '"';
}

function validateColumn(column: string | null | undefined, allowed: string[], label: string): void {
  if (!column || column.trim() === "") throw new IllegalArgumentException(label + "不能为空");
  if (!allowed.includes(column) && !BUILTIN_COLUMNS.has(column)) {
    throw new IllegalArgumentException("非法" + label + ": " + column);
  }
}

function isJsonColumn(columnTypeOf: Map<string, string>, column: string): boolean {
  return (columnTypeOf.get(column) ?? "").toUpperCase() === "JSON";
}

function jsonValue(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

interface SqlAndParams {
  sql: string;
  params: unknown[];
}

interface QueryColumns {
  key: string;
  ref: string;
  columnType: string;
  sortable: boolean;
  filterable: boolean;
}

/** 结构化/旧格式 filter 片段（复用 filter 协议 7 操作符） */
function appendFilters(sql: string[], params: unknown[], allowed: string[] | null, columnTypeOf: Map<string, string> | null, cols: QueryColumns[] | null, filters: Data): void {
  if (!filters || Object.keys(filters).length === 0) return;
  if (Array.isArray(filters.conditions)) {
    const logic = String(filters.logic ?? "AND").toUpperCase() === "OR" ? "OR" : "AND";
    appendStructured(sql, params, allowed, columnTypeOf, cols, logic, filters.conditions as Data[]);
    return;
  }
  // 旧格式 {col: value} 等值 AND
  for (const [key, v] of Object.entries(filters)) {
    const ref = cols ? resolveRef(key, cols, false, "筛选字段") : (validateColumn(key, allowed!, "筛选字段"), qc(key));
    if (v == null) continue;
    if (columnTypeOf && isJsonColumn(columnTypeOf, key)) {
      sql.push(" AND JSON_CONTAINS(" + ref + ", ?)");
      params.push(jsonValue(v));
    } else {
      sql.push(" AND " + ref + " = ?");
      params.push(v);
    }
  }
}

function resolveRef(column: string, cols: QueryColumns[], sortable: boolean, label: string): string {
  if (!column || column.trim() === "") throw new IllegalArgumentException(label + "不能为空");
  if (BUILTIN_COLUMNS.has(column)) return "m." + column;
  for (const c of cols) {
    if (c.key === column) {
      if (sortable && !c.sortable) throw new IllegalArgumentException("该列不可排序: " + column);
      if (!sortable && !c.filterable) throw new IllegalArgumentException("该列不可" + label + ": " + column);
      return c.ref;
    }
  }
  throw new IllegalArgumentException("非法" + label + ": " + column);
}

function appendStructured(sql: string[], params: unknown[], allowed: string[] | null, columnTypeOf: Map<string, string> | null, cols: QueryColumns[] | null, logic: string, conditions: Data[]): void {
  const fragments: string[] = [];
  for (const c of conditions) {
    const column = String(c.column ?? "");
    const ref = cols ? resolveRef(column, cols, false, "筛选字段") : (validateColumn(column, allowed!, "筛选字段"), qc(column));
    const op = c.op == null ? "eq" : String(c.op).toLowerCase();
    const json = columnTypeOf ? isJsonColumn(columnTypeOf, column) : cols ? (cols.find((x) => x.key === column)?.columnType ?? "").toUpperCase() === "JSON" : false;
    switch (op) {
      case "eq": {
        if (c.value == null) continue;
        if (json) { fragments.push("JSON_CONTAINS(" + ref + ", ?)"); params.push(jsonValue(c.value)); }
        else { fragments.push(ref + " = ?"); params.push(c.value); }
        break;
      }
      case "ne": {
        if (c.value == null) continue;
        if (json) { fragments.push("NOT JSON_CONTAINS(" + ref + ", ?)"); params.push(jsonValue(c.value)); }
        else { fragments.push(ref + " <> ?"); params.push(c.value); }
        break;
      }
      case "like": {
        if (c.value == null) continue;
        fragments.push(ref + " LIKE ?");
        params.push("%" + c.value + "%");
        break;
      }
      case "in": {
        const values = c.value;
        if (!Array.isArray(values) || values.length === 0) continue;
        if (json) { fragments.push("JSON_OVERLAPS(" + ref + ", ?)"); params.push(jsonValue(values)); }
        else {
          fragments.push(ref + " IN (" + values.map(() => "?").join(", ") + ")");
          params.push(...values);
        }
        break;
      }
      case "range": {
        const range = c.value;
        if (!Array.isArray(range) || range.length !== 2 || range[0] == null || range[1] == null) continue;
        fragments.push("(" + ref + " >= ? AND " + ref + " <= ?)");
        params.push(range[0], range[1]);
        break;
      }
      case "isempty":
        fragments.push("(" + ref + " IS NULL OR " + ref + " = '')");
        break;
      case "isnotempty":
        fragments.push("(" + ref + " IS NOT NULL AND " + ref + " <> '')");
        break;
      default:
        throw new IllegalArgumentException("非法筛选运算符: " + op);
    }
  }
  if (fragments.length === 0) return;
  sql.push(" AND (" + fragments.join(" " + logic + " ") + ")");
}

function appendKeyword(sql: string[], params: unknown[], allowed: string[] | null, cols: QueryColumns[] | null, keyword: string | null, keywordColumn: string | null): void {
  if (!keyword || keyword.trim() === "") return;
  const columns = (keywordColumn ?? "").split(",").map((s) => s.trim()).filter((s) => s !== "");
  const likeFragments: string[] = [];
  for (const col of columns) {
    const ref = cols ? resolveRef(col, cols, false, "关键词匹配列") : (validateColumn(col, allowed!, "关键词匹配列"), qc(col));
    likeFragments.push(ref + " LIKE ?");
    params.push("%" + keyword + "%");
  }
  if (likeFragments.length === 0) throw new IllegalArgumentException("关键词匹配列不能为空");
  sql.push(likeFragments.length === 1 ? " AND " + likeFragments[0] : " AND (" + likeFragments.join(" OR ") + ")");
}

/** 单表分页 SELECT（H2 方言；执行前过 translateSql） */
function buildSelect(ctx: BizContext, tenantId: string, columnTypeOf: Map<string, string>, filters: Data, keyword: string | null, keywordColumn: string | null, sort: string | null, order: string | null, page: number, size: number): SqlAndParams {
  const sql: string[] = ["SELECT * FROM " + ctx.tableName + " WHERE tenant_id = ?"];
  const params: unknown[] = [tenantId];
  appendFilters(sql, params, ctx.columnKeys, columnTypeOf, null, filters);
  appendKeyword(sql, params, ctx.columnKeys, null, keyword, keywordColumn);
  const sortColumn = !sort || sort.trim() === "" ? "created_at" : sort;
  validateColumn(sortColumn, ctx.columnKeys, "排序字段");
  const orderDir = !order || order.trim() === "" ? "desc" : order.toLowerCase();
  if (!ALLOWED_ORDER.has(orderDir)) throw new IllegalArgumentException("非法排序方向: " + order);
  sql.push(" ORDER BY " + qc(sortColumn) + " " + orderDir.toUpperCase());
  if (size > 0) {
    sql.push(" LIMIT ? OFFSET ?");
    params.push(size, page * size);
  }
  return { sql: translateSql(sql.join("")), params };
}

function buildCount(ctx: BizContext, tenantId: string, columnTypeOf: Map<string, string>, filters: Data, keyword: string | null, keywordColumn: string | null): SqlAndParams {
  const sql: string[] = ["SELECT COUNT(1) FROM " + ctx.tableName + " WHERE tenant_id = ?"];
  const params: unknown[] = [tenantId];
  appendFilters(sql, params, ctx.columnKeys, columnTypeOf, null, filters);
  appendKeyword(sql, params, ctx.columnKeys, null, keyword, keywordColumn);
  return { sql: translateSql(sql.join("")), params };
}

function filterData(allowed: string[], data: Data): Data {
  const safe: Data = {};
  for (const [key, v] of Object.entries(data ?? {})) {
    if (key === "id" || key === "tenant_id" || key === "version") continue;
    if (!allowed.includes(key)) continue;
    safe[key] = v;
  }
  return safe;
}

function buildInsert(ctx: BizContext, allowed: string[], data: Data, tenantId: string): { sp: SqlAndParams; id: string } {
  const safe = filterData(allowed, data);
  const rowId = uuid32();
  const cols = ["id", "tenant_id", "version", ...Object.keys(safe)];
  const params: unknown[] = [rowId, tenantId, 1, ...Object.values(safe)];
  const sp: SqlAndParams = {
    sql: translateSql(
      "INSERT INTO " + ctx.tableName + " (" + cols.map(qc).join(", ") + ") VALUES (" + cols.map(() => "?").join(", ") + ")",
    ),
    params,
  };
  return { sp, id: rowId };
}

function buildUpdate(ctx: BizContext, allowed: string[], data: Data, tenantId: string, id: string, version: number): SqlAndParams {
  const safe = filterData(allowed, data);
  if (Object.keys(safe).length === 0) throw new IllegalArgumentException("更新内容不能为空");
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(safe)) {
    sets.push(qc(k) + " = ?");
    params.push(v);
  }
  sets.push("version = version + 1, updated_at = NOW()");
  params.push(id, tenantId, version);
  return { sql: translateSql("UPDATE " + ctx.tableName + " SET " + sets.join(", ") + " WHERE id = ? AND tenant_id = ? AND version = ?"), params };
}

// ==================== 行映射 ====================

function parseJSONSafe(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v; // 兼容旧逗号串
  }
}

/** 子表行（物理大写列 → 语义 key；含系统列，对齐 Java queryForList 原样返回） */
function subRowJSON(def: SubTableDef, row: Row): Row {
  const out: Row = {
    id: row.ID,
    biz_id: row.BIZ_ID,
    tenant_id: row.TENANT_ID,
    sort_no: row.SORT_NO,
    version: row.VERSION,
    created_by: row.CREATED_BY ?? null,
    created_at: normTs(row.CREATED_AT),
    updated_at: normTs(row.UPDATED_AT),
  };
  for (const c of def.columns) out[c.key] = c.columnType === "JSON" ? parseJSONSafe(row[c.key.toUpperCase()]) : (row[c.key.toUpperCase()] ?? null);
  return out;
}

function readSubRows(def: SubTableDef, bizId: string): Row[] {
  // 动态表不走 queryRows（其 camelCase 映射面向固定镜像表）；保留物理大写键
  return (query("SELECT * FROM " + def.tableName + " WHERE tenant_id = ? AND biz_id = ? ORDER BY sort_no", [tenantOfCurrent(), bizId]) as Row[]).map((r) => subRowJSON(def, r));
}

function toVO(ctx: BizContext, row: Row): Row {
  const data: Data = {};
  for (const c of ctx.columns) {
    if (subtableField(c)) continue;
    const v = row[c.key.toUpperCase()];
    if (v != null) data[c.key] = c.columnType === "JSON" ? parseJSONSafe(v) : v;
  }
  for (const [field, def] of ctx.subTables) {
    if (def.subMode === "embedded") data[field] = readSubRows(def, String(row.ID));
  }
  return {
    id: String(row.ID),
    data,
    version: row.VERSION == null ? null : Number(row.VERSION),
    createdAt: normTs(row.CREATED_AT),
    updatedAt: normTs(row.UPDATED_AT),
  };
}

// ==================== filter/params 解析 ====================

function parseFilter(filterJson: string | null): Data {
  if (!filterJson || filterJson.trim() === "") return {};
  try {
    const map = JSON.parse(filterJson);
    return map && typeof map === "object" && !Array.isArray(map) ? (map as Data) : {};
  } catch (e) {
    throw new BusinessException("筛选参数 filter 格式非法，应为 JSON 对象: " + (e instanceof Error ? e.message : String(e)), 400);
  }
}

function parseRuntimeParams(paramsJson: string | null): Data {
  if (!paramsJson || paramsJson.trim() === "") return {};
  try {
    const map = JSON.parse(paramsJson);
    return map && typeof map === "object" && !Array.isArray(map) ? (map as Data) : {};
  } catch (e) {
    throw new BusinessException("运行时参数 params 格式非法，应为 JSON 对象: " + (e instanceof Error ? e.message : String(e)), 400);
  }
}

export interface BizQueryRequest {
  filter: string | null;
  keyword: string | null;
  keywordColumn: string | null;
  sort: string | null;
  order: string | null;
  params: string | null;
  page: number;
  size: number;
}

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

function execPage(page: number, size: number, count: SqlAndParams, select: SqlAndParams, rowMapper: (r: Row) => Row): Row {
  const totalRow = queryOne<{ c: number }>(count.sql, count.params);
  const rows = query(select.sql, select.params) as Row[];
  return { records: rows.map(rowMapper), total: totalRow?.c ?? 0, page, size };
}

// ==================== 单表 CRUD（BizDataSupport 通用委托） ====================

function findByIdVO(ctx: BizContext, id: string): Row {
  const rows = query("SELECT * FROM " + ctx.tableName + " WHERE id = ? AND tenant_id = ?", [id, tenantOfCurrent()]) as Row[];
  if (!rows.length) throw new BusinessException("业务数据不存在: " + id, 404);
  return toVO(ctx, rows[0]);
}

function validateRequired(columns: ColumnConfig[], data: Data): void {
  for (const c of columns) {
    if (c.required) {
      const v = (data ?? {})[c.key];
      if (v == null || (typeof v === "string" && v.trim() === "")) {
        throw new BusinessException("必填字段不能为空: " + (c.label ?? c.key), 400);
      }
    }
  }
}

function isDataPickerColumn(ctx: BizContext, col: ColumnConfig): boolean {
  if (!col.pickerConfig || col.pickerConfig.trim() === "") return false;
  let picker: Data | null = null;
  try {
    picker = JSON.parse(col.pickerConfig);
  } catch {
    return false;
  }
  const pickerType = picker?.pickerType == null ? null : String(picker.pickerType);
  if (pickerType === "lookupPicker") return false;
  if (pickerType === "dataPicker") return true;
  return ctx.columns.some((c) => c.key === col.key + "_text");
}

function resolveDisplayTextsInternal(sourceFormKey: string, ids: string[], displayField: string): Map<string, string> {
  const table = tableNameOf(sourceFormKey);
  const placeholders = ids.map(() => "?").join(",");
  const rows = query(
    "SELECT id, " + qc(displayField) + " AS DISP FROM " + table + " WHERE tenant_id = ? AND id IN (" + placeholders + ")",
    [tenantOfCurrent(), ...ids],
  ) as Row[];
  const result = new Map<string, string>();
  for (const row of rows) {
    const v = row.DISP;
    result.set(String(row.id), v == null ? "" : String(v));
  }
  return result;
}

function resolvePickerText(ctx: BizContext, col: ColumnConfig, raw: unknown): string {
  let picker: Data;
  try {
    picker = JSON.parse(col.pickerConfig!);
  } catch {
    throw new BusinessException("data-picker 配置或引用值非法: " + col.key, 400);
  }
  const sourceFormKey = picker.sourceFormKey == null ? null : String(picker.sourceFormKey);
  const displayField = picker.displayField == null ? null : String(picker.displayField);
  const maxCountObj = picker.maxCount;
  if (raw == null || String(raw).trim() === "") return "";
  let ids: string[];
  try {
    const arr = JSON.parse(String(raw));
    if (!Array.isArray(arr)) throw new Error("not array");
    ids = arr.map((x) => String(x)).filter((x) => x.trim() !== "");
  } catch {
    throw new BusinessException("data-picker 引用值格式非法（需 JSON 数组）: " + col.key, 400);
  }
  if (ids.length === 0) return "";
  if (maxCountObj != null) {
    const maxCount = Number(maxCountObj);
    if (Number.isNaN(maxCount)) throw new BusinessException("data-picker maxCount 配置非法: " + col.key, 400);
    if (maxCount > 0 && ids.length > maxCount) {
      throw new BusinessException("data-picker 引用数量超出限制（最多 " + maxCount + "）: " + col.key, 400);
    }
  }
  const texts = resolveDisplayTextsInternal(sourceFormKey!, ids, displayField!);
  const ordered: string[] = [];
  for (const id of ids) {
    const t = texts.get(id);
    if (t === undefined) throw new BusinessException("引用的数据不存在: " + col.key + "=" + id, 400);
    ordered.push(t);
  }
  return JSON.stringify(ordered);
}

function resolvePickerValues(ctx: BizContext, data: Data): Data {
  const extra: Data = {};
  for (const col of ctx.columns) {
    if (!isDataPickerColumn(ctx, col)) continue;
    extra[col.key + "_text"] = resolvePickerText(ctx, col, data[col.key]);
  }
  return extra;
}

function serializeJsonColumns(data: Data): Data {
  const out: Data = { ...data };
  for (const [k, v] of Object.entries(data ?? {})) {
    if (v == null || typeof v === "string") continue;
    try {
      out[k] = JSON.stringify(v);
    } catch {
      throw new BusinessException("字段 " + k + " 无法序列化为 JSON", 400);
    }
  }
  return out;
}

function createGeneric(formKey: string, data: Data): Row {
  const tenantId = tenantOfCurrent();
  const ctx = loadContext(formKey);
  validateRequired(ctx.columns, data ?? {});
  const merged = serializeJsonColumns(data ?? {});
  Object.assign(merged, resolvePickerValues(ctx, merged));
  const insert = buildInsert(ctx, ctx.columnKeys, merged, tenantId);
  exec(insert.sp.sql, insert.sp.params);
  // 子表行写入（随主表创建批量插入）
  for (const [field, def] of ctx.subTables) {
    const raw = (data ?? {})[field];
    if (Array.isArray(raw)) writeSubRows(def, insert.id, raw);
  }
  return findByIdVO(ctx, insert.id);
}

function writeSubRows(def: SubTableDef, bizId: string, rows: unknown[]): void {
  if (rows.length > MAX_SUB_ROWS) throw new BusinessException("子表行数超限（最多 " + MAX_SUB_ROWS + " 行）: " + def.tableName, 400);
  let sortNo = 0;
  for (const row of rows) insertOneSubRow(def, bizId, toRowMap(row, def.tableName), sortNo++);
}

function toRowMap(row: unknown, tableName: string): Data {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new BusinessException("子表行数据格式非法（需对象）: " + tableName, 400);
  }
  return { ...(row as Data) };
}

function insertOneSubRow(def: SubTableDef, bizId: string, m: Data, sortNo: number): Row {
  const rowId = uuid32();
  const cols = ["id", "biz_id", "tenant_id", "sort_no", "version", ...def.subKeys];
  const params: unknown[] = [rowId, bizId, tenantOfCurrent(), sortNo, 1, ...def.subKeys.map((k) => m[k] ?? null)];
  exec(
    translateSql("INSERT INTO " + def.tableName + " (" + cols.map(qc).join(", ") + ") VALUES (" + cols.map(() => "?").join(", ") + ")"),
    params,
  );
  return { ...m, id: rowId, sort_no: sortNo };
}

function updateGeneric(formKey: string, id: string, data: Data, version: number | null): Row {
  const tenantId = tenantOfCurrent();
  const ctx = loadContext(formKey);
  validateRequired(ctx.columns, data ?? {});
  const merged = serializeJsonColumns(data ?? {});
  Object.assign(merged, resolvePickerValues(ctx, merged));
  const update = buildUpdate(ctx, ctx.columnKeys, merged, tenantId, id, version ?? 1);
  const affected = exec(update.sql, update.params).changes;
  if (affected === 0) {
    const exists = queryOne("SELECT ID FROM " + ctx.tableName + " WHERE id = ? AND tenant_id = ?", [id, tenantId]);
    if (!exists) throw new BusinessException("业务数据不存在: " + id, 404);
    throw new BusinessException("数据已被他人修改，请刷新后重试", 409);
  }
  for (const [field, def] of ctx.subTables) {
    const raw = (data ?? {})[field];
    if (Array.isArray(raw)) diffSubRows(def, id, raw);
  }
  return findByIdVO(ctx, id);
}

function diffSubRows(def: SubTableDef, bizId: string, rows: unknown[]): void {
  if (rows.length > MAX_SUB_ROWS) throw new BusinessException("子表行数超限（最多 " + MAX_SUB_ROWS + " 行）: " + def.tableName, 400);
  const existing = readSubRows(def, bizId);
  const existingById = new Map(existing.map((r) => [String(r.id), r]));
  const keepIds = new Set<string>();
  let sortNo = 0;
  for (const row of rows) {
    const m = toRowMap(row, def.tableName);
    const rowId = m.id == null ? null : String(m.id);
    const cur = rowId != null ? existingById.get(rowId) : undefined;
    if (rowId && cur) {
      let changed = def.subKeys.some((k) => JSON.stringify(cur[k] ?? null) !== JSON.stringify((m[k] ?? null)));
      if (!changed && Number(cur.sort_no) !== sortNo) changed = true;
      if (changed) {
        const sets = def.subKeys.map((k) => qc(k) + " = ?");
        const params: unknown[] = def.subKeys.map((k) => m[k] ?? null);
        sets.push(qc("sort_no") + " = ?");
        params.push(sortNo, tenantOfCurrent(), bizId, rowId);
        exec("UPDATE " + def.tableName + " SET " + sets.join(", ") + " WHERE tenant_id = ? AND biz_id = ? AND id = ?", params);
      }
      keepIds.add(rowId);
    } else {
      const newRow = { ...m };
      delete newRow.id;
      insertOneSubRow(def, bizId, newRow, sortNo);
    }
    sortNo++;
  }
  if (existingById.size > keepIds.size) {
    const removeIds = [...existingById.keys()].filter((x) => !keepIds.has(x));
    const placeholders = removeIds.map(() => "?").join(",");
    exec("DELETE FROM " + def.tableName + " WHERE tenant_id = ? AND biz_id = ? AND id IN (" + placeholders + ")", [tenantOfCurrent(), bizId, ...removeIds]);
  }
}

function deleteGeneric(formKey: string, id: string): void {
  const tenantId = tenantOfCurrent();
  const ctx = loadContext(formKey);
  for (const def of ctx.subTables.values()) {
    exec("DELETE FROM " + def.tableName + " WHERE tenant_id = ? AND biz_id = ?", [tenantId, id]);
  }
  const affected = exec("DELETE FROM " + ctx.tableName + " WHERE id = ? AND tenant_id = ?", [id, tenantId]).changes;
  if (affected === 0) throw new BusinessException("业务数据不存在: " + id, 404);
}

// ==================== 三种查询模式 ====================

function queryGeneric(formKey: string, req: BizQueryRequest): Row {
  const tenantId = tenantOfCurrent();
  const ctx = loadContext(formKey);
  const filters = parseFilter(req.filter);
  const columnTypeOf = new Map(ctx.columns.map((c) => [c.key, (c.columnType ?? "").toUpperCase()]));
  const page = Math.max(req.page, 1);
  const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100);
  try {
    const count = buildCount(ctx, tenantId, columnTypeOf, filters, req.keyword, req.keywordColumn);
    const select = buildSelect(ctx, tenantId, columnTypeOf, filters, req.keyword, req.keywordColumn, req.sort, req.order, page - 1, size);
    return execPage(page, size, count, select, (r) => toVO(ctx, r));
  } catch (e) {
    if (e instanceof IllegalArgumentException) throw new BusinessException(e.message, 400);
    throw e;
  }
}

/** 解析 FORM 数据源 params 中的 queryMode 配置段 */
export interface FormQueryConfig {
  queryMode: string | null;
  joins: JoinConfig[];
  query: string | null;
  columns: ColumnConfig[];
  declaredParams: string[];
}

export interface JoinConfig {
  alias: string;
  targetFormKey: string;
  localField: string;
  foreignField: string;
  joinField: string;
  virtualKey: string;
  label: string | null;
  sortable: boolean;
  filterable: boolean;
}

export function parseFormQueryConfig(paramsJson: string | null | undefined): FormQueryConfig {
  if (!paramsJson || paramsJson.trim() === "") return { queryMode: null, joins: [], query: null, columns: [], declaredParams: [] };
  let root: Data;
  try {
    root = JSON.parse(paramsJson);
  } catch (e) {
    throw new BusinessException("数据源 params 不是合法 JSON: " + (e instanceof Error ? e.message : String(e)), 400);
  }
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    throw new BusinessException("数据源 params 必须是 JSON 对象", 400);
  }
  const mode = root.queryMode == null ? null : String(root.queryMode);
  const parseCols = (node: unknown): ColumnConfig[] => (Array.isArray(node) ? (node as ColumnConfig[]) : []);
  if (mode === "config") {
    const joins = Array.isArray(root.joins)
      ? (root.joins as Data[]).map((j) => ({
          alias: String(j.alias ?? ""),
          targetFormKey: String(j.targetFormKey ?? ""),
          localField: String(j.localField ?? ""),
          foreignField: String(j.foreignField ?? ""),
          joinField: String(j.joinField ?? ""),
          virtualKey: String(j.virtualKey ?? ""),
          label: j.label == null ? null : String(j.label),
          sortable: j.sortable === true,
          filterable: j.filterable === true,
        }))
      : [];
    return { queryMode: mode, joins, query: null, columns: [], declaredParams: [] };
  }
  if (mode === "sql" || mode === "visual") {
    return {
      queryMode: mode,
      joins: [],
      query: root.query == null ? null : String(root.query),
      columns: parseCols(root.columns),
      declaredParams: Array.isArray(root.params) ? (root.params as unknown[]).map((p) => String(p)) : [],
    };
  }
  return { queryMode: mode, joins: [], query: null, columns: [], declaredParams: [] };
}

function buildJoinColumns(ctx: BizContext, joins: JoinConfig[]): QueryColumns[] {
  const typeOf = new Map(ctx.columns.map((c) => [c.key, (c.columnType ?? "").toUpperCase()]));
  const cols: QueryColumns[] = ctx.columnKeys.map((key) => ({ key, ref: "m." + key, columnType: typeOf.get(key) ?? "", sortable: true, filterable: true }));
  for (const j of joins) {
    cols.push({ key: j.virtualKey, ref: j.alias + "." + j.joinField, columnType: resolveJoinColumnType(j), sortable: j.sortable, filterable: j.filterable });
  }
  return cols;
}

function resolveJoinColumnType(j: JoinConfig): string {
  try {
    const targetCols = getBusinessColumnsByKey(tenantOfCurrent(), j.targetFormKey);
    for (const c of targetCols) if (j.joinField === c.key) return (c.columnType ?? "VARCHAR").toUpperCase();
  } catch {
    // 目标表单不可解析时 fallback
  }
  return "VARCHAR";
}

/** config 模式：主表 m.* + LEFT JOIN 虚拟列（H2 方言 JSON_UNQUOTE(JSON_EXTRACT) → translateSql） */
function joinLocalRef(j: JoinConfig, cols: QueryColumns[]): string {
  const localType = cols.find((c) => c.key === j.localField)?.columnType ?? "";
  if (localType.toUpperCase() === "JSON") {
    return "JSON_UNQUOTE(JSON_EXTRACT(m." + j.localField + ",'$[0]'))";
  }
  return "m." + j.localField;
}

function joinSql(ctx: BizContext, joins: JoinConfig[], cols: QueryColumns[], tenantId: string, filters: Data, keyword: string | null, keywordColumn: string | null, sort: string | null, order: string | null, page: number, size: number, isCount: boolean): SqlAndParams {
  const sql: string[] = [
    isCount
      ? "SELECT COUNT(1) FROM " + ctx.tableName + " m"
      : "SELECT m.*" + joins.map((j) => ", " + j.alias + "." + j.joinField + " AS " + j.virtualKey).join("") + " FROM " + ctx.tableName + " m",
  ];
  for (const j of joins) {
    sql.push(" LEFT JOIN wf_biz_" + j.targetFormKey + " " + j.alias + " ON " + j.alias + "." + j.foreignField + " = " + joinLocalRef(j, cols));
  }
  sql.push(" WHERE m.tenant_id = ?");
  const params: unknown[] = [tenantId];
  appendFilters(sql, params, null, null, cols, filters);
  appendKeyword(sql, params, null, cols, keyword, keywordColumn);
  if (!isCount) {
    const sortColumn = !sort || sort.trim() === "" ? "created_at" : sort;
    const sortRef = resolveRef(sortColumn, cols, true, "排序字段");
    const orderDir = !order || order.trim() === "" ? "desc" : order.toLowerCase();
    if (!ALLOWED_ORDER.has(orderDir)) throw new IllegalArgumentException("非法排序方向: " + order);
    sql.push(" ORDER BY " + sortRef + " " + orderDir.toUpperCase());
    if (size > 0) {
      sql.push(" LIMIT ? OFFSET ?");
      params.push(size, page * size);
    }
  }
  return { sql: translateSql(sql.join("")), params };
}

function toJoinVO(ctx: BizContext, joins: JoinConfig[], row: Row): Row {
  const vo = toVO(ctx, row);
  const data = vo.data as Data;
  for (const j of joins) {
    const v = row[j.virtualKey.toUpperCase()];
    if (v != null) data[j.virtualKey] = v;
  }
  return vo;
}

function queryJoinConfig(formKey: string, req: BizQueryRequest, joins: JoinConfig[]): Row {
  const tenantId = tenantOfCurrent();
  const ctx = loadContext(formKey);
  const cols = buildJoinColumns(ctx, joins);
  const filters = parseFilter(req.filter);
  const page = Math.max(req.page, 1);
  const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100);
  try {
    const count = joinSql(ctx, joins, cols, tenantId, filters, req.keyword, req.keywordColumn, null, null, 0, 0, true);
    const select = joinSql(ctx, joins, cols, tenantId, filters, req.keyword, req.keywordColumn, req.sort, req.order, page - 1, size, false);
    return execPage(page, size, count, select, (r) => toJoinVO(ctx, joins, r));
  } catch (e) {
    if (e instanceof IllegalArgumentException) throw new BusinessException(e.message, 400);
    throw e;
  }
}

// ==================== sql 模式（SqlTemplateEngine） ====================

const PLACEHOLDER_RE = /:[A-Za-z_][A-Za-z0-9_]*/g;

function extractSelectOutputs(sql: string): Set<string> {
  const out = new Set<string>();
  const lower = sql.toLowerCase();
  const sel = indexOfKeyword(lower, "select", 0);
  const from = indexOfKeyword(lower, "from", sel + 6);
  if (sel < 0 || from < 0) return out;
  for (const part of sql.slice(sel + 6, from).split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    if (trimmed === "*" || trimmed.endsWith(".*")) {
      out.add("*");
      continue;
    }
    let name: string;
    const asIdx = indexOfKeyword(trimmed.toLowerCase(), "as", 0);
    if (asIdx >= 0) {
      name = trimmed.slice(asIdx + 2).trim().split(/[\s,]+/)[0];
    } else {
      const dot = trimmed.lastIndexOf(".");
      name = (dot >= 0 ? trimmed.slice(dot + 1) : trimmed).trim();
    }
    name = name.replace(/`/g, "").replace(/"/g, "");
    if (name) out.add(name);
  }
  return out;
}

function indexOfKeyword(lower: string, kw: string, from: number): number {
  let i = lower.indexOf(kw, from);
  while (i >= 0) {
    const beforeOk = i === 0 || !/[a-z0-9_]/.test(lower[i - 1]);
    const end = i + kw.length;
    const afterOk = end >= lower.length || !/[a-z0-9_]/.test(lower[end]);
    if (beforeOk && afterOk) return i;
    i = lower.indexOf(kw, i + 1);
  }
  return -1;
}

export function validateSqlTemplate(query: string | null, columns: QueryColumns[], declaredParams: string[]): void {
  if (!query || query.trim() === "") throw new IllegalArgumentException("SQL 模板不能为空");
  const trimmed = query.trim();
  if (trimmed.slice(0, 6).toUpperCase() !== "SELECT") throw new IllegalArgumentException("仅允许 SELECT 查询");
  if (!columns.length) throw new IllegalArgumentException("columns 不能为空");
  const outputs = extractSelectOutputs(trimmed);
  if (!outputs.has("*")) {
    for (const c of columns) {
      if (!outputs.has(c.key)) throw new IllegalArgumentException("声明列不在查询结果中: " + c.key);
    }
  }
  for (const p of declaredParams) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(p)) throw new IllegalArgumentException("参数名非法: " + p);
  }
  for (const ph of trimmed.match(PLACEHOLDER_RE) ?? []) {
    if (ph === ":tenantId") continue;
    if (!declaredParams.includes(ph.slice(1))) throw new IllegalArgumentException("SQL 模板包含未声明参数: " + ph);
  }
}

function bindPlaceholders(query: string, tenantId: string, declaredParams: string[], runtimeParams: Data, params: unknown[]): string {
  return query.replace(PLACEHOLDER_RE, (ph) => {
    if (ph === ":tenantId") {
      params.push(tenantId);
      return "?";
    }
    const name = ph.slice(1);
    if (!declaredParams.includes(name)) throw new IllegalArgumentException("SQL 模板包含未声明参数: " + ph);
    if (runtimeParams == null || !Object.prototype.hasOwnProperty.call(runtimeParams, name)) {
      throw new IllegalArgumentException("缺少运行时参数值: " + ph);
    }
    params.push(runtimeParams[name]);
    return "?";
  });
}

function toSqlColumns(declared: ColumnConfig[]): QueryColumns[] {
  return declared.map((c) => ({
    key: c.key,
    ref: c.key,
    columnType: (c.columnType ?? "").toUpperCase(),
    sortable: c.sortable === true,
    filterable: c.filterable === true,
  }));
}

function toSqlVO(declared: ColumnConfig[], row: Row): Row {
  const normalizer = new Map<string, string>();
  for (const c of declared) {
    if (c.key && !normalizer.has(c.key.toLowerCase())) normalizer.set(c.key.toLowerCase(), c.key);
  }
  const data: Data = {};
  for (const [k, v] of Object.entries(row)) {
    const lower = k.toLowerCase();
    data[normalizer.get(lower) ?? lower] = v;
  }
  delete data.version;
  delete data.created_at;
  delete data.updated_at;
  delete data.tenant_id;
  return {
    id: String(row.id ?? ""),
    data,
    version: row.version == null ? null : Number(row.version),
    createdAt: normTs(row.created_at),
    updatedAt: normTs(row.updated_at),
  };
}

function querySqlTemplate(formKey: string | null, req: BizQueryRequest, cfg: FormQueryConfig): Row {
  if (formKey != null && !FORM_KEY_PATTERN.test(formKey)) throw new BusinessException("非法表单 key: " + formKey, 400);
  const tenantId = tenantOfCurrent();
  const cols = toSqlColumns(cfg.columns);
  const filters = parseFilter(req.filter);
  const runtimeParams = parseRuntimeParams(req.params);
  const page = Math.max(req.page, 1);
  const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100);
  try {
    validateSqlTemplate(cfg.query, cols, cfg.declaredParams);
    const innerParams: unknown[] = [];
    const innerSql = bindPlaceholders(cfg.query!, tenantId, cfg.declaredParams, runtimeParams, innerParams);
    const filterSql: string[] = [];
    const filterParams: unknown[] = [];
    appendFilters(filterSql, filterParams, null, null, cols, filters);
    appendKeyword(filterSql, filterParams, null, cols, req.keyword, req.keywordColumn);
    let filterBody = filterSql.join("");
    if (filterBody.startsWith(" AND ")) filterBody = filterBody.slice(5);
    const filterFragment = filterBody === "" ? "" : " WHERE " + filterBody;
    const sortColumn = !req.sort || req.sort.trim() === "" ? (cols.find((c) => c.sortable)?.key ?? null) : req.sort;
    let orderByFragment = "";
    if (sortColumn != null) {
      const hit = cols.find((c) => c.key === sortColumn);
      if (!hit || !hit.sortable) throw new IllegalArgumentException("该列不可排序: " + sortColumn);
      const orderDir = !req.order || req.order.trim() === "" ? "desc" : req.order.toLowerCase();
      if (!ALLOWED_ORDER.has(orderDir)) throw new IllegalArgumentException("非法排序方向: " + req.order);
      orderByFragment = " ORDER BY " + qc(sortColumn) + " " + orderDir.toUpperCase();
    }
    // wrapSubquery：内层参数 → 筛选参数 → 分页参数（仅 select）
    const baseParams = [...innerParams, ...filterParams];
    let rowSql = "SELECT * FROM (" + innerSql + ") _qs" + filterFragment + orderByFragment;
    let rowParams = [...baseParams];
    if (size > 0) {
      rowSql += " LIMIT ? OFFSET ?";
      rowParams.push(size, (Math.max(page, 1) - 1) * size);
    }
    const countSql = "SELECT COUNT(*) FROM (" + innerSql + ") _qs" + filterFragment;
    return execPage(page, size, { sql: translateSql(countSql), params: baseParams }, { sql: translateSql(rowSql), params: rowParams }, (r) => toSqlVO(cfg.columns, r));
  } catch (e) {
    if (e instanceof IllegalArgumentException) throw new BusinessException(e.message, 400);
    throw e;
  }
}

// ==================== 引用解析 / 引用统计 ====================

export function resolveByFormKey(tenantId: string, formKey: string, ids: string[], displayField: string | null): Record<string, string> {
  return withTenant(tenantId, () => {
    const ctx = loadContext(formKey);
    let field = displayField;
    if (!field || field.trim() === "") {
      field = ctx.columns.find((c) => !c.hidden && !c.pickerConfig)?.key ?? null;
      if (!field) throw new BusinessException("目标表单无可解析的显示字段", 400);
    }
    return resolveDisplayTexts(tenantId, formKey, ids, field);
  });
}

export function resolveDisplayTexts(tenantId: string, sourceFormKey: string, ids: string[], displayField: string): Record<string, string> {
  return withTenant(tenantId, () => {
    if (!sourceFormKey || !FORM_KEY_PATTERN.test(sourceFormKey)) throw new BusinessException("非法目标表单 key: " + sourceFormKey, 400);
    if (!ids || ids.length === 0) return {};
    if (!displayField || !FORM_KEY_PATTERN.test(displayField)) throw new BusinessException("非法显示字段: " + displayField, 400);
    const out: Record<string, string> = {};
    for (const [id, text] of resolveDisplayTextsInternal(sourceFormKey, ids, displayField)) out[id] = text;
    return out;
  });
}

/** 统计各业务表单被 dataPicker 引用的情况（引用感知） */
export function countReferencedBy(tenantId: string): Record<string, { count: number; referencedBy: string[] }> {
  return withTenant(tenantId, () => {
    const result: Record<string, { count: number; referencedBy: string[] }> = {};
    const defs = queryRows(
      "WF_FORM_DEF",
      "SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND TYPE = ? AND COLUMN_CONFIG IS NOT NULL",
      [tenantId, "BUSINESS"],
    );
    for (const def of defs) {
      const cols = parseColumnConfig(def.columnConfig as string);
      for (const col of cols) {
        if (!col.pickerConfig || col.pickerConfig.trim() === "") continue;
        let picker: Data | null = null;
        try {
          picker = JSON.parse(col.pickerConfig);
        } catch {
          continue;
        }
        const target = picker?.sourceFormKey;
        if (target == null || String(target).trim() === "") continue;
        const targetKey = String(target);
        if (!result[targetKey]) result[targetKey] = { count: 0, referencedBy: [] };
        result[targetKey].count += 1;
        result[targetKey].referencedBy.push(String(def.key));
      }
    }
    return result;
  });
}

// ==================== BizDataHandler（example 模块两个实现内联移植） ====================

interface HandlerHooks {
  beforeCreate?: (data: Data) => void;
  afterCreate?: (created: Row) => void;
  beforeUpdate?: (formKey: string, id: string) => void;
  beforeDelete?: (existing: Row) => void;
  overridesQuery?: boolean;
  query?: (req: BizQueryRequest) => Row;
}

function handlersOf(tenantId: string, formKey: string): HandlerHooks[] {
  return withTenant(tenantId, () => {
    const handlers: HandlerHooks[] = [];
    if (formKey === "leave_bill") {
      handlers.push({
        beforeCreate: (data) => {
          const days = Number(data.days ?? 0);
          if (days > 5 && (!data.reason || String(data.reason).trim() === "")) {
            throw new BusinessException("请假超过 5 天必须填写理由", 400);
          }
        },
        afterCreate: (created) => {
          updateGeneric("leave_bill", String(created.id), { status: "草稿" }, Number(created.version));
        },
      });
    }
    if (formKey === "emp_profile") {
      handlers.push({
        overridesQuery: true,
        query: (req) => {
          const page = queryGeneric("emp_profile", req);
          const lu = CURRENT_LOGIN_USER;
          const orgId = lu?.orgId ?? null;
          const records = (page.records as Row[]).filter((vo) => {
            if (orgId == null) return true;
            const dept = (vo.data as Data)?.dept;
            return dept != null && String(orgId) === String(dept);
          });
          for (const vo of records) {
            const data = vo.data as Data;
            if (data.hire_date != null) {
              const d = new Date(String(data.hire_date));
              if (!Number.isNaN(d.getTime())) {
                data.workingDays = Math.floor((Date.now() - d.getTime()) / 86400000);
              }
            }
          }
          return { records, total: records.length, page: page.page, size: page.size };
        },
        beforeCreate: (data) => {
          if (!/^1\d{10}$/.test(String(data.phone ?? ""))) {
            throw new BusinessException("手机号格式非法: " + data.phone, 400);
          }
        },
        beforeDelete: (existing) => {
          const status = (existing?.data as Data)?.status;
          if (String(status ?? "") !== "离职") throw new BusinessException("在职员工不可删除", 409);
        },
      });
    }
    return handlers;
  });
}

let CURRENT_LOGIN_USER: { orgId: number | null } | null = null;
function withLoginUser<T>(lu: { orgId: number | null } | null, fn: () => T): T {
  const prev = CURRENT_LOGIN_USER;
  CURRENT_LOGIN_USER = lu;
  try {
    return fn();
  } finally {
    CURRENT_LOGIN_USER = prev;
  }
}

// ==================== 门面（覆盖短路 → 守卫 → 钩子 → 通用委托） ====================

export function bizCreate(tenantId: string, loginUser: { orgId: number | null } | null, formKey: string, data: Data): Row {
  return withTenant(tenantId, () =>
    tx(() =>
      withLoginUser(loginUser, () => {
        const handlers = handlersOf(tenantId, formKey);
        for (const hd of handlers) hd.beforeCreate?.(data);
        const created = createGeneric(formKey, data);
        for (const hd of handlers) hd.afterCreate?.(created);
        // afterCreate 钩子可能已回写默认值并自增 version → 重新查询返回最新状态
        const ctx = loadContext(formKey);
        return findByIdVO(ctx, String(created.id));
      }),
    ),
  );
}

export function bizQuery(tenantId: string, loginUser: { orgId: number | null } | null, formKey: string, req: BizQueryRequest): Row {
  return withTenant(tenantId, () =>
    withLoginUser(loginUser, () => {
      for (const hd of handlersOf(tenantId, formKey)) {
        if (hd.overridesQuery) return hd.query!(req);
      }
      return queryGeneric(formKey, req);
    }),
  );
}

export function bizQueryJoin(tenantId: string, formKey: string, req: BizQueryRequest, joins: JoinConfig[]): Row {
  return withTenant(tenantId, () => queryJoinConfig(formKey, req, joins));
}

export function bizQuerySql(tenantId: string, formKey: string, req: BizQueryRequest, cfg: FormQueryConfig): Row {
  return withTenant(tenantId, () => querySqlTemplate(formKey, req, cfg));
}

/** SQL 数据源专用：绕过绑定表单的 covering handler */
export function bizQuerySqlRaw(tenantId: string, formKey: string, req: BizQueryRequest, cfg: FormQueryConfig): Row {
  return withTenant(tenantId, () => querySqlTemplate(formKey, req, cfg));
}

export function bizGetById(tenantId: string, formKey: string, id: string): Row {
  return withTenant(tenantId, () => {
    const ctx = loadContext(formKey);
    return findByIdVO(ctx, id);
  });
}

export function bizUpdate(tenantId: string, loginUser: { orgId: number | null } | null, formKey: string, id: string, data: Data, version: number | null): Row {
  return withTenant(tenantId, () =>
    tx(() =>
      withLoginUser(loginUser, () => {
        const handlers = handlersOf(tenantId, formKey);
        const existing = bizGetById(tenantId, formKey, id);
        for (const hd of handlers) hd.beforeUpdate?.(formKey, id);
        const updated = updateGeneric(formKey, id, data, version);
        void existing;
        return updated;
      }),
    ),
  );
}

export function bizDelete(tenantId: string, loginUser: { orgId: number | null } | null, formKey: string, id: string): void {
  withTenant(tenantId, () =>
    tx(() =>
      withLoginUser(loginUser, () => {
        const handlers = handlersOf(tenantId, formKey);
        const ctx = loadContext(formKey);
        const existing = findByIdVO(ctx, id);
        for (const hd of handlers) hd.beforeDelete?.(existing);
        deleteGeneric(formKey, id);
      }),
    ),
  );
}

// ==================== 子表行端点 ====================

function requireSubTable(ctx: BizContext, field: string): SubTableDef {
  const def = ctx.subTables.get(field);
  if (!def) throw new BusinessException("子表字段不存在: " + field, 404);
  return def;
}

function listSubRows(tenantId: string, formKey: string, id: string, field: string): Row[] {
  return withTenant(tenantId, () => {
    const ctx = loadContext(formKey);
    const def = requireSubTable(ctx, field);
    findByIdVO(ctx, id); // 主行 404 校验
    return readSubRows(def, id);
  });
}

function addSubRow(tenantId: string, formKey: string, id: string, field: string, data: Data): Row {
  return withTenant(tenantId, () => {
    const ctx = loadContext(formKey);
    const def = requireSubTable(ctx, field);
    findByIdVO(ctx, id);
    const rows = readSubRows(def, id);
    if (rows.length >= MAX_SUB_ROWS) throw new BusinessException("子表行数超限（最多 " + MAX_SUB_ROWS + " 行）: " + def.tableName, 400);
    const inserted = insertOneSubRow(def, id, toRowMap(data, def.tableName), rows.length);
    return readSubRows(def, id).find((r) => String(r.id) === String(inserted.id)) ?? inserted;
  });
}

function updateSubRow(tenantId: string, formKey: string, id: string, field: string, rowId: string, data: Data, version: number | null): Row {
  return withTenant(tenantId, () => {
    const ctx = loadContext(formKey);
    const def = requireSubTable(ctx, field);
    findByIdVO(ctx, id);
    const safe: Data = {};
    for (const k of def.subKeys) if (k in data) safe[k] = data[k];
    if (Object.keys(safe).length === 0) throw new BusinessException("更新内容不能为空: " + field, 400);
    const sets = Object.keys(safe).map((k) => qc(k) + " = ?");
    const params: unknown[] = Object.values(safe);
    sets.push("version = version + 1, updated_at = NOW()");
    params.push(tenantOfCurrent(), id, rowId, version ?? 1);
    const affected = exec(
      translateSql("UPDATE " + def.tableName + " SET " + sets.join(", ") + " WHERE tenant_id = ? AND biz_id = ? AND id = ? AND version = ?"),
      params,
    ).changes;
    if (affected === 0) throw new BusinessException("子表行已被他人修改或不存在，请刷新后重试", 409);
    const row = readSubRows(def, id).find((r) => String(r.id) === rowId);
    if (!row) throw new BusinessException("子表行不存在: " + rowId, 404);
    return row;
  });
}

function deleteSubRow(tenantId: string, formKey: string, id: string, field: string, rowId: string): void {
  withTenant(tenantId, () => {
    const ctx = loadContext(formKey);
    const def = requireSubTable(ctx, field);
    findByIdVO(ctx, id);
    exec("DELETE FROM " + def.tableName + " WHERE tenant_id = ? AND biz_id = ? AND id = ?", [tenantOfCurrent(), id, rowId]);
  });
}

// ==================== 端点（/referenced-count 与 /resolve 必须先于 /:formKey 注册） ====================

router.get("/referenced-count", (req: Request, res: Response) => {
  ok(res, countReferencedBy(tenantOf(req)));
});

router.post("/:formKey", (req: Request, res: Response) => {
  ok(res, bizCreate(tenantOf(req), loginUserCtx(req), req.params.formKey, (req.body ?? {}) as Data));
});

router.get("/:formKey", (req: Request, res: Response) => {
  ok(res, bizQuery(tenantOf(req), loginUserCtx(req), req.params.formKey, queryRequestOf(req)));
});

router.get("/:formKey/resolve", (req: Request, res: Response) => {
  const ids = (req.query.ids == null ? [] : Array.isArray(req.query.ids) ? req.query.ids : [req.query.ids]).map((x) => String(x));
  const displayField = req.query.displayField == null ? null : String(req.query.displayField);
  ok(res, resolveByFormKey(tenantOf(req), req.params.formKey, ids, displayField));
});

router.get("/:formKey/:id/sub/:field", (req: Request, res: Response) => {
  ok(res, listSubRows(tenantOf(req), req.params.formKey, req.params.id, req.params.field));
});

router.post("/:formKey/:id/sub/:field", (req: Request, res: Response) => {
  ok(res, addSubRow(tenantOf(req), req.params.formKey, req.params.id, req.params.field, (req.body ?? {}) as Data));
});

router.put("/:formKey/:id/sub/:field/:rowId", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Data;
  const version = typeof body.version === "number" ? body.version : null;
  ok(res, updateSubRow(tenantOf(req), req.params.formKey, req.params.id, req.params.field, req.params.rowId, body, version));
});

router.delete("/:formKey/:id/sub/:field/:rowId", (req: Request, res: Response) => {
  deleteSubRow(tenantOf(req), req.params.formKey, req.params.id, req.params.field, req.params.rowId);
  ok(res);
});

router.get("/:formKey/:id", (req: Request, res: Response) => {
  ok(res, bizGetById(tenantOf(req), req.params.formKey, req.params.id));
});

router.put("/:formKey/:id", (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Data;
  const version = typeof body.version === "number" ? body.version : null;
  ok(res, bizUpdate(tenantOf(req), loginUserCtx(req), req.params.formKey, req.params.id, body, version));
});

router.delete("/:formKey/:id", (req: Request, res: Response) => {
  bizDelete(tenantOf(req), loginUserCtx(req), req.params.formKey, req.params.id);
  ok(res);
});

/** 当前登录用户的 orgId（emp_profile covering handler 用） */
function loginUserCtx(req: Request): { orgId: number | null } | null {
  const lu = req.loginUser;
  if (!lu) return null;
  const row = queryOne<{ ORG_ID: number | null }>("SELECT ORG_ID FROM SYS_USER WHERE ID = ?", [Number(lu.userId)]);
  return { orgId: row?.ORG_ID ?? null };
}

export default router;
