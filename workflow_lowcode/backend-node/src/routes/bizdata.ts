/**
 * bizdata.ts — 业务数据模块（对齐 BizDataController 11 端点）
 *             + 通用引擎移植（BizDataSupport / BizDataQueryBuilder / JoinSqlGenerator /
 *               SqlQueryEngine / SqlTemplateEngine —— 供 datasource.ts 复用）
 *
 * 端点（路径为绝对路径，主线程直接 app.use(bizdataRouter) 即可，无需前缀）：
 *  GET    /api/v1/biz-data/referenced-count                referencedCount（dataPicker 引用统计）
 *  POST   /api/v1/biz-data/{formKey}                       create（新增行）
 *  GET    /api/v1/biz-data/{formKey}                       query（分页查询）
 *  GET    /api/v1/biz-data/{formKey}/resolve               resolve（批量解析显示文本；字面量优先于 /{id}）
 *  GET    /api/v1/biz-data/{formKey}/{id}                  getById
 *  PUT    /api/v1/biz-data/{formKey}/{id}                  update（乐观锁，body.version）
 *  DELETE /api/v1/biz-data/{formKey}/{id}                  delete
 *  GET    /api/v1/biz-data/{formKey}/{id}/sub/{field}      listSubRows（sort_no 升序）
 *  POST   /api/v1/biz-data/{formKey}/{id}/sub/{field}      addSubRow
 *  PUT    /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId} updateSubRow（乐观锁）
 *  DELETE /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId} deleteSubRow
 *
 * 对齐要点（8080 金标准 + Java 源码）：
 *  - 表名 = wf_biz_<formKey>，子表 = wf_biz_<formKey>_<field>；loadContext：非法 key → 400 "非法表单 key: x"，
 *    表不存在 → 404 "业务表单数据表不存在: x"
 *  - 所有标识符（表/列/排序/筛选字段）走白名单校验，值全部参数绑定；JSON 列筛选走 JSON_CONTAINS/JSON_OVERLAPS
 *    （H2/MySQL 函数）—— SQLite 端翻译为等价 json_each EXISTS 子查询，参数顺序不变
 *  - 更新乐观锁：version 不匹配 → 409 "数据已被他人修改，请刷新后重试"；行不存在 → 404 "业务数据不存在: x"
 *  - buildInsert 不写 created_at/updated_at（Java 端动态表 DDL 无默认值，同样为 NULL）；NOW() → 运行时文本
 *  - BizDataVO JSON 序（Jackson 3 隐式 creator 参数声明序）：id,data,version,createdAt,updatedAt；
 *    BizDataPageVO：records,total,page,size；id 为 null 时 Java String.valueOf → "null"
 *  - v1 分页 1-based（?page=0 → 输出 page:1）；size<=0 不分页取全部
 */
import { Router } from 'express';
import { getDb, all, one, run, type Row } from '../lib/db';
import { BusinessException, IllegalArgumentError } from '../lib/errors';
import { authGuard, ah, ok, requireBody, ValidationError, type AuthedRequest } from '../lib/http';
import { fmtIso, toIsoText } from '../lib/serialize';

export const bizdataRouter = Router();

// ---------------------------------------------------------------- 公共小件（与 form.ts 同源移植）

export const FORM_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const COLUMN_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const RESERVED_COLUMNS = new Set(['id', 'tenant_id', 'version', 'created_by', 'created_at', 'updated_at']);
const SUB_RESERVED_COLUMNS = new Set(['id', 'biz_id', 'tenant_id', 'sort_no', 'version', 'created_by', 'created_at', 'updated_at']);
const ALLOWED_COLUMN_TYPES = new Set(['VARCHAR', 'TEXT', 'LONGTEXT', 'INT', 'DECIMAL', 'DATE', 'DATETIME', 'TINYINT', 'JSON']);

/** 子表行单次请求上限 */
const MAX_SUB_ROWS = 100;

/** Java String null 插值语义（"null"） */
function jstr(v: unknown): string {
  return v == null ? 'null' : String(v);
}

function nowText(): string {
  return fmtIso(new Date()).replace('T', ' ');
}

function isBlank(v: string | null | undefined): boolean {
  return v == null || v.trim() === '';
}

/** 读取 query 参数首个值（Express query 值可能是数组） */
export function qs(req: AuthedRequest, name: string): string | null {
  const v = req.query[name];
  if (v == null) return null;
  if (Array.isArray(v)) return typeof v[0] === 'string' ? (v[0] as string) : null;
  return typeof v === 'string' ? v : null;
}

/** 租户（TenantProvider.getTenantId 对齐：缺失/空白 → TenantNotSetException） */
export function tenantOf(req: AuthedRequest): string {
  const h = req.headers['x-tenant-id'];
  const v = Array.isArray(h) ? h[0] : h;
  if (v == null || String(v).trim() === '') {
    throw new ValidationError('Tenant ID is not set. Ensure X-Tenant-Id header is provided.');
  }
  return String(v);
}

// ---------------------------------------------------------------- ColumnConfig（富版：含 pickerConfig/subMode/sortable/filterable/matchType）

export interface ColumnConfig {
  key: string | null;
  label: string | null;
  columnType: string | null;
  length: number | null;
  scale: number | null;
  required: boolean;
  unique: boolean;
  indexed: boolean;
  hidden: boolean;
  pickerConfig: string | null;
  storageMode: string;
  componentType: string | null;
  sortable: boolean | null;
  filterable: boolean | null;
  matchType: string | null;
  subColumns: ColumnConfig[] | null;
  subMode: string | null;
}

export function colCfg(v: Record<string, unknown>): ColumnConfig {
  const sub = v['subColumns'];
  return {
    key: v['key'] == null ? null : String(v['key']),
    label: v['label'] == null ? null : String(v['label']),
    columnType: v['columnType'] == null ? null : String(v['columnType']),
    length: v['length'] == null ? null : Number(v['length']),
    scale: v['scale'] == null ? null : Number(v['scale']),
    required: v['required'] === true,
    unique: v['unique'] === true,
    indexed: v['indexed'] === true,
    hidden: v['hidden'] === true,
    pickerConfig: v['pickerConfig'] == null ? null : String(v['pickerConfig']),
    storageMode: v['storageMode'] == null ? 'JSON' : String(v['storageMode']),
    componentType: v['componentType'] == null ? null : String(v['componentType']),
    sortable: v['sortable'] == null ? null : v['sortable'] === true,
    filterable: v['filterable'] == null ? null : v['filterable'] === true,
    matchType: v['matchType'] == null ? null : String(v['matchType']),
    subColumns: Array.isArray(sub) ? sub.map((s) => colCfg(s as Record<string, unknown>)) : null,
    subMode: v['subMode'] == null ? null : String(v['subMode']),
  };
}

/**
 * ColumnConfig → Jackson JSON（默认构造器 bean → 全属性字母序；8080 实测序）。
 */
export function colCfgJson(c: ColumnConfig): Record<string, unknown> {
  return {
    columnType: c.columnType,
    componentType: c.componentType,
    filterable: c.filterable,
    hidden: c.hidden,
    indexed: c.indexed,
    key: c.key,
    label: c.label,
    length: c.length,
    matchType: c.matchType,
    pickerConfig: c.pickerConfig,
    required: c.required,
    scale: c.scale,
    sortable: c.sortable,
    storageMode: c.storageMode,
    subColumns: c.subColumns == null ? null : c.subColumns.map(colCfgJson),
    subMode: c.subMode,
    unique: c.unique,
  };
}

/** FormDefinitionService.parseColumnConfig（错误消息逐字对齐） */
export function parseColumnConfig(columnConfig: string | null): ColumnConfig[] {
  if (isBlank(columnConfig)) {
    throw new BusinessException('业务表单发布前必须配置列映射（column_config）', 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(columnConfig as string);
  } catch {
    throw new BusinessException('业务表单列映射配置非法: Unrecognized token', 400);
  }
  if (!Array.isArray(parsed)) {
    throw new BusinessException('业务表单列映射配置非法: Cannot deserialize value of type `java.util.ArrayList<com.workflow.engine.form.column.ColumnConfig>` from Object value', 400);
  }
  const columns = (parsed as Record<string, unknown>[]).map(colCfg);
  if (columns.length === 0) {
    throw new BusinessException('业务表单列映射不能为空', 400);
  }
  for (const c of columns) {
    validateColumnConfig(c);
  }
  return columns;
}

function validateColumnConfig(c: ColumnConfig): void {
  if (c.key == null || !COLUMN_KEY_RE.test(c.key)) {
    throw new BusinessException(`非法列名: ${jstr(c.key)}`, 400);
  }
  if (c.subColumns != null && c.subColumns.length > 0) {
    for (const sub of c.subColumns) validateColumnConfig(sub);
    return;
  }
  if (RESERVED_COLUMNS.has(c.key)) {
    throw new BusinessException(`列名 ${c.key} 为系统保留列`, 400);
  }
  if (c.columnType == null || !ALLOWED_COLUMN_TYPES.has(c.columnType)) {
    throw new BusinessException(`非法列类型: ${jstr(c.columnType)}`, 400);
  }
  if (c.storageMode === 'SUB_TABLE') {
    throw new BusinessException(`子表存储模式暂未实现: ${c.key}`, 400);
  }
}

// ---------------------------------------------------------------- wf_form_def 行读（bizdata 视角）

const FORM_DEF_COLS = `"id","tenant_id","name","key","type","column_config","schema","version","status","process_key","published_version","created_by","created_at","updated_at"`;

function asFormDef(r: Row | null | undefined): Record<string, unknown> | null {
  if (!r) return null;
  return {
    id: String(r['id']),
    tenant_id: String(r['tenant_id']),
    name: String(r['name']),
    key: String(r['key']),
    type: String(r['type']),
    column_config: (r['column_config'] as string | null) ?? null,
    schema: (r['schema'] as string | null) ?? null,
    version: Number(r['version']),
    status: String(r['status']),
  };
}

/** FormDefinitionService.getBusinessColumnsByKey */
export function getBusinessColumnsByKey(key: string, tenantId: string): ColumnConfig[] {
  const r = asFormDef(
    one(`SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' ORDER BY "version" DESC LIMIT 1`, [tenantId, key]),
  );
  if (!r) throw new BusinessException(`业务表单不存在或未发布: ${key}`, 404);
  if (r['type'] !== 'BUSINESS') {
    throw new BusinessException(`表单 ${key} 不是业务表单`, 400);
  }
  return parseColumnConfig(r['column_config'] as string | null);
}

/** existsByTenantIdAndKey */
export function formKeyExists(key: string, tenantId: string): boolean {
  return !!one(`SELECT 1 AS X FROM wf_form_def WHERE tenant_id = ? AND "key" = ? LIMIT 1`, [tenantId, key]);
}

/** findFirstByTenantIdAndKeyAndStatusOrderByVersionDesc（PUBLISHED 最新版） */
export function latestPublishedForm(key: string, tenantId: string): Record<string, unknown> | null {
  return asFormDef(
    one(`SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' ORDER BY "version" DESC LIMIT 1`, [tenantId, key]),
  );
}

export function tableExists(table: string): boolean {
  const r = one(`SELECT COUNT(1) AS C FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
  return Number(r?.['C'] ?? 0) > 0;
}

// ---------------------------------------------------------------- BizDataContext

export interface SubTableDef {
  tableName: string;
  subMode: string;
  subColumns: ColumnConfig[];
  subKeys: string[];
}

export interface BizDataContext {
  tableName: string;
  formKey: string;
  columns: ColumnConfig[];
  keys: string[];
  subTables: Map<string, SubTableDef>;
}

/** BizDataSupport.loadContext */
export function loadContext(formKey: string | null): BizDataContext {
  if (formKey == null || !FORM_KEY_RE.test(formKey)) {
    throw new BusinessException('非法表单 key: ' + jstr(formKey), 400);
  }
  const tableName = 'wf_biz_' + formKey;
  if (!tableExists(tableName)) {
    throw new BusinessException('业务表单数据表不存在: ' + formKey, 404);
  }
  const columns = getBusinessColumnsByKey(formKey, currentTenant());
  const keys = columns.filter((c) => c.subColumns == null || c.subColumns.length === 0).map((c) => c.key as string);
  const subTables = new Map<string, SubTableDef>();
  for (const c of columns) {
    if (c.subColumns != null && c.subColumns.length > 0) {
      const mode = isBlank(c.subMode) ? 'embedded' : (c.subMode as string);
      subTables.set(c.key as string, {
        tableName: 'wf_biz_' + formKey + '_' + c.key,
        subMode: mode,
        subColumns: c.subColumns,
        subKeys: c.subColumns.map((s) => s.key as string),
      });
    }
  }
  return { tableName, formKey, columns, keys, subTables };
}

/** 模块级租户（HTTP 路径设置；服务级调用前必须 set） */
let __tenant: string | null = null;
export function setBizTenant(t: string): void {
  __tenant = t;
}
function currentTenant(): string {
  if (__tenant == null) throw new ValidationError('Tenant ID is not set. Ensure X-Tenant-Id header is provided.');
  return __tenant;
}

// ---------------------------------------------------------------- BizDataQueryBuilder 移植（SQLite 方言翻译）

const BUILTIN_COLUMNS = new Set(['id', 'created_at', 'updated_at']);
const ALLOWED_ORDER = new Set(['asc', 'desc']);

export interface SqlAndParams {
  sql: string;
  params: unknown[];
}

function isJsonColumn(columnTypeOf: Map<string, string>, column: string): boolean {
  return (columnTypeOf.get(column) ?? '').toUpperCase() === 'JSON';
}

function jsonValue(v: unknown): string {
  return JSON.stringify(v) ?? String(v);
}

/**
 * H2/MySQL JSON 函数 → SQLite 等价翻译（参数顺序不变）：
 *   JSON_CONTAINS(col, ?)    → EXISTS (SELECT 1 FROM json_each(COALESCE(col, '[]')) je WHERE je.value = json_extract(?, '$'))
 *   NOT JSON_CONTAINS(col,?) → NOT EXISTS (...)
 *   JSON_OVERLAPS(col, ?)    → EXISTS (SELECT 1 FROM json_each(COALESCE(col,'[]')) a WHERE EXISTS (SELECT 1 FROM json_each(?) b WHERE b.value = a.value))
 */
function sqliteJsonContains(ref: string, negated: boolean): string {
  const inner = `EXISTS (SELECT 1 FROM json_each(COALESCE(${ref}, '[]')) je WHERE je.value = json_extract(?, '$'))`;
  return negated ? `NOT ${inner}` : inner;
}

function sqliteJsonOverlaps(ref: string): string {
  return `EXISTS (SELECT 1 FROM json_each(COALESCE(${ref}, '[]')) jeA WHERE EXISTS (SELECT 1 FROM json_each(?) jeB WHERE jeB.value = jeA.value))`;
}

/** 标识符引用（列名已过 COLUMN_KEY_RE 白名单，双引号包裹即可） */
function qcol(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function validateColumn(column: string | null, allowedColumns: string[], label: string): void {
  if (column == null || column.trim() === '') {
    throw new IllegalArgumentError(label + '不能为空');
  }
  if (!allowedColumns.includes(column) && !BUILTIN_COLUMNS.has(column)) {
    throw new IllegalArgumentError('非法' + label + ': ' + column);
  }
}

/** 过滤数据：仅保留白名单列，静默忽略未知字段与系统字段（防覆盖/注入） */
function filterData(allowedColumns: string[], data: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  if (data == null) return safe;
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id' || key === 'tenant_id' || key === 'version') continue;
    if (!allowedColumns.includes(key)) continue;
    safe[key] = value;
  }
  return safe;
}

function appendKeyword(sql: string[], params: unknown[], allowedColumns: string[], keyword: string | null, keywordColumn: string | null): void {
  if (keyword == null || keyword.trim() === '') return;
  const cols = isBlank(keywordColumn) ? [] : (keywordColumn as string).split(',');
  const likeFragments: string[] = [];
  for (const col of cols) {
    const trimmed = col.trim();
    if (trimmed === '') continue;
    validateColumn(trimmed, allowedColumns, '关键词匹配列');
    likeFragments.push(`${qcol(trimmed)} LIKE ?`);
    params.push(`%${keyword}%`);
  }
  if (likeFragments.length === 0) {
    throw new IllegalArgumentError('关键词匹配列不能为空');
  }
  if (likeFragments.length === 1) {
    sql.push(` AND ${likeFragments[0]}`);
  } else {
    sql.push(` AND (${likeFragments.join(' OR ')})`);
  }
}

function appendFilters(
  sql: string[],
  params: unknown[],
  allowedColumns: string[],
  columnTypeOf: Map<string, string>,
  filters: Record<string, unknown>,
): void {
  if (filters == null || Object.keys(filters).length === 0) return;
  if (Array.isArray(filters['conditions'])) {
    const logic = String(filters['logic'] ?? 'AND').toUpperCase() === 'AND' ? 'AND' : 'OR';
    appendStructuredFilters(sql, params, allowedColumns, columnTypeOf, logic, filters['conditions'] as Record<string, unknown>[]);
    return;
  }
  for (const [key, value] of Object.entries(filters)) {
    validateColumn(key, allowedColumns, '筛选字段');
    if (value == null) continue;
    if (isJsonColumn(columnTypeOf, key)) {
      sql.push(` AND ${sqliteJsonContains(qcol(key), false)}`);
      params.push(jsonValue(value));
    } else {
      sql.push(` AND ${qcol(key)} = ?`);
      params.push(value);
    }
  }
}

function appendStructuredFilters(
  sql: string[],
  params: unknown[],
  allowedColumns: string[],
  columnTypeOf: Map<string, string>,
  logic: string,
  conditions: Record<string, unknown>[],
): void {
  const fragments: string[] = [];
  for (const c of conditions) {
    const column = String(c['column']);
    validateColumn(column, allowedColumns, '筛选字段');
    const op = c['op'] == null ? 'eq' : String(c['op']).toLowerCase();
    const json = isJsonColumn(columnTypeOf, column);
    const ref = qcol(column);
    switch (op) {
      case 'eq': {
        if (c['value'] == null) continue;
        if (json) {
          fragments.push(sqliteJsonContains(ref, false));
          params.push(jsonValue(c['value']));
        } else {
          fragments.push(`${ref} = ?`);
          params.push(c['value']);
        }
        break;
      }
      case 'ne': {
        if (c['value'] == null) continue;
        if (json) {
          fragments.push(sqliteJsonContains(ref, true));
          params.push(jsonValue(c['value']));
        } else {
          fragments.push(`${ref} <> ?`);
          params.push(c['value']);
        }
        break;
      }
      case 'like': {
        if (c['value'] == null) continue;
        fragments.push(`${ref} LIKE ?`);
        params.push(`%${c['value']}%`);
        break;
      }
      case 'in': {
        const v = c['value'];
        if (!Array.isArray(v) || v.length === 0) continue;
        if (json) {
          fragments.push(sqliteJsonOverlaps(ref));
          params.push(jsonValue(v));
        } else {
          fragments.push(`${ref} IN (${v.map(() => '?').join(', ')})`);
          params.push(...v);
        }
        break;
      }
      case 'range': {
        const v = c['value'];
        if (!Array.isArray(v) || v.length !== 2 || v[0] == null || v[1] == null) continue;
        fragments.push(`(${ref} >= ? AND ${ref} <= ?)`);
        params.push(v[0], v[1]);
        break;
      }
      case 'isempty':
        fragments.push(`(${ref} IS NULL OR ${ref} = '')`);
        break;
      case 'isnotempty':
        fragments.push(`(${ref} IS NOT NULL AND ${ref} <> '')`);
        break;
      default:
        throw new IllegalArgumentError('非法筛选运算符: ' + op);
    }
  }
  if (fragments.length === 0) return;
  sql.push(` AND (${fragments.join(` ${logic} `)})`);
}

/** 生成分页 SELECT（带列类型，JSON 列走 json_each 翻译） */
export function buildSelect(
  tableName: string,
  allowedColumns: string[],
  columnTypeOf: Map<string, string>,
  tenantId: string,
  filters: Record<string, unknown>,
  keyword: string | null,
  keywordColumn: string | null,
  sort: string | null,
  order: string | null,
  page: number,
  size: number,
): SqlAndParams {
  const sql: string[] = [];
  const params: unknown[] = [tenantId];
  sql.push(`SELECT * FROM ${tableName} WHERE tenant_id = ?`);
  appendFilters(sql, params, allowedColumns, columnTypeOf, filters);
  appendKeyword(sql, params, allowedColumns, keyword, keywordColumn);

  const sortColumn = isBlank(sort) ? 'created_at' : (sort as string);
  validateColumn(sortColumn, allowedColumns, '排序字段');
  const orderDir = isBlank(order) ? 'desc' : (order as string).toLowerCase();
  if (!ALLOWED_ORDER.has(orderDir)) {
    throw new IllegalArgumentError('非法排序方向: ' + order);
  }
  sql.push(` ORDER BY ${qcol(sortColumn)} ${orderDir.toUpperCase()}`);

  if (size > 0) {
    sql.push(` LIMIT ? OFFSET ?`);
    params.push(size, page * size);
  }
  return { sql: sql.join(''), params };
}

/** 生成 COUNT 查询（分页总数，过滤条件与 buildSelect 一致） */
export function buildCount(
  tableName: string,
  allowedColumns: string[],
  columnTypeOf: Map<string, string>,
  tenantId: string,
  filters: Record<string, unknown>,
  keyword: string | null,
  keywordColumn: string | null,
): SqlAndParams {
  const sql: string[] = [];
  const params: unknown[] = [tenantId];
  sql.push(`SELECT COUNT(1) FROM ${tableName} WHERE tenant_id = ?`);
  appendFilters(sql, params, allowedColumns, columnTypeOf, filters);
  appendKeyword(sql, params, allowedColumns, keyword, keywordColumn);
  return { sql: sql.join(''), params };
}

/** 生成 INSERT（仅白名单列 + tenant_id + version；id 内部生成） */
export function buildInsert(tableName: string, allowedColumns: string[], data: Record<string, unknown>, tenantId: string): SqlAndParams {
  const safeData = filterData(allowedColumns, data);
  const cols = [`id`, `tenant_id`, `version`];
  const placeholders = ['?', '?', '?'];
  const params: unknown[] = [crypto.randomUUID().replace(/-/g, ''), tenantId, 1];
  for (const [key, value] of Object.entries(safeData)) {
    cols.push(key);
    placeholders.push('?');
    params.push(value);
  }
  return { sql: `INSERT INTO ${tableName} (${cols.map(qcol).join(', ')}) VALUES (${placeholders.join(', ')})`, params };
}

/** 生成 UPDATE（乐观锁；NOW() → 运行时文本字面量） */
export function buildUpdate(
  tableName: string,
  allowedColumns: string[],
  data: Record<string, unknown>,
  tenantId: string,
  id: string,
  version: number,
): SqlAndParams {
  const safeData = filterData(allowedColumns, data);
  if (Object.keys(safeData).length === 0) {
    throw new IllegalArgumentError('更新内容不能为空');
  }
  const sets: string[] = [];
  const params: unknown[] = [];
  let first = true;
  for (const [key, value] of Object.entries(safeData)) {
    if (!first) sets.push(', ');
    sets.push(`${qcol(key)} = ?`);
    params.push(value);
    first = false;
  }
  sets.push(`, version = version + 1, updated_at = '${nowText()}'`);
  params.push(id, tenantId, version);
  return { sql: `UPDATE ${tableName} SET ${sets.join('')} WHERE id = ? AND tenant_id = ? AND version = ?`, params };
}

/** 生成 DELETE（租户范围限定） */
export function buildDelete(tableName: string, tenantId: string, id: string): SqlAndParams {
  return { sql: `DELETE FROM ${tableName} WHERE id = ? AND tenant_id = ?`, params: [id, tenantId] };
}

// ---------------------------------------------------------------- SqlQueryEngine 移植

/** execPage：先 COUNT 得总数，再 SELECT 取当前页 */
export function execPage(
  page: number,
  size: number,
  count: SqlAndParams,
  select: SqlAndParams,
  rowMapper: (row: Row) => Record<string, unknown>,
): Record<string, unknown> {
  const totalRow = one(count.sql, count.params);
  const total = totalRow ? Number(Object.values(totalRow)[0]) : 0;
  const rows = all(select.sql, select.params);
  const records = rows.map(rowMapper);
  return { records, total: total == null ? 0 : total, page: Number(page), size: Number(size) };
}

export interface WrappedQuery {
  select: SqlAndParams;
  count: SqlAndParams;
}

/** wrapSubquery：内层 SQL 包裹为分页子查询（参数：内层 → 筛选 → 分页） */
export function wrapSubquery(
  inner: SqlAndParams,
  filterFragment: string,
  filterParams: unknown[],
  orderByFragment: string,
  page: number,
  size: number,
): WrappedQuery {
  const baseParams = [...inner.params, ...filterParams];
  let rowSql = `SELECT * FROM (${inner.sql}) _qs${filterFragment}${orderByFragment}`;
  const rowParams = [...baseParams];
  if (size > 0) {
    rowSql += ` LIMIT ? OFFSET ?`;
    rowParams.push(size, (Math.max(page, 1) - 1) * size);
  }
  const countSql = `SELECT COUNT(*) FROM (${inner.sql}) _qs${filterFragment}`;
  return {
    select: { sql: rowSql, params: rowParams },
    count: { sql: countSql, params: baseParams },
  };
}

// ---------------------------------------------------------------- JoinSqlGenerator 移植（config 模式 JOIN）

export interface JoinConfig {
  alias: string | null;
  targetFormKey: string | null;
  localField: string | null;
  foreignField: string | null;
  joinField: string | null;
  virtualKey: string | null;
  label: string | null;
  sortable: boolean;
  filterable: boolean;
}

export interface QueryColumn {
  key: string;
  ref: string;
  columnType: string;
  sortable: boolean;
  filterable: boolean;
}

const JOIN_BUILTIN_COLUMNS = BUILTIN_COLUMNS;
const IDENT_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

function joinIsJsonColumn(columns: QueryColumn[], key: string): boolean {
  for (const c of columns) {
    if (c.key === key) return c.columnType.toUpperCase() === 'JSON';
  }
  return false;
}

/** JOIN 匹配的 localField 引用：JSON 列提取首元素，普通列直接引用 */
function joinLocalRef(j: JoinConfig, columns: QueryColumn[]): string {
  if (j.localField != null && joinIsJsonColumn(columns, j.localField)) {
    // SQLite json_extract 已返回未引用文本，等价 JSON_UNQUOTE(JSON_EXTRACT(...))
    return `json_extract(m.${j.localField},'$[0]')`;
  }
  return `m.${j.localField}`;
}

function joinResolveRef(column: string | null, columns: QueryColumn[], sortable: boolean, label: string): string {
  if (column == null || column.trim() === '') {
    throw new IllegalArgumentError(label + '不能为空');
  }
  if (JOIN_BUILTIN_COLUMNS.has(column)) {
    return `m.${column}`;
  }
  for (const c of columns) {
    if (c.key === column) {
      if (sortable && !c.sortable) {
        throw new IllegalArgumentError('该列不可排序: ' + column);
      }
      if (!sortable && !c.filterable) {
        throw new IllegalArgumentError('该列不可' + label + ': ' + column);
      }
      return c.ref;
    }
  }
  throw new IllegalArgumentError('非法' + label + ': ' + column);
}

function joinAppendFilters(sql: string[], params: unknown[], columns: QueryColumn[], filters: Record<string, unknown>): void {
  if (filters == null || Object.keys(filters).length === 0) return;
  if (Array.isArray(filters['conditions'])) {
    const logic = String(filters['logic'] ?? 'AND').toUpperCase() === 'AND' ? 'AND' : 'OR';
    joinAppendStructuredFilters(sql, params, columns, logic, filters['conditions'] as Record<string, unknown>[]);
    return;
  }
  for (const [key, value] of Object.entries(filters)) {
    const ref = joinResolveRef(key, columns, false, '筛选字段');
    if (value == null) continue;
    if (joinIsJsonColumn(columns, key)) {
      sql.push(` AND ${sqliteJsonContains(ref, false)}`);
      params.push(jsonValue(value));
    } else {
      sql.push(` AND ${ref} = ?`);
      params.push(value);
    }
  }
}

function joinAppendStructuredFilters(
  sql: string[],
  params: unknown[],
  columns: QueryColumn[],
  logic: string,
  conditions: Record<string, unknown>[],
): void {
  const fragments: string[] = [];
  for (const c of conditions) {
    const column = String(c['column']);
    const ref = joinResolveRef(column, columns, false, '筛选字段');
    const op = c['op'] == null ? 'eq' : String(c['op']).toLowerCase();
    const json = joinIsJsonColumn(columns, column);
    switch (op) {
      case 'eq': {
        if (c['value'] == null) continue;
        if (json) {
          fragments.push(sqliteJsonContains(ref, false));
          params.push(jsonValue(c['value']));
        } else {
          fragments.push(`${ref} = ?`);
          params.push(c['value']);
        }
        break;
      }
      case 'ne': {
        if (c['value'] == null) continue;
        if (json) {
          fragments.push(sqliteJsonContains(ref, true));
          params.push(jsonValue(c['value']));
        } else {
          fragments.push(`${ref} <> ?`);
          params.push(c['value']);
        }
        break;
      }
      case 'like': {
        if (c['value'] == null) continue;
        fragments.push(`${ref} LIKE ?`);
        params.push(`%${c['value']}%`);
        break;
      }
      case 'in': {
        const v = c['value'];
        if (!Array.isArray(v) || v.length === 0) continue;
        if (json) {
          fragments.push(sqliteJsonOverlaps(ref));
          params.push(jsonValue(v));
        } else {
          fragments.push(`${ref} IN (${v.map(() => '?').join(', ')})`);
          params.push(...v);
        }
        break;
      }
      case 'range': {
        const v = c['value'];
        if (!Array.isArray(v) || v.length !== 2 || v[0] == null || v[1] == null) continue;
        fragments.push(`(${ref} >= ? AND ${ref} <= ?)`);
        params.push(v[0], v[1]);
        break;
      }
      case 'isempty':
        fragments.push(`(${ref} IS NULL OR ${ref} = '')`);
        break;
      case 'isnotempty':
        fragments.push(`(${ref} IS NOT NULL AND ${ref} <> '')`);
        break;
      default:
        throw new IllegalArgumentError('非法筛选运算符: ' + op);
    }
  }
  if (fragments.length === 0) return;
  sql.push(` AND (${fragments.join(` ${logic} `)})`);
}

function joinAppendKeyword(sql: string[], params: unknown[], columns: QueryColumn[], keyword: string | null, keywordColumn: string | null): void {
  if (keyword == null || keyword.trim() === '') return;
  const cols = isBlank(keywordColumn) ? [] : (keywordColumn as string).split(',');
  const likeFragments: string[] = [];
  for (const col of cols) {
    const trimmed = col.trim();
    if (trimmed === '') continue;
    const ref = joinResolveRef(trimmed, columns, false, '关键词匹配列');
    likeFragments.push(`${ref} LIKE ?`);
    params.push(`%${keyword}%`);
  }
  if (likeFragments.length === 0) {
    throw new IllegalArgumentError('关键词匹配列不能为空');
  }
  if (likeFragments.length === 1) {
    sql.push(` AND ${likeFragments[0]}`);
  } else {
    sql.push(` AND (${likeFragments.join(' OR ')})`);
  }
}

export function joinBuildSelect(
  mainTable: string,
  tenantId: string,
  joins: JoinConfig[],
  columns: QueryColumn[],
  filters: Record<string, unknown>,
  keyword: string | null,
  keywordColumn: string | null,
  sort: string | null,
  order: string | null,
  page: number,
  size: number,
): SqlAndParams {
  const sql: string[] = [`SELECT m.*`];
  const params: unknown[] = [tenantId];
  for (const j of joins) {
    sql.push(`, ${j.alias}.${j.joinField} AS ${j.virtualKey}`);
  }
  sql.push(` FROM ${mainTable} m`);
  for (const j of joins) {
    sql.push(` LEFT JOIN wf_biz_${j.targetFormKey} ${j.alias} ON ${j.alias}.${j.foreignField} = ${joinLocalRef(j, columns)}`);
  }
  sql.push(` WHERE m.tenant_id = ?`);
  joinAppendFilters(sql, params, columns, filters);
  joinAppendKeyword(sql, params, columns, keyword, keywordColumn);

  const sortColumn = isBlank(sort) ? 'created_at' : (sort as string);
  const sortRef = joinResolveRef(sortColumn, columns, true, '排序字段');
  const orderDir = isBlank(order) ? 'desc' : (order as string).toLowerCase();
  if (!ALLOWED_ORDER.has(orderDir)) {
    throw new IllegalArgumentError('非法排序方向: ' + order);
  }
  sql.push(` ORDER BY ${sortRef} ${orderDir.toUpperCase()}`);
  if (size > 0) {
    sql.push(` LIMIT ? OFFSET ?`);
    params.push(size, page * size);
  }
  return { sql: sql.join(''), params };
}

export function joinBuildCount(
  mainTable: string,
  tenantId: string,
  joins: JoinConfig[],
  columns: QueryColumn[],
  filters: Record<string, unknown>,
  keyword: string | null,
  keywordColumn: string | null,
): SqlAndParams {
  const sql: string[] = [`SELECT COUNT(1) FROM ${mainTable} m`];
  const params: unknown[] = [tenantId];
  for (const j of joins) {
    sql.push(` LEFT JOIN wf_biz_${j.targetFormKey} ${j.alias} ON ${j.alias}.${j.foreignField} = ${joinLocalRef(j, columns)}`);
  }
  sql.push(` WHERE m.tenant_id = ?`);
  joinAppendFilters(sql, params, columns, filters);
  joinAppendKeyword(sql, params, columns, keyword, keywordColumn);
  return { sql: sql.join(''), params };
}

// ---------------------------------------------------------------- SqlTemplateEngine 移植（:tenantId 可选 + 参数白名单）

const PLACEHOLDER_RE = /:[A-Za-z_][A-Za-z0-9_]*/g;

function indexOfKeyword(s: string, kw: string, from = 0): number {
  const lower = s.toLowerCase();
  const k = kw.toLowerCase();
  let i = lower.indexOf(k, from);
  while (i >= 0) {
    const beforeOk = i === 0 || !/[A-Za-z0-9_]/.test(lower.charAt(i - 1));
    const end = i + k.length;
    const afterOk = end >= lower.length || !/[A-Za-z0-9_]/.test(lower.charAt(end));
    if (beforeOk && afterOk) return i;
    i = lower.indexOf(k, i + 1);
  }
  return -1;
}

/** 解析 SELECT 输出列/别名集合（"*" 表示通配，跳过逐列匹配） */
export function extractSelectOutputs(sql: string): Set<string> {
  const out = new Set<string>();
  const sel = indexOfKeyword(sql, 'SELECT');
  if (sel < 0) return out;
  const from = indexOfKeyword(sql, 'FROM', sel + 6);
  if (from < 0) return out;
  const list = sql.substring(sel + 6, from);
  for (const part of list.split(',')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    if (trimmed === '*' || trimmed.endsWith('.*')) {
      out.add('*');
      continue;
    }
    let name: string;
    const as = indexOfKeyword(trimmed, 'AS');
    if (as >= 0) {
      const after = trimmed.substring(as + 2).trim();
      name = after.split(/[\s,]+/)[0] ?? '';
    } else {
      const dot = trimmed.lastIndexOf('.');
      name = (dot >= 0 ? trimmed.substring(dot + 1) : trimmed).trim();
    }
    name = name.replace(/`/g, '').replace(/"/g, '');
    if (name !== '') out.add(name);
  }
  return out;
}

export function extractPlaceholders(sql: string): string[] {
  const out: string[] = [];
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) != null) {
    out.push(m[0]);
  }
  return out;
}

/** 校验 SQL 模板（SELECT / columns 非空 / 声明列命中输出 / 参数白名单） */
export function sqlTemplateValidate(query: string | null, columns: QueryColumn[], declaredParams: string[] | null): void {
  if (query == null || query.trim() === '') {
    throw new IllegalArgumentError('SQL 模板不能为空');
  }
  const trimmed = query.trim();
  if (trimmed.substring(0, 6).toUpperCase() !== 'SELECT') {
    throw new IllegalArgumentError('仅允许 SELECT 查询');
  }
  if (columns == null || columns.length === 0) {
    throw new IllegalArgumentError('columns 不能为空');
  }
  const outputs = extractSelectOutputs(trimmed);
  if (!outputs.has('*')) {
    for (const c of columns) {
      if (!outputs.has(c.key)) {
        throw new IllegalArgumentError('声明列不在查询结果中: ' + c.key);
      }
    }
  }
  const params = declaredParams ?? [];
  for (const p of params) {
    if (!IDENT_RE.test(p)) {
      throw new IllegalArgumentError('参数名非法: ' + p);
    }
  }
  for (const ph of extractPlaceholders(trimmed)) {
    if (ph === ':tenantId') continue;
    if (!params.includes(ph.substring(1))) {
      throw new IllegalArgumentError('SQL 模板包含未声明参数: ' + ph);
    }
  }
}

function templateResolveKey(column: string | null, columns: QueryColumn[], label: string): string {
  if (column == null || column.trim() === '') {
    throw new IllegalArgumentError(label + '不能为空');
  }
  for (const c of columns) {
    if (c.key === column) {
      if (!c.filterable) {
        throw new IllegalArgumentError('该列不可' + label + ': ' + column);
      }
      return c.key;
    }
  }
  throw new IllegalArgumentError('非法' + label + ': ' + column);
}

function templateAppendFilters(sql: string[], params: unknown[], columns: QueryColumn[], filters: Record<string, unknown>): void {
  if (filters == null || Object.keys(filters).length === 0) return;
  if (Array.isArray(filters['conditions'])) {
    const logic = String(filters['logic'] ?? 'AND').toUpperCase() === 'AND' ? 'AND' : 'OR';
    const fragments: string[] = [];
    for (const c of filters['conditions'] as Record<string, unknown>[]) {
      const column = String(c['column']);
      const key = templateResolveKey(column, columns, '筛选字段');
      const op = c['op'] == null ? 'eq' : String(c['op']).toLowerCase();
      const json = columns.find((x) => x.key === column)?.columnType.toUpperCase() === 'JSON';
      switch (op) {
        case 'eq': {
          if (c['value'] == null) continue;
          if (json) {
            fragments.push(`JSON_CONTAINS(${key}, ?)`);
            params.push(jsonValue(c['value']));
          } else {
            fragments.push(`${key} = ?`);
            params.push(c['value']);
          }
          break;
        }
        case 'ne': {
          if (c['value'] == null) continue;
          if (json) {
            fragments.push(`NOT JSON_CONTAINS(${key}, ?)`);
            params.push(jsonValue(c['value']));
          } else {
            fragments.push(`${key} <> ?`);
            params.push(c['value']);
          }
          break;
        }
        case 'like': {
          if (c['value'] == null) continue;
          fragments.push(`${key} LIKE ?`);
          params.push(`%${c['value']}%`);
          break;
        }
        case 'in': {
          const v = c['value'];
          if (!Array.isArray(v) || v.length === 0) continue;
          if (json) {
            fragments.push(`JSON_OVERLAPS(${key}, ?)`);
            params.push(jsonValue(v));
          } else {
            fragments.push(`${key} IN (${v.map(() => '?').join(', ')})`);
            params.push(...v);
          }
          break;
        }
        case 'range': {
          const v = c['value'];
          if (!Array.isArray(v) || v.length !== 2 || v[0] == null || v[1] == null) continue;
          fragments.push(`(${key} >= ? AND ${key} <= ?)`);
          params.push(v[0], v[1]);
          break;
        }
        case 'isempty':
          fragments.push(`(${key} IS NULL OR ${key} = '')`);
          break;
        case 'isnotempty':
          fragments.push(`(${key} IS NOT NULL AND ${key} <> '')`);
          break;
        default:
          throw new IllegalArgumentError('非法筛选运算符: ' + op);
      }
    }
    if (fragments.length === 0) return;
    if (fragments.length === 1) {
      sql.push(` AND ${fragments[0]}`);
    } else {
      sql.push(` AND (${fragments.join(` ${logic} `)})`);
    }
    return;
  }
  for (const [key0, value] of Object.entries(filters)) {
    const key = templateResolveKey(key0, columns, '筛选字段');
    if (value == null) continue;
    const json = columns.find((x) => x.key === key0)?.columnType.toUpperCase() === 'JSON';
    if (json) {
      sql.push(` AND JSON_CONTAINS(${key}, ?)`);
      params.push(jsonValue(value));
    } else {
      sql.push(` AND ${key} = ?`);
      params.push(value);
    }
  }
}

function templateAppendKeyword(sql: string[], params: unknown[], columns: QueryColumn[], keyword: string | null, keywordColumn: string | null): void {
  if (keyword == null || keyword.trim() === '') return;
  const cols = isBlank(keywordColumn) ? [] : (keywordColumn as string).split(',');
  const likeFragments: string[] = [];
  for (const col of cols) {
    const trimmed = col.trim();
    if (trimmed === '') continue;
    const key = templateResolveKey(trimmed, columns, '关键词匹配列');
    likeFragments.push(`${key} LIKE ?`);
    params.push(`%${keyword}%`);
  }
  if (likeFragments.length === 0) {
    throw new IllegalArgumentError('关键词匹配列不能为空');
  }
  if (likeFragments.length === 1) {
    sql.push(` AND ${likeFragments[0]}`);
  } else {
    sql.push(` AND (${likeFragments.join(' OR ')})`);
  }
}

function templateBindPlaceholders(
  query: string,
  tenantId: string,
  declaredParams: string[],
  runtimeParams: Record<string, unknown> | null,
  params: unknown[],
): string {
  let sb = '';
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query)) != null) {
    sb += query.substring(last, m.index);
    const ph = m[0];
    if (ph === ':tenantId') {
      sb += '?';
      params.push(tenantId);
    } else {
      const name = ph.substring(1);
      if (!declaredParams.includes(name)) {
        throw new IllegalArgumentError('SQL 模板包含未声明参数: ' + ph);
      }
      if (runtimeParams == null || !(name in runtimeParams)) {
        throw new IllegalArgumentError('缺少运行时参数值: ' + ph);
      }
      sb += '?';
      params.push(runtimeParams[name]);
    }
    last = m.index + ph.length;
  }
  sb += query.substring(last);
  return sb;
}

function templateDefaultSortColumn(columns: QueryColumn[]): string | null {
  for (const c of columns) {
    if (c.sortable) return c.key;
  }
  return null;
}

/**
 * 包裹查询（含参数透传）：等价 SqlTemplateEngine.wrap。
 * 模板 JSON 函数保持原样（json_each 翻译仅限本模块生成的筛选；模板 JSON 列筛选同样翻译）。
 */
export function sqlTemplateWrap(
  query: string,
  tenantId: string,
  columns: QueryColumn[],
  filters: Record<string, unknown>,
  keyword: string | null,
  keywordColumn: string | null,
  sort: string | null,
  order: string | null,
  page: number,
  size: number,
  declaredParams: string[] | null,
  runtimeParams: Record<string, unknown> | null,
): WrappedQuery {
  sqlTemplateValidate(query, columns, declaredParams);

  const innerParams: unknown[] = [];
  let innerSql = templateBindPlaceholders(query, tenantId, declaredParams ?? [], runtimeParams, innerParams);

  const filterSql: string[] = [];
  const filterParams: unknown[] = [];
  templateAppendFilters(filterSql, filterParams, columns, filters);
  templateAppendKeyword(filterSql, filterParams, columns, keyword, keywordColumn);
  let filterBody = filterSql.join('');
  if (filterBody.startsWith(' AND ')) {
    filterBody = filterBody.substring(5);
  }
  const filterFragment = filterBody === '' ? '' : ' WHERE ' + filterBody;

  const sortColumn = isBlank(sort) ? templateDefaultSortColumn(columns) : sort;
  let orderByFragment = '';
  if (sortColumn != null) {
    const found = columns.find((c) => c.key === sortColumn);
    if (found == null || !found.sortable) {
      throw new IllegalArgumentError('该列不可排序: ' + sortColumn);
    }
    const orderDir = isBlank(order) ? 'desc' : (order as string).toLowerCase();
    if (!ALLOWED_ORDER.has(orderDir)) {
      throw new IllegalArgumentError('非法排序方向: ' + order);
    }
    orderByFragment = ` ORDER BY ${sortColumn} ${orderDir.toUpperCase()}`;
  }

  return wrapSubquery({ sql: innerSql, params: innerParams }, filterFragment, filterParams, orderByFragment, page, size);
}

// ---------------------------------------------------------------- FormQueryConfig 移植

export interface FormQueryConfig {
  queryMode: string | null;
  joins: JoinConfig[];
  query: string | null;
  columns: ColumnConfig[];
  declaredParams: string[];
}

export function formQueryConfigIsEmpty(cfg: FormQueryConfig): boolean {
  return cfg.queryMode == null && cfg.joins.length === 0 && cfg.query == null && cfg.columns.length === 0 && cfg.declaredParams.length === 0;
}

export function formQueryConfigIsConfigMode(cfg: FormQueryConfig): boolean {
  return cfg.queryMode === 'config' && cfg.joins.length > 0;
}

export function formQueryConfigIsSqlMode(cfg: FormQueryConfig): boolean {
  return cfg.queryMode === 'sql' && !isBlank(cfg.query);
}

export function formQueryConfigIsVisualMode(cfg: FormQueryConfig): boolean {
  return cfg.queryMode === 'visual' && !isBlank(cfg.query);
}

export function formQueryConfigParse(paramsJson: string | null): FormQueryConfig {
  if (isBlank(paramsJson)) {
    return { queryMode: null, joins: [], query: null, columns: [], declaredParams: [] };
  }
  let root: unknown;
  try {
    root = JSON.parse(paramsJson as string);
  } catch (e) {
    throw new BusinessException('数据源 params 不是合法 JSON: ' + (e instanceof Error ? e.message : String(e)), 400);
  }
  if (root == null || typeof root !== 'object' || Array.isArray(root)) {
    throw new BusinessException('数据源 params 必须是 JSON 对象', 400);
  }
  const obj = root as Record<string, unknown>;
  const text = (field: string): string | null => (obj[field] == null ? null : String(obj[field]));
  const bool = (field: string): boolean => obj[field] === true;
  const mode = text('queryMode');
  if (mode === 'config') {
    const joins: JoinConfig[] = [];
    const node = obj['joins'];
    if (Array.isArray(node)) {
      for (const n of node) {
        if (n == null || typeof n !== 'object' || Array.isArray(n)) continue;
        const o = n as Record<string, unknown>;
        joins.push({
          alias: o['alias'] == null ? null : String(o['alias']),
          targetFormKey: o['targetFormKey'] == null ? null : String(o['targetFormKey']),
          localField: o['localField'] == null ? null : String(o['localField']),
          foreignField: o['foreignField'] == null ? null : String(o['foreignField']),
          joinField: o['joinField'] == null ? null : String(o['joinField']),
          virtualKey: o['virtualKey'] == null ? null : String(o['virtualKey']),
          label: o['label'] == null ? null : String(o['label']),
          sortable: o['sortable'] === true,
          filterable: o['filterable'] === true,
        });
      }
    }
    return { queryMode: mode, joins, query: null, columns: [], declaredParams: [] };
  }
  if (mode === 'sql' || mode === 'visual') {
    const query = text('query');
    const columns: ColumnConfig[] = [];
    if (Array.isArray(obj['columns'])) {
      for (const n of obj['columns'] as Record<string, unknown>[]) {
        if (n == null || typeof n !== 'object') continue;
        columns.push(colCfg(n));
      }
    }
    const declaredParams: string[] = [];
    if (Array.isArray(obj['params'])) {
      for (const n of obj['params']) {
        if (n != null && typeof n === 'string' && n.trim() !== '') declaredParams.push(n);
      }
    }
    return { queryMode: mode, joins: [], query, columns, declaredParams };
  }
  return { queryMode: mode, joins: [], query: null, columns: [], declaredParams: [] };
}

// ---------------------------------------------------------------- BizDataSupport 移植

/** 必填字段校验 */
export function validateRequired(columns: ColumnConfig[], data: Record<string, unknown> | null): void {
  const safe = data ?? {};
  for (const c of columns) {
    if (c.required) {
      const v = safe[c.key as string];
      if (v == null || (typeof v === 'string' && v.trim() === '')) {
        throw new BusinessException('必填字段不能为空: ' + jstr(c.label), 400);
      }
    }
  }
}

/** 非字符串值（数组/对象）序列化为 JSON 字符串（供参数绑定存储） */
function serializeJsonColumns(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const [key, v] of Object.entries(data)) {
    if (v == null || typeof v === 'string') continue;
    try {
      out[key] = JSON.stringify(v);
    } catch (e) {
      throw new BusinessException(`字段 ${key} 无法序列化为 JSON: ${e instanceof Error ? e.message : String(e)}`, 400);
    }
  }
  return out;
}

/** JSON 列值反序列化；parse 失败原样返回（兼容旧逗号串数据） */
function deserializeJsonValue(v: unknown): unknown {
  if (v == null || typeof v !== 'string') return v;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

function isDataPickerColumn(ctx: BizDataContext, col: ColumnConfig): boolean {
  if (isBlank(col.pickerConfig)) return false;
  try {
    const picker = JSON.parse(col.pickerConfig as string) as Record<string, unknown>;
    const pickerType = picker['pickerType'] == null ? null : String(picker['pickerType']);
    if (pickerType === 'lookupPicker') return false;
    if (pickerType === 'dataPicker') return true;
    return ctx.columns.some((c) => c.key === (col.key as string) + '_text');
  } catch {
    return false;
  }
}

/** 批量解析被引用记录的显示文本（id → displayField 值） */
export function resolveDisplayTexts(sourceFormKey: string | null, ids: string[] | null, displayField: string | null): Record<string, string> {
  if (sourceFormKey == null || !FORM_KEY_RE.test(sourceFormKey)) {
    throw new BusinessException('非法目标表单 key: ' + jstr(sourceFormKey), 400);
  }
  if (ids == null || ids.length === 0) {
    return {};
  }
  if (displayField == null || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(displayField)) {
    throw new BusinessException('非法显示字段: ' + jstr(displayField), 400);
  }
  const table = 'wf_biz_' + sourceFormKey;
  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT id, ${displayField} FROM ${table} WHERE tenant_id = ? AND id IN (${placeholders})`;
  const params: unknown[] = [currentTenant(), ...ids];
  const result: Record<string, string> = {};
  for (const row of all(sql, params)) {
    const v = row[displayField];
    result[String(row['id'])] = v == null ? '' : String(v);
  }
  return result;
}

function resolvePickerText(ctx: BizDataContext, col: ColumnConfig, raw: unknown): string {
  let picker: Record<string, unknown>;
  try {
    picker = JSON.parse(col.pickerConfig as string) as Record<string, unknown>;
  } catch {
    throw new BusinessException('data-picker 配置或引用值非法: ' + col.key, 400);
  }
  const sourceFormKey = picker['sourceFormKey'] == null ? null : String(picker['sourceFormKey']);
  const displayField = picker['displayField'] == null ? null : String(picker['displayField']);
  const maxCountObj = picker['maxCount'];

  if (raw == null || String(raw).trim() === '') return '';
  const rawStr = String(raw);
  let ids: string[];
  try {
    const parsed = JSON.parse(rawStr);
    if (!Array.isArray(parsed) || parsed.some((x) => typeof x !== 'string')) throw new Error('not string array');
    ids = parsed as string[];
  } catch {
    throw new BusinessException('data-picker 引用值格式非法（需 JSON 数组）: ' + col.key, 400);
  }
  ids = ids.filter((s) => s.trim() !== '');
  if (ids.length === 0) return '';
  if (maxCountObj != null) {
    const maxCount = Number(String(maxCountObj));
    if (!Number.isInteger(maxCount)) {
      throw new BusinessException('data-picker maxCount 配置非法: ' + col.key, 400);
    }
    if (maxCount > 0 && ids.length > maxCount) {
      throw new BusinessException(`data-picker 引用数量超出限制（最多 ${maxCount}）: ` + col.key, 400);
    }
  }
  const texts = resolveDisplayTexts(sourceFormKey, ids, displayField);
  const ordered: string[] = [];
  for (const id of ids) {
    const t = texts[id];
    if (t == null) {
      throw new BusinessException(`引用的数据不存在: ${col.key}=${id}`, 400);
    }
    ordered.push(t);
  }
  return JSON.stringify(ordered);
}

/** 遍历 data-picker 引用列：生成 <key>_text 展示缓存文本（不改原 data） */
export function resolvePickerValues(ctx: BizDataContext, data: Record<string, unknown>): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const col of ctx.columns) {
    if (isBlank(col.pickerConfig)) continue;
    if (!isDataPickerColumn(ctx, col)) continue;
    const key = col.key as string;
    extra[key + '_text'] = resolvePickerText(ctx, col, data[key]);
  }
  return extra;
}

/** 按表单 key 批量解析显示文本（resolve API 入口） */
export function resolveByFormKey(formKey: string, ids: string[] | null, displayField: string | null): Record<string, string> {
  const ctx = loadContext(formKey);
  let field = displayField;
  if (isBlank(field)) {
    const first = ctx.columns.find((c) => !c.hidden && c.pickerConfig == null);
    if (!first) {
      throw new BusinessException('目标表单无可解析的显示字段', 400);
    }
    field = first.key;
  }
  return resolveDisplayTexts(formKey, ids, field);
}

/** 解析单个表单 column_config 中的 dataPicker 引用列，聚合到 result */
function collectPickerRefs(def: Record<string, unknown>, result: Map<string, { count: number; referencedBy: string[] }>): void {
  const columnConfig = def['column_config'] as string | null;
  if (isBlank(columnConfig)) return;
  let cols: unknown;
  try {
    cols = JSON.parse(columnConfig as string);
  } catch {
    return;
  }
  if (!Array.isArray(cols)) return;
  for (const col of cols) {
    if (col == null || typeof col !== 'object') continue;
    const pickerConfig = (col as Record<string, unknown>)['pickerConfig'];
    if (typeof pickerConfig !== 'string' || pickerConfig.trim() === '') continue;
    let picker: Record<string, unknown>;
    try {
      picker = JSON.parse(pickerConfig) as Record<string, unknown>;
    } catch {
      continue;
    }
    const target = picker['sourceFormKey'];
    if (target == null || String(target).trim() === '') continue;
    const targetKey = String(target);
    let entry = result.get(targetKey);
    if (!entry) {
      entry = { count: 0, referencedBy: [] };
      result.set(targetKey, entry);
    }
    entry.count += 1;
    entry.referencedBy.push(String(def['key']));
  }
}

/** 统计各业务表单被 dataPicker 引用的情况（引用感知） */
export function countReferencedBy(): Record<string, Record<string, unknown>> {
  const result = new Map<string, { count: number; referencedBy: string[] }>();
  const tenantId = currentTenant();
  const defs = all(
    `SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "type" = 'BUSINESS' ORDER BY updated_at DESC`,
    [tenantId],
  );
  for (const r of defs) {
    const def = asFormDef(r);
    if (def) collectPickerRefs(def, result);
  }
  const out: Record<string, Record<string, unknown>> = {};
  for (const [k, v] of result) {
    out[k] = { count: v.count, referencedBy: v.referencedBy };
  }
  return out;
}

// ---------------------------------------------------------------- 行映射（BizDataVO）

function asInt(v: unknown): number | null {
  if (typeof v === 'number') return Math.trunc(v);
  if (v == null) return null;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`For input string: "${String(v)}"`);
  return Math.trunc(n);
}

export function toVO(ctx: BizDataContext, row: Row): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const c of ctx.columns) {
    const v = row[c.key as string];
    if (v != null) {
      data[c.key as string] = c.columnType === 'JSON' ? deserializeJsonValue(v) : v;
    }
  }
  for (const [key, def] of ctx.subTables) {
    if (def.subMode === 'embedded') {
      data[key] = readSubRows(def, String(row['id']));
    }
  }
  const version = asInt(row['version']);
  const createdAt = toIsoText(row['created_at']);
  const updatedAt = toIsoText(row['updated_at']);
  return { id: String(row['id']), data, version, createdAt, updatedAt };
}

/** sql 模式行映射：外层子查询输出列全量保留；声明列大小写不敏感对齐 */
export function toSqlVO(declared: ColumnConfig[] | null, row: Row): Record<string, unknown> {
  const keyNormalizer = new Map<string, string>();
  if (declared != null) {
    for (const c of declared) {
      if (c.key != null && c.key.trim() !== '') {
        if (!keyNormalizer.has(c.key.toLowerCase())) {
          keyNormalizer.set(c.key.toLowerCase(), c.key);
        }
      }
    }
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const lower = k.toLowerCase();
    data[keyNormalizer.get(lower) ?? lower] = v;
  }
  delete data['version'];
  delete data['created_at'];
  delete data['updated_at'];
  delete data['tenant_id'];
  const version = asInt(row['version']);
  const createdAt = toIsoText(row['created_at']);
  const updatedAt = toIsoText(row['updated_at']);
  const rowId = row['id'];
  return { id: rowId == null ? 'null' : String(rowId), data, version, createdAt, updatedAt };
}

// ---------------------------------------------------------------- 通用 CRUD（BizDataSupport）

/** 通用新增实现 */
export function createGeneric(formKey: string, data: Record<string, unknown>): Record<string, unknown> {
  const tenantId = currentTenant();
  const ctx = loadContext(formKey);

  validateRequired(ctx.columns, data);

  const merged = serializeJsonColumns(data);
  Object.assign(merged, resolvePickerValues(ctx, merged));

  const insert = buildInsert(ctx.tableName, ctx.keys, merged, tenantId);
  run(insert.sql, insert.params);

  const bizId = String(insert.params[0]);
  for (const [key, def] of ctx.subTables) {
    const raw = data[key];
    if (Array.isArray(raw)) {
      writeSubRows(def, bizId, raw);
    }
  }
  return findById(ctx.tableName, tenantId, ctx, bizId);
}

/** 通用分页查询实现（queryGeneric） */
export function queryGeneric(formKey: string, req: BizDataQueryRequest): Record<string, unknown> {
  const tenantId = currentTenant();
  const ctx = loadContext(formKey);

  const filters = parseFilter(req.filter);
  const columnTypeOf = new Map<string, string>();
  for (const c of ctx.columns) {
    columnTypeOf.set(c.key as string, (c.columnType ?? '').toUpperCase());
  }
  const page = Math.max(req.page, 1);
  const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100);

  try {
    const count = buildCount(ctx.tableName, ctx.keys, columnTypeOf, tenantId, filters, req.keyword, req.keywordColumn);
    const select = buildSelect(
      ctx.tableName, ctx.keys, columnTypeOf, tenantId, filters,
      req.keyword, req.keywordColumn, req.sort, req.order, page - 1, size,
    );
    return execPage(page, size, count, select, (row) => toVO(ctx, row));
  } catch (e) {
    if (e instanceof IllegalArgumentError) {
      throw new BusinessException(e.message, 400);
    }
    throw e;
  }
}

/** config 模式分页查询实现（声明式 JOIN，含虚拟列） */
export function queryJoinConfig(formKey: string, req: BizDataQueryRequest, joins: JoinConfig[]): Record<string, unknown> {
  const tenantId = currentTenant();
  const ctx = loadContext(formKey);

  const columns = buildJoinColumns(ctx, joins);
  const filters = parseFilter(req.filter);
  const page = Math.max(req.page, 1);
  const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100);

  try {
    const count = joinBuildCount(ctx.tableName, tenantId, joins, columns, filters, req.keyword, req.keywordColumn);
    const select = joinBuildSelect(
      ctx.tableName, tenantId, joins, columns, filters,
      req.keyword, req.keywordColumn, req.sort, req.order, page - 1, size,
    );
    return execPage(page, size, count, select, (row) => toVO(ctx, row));
  } catch (e) {
    if (e instanceof IllegalArgumentError) {
      throw new BusinessException(e.message, 400);
    }
    throw e;
  }
}

/** sql 模式分页查询实现（管理员 SQL 模板包裹，运行时参数白名单透传） */
export function querySqlTemplate(formKey: string | null, req: BizDataQueryRequest, cfg: FormQueryConfig): Record<string, unknown> {
  if (formKey != null && !FORM_KEY_RE.test(formKey)) {
    throw new BusinessException('非法表单 key: ' + formKey, 400);
  }
  const tenantId = currentTenant();
  const columns = toQueryColumns(cfg.columns);
  const filters = parseFilter(req.filter);
  const runtimeParams = parseRuntimeParams(req.params);
  const page = Math.max(req.page, 1);
  const size = req.size <= 0 ? req.size : Math.min(Math.max(req.size, 1), 100);

  try {
    const wq = sqlTemplateWrap(
      cfg.query as string, tenantId, columns, filters, req.keyword, req.keywordColumn,
      req.sort, req.order, page, size, cfg.declaredParams, runtimeParams,
    );
    return execPage(page, size, wq.count, wq.select, (row) => toSqlVO(cfg.columns, row));
  } catch (e) {
    if (e instanceof IllegalArgumentError) {
      throw new BusinessException(e.message, 400);
    }
    throw e;
  }
}

/** 构建查询列映射：主表列（ref="m."+key，默认全可排可筛）+ 虚拟列 */
function buildJoinColumns(ctx: BizDataContext, joins: JoinConfig[]): QueryColumn[] {
  const typeOf = new Map<string, string>();
  for (const c of ctx.columns) {
    typeOf.set(c.key as string, (c.columnType ?? '').toUpperCase());
  }
  const columns: QueryColumn[] = [];
  for (const key of ctx.keys) {
    columns.push({ key, ref: 'm.' + key, columnType: typeOf.get(key) ?? '', sortable: true, filterable: true });
  }
  for (const j of joins) {
    columns.push({
      key: j.virtualKey as string,
      ref: `${j.alias}.${j.joinField}`,
      columnType: resolveJoinColumnType(j),
      sortable: j.sortable,
      filterable: j.filterable,
    });
  }
  return columns;
}

function resolveJoinColumnType(j: JoinConfig): string {
  try {
    const targetCols = getBusinessColumnsByKey(j.targetFormKey as string, currentTenant());
    for (const c of targetCols) {
      if (j.joinField === c.key) {
        return (c.columnType ?? 'VARCHAR').toUpperCase();
      }
    }
  } catch (e) {
    if (!(e instanceof BusinessException)) throw e;
  }
  return 'VARCHAR';
}

function toQueryColumns(cols: ColumnConfig[]): QueryColumn[] {
  const out: QueryColumn[] = [];
  for (const c of cols) {
    out.push({
      key: c.key as string,
      ref: c.key as string,
      columnType: (c.columnType ?? '').toUpperCase(),
      sortable: c.sortable === true,
      filterable: c.filterable === true,
    });
  }
  return out;
}

function parseFilter(filterJson: string | null): Record<string, unknown> {
  if (isBlank(filterJson)) return {};
  try {
    const map = JSON.parse(filterJson as string);
    if (map == null || typeof map !== 'object' || Array.isArray(map)) return {};
    return map as Record<string, unknown>;
  } catch (e) {
    throw new BusinessException('筛选参数 filter 格式非法，应为 JSON 对象: ' + (e instanceof Error ? e.message : String(e)), 400);
  }
}

function parseRuntimeParams(paramsJson: string | null): Record<string, unknown> {
  if (isBlank(paramsJson)) return {};
  try {
    const map = JSON.parse(paramsJson as string);
    if (map == null || typeof map !== 'object' || Array.isArray(map)) return {};
    return map as Record<string, unknown>;
  } catch (e) {
    throw new BusinessException('运行时参数 params 格式非法，应为 JSON 对象: ' + (e instanceof Error ? e.message : String(e)), 400);
  }
}

/** 查询单条业务数据；不存在抛 404 */
export function findById(tableName: string, tenantId: string, ctx: BizDataContext, id: string): Record<string, unknown> {
  const rows = all(`SELECT * FROM ${tableName} WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
  if (rows.length === 0) {
    throw new BusinessException('业务数据不存在: ' + id, 404);
  }
  return toVO(ctx, rows[0] as Row);
}

/** 通用更新实现（乐观锁） */
export function updateGeneric(formKey: string, id: string, data: Record<string, unknown>, version: number | null): Record<string, unknown> {
  const tenantId = currentTenant();
  const ctx = loadContext(formKey);

  validateRequired(ctx.columns, data);
  const currentVersion = version == null ? 1 : version;

  const merged = serializeJsonColumns(data);
  Object.assign(merged, resolvePickerValues(ctx, merged));

  const update = buildUpdate(ctx.tableName, ctx.keys, merged, tenantId, id, currentVersion);
  const affected = run(update.sql, update.params).changes;

  if (affected === 0) {
    const exists = all(`SELECT id, version FROM ${ctx.tableName} WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    if (exists.length === 0) {
      throw new BusinessException('业务数据不存在: ' + id, 404);
    }
    throw new BusinessException('数据已被他人修改，请刷新后重试', 409);
  }

  for (const [key, def] of ctx.subTables) {
    const raw = data[key];
    if (Array.isArray(raw)) {
      diffSubRows(def, id, raw);
    }
  }
  return findById(ctx.tableName, tenantId, ctx, id);
}

/** 通用删除实现（租户范围限定，级联子表） */
export function deleteGeneric(formKey: string, id: string): void {
  const tenantId = currentTenant();
  const ctx = loadContext(formKey);

  for (const def of ctx.subTables.values()) {
    run(`DELETE FROM ${def.tableName} WHERE tenant_id = ? AND biz_id = ?`, [tenantId, id]);
  }
  const del = buildDelete(ctx.tableName, tenantId, id);
  const affected = run(del.sql, del.params).changes;
  if (affected === 0) {
    throw new BusinessException('业务数据不存在: ' + id, 404);
  }
}

// ---------------------------------------------------------------- 子表读写

function requireSubTable(ctx: BizDataContext, field: string): SubTableDef {
  const def = ctx.subTables.get(field);
  if (!def) {
    throw new BusinessException('子表字段不存在: ' + field, 404);
  }
  return def;
}

function requireMainRow(ctx: BizDataContext, id: string): void {
  findById(ctx.tableName, currentTenant(), ctx, id);
}

export function listSubRows(formKey: string, id: string, field: string): Row[] {
  const ctx = loadContext(formKey);
  const def = requireSubTable(ctx, field);
  requireMainRow(ctx, id);
  return readSubRows(def, id);
}

export function addSubRow(formKey: string, id: string, field: string, data: Record<string, unknown>): Record<string, unknown> {
  const ctx = loadContext(formKey);
  const def = requireSubTable(ctx, field);
  requireMainRow(ctx, id);
  const rows = readSubRows(def, id);
  if (rows.length >= MAX_SUB_ROWS) {
    throw new BusinessException(`子表行数超限（最多 ${MAX_SUB_ROWS} 行）: ${def.tableName}`, 400);
  }
  return insertOneSubRow(def, id, data, rows.length);
}

export function updateSubRow(
  formKey: string, id: string, field: string, rowId: string,
  data: Record<string, unknown>, version: number | null,
): Record<string, unknown> {
  const ctx = loadContext(formKey);
  const def = requireSubTable(ctx, field);
  requireMainRow(ctx, id);

  const safe: Record<string, unknown> = {};
  for (const k of def.subKeys) {
    if (k in data) {
      safe[k] = data[k];
    }
  }
  if (Object.keys(safe).length === 0) {
    throw new BusinessException('更新内容不能为空: ' + field, 400);
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const [k, v] of Object.entries(safe)) {
    sets.push(`${qcol(k)} = ?`);
    params.push(v);
  }
  sets.push(`version = version + 1, updated_at = '${nowText()}'`);
  params.push(currentTenant(), id, rowId, version == null ? 1 : version);

  const affected = run(
    `UPDATE ${def.tableName} SET ${sets.join('')} WHERE tenant_id = ? AND biz_id = ? AND id = ? AND version = ?`,
    params,
  ).changes;
  if (affected === 0) {
    throw new BusinessException('子表行已被他人修改或不存在，请刷新后重试', 409);
  }
  const rows = readSubRows(def, id);
  const found = rows.find((r) => rowId === String(r['id']));
  if (!found) {
    throw new BusinessException('子表行不存在: ' + rowId, 404);
  }
  return found;
}

export function deleteSubRow(formKey: string, id: string, field: string, rowId: string): void {
  const ctx = loadContext(formKey);
  const def = requireSubTable(ctx, field);
  requireMainRow(ctx, id);
  run(`DELETE FROM ${def.tableName} WHERE tenant_id = ? AND biz_id = ? AND id = ?`, [currentTenant(), id, rowId]);
}

function readSubRows(def: SubTableDef, bizId: string): Row[] {
  return all(`SELECT * FROM ${def.tableName} WHERE tenant_id = ? AND biz_id = ? ORDER BY sort_no`, [currentTenant(), bizId]);
}

function writeSubRows(def: SubTableDef, bizId: string, rows: unknown[]): void {
  if (rows.length > MAX_SUB_ROWS) {
    throw new BusinessException(`子表行数超限（最多 ${MAX_SUB_ROWS} 行）: ${def.tableName}`, 400);
  }
  let sortNo = 0;
  for (const row of rows) {
    insertOneSubRow(def, bizId, toRowMap(row, def.tableName), sortNo);
    sortNo++;
  }
}

function diffSubRows(def: SubTableDef, bizId: string, rows: unknown[]): void {
  if (rows.length > MAX_SUB_ROWS) {
    throw new BusinessException(`子表行数超限（最多 ${MAX_SUB_ROWS} 行）: ${def.tableName}`, 400);
  }
  const existing = readSubRows(def, bizId);
  const existingById = new Map<string, Row>();
  for (const r of existing) {
    existingById.set(String(r['id']), r);
  }

  const keepIds = new Set<string>();
  let sortNo = 0;
  for (const row of rows) {
    const m = toRowMap(row, def.tableName);
    const rawId = m['id'];
    const rowId = rawId == null ? null : String(rawId);
    if (rowId != null && existingById.has(rowId)) {
      const cur = existingById.get(rowId) as Row;
      const changed = def.subKeys.some((k) => !javaEquals(cur[k], m[k]));
      if (changed || !javaEquals(cur['sort_no'], sortNo)) {
        const sets: string[] = [];
        const params: unknown[] = [];
        for (const k of def.subKeys) {
          sets.push(`${qcol(k)} = ?`);
          params.push(m[k]);
        }
        sets.push('sort_no = ?');
        params.push(sortNo);
        params.push(currentTenant(), bizId, rowId);
        run(`UPDATE ${def.tableName} SET ${sets.join('')} WHERE tenant_id = ? AND biz_id = ? AND id = ?`, params);
      }
      keepIds.add(rowId);
    } else {
      const newRow: Record<string, unknown> = { ...m };
      delete newRow['id'];
      insertOneSubRow(def, bizId, newRow, sortNo);
    }
    sortNo++;
  }

  if (existingById.size > keepIds.size) {
    const params: unknown[] = [currentTenant(), bizId];
    const ph: string[] = [];
    for (const id of existingById.keys()) {
      if (!keepIds.has(id)) {
        ph.push('?');
        params.push(id);
      }
    }
    run(`DELETE FROM ${def.tableName} WHERE tenant_id = ? AND biz_id = ? AND id IN (${ph.join(',')})`, params);
  }
}

/** Java Objects.equals 语义（number 1 === string "1" 为不等） */
function javaEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  return String(a) === String(b) && typeof a === typeof b;
}

function insertOneSubRow(def: SubTableDef, bizId: string, m: Record<string, unknown>, sortNo: number): Record<string, unknown> {
  const rowId = crypto.randomUUID().replace(/-/g, '');
  const params: unknown[] = [rowId, bizId, currentTenant(), sortNo, 1];
  const cols = ['id', 'biz_id', 'tenant_id', 'sort_no', 'version'];
  const vals = ['?', '?', '?', '?', '?'];
  for (const k of def.subKeys) {
    cols.push(k);
    vals.push('?');
    params.push(m[k]);
  }
  run(`INSERT INTO ${def.tableName} (${cols.map(qcol).join(', ')}) VALUES (${vals.join(', ')})`, params);
  const inserted: Record<string, unknown> = { ...m };
  inserted['id'] = rowId;
  inserted['sort_no'] = sortNo;
  return inserted;
}

/** 子表行必须是 JSON 对象；非法抛 400 */
function toRowMap(row: unknown, tableName: string): Record<string, unknown> {
  if (row == null || typeof row !== 'object' || Array.isArray(row)) {
    throw new BusinessException('子表行数据格式非法（需对象）: ' + tableName, 400);
  }
  return { ...(row as Record<string, unknown>) };
}

// ---------------------------------------------------------------- BizDataQueryRequest（@ModelAttribute 绑定）

export interface BizDataQueryRequest {
  filter: string | null;
  keyword: string | null;
  keywordColumn: string | null;
  sort: string | null;
  order: string | null;
  params: string | null;
  page: number;
  size: number;
}

/** @ModelAttribute BizDataQueryRequest 绑定（int 字段转换失败 → HTTP 200 + code 400，8080 实测消息） */
export function bizQueryReqOf(q: Record<string, unknown>): BizDataQueryRequest {
  return {
    filter: scalarStr(q, 'filter'),
    keyword: scalarStr(q, 'keyword'),
    keywordColumn: scalarStr(q, 'keywordColumn'),
    sort: scalarStr(q, 'sort'),
    order: scalarStr(q, 'order'),
    params: scalarStr(q, 'params'),
    page: modelInt(q, 'page', 1),
    size: modelInt(q, 'size', 20),
  };
}

function scalarStr(q: Record<string, unknown>, key: string): string | null {
  const v = q[key];
  if (v == null) return null;
  return String(Array.isArray(v) ? v[0] : v);
}

function modelInt(q: Record<string, unknown>, key: string, dflt: number): number {
  const v = q[key];
  if (v == null) return dflt;
  const s = String(Array.isArray(v) ? v[0] : v);
  if (!/^[+-]?\d+$/.test(s) || !Number.isInteger(Number(s))) {
    throw new ValidationError(
      `Failed to convert property value of type 'java.lang.String' to required type 'int' for property '${key}'; For input string: "${s}"`,
    );
  }
  return Number(s);
}

// ---------------------------------------------------------------- 路由（BizDataController 11 端点）

const SIG_CREATE =
  'public com.workflow.common.domain.R<com.workflow.api.dto.BizDataVO> com.workflow.api.controller.BizDataController.create(java.lang.String,java.util.Map<java.lang.String, java.lang.Object>)';
const SIG_UPDATE =
  'public com.workflow.common.domain.R<com.workflow.api.dto.BizDataVO> com.workflow.api.controller.BizDataController.update(java.lang.String,java.lang.String,java.util.Map<java.lang.String, java.lang.Object>)';
const SIG_ADD_SUB =
  'public com.workflow.common.domain.R<java.util.Map<java.lang.String, java.lang.Object>> com.workflow.api.controller.BizDataController.addSubRow(java.lang.String,java.lang.String,java.lang.String,java.util.Map<java.lang.String, java.lang.Object>)';
const SIG_UPDATE_SUB =
  'public com.workflow.common.domain.R<java.util.Map<java.lang.String, java.lang.Object>> com.workflow.api.controller.BizDataController.updateSubRow(java.lang.String,java.lang.String,java.lang.String,java.lang.String,java.util.Map<java.lang.String, java.lang.Object>)';

/** @RequestParam List<String> ids（逗号分隔 + 重复参数双形态） */
function strListQuery(q: Record<string, unknown>, key: string): string[] | null {
  const v = q[key];
  if (v == null) return null;
  const out: string[] = [];
  for (const piece of Array.isArray(v) ? v : [v]) {
    for (const tok of String(piece).split(',')) {
      out.push(tok);
    }
  }
  return out;
}

/** GET /api/v1/biz-data/referenced-count */
bizdataRouter.get(
  '/api/v1/biz-data/referenced-count',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    ok(res, countReferencedBy());
  }),
);

/** GET /api/v1/biz-data/{formKey}/resolve（字面量优先于 /{id}） */
bizdataRouter.get(
  '/api/v1/biz-data/:formKey/resolve',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    const formKey = req.params['formKey'] as string;
    const q = req.query as Record<string, unknown>;
    const ids = strListQuery(q, 'ids');
    if (ids == null) {
      throw new Error("Required request parameter 'ids' for method parameter type List is not present");
    }
    const displayField = scalarStr(q, 'displayField');
    ok(res, resolveByFormKey(formKey, ids, displayField));
  }),
);

/** POST /api/v1/biz-data/{formKey} */
bizdataRouter.post(
  '/api/v1/biz-data/:formKey',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    const formKey = req.params['formKey'] as string;
    const data = requireBodyWithSig(req, SIG_CREATE);
    ok(res, createGeneric(formKey, data));
  }),
);

/** GET /api/v1/biz-data/{formKey} */
bizdataRouter.get(
  '/api/v1/biz-data/:formKey',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    const formKey = req.params['formKey'] as string;
    ok(res, queryGeneric(formKey, bizQueryReqOf(req.query as Record<string, unknown>)));
  }),
);

/** GET /api/v1/biz-data/{formKey}/{id} */
bizdataRouter.get(
  '/api/v1/biz-data/:formKey/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    const ctx = loadContext(req.params['formKey'] as string);
    ok(res, findById(ctx.tableName, ctx ? (req.headers['x-tenant-id'] as string) : '', ctx, req.params['id'] as string));
  }),
);

/** PUT /api/v1/biz-data/{formKey}/{id} */
bizdataRouter.put(
  '/api/v1/biz-data/:formKey/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    const formKey = req.params['formKey'] as string;
    const id = req.params['id'] as string;
    const data = requireBodyWithSig(req, SIG_UPDATE);
    const version = data['version'] instanceof Number || typeof data['version'] === 'number' ? Number(data['version']) : null;
    ok(res, updateGeneric(formKey, id, data, version));
  }),
);

/** DELETE /api/v1/biz-data/{formKey}/{id} */
bizdataRouter.delete(
  '/api/v1/biz-data/:formKey/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    await Promise.resolve();
    deleteGeneric(req.params['formKey'] as string, req.params['id'] as string);
    ok(res);
  }),
);

/** GET /api/v1/biz-data/{formKey}/{id}/sub/{field} */
bizdataRouter.get(
  '/api/v1/biz-data/:formKey/:id/sub/:field',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    ok(
      res,
      listSubRows(req.params['formKey'] as string, req.params['id'] as string, req.params['field'] as string),
    );
  }),
);

/** POST /api/v1/biz-data/{formKey}/{id}/sub/{field} */
bizdataRouter.post(
  '/api/v1/biz-data/:formKey/:id/sub/:field',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    const data = requireBodyWithSig(req, SIG_ADD_SUB);
    ok(
      res,
      addSubRow(req.params['formKey'] as string, req.params['id'] as string, req.params['field'] as string, data),
    );
  }),
);

/** PUT /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId} */
bizdataRouter.put(
  '/api/v1/biz-data/:formKey/:id/sub/:field/:rowId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    const data = requireBodyWithSig(req, SIG_UPDATE_SUB);
    const version = data['version'] instanceof Number || typeof data['version'] === 'number' ? Number(data['version']) : null;
    ok(
      res,
      updateSubRow(
        req.params['formKey'] as string,
        req.params['id'] as string,
        req.params['field'] as string,
        req.params['rowId'] as string,
        data,
        version,
      ),
    );
  }),
);

/** DELETE /api/v1/biz-data/{formKey}/{id}/sub/{field}/{rowId} */
bizdataRouter.delete(
  '/api/v1/biz-data/:formKey/:id/sub/:field/:rowId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    setBizTenant(tenantOf(req));
    deleteSubRow(
      req.params['formKey'] as string,
      req.params['id'] as string,
      req.params['field'] as string,
      req.params['rowId'] as string,
    );
    ok(res);
  }),
);

/** @RequestBody Map 语义：缺失体 → 500（jsonBody 带方法签名） */
function requireBodyWithSig(req: AuthedRequest, javaSignature: string): Record<string, unknown> {
  const b = req.body;
  const cl = req.headers['content-length'];
  const isEmptyObject = typeof b === 'object' && b !== null && !Array.isArray(b) && Object.keys(b).length === 0;
  if (b == null || (isEmptyObject && (cl === undefined || cl === '' || cl === '0'))) {
    throw new Error(`Required request body is missing: ${javaSignature}`);
  }
  if (typeof b !== 'object' || Array.isArray(b)) {
    throw new Error('JSON parse error: Cannot deserialize instance of `java.util.Map<java.lang.String,java.lang.Object>` out of VALUE token');
  }
  return b as Record<string, unknown>;
}

// 保持 import 使用（getDb 供事务型调用方扩展；避免未用告警）
void getDb;
void requireBody;
