/**
 * form.ts — 低代码表单模块（对齐 FormDefinitionController + FormDataController）
 *
 * 端点（路径为绝对路径，主线程直接 app.use(formRouter) 即可，无需前缀）：
 *  POST   /api/v1/form-definitions                          create（@RequestParam name,key,type?,processKey?）
 *  GET    /api/v1/form-definitions                          list（page,size,status?,name?,type?）
 *  GET    /api/v1/form-definitions/by-key/{key}             getByKey（最新版本）
 *  GET    /api/v1/form-definitions/{id}                     getById（含 schema/columnConfig）
 *  PUT    /api/v1/form-definitions/{id}                     update（原地更新）
 *  DELETE /api/v1/form-definitions/{id}                     delete（软删 → ARCHIVED）
 *  POST   /api/v1/form-definitions/{id}/publish             publish（BUSINESS 触发 wf_biz_* 建表）
 *  GET    /api/v1/form-definitions/{id}/versions            getVersions
 *  GET    /api/v1/form-definitions/{id}/versions/{version}  getByVersion
 *  POST   /api/v1/form-data                                 save（upsert 当前数据）
 *  POST   /api/v1/form-data/snapshot                        saveSnapshot（不可变新记录）
 *  POST   /api/v1/form-data/draft                           saveDraft（发起页草稿）
 *  GET    /api/v1/form-data/draft/{formDefId}               getDraft
 *  DELETE /api/v1/form-data/draft/{formDefId}               clearDraft
 *  GET    /api/v1/form-data                                 getByProcessInstance（pid+formDefId 当前数据）
 *  GET    /api/v1/form-data/task/{taskId}                   getByTaskId（最新快照）
 *  GET    /api/v1/form-data/process-instance/{pid}/snapshots getSnapshots（时间倒序）
 *  GET    /api/v1/form-data/process-instance/{pid}          getByProcessInstance（全部）
 *  GET    /api/v1/form-data/{id}                            getById
 *  PUT    /api/v1/form-data/{id}                            update
 *
 * 对齐要点（2026-09-16 实测 8080 金标准）：
 *  - 分页 1-based（Spring PageRequest.of(max(page,1)-1, size)），信封 PageResponse{content,pageNumber,
 *    pageSize,totalElements,totalPages}，默认 page=1 size=20；size<1 → HTTP400 "Page size must not be less than one"；
 *    page/size 非整数 → HTTP500 Method parameter '...': Failed to convert ... 'int'
 *  - JSON key 序（Jackson 3 语义）：显式构造器参数按声明序在前，其余属性按字母序 —— 实体/DTO 各自固定顺序输出
 *  - 表单服务 RuntimeException → HTTP500（"Form definition not found: x" 等）；BusinessException → HTTP200+code400
 *  - schema/columnConfig/dataJson 原样透传字符串；时间 ISO T 分隔（秒精度）；Long→数字（本模块无 Long 列）
 *  - 列名 "key"/"schema"/"type" 小写须双引号；租户取 X-Tenant-Id（缺失 → HTTP400 Tenant ID is not set...）
 */
import { Router } from 'express';
import { getDb, all, one, run, type Row } from '../lib/db';
import { BusinessException, IllegalArgumentError, TenantNotSetError } from '../lib/errors';
import { ok, authGuard, ah, type AuthedRequest } from '../lib/http';
import { toIsoText, fmtIso } from '../lib/serialize';
import { pageResponse } from '../lib/page';

export const formRouter = Router();

// ---------------------------------------------------------------- 公共小件

const FORM_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const COLUMN_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const UNSUPPORTED_COMPONENTS = new Set(['userPicker', 'deptPicker', 'divider', 'groupContainer', 'dataTable']);
const RESERVED_COLUMNS = new Set(['id', 'tenant_id', 'version', 'created_by', 'created_at', 'updated_at']);
const SUB_RESERVED_COLUMNS = new Set(['id', 'biz_id', 'tenant_id', 'sort_no', 'version', 'created_by', 'created_at', 'updated_at']);
const ALLOWED_COLUMN_TYPES = new Set(['VARCHAR', 'TEXT', 'LONGTEXT', 'INT', 'DECIMAL', 'DATE', 'DATETIME', 'TINYINT', 'JSON']);

/** Java String null 插值语义（"null"） */
function jstr(v: unknown): string {
  return v == null ? 'null' : String(v);
}

/** 当前时间文本（LocalDateTime.now() 同族格式；库内存空格分隔） */
function nowText(): string {
  return fmtIso(new Date()).replace('T', ' ');
}

/** 读取 query 参数首个值（Express query 值可能是数组） */
function qs(req: AuthedRequest, name: string): string | null {
  const v = req.query[name];
  if (v == null) return null;
  if (Array.isArray(v)) return typeof v[0] === 'string' ? (v[0] as string) : null;
  return typeof v === 'string' ? v : null;
}

/** 租户（TenantProvider.getTenantId 对齐：缺失/空白 → TenantNotSetException） */
function tenantOf(req: AuthedRequest): string {
  const h = req.headers['x-tenant-id'];
  const v = Array.isArray(h) ? h[0] : h;
  if (v == null || String(v).trim() === '') {
    throw new TenantNotSetError('Tenant ID is not set. Ensure X-Tenant-Id header is provided.');
  }
  return String(v);
}

/**
 * int 参数绑定（对齐 Spring MVC @RequestParam int）：
 *  - 缺省：有 default 用 default，否则 500 "Required request parameter 'x' for method parameter type String is not present"
 *  - 非整数：500 "Method parameter 'x': Failed to convert value of type 'java.lang.String' to required type 'int'; For input string: \"raw\""
 */
function intParam(req: AuthedRequest, name: string, dflt?: number): number {
  const raw = qs(req, name);
  if (raw == null) {
    if (dflt !== undefined) return dflt;
    throw new Error(`Required request parameter '${name}' for method parameter type String is not present`);
  }
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(n)) {
    throw new Error(
      `Method parameter '${name}': Failed to convert value of type 'java.lang.String' to required type 'int'; For input string: "${raw}"`,
    );
  }
  return n;
}

/** 路径变量 int（Integer；非整数 → 500，type 名为 java.lang.Integer） */
function intPath(req: AuthedRequest, name: string): number {
  const raw = String(req.params[name] ?? '');
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(n)) {
    throw new Error(
      `Method parameter '${name}': Failed to convert value of type 'java.lang.String' to required type 'java.lang.Integer'; For input string: "${raw}"`,
    );
  }
  return n;
}

/** 分页参数（FormDefinitionController#list / PageDefinitionController#list 对齐） */
function pageParams(req: AuthedRequest): { page: number; size: number; offset: number } {
  const page = intParam(req, 'page', 1);
  const size = intParam(req, 'size', 20);
  if (size < 1) throw new IllegalArgumentError('Page size must not be less than one');
  const norm = Math.max(page, 1);
  return { page: norm, size, offset: (norm - 1) * size };
}

function isBlank(v: string | null | undefined): boolean {
  return v == null || v.trim() === '';
}

function parseJsonOr400(text: string | null, msg: string): unknown {
  try {
    return JSON.parse(text == null || text.trim() === '' ? '{}' : text);
  } catch {
    throw new BusinessException(msg, 400);
  }
}

// ---------------------------------------------------------------- wf_form_def 行读

interface FormDefRow {
  id: string;
  tenant_id: string;
  name: string;
  key: string;
  type: string;
  column_config: string | null;
  schema: string | null;
  version: number;
  status: string;
  process_key: string | null;
  published_version: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function asFormDef(r: Row | null | undefined): FormDefRow | null {
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
    process_key: (r['process_key'] as string | null) ?? null,
    published_version: r['published_version'] == null ? null : Number(r['published_version']),
    created_by: (r['created_by'] as string | null) ?? null,
    created_at: String(r['created_at']),
    updated_at: String(r['updated_at']),
  };
}

const FORM_DEF_COLS = `"id","tenant_id","name","key","type","column_config","schema","version","status","process_key","published_version","created_by","created_at","updated_at"`;

function formDefById(id: string, tenantId: string): FormDefRow {
  const r = asFormDef(one(`SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE "id" = ? AND tenant_id = ?`, [id, tenantId]));
  if (!r) throw new Error(`Form definition not found: ${jstr(id)}`);
  return r;
}

function formDefByKeyLatest(key: string, tenantId: string): FormDefRow {
  const r = asFormDef(
    one(`SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "key" = ? ORDER BY "version" DESC LIMIT 1`, [tenantId, key]),
  );
  if (!r) throw new Error(`Form definition not found: ${jstr(key)}`);
  return r;
}

/**
 * FormDefinition 实体 JSON（Jackson 3 序：默认构造器 → 全字母序）
 * 字母序：columnConfig, createdAt, createdBy, id, key, name, processKey, publishedVersion, schema, status, tenantId, type, updatedAt, version
 */
function formDefEntityJson(r: FormDefRow): Record<string, unknown> {
  return {
    columnConfig: r.column_config,
    createdAt: toIsoText(r.created_at),
    createdBy: r.created_by,
    id: r.id,
    key: r.key,
    name: r.name,
    processKey: r.process_key,
    publishedVersion: r.published_version,
    schema: r.schema,
    status: r.status,
    tenantId: r.tenant_id,
    type: r.type,
    updatedAt: toIsoText(r.updated_at),
    version: r.version,
  };
}

/** FormDefinitionDTO（列表；构造器参数序在前 + processKey 字母序殿后 —— 8080 实测序） */
function formDefDtoJson(r: FormDefRow): Record<string, unknown> {
  return {
    id: r.id,
    name: r.name,
    key: r.key,
    type: r.type,
    version: r.version,
    status: r.status,
    publishedVersion: r.published_version,
    createdBy: r.created_by,
    createdAt: toIsoText(r.created_at),
    updatedAt: toIsoText(r.updated_at),
    processKey: r.process_key,
  };
}

/** FormDefinitionDetailDTO（默认构造器 → 全字母序，无 tenantId） */
function formDefDetailJson(r: FormDefRow): Record<string, unknown> {
  return {
    columnConfig: r.column_config,
    createdAt: toIsoText(r.created_at),
    createdBy: r.created_by,
    id: r.id,
    key: r.key,
    name: r.name,
    processKey: r.process_key,
    publishedVersion: r.published_version,
    schema: r.schema,
    status: r.status,
    type: r.type,
    updatedAt: toIsoText(r.updated_at),
    version: r.version,
  };
}

/** FormVersionDTO（构造器参数序：id, version, status, createdBy, createdAt —— 8080 实测序） */
function formVersionJson(r: FormDefRow): Record<string, unknown> {
  return {
    id: r.id,
    version: r.version,
    status: r.status,
    createdBy: r.created_by,
    createdAt: toIsoText(r.created_at),
  };
}

// ---------------------------------------------------------------- BUSINESS 发布校验（FormDefinitionService 移植）

interface ColumnConfig {
  key: string | null;
  columnType: string | null;
  length: number | null;
  scale: number | null;
  required: boolean;
  unique: boolean;
  indexed: boolean;
  hidden: boolean;
  storageMode: string;
  componentType: string | null;
  subColumns: ColumnConfig[] | null;
}

function colCfg(v: Record<string, unknown>): ColumnConfig {
  const sub = v['subColumns'];
  return {
    key: v['key'] == null ? null : String(v['key']),
    columnType: v['columnType'] == null ? null : String(v['columnType']),
    length: v['length'] == null ? null : Number(v['length']),
    scale: v['scale'] == null ? null : Number(v['scale']),
    required: v['required'] === true,
    unique: v['unique'] === true,
    indexed: v['indexed'] === true,
    hidden: v['hidden'] === true,
    storageMode: v['storageMode'] == null ? 'JSON' : String(v['storageMode']),
    componentType: v['componentType'] == null ? null : String(v['componentType']),
    subColumns: Array.isArray(sub) ? sub.map((s) => colCfg(s as Record<string, unknown>)) : null,
  };
}

/** FormDefinitionService.parseColumnConfig（错误消息逐字对齐） */
function parseColumnConfig(columnConfig: string | null): ColumnConfig[] {
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

/** FormDefinitionService.validateBusinessSchema */
function validateBusinessSchema(schema: string | null): void {
  const root = parseJsonOr400(schema, '表单 schema 解析失败');
  const rule = Array.isArray(root) ? root : (root as Record<string, unknown>)['rule'];
  if (!Array.isArray(rule)) {
    throw new BusinessException('表单 schema 格式非法', 400);
  }
  for (const field of rule) {
    const type = (field as Record<string, unknown>)['type'];
    const t = type == null ? '' : String(type);
    if (UNSUPPORTED_COMPONENTS.has(t)) {
      throw new BusinessException(`业务表单暂不支持组件（${t}），请移除后发布`, 400);
    }
  }
}

/** FormDefinitionService.collectExternalDisplayFields */
function collectExternalDisplayFields(schema: string | null): Set<string> {
  const fields = new Set<string>();
  const root = parseJsonOr400(schema, '表单 schema 解析失败');
  const rule = Array.isArray(root) ? root : (root as Record<string, unknown>)['rule'];
  collectExternalDisplayFieldsWalk(rule, fields);
  return fields;
}

function collectExternalDisplayFieldsWalk(rules: unknown, fields: Set<string>): void {
  if (!Array.isArray(rules)) return;
  for (const field of rules) {
    const f = (field ?? {}) as Record<string, unknown>;
    if (f['type'] === 'page-list-cards') {
      const key = f['field'];
      if (key != null && String(key).trim() !== '') fields.add(String(key));
      continue;
    }
    const props = (f['props'] ?? {}) as Record<string, unknown>;
    collectExternalDisplayFieldsWalk(f['children'], fields);
    collectExternalDisplayFieldsWalk(props['rule'], fields);
    if (Array.isArray(props['columns'])) {
      for (const column of props['columns']) {
        const col = (column ?? {}) as Record<string, unknown>;
        collectExternalDisplayFieldsWalk(col['rule'], fields);
      }
    }
  }
}

/** FormDefinitionService.getBusinessColumnsByKey */
function getBusinessColumnsByKey(key: string, tenantId: string): ColumnConfig[] {
  const r = asFormDef(
    one(`SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' ORDER BY "version" DESC LIMIT 1`, [tenantId, key]),
  );
  if (!r) throw new BusinessException(`业务表单不存在或未发布: ${key}`, 404);
  if (r.type !== 'BUSINESS') {
    throw new BusinessException(`表单 ${key} 不是业务表单`, 400);
  }
  return parseColumnConfig(r.column_config);
}

/** FormDefinitionService.validatePickerReferences */
function validatePickerReferences(schema: string | null, tenantId: string): void {
  const root = parseJsonOr400(schema, '表单 schema 解析失败');
  const rule = Array.isArray(root) ? root : (root as Record<string, unknown>)['rule'];
  if (!Array.isArray(rule)) return;
  for (const field of rule) {
    const f = (field ?? {}) as Record<string, unknown>;
    if (f['type'] !== 'dataPicker') continue;
    const fieldKey = f['field'] == null ? '' : String(f['field']);
    const props = (f['props'] ?? {}) as Record<string, unknown>;
    const dataSourceId = props['dataSourceId'] == null ? '' : String(props['dataSourceId']);
    const sourceFormKey = props['sourceFormKey'] == null ? '' : String(props['sourceFormKey']);
    if (dataSourceId.trim() === '' && sourceFormKey.trim() === '') {
      throw new BusinessException(`data-picker 字段 ${fieldKey} 未配置数据源（dataSourceId）`, 400);
    }
    if (dataSourceId.trim() !== '') continue;
    let targetColumns: ColumnConfig[];
    try {
      targetColumns = getBusinessColumnsByKey(sourceFormKey, tenantId);
    } catch (e) {
      if (e instanceof BusinessException) {
        throw new BusinessException(`data-picker 目标表单不存在或未发布: ${sourceFormKey}`, 400);
      }
      throw e;
    }
    const targetKeys = new Set(targetColumns.map((c) => c.key).filter((k): k is string => k != null));
    const displayField = props['displayField'] == null ? '' : String(props['displayField']);
    if (displayField.trim() === '') {
      throw new BusinessException(`data-picker 字段 ${fieldKey} 未配置显示字段`, 400);
    }
    if (!targetKeys.has(displayField)) {
      throw new BusinessException(`data-picker 引用列已不存在: ${displayField}`, 400);
    }
    if (Array.isArray(props['columns'])) {
      for (const col of props['columns']) {
        const c = col == null ? '' : String(col);
        if (c.trim() !== '' && !targetKeys.has(c)) {
          throw new BusinessException(`data-picker 引用列已不存在: ${c}`, 400);
        }
      }
    }
    const dependOn = (props['dependOn'] ?? {}) as Record<string, unknown>;
    const sourceColumn = dependOn['sourceColumn'] == null ? '' : String(dependOn['sourceColumn']);
    if (sourceColumn.trim() !== '' && !targetKeys.has(sourceColumn)) {
      throw new BusinessException(`data-picker 级联引用列已不存在: ${sourceColumn}`, 400);
    }
    const hiddenKeys = new Set(targetColumns.filter((c) => c.hidden).map((c) => c.key).filter((k): k is string => k != null));
    if (Array.isArray(props['filters'])) {
      for (const filter of props['filters']) {
        const fCol = ((filter ?? {}) as Record<string, unknown>)['column'];
        const col = fCol == null ? '' : String(fCol);
        if (col.trim() === '') continue;
        if (!targetKeys.has(col)) {
          throw new BusinessException(`data-picker 过滤条件引用列已不存在: ${col}`, 400);
        }
        if (hiddenKeys.has(col)) {
          throw new BusinessException(`data-picker 过滤条件不能引用隐藏列: ${col}`, 400);
        }
      }
    }
  }
}

// ---------------------------------------------------------------- 动态表管理（DynamicTableManager + DdlBuilder SQLite 移植）

function validateFormKey(formKey: string | null): void {
  if (formKey == null || !FORM_KEY_RE.test(formKey)) {
    throw new IllegalArgumentError(`非法表单 key（仅允许字母开头，含字母/数字/下划线，最长 64）: ${jstr(formKey)}`);
  }
}

function validateSubField(field: string | null): void {
  if (field == null || !COLUMN_KEY_RE.test(field)) {
    throw new IllegalArgumentError(`非法子表字段名（仅允许字母开头，含字母/数字/下划线，最长 64）: ${jstr(field)}`);
  }
}

/** DdlBuilder.validateColumns（IllegalArgumentException → HTTP400） */
function ddlValidateColumns(columns: ColumnConfig[]): void {
  for (const c of columns) {
    if (c.key == null || !COLUMN_KEY_RE.test(c.key)) {
      throw new IllegalArgumentError(`非法列名（仅允许字母开头，含字母/数字/下划线，最长 64）: ${jstr(c.key)}`);
    }
    if (c.subColumns != null && c.subColumns.length > 0) {
      for (const sub of c.subColumns) {
        if (sub.key != null && SUB_RESERVED_COLUMNS.has(sub.key)) {
          throw new IllegalArgumentError(`子表列名 ${sub.key} 为系统保留列，不允许作为业务列`);
        }
      }
      continue;
    }
    if (c.key != null && RESERVED_COLUMNS.has(c.key)) {
      throw new IllegalArgumentError(`列名 ${c.key} 为系统保留列，不允许作为业务列`);
    }
    if (c.columnType == null || !ALLOWED_COLUMN_TYPES.has(c.columnType)) {
      throw new IllegalArgumentError(`非法列类型: ${jstr(c.columnType)}`);
    }
    if (c.columnType === 'VARCHAR') {
      const len = c.length == null ? 255 : c.length;
      if (len < 1 || len > 255) {
        throw new IllegalArgumentError(`VARCHAR 长度必须在 1~255 之间: ${c.key}`);
      }
    }
    if (c.columnType === 'DECIMAL') {
      const len = c.length == null ? 18 : c.length;
      const scale = c.scale == null ? 0 : c.scale;
      if (len < 1 || len > 30 || scale < 0 || scale > len) {
        throw new IllegalArgumentError(`DECIMAL 长度/精度非法: ${c.key}`);
      }
    }
  }
}

/** ColumnTypeMapper 简化映射：Java 声明类型 → SQLite 列类型 */
function sqliteType(c: ColumnConfig): string {
  switch (c.columnType) {
    case 'VARCHAR':
      return `VARCHAR(${c.length == null ? 255 : c.length})`;
    case 'TEXT':
    case 'LONGTEXT':
      return 'TEXT';
    case 'INT':
      return 'INT';
    case 'DECIMAL':
      return `DECIMAL(${c.length == null ? 18 : c.length},${c.scale == null ? 0 : c.scale})`;
    case 'DATE':
      return 'DATE';
    case 'DATETIME':
      return 'DATETIME';
    case 'TINYINT':
      return 'TINYINT(1)';
    case 'JSON':
      return 'JSON';
    default:
      throw new IllegalArgumentError(`非法列类型: ${jstr(c.columnType)}`);
  }
}

function isSubtableField(c: ColumnConfig): boolean {
  return c.subColumns != null && c.subColumns.length > 0;
}

function tableExists(table: string): boolean {
  const r = one(`SELECT COUNT(1) AS C FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]);
  return Number(r?.['C'] ?? 0) > 0;
}

/**
 * ensureTable（SQLite 版）：
 * 表不存在 → 建表（固定列 id/tenant_id/version/created_by/created_at/updated_at + 业务列 + 唯一/普通索引）；
 * 已存在 → 仅补缺失列（ADD COLUMN）与缺失索引（跨类变更/缩宽校验依赖 information_schema 的部分不适用于
 * SQLite 声明式类型，此处为已文档化的简化：列存在即跳过，不做 MODIFY 比较）。
 */
function ensureTable(formKey: string, columns: ColumnConfig[]): void {
  validateFormKey(formKey);
  ddlValidateColumns(columns);
  const table = `wf_biz_${formKey}`;

  if (!tableExists(table)) {
    const defs = ['id VARCHAR(64) NOT NULL PRIMARY KEY', 'tenant_id VARCHAR(64) NOT NULL'];
    for (const c of columns) {
      if (isSubtableField(c)) continue;
      defs.push(`"${c.key}" ${sqliteType(c)}${c.required ? ' NOT NULL' : ''}`);
    }
    defs.push('version INT NOT NULL DEFAULT 1', 'created_by VARCHAR(50)', 'created_at DATETIME', 'updated_at DATETIME');
    run(`CREATE TABLE IF NOT EXISTS ${table} (${defs.join(', ')})`);
    for (const c of columns) {
      if (isSubtableField(c)) continue;
      if (c.unique) run(`CREATE UNIQUE INDEX IF NOT EXISTS uk_${formKey}_${c.key} ON ${table} (tenant_id, "${c.key}")`);
      if (c.indexed) run(`CREATE INDEX IF NOT EXISTS idx_${formKey}_${c.key} ON ${table} ("${c.key}")`);
    }
    return;
  }

  const existing = new Set(all(`PRAGMA table_info(${table})`).map((r) => String(r['name'])));
  for (const c of columns) {
    if (isSubtableField(c)) continue;
    if (!existing.has(c.key as string)) {
      // ALTER ADD COLUMN 带 NOT NULL 需默认值；Java H2 同样受此限制，SQLite 端按可空处理
      run(`ALTER TABLE ${table} ADD COLUMN "${c.key}" ${sqliteType(c)}`);
    }
    if (c.unique) run(`CREATE UNIQUE INDEX IF NOT EXISTS uk_${formKey}_${c.key} ON ${table} (tenant_id, "${c.key}")`);
    if (c.indexed) run(`CREATE INDEX IF NOT EXISTS idx_${formKey}_${c.key} ON ${table} ("${c.key}")`);
  }
}

function ensureSubTable(formKey: string, field: string, subColumns: ColumnConfig[]): void {
  validateFormKey(formKey);
  validateSubField(field);
  ddlValidateColumns(subColumns);
  const table = `wf_biz_${formKey}_${field}`;

  if (!tableExists(table)) {
    const defs = ['id VARCHAR(64) NOT NULL PRIMARY KEY', 'biz_id VARCHAR(64) NOT NULL', 'tenant_id VARCHAR(64) NOT NULL'];
    for (const c of subColumns) {
      defs.push(`"${c.key}" ${sqliteType(c)}${c.required ? ' NOT NULL' : ''}`);
    }
    defs.push('sort_no INT NOT NULL DEFAULT 0', 'version INT NOT NULL DEFAULT 1', 'created_by VARCHAR(50)', 'created_at DATETIME', 'updated_at DATETIME');
    run(`CREATE TABLE IF NOT EXISTS ${table} (${defs.join(', ')})`);
    run(`CREATE INDEX IF NOT EXISTS idx_${formKey}_${field}_biz ON ${table} (tenant_id, biz_id)`);
    for (const c of subColumns) {
      if (c.unique) run(`CREATE UNIQUE INDEX IF NOT EXISTS uk_${formKey}_${field}_${c.key} ON ${table} (tenant_id, biz_id, "${c.key}")`);
      if (c.indexed) run(`CREATE INDEX IF NOT EXISTS idx_${formKey}_${field}_${c.key} ON ${table} ("${c.key}")`);
    }
    return;
  }

  const existing = new Set(all(`PRAGMA table_info(${table})`).map((r) => String(r['name'])));
  for (const c of subColumns) {
    if (!existing.has(c.key as string)) {
      run(`ALTER TABLE ${table} ADD COLUMN "${c.key}" ${sqliteType(c)}`);
    }
  }
}

// ---------------------------------------------------------------- 表单定义路由

/** POST /api/v1/form-definitions */
formRouter.post(
  '/api/v1/form-definitions',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    // @RequestParam 必填参数缺失 → 500（Spring MissingServletRequestParameter 语义）
    const name = qs(req, 'name');
    const key = qs(req, 'key');
    if (name == null) throw new Error("Required request parameter 'name' for method parameter type String is not present");
    if (key == null) throw new Error("Required request parameter 'key' for method parameter type String is not present");
    const type = qs(req, 'type');
    const processKey = qs(req, 'processKey');

    const now = nowText();
    const id = crypto.randomUUID().replace(/-/g, '');
    const tx = getDb().transaction(() => {
      const exists = one(`SELECT 1 AS X FROM wf_form_def WHERE tenant_id = ? AND "key" = ?`, [tenantId, key]);
      if (exists) throw new Error(`Form key already exists: ${key}`);
      run(
        `INSERT INTO wf_form_def (${FORM_DEF_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, name, key, isBlank(type) ? 'WORKFLOW' : type, null, '[]', 1, 'DRAFT', processKey, null, null, now, now],
      );
    });
    tx();
    ok(res, formDefEntityJson(formDefById(id, tenantId)));
  }),
);

/** GET /api/v1/form-definitions —— list（1-based 分页，PageResponse 信封） */
formRouter.get(
  '/api/v1/form-definitions',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const { page, size, offset } = pageParams(req);
    const status = qs(req, 'status');
    const name = qs(req, 'name');
    const type = qs(req, 'type');
    const hasType = !isBlank(type);
    const hasName = !isBlank(name);
    const hasStatus = !isBlank(status);

    let where = 'WHERE tenant_id = ?';
    const params: unknown[] = [tenantId];
    if (hasType) {
      where += ` AND "type" = ?`;
      params.push(type);
      if (hasName) {
        where += ` AND "name" LIKE ?`;
        params.push(`%${name}%`);
      } else if (hasStatus) {
        where += ` AND status = ?`;
        params.push(status);
      }
    } else if (hasName) {
      where += ` AND "name" LIKE ?`;
      params.push(`%${name}%`);
    } else if (hasStatus) {
      where += ` AND status = ?`;
      params.push(status);
    }

    const totalRow = one(`SELECT COUNT(1) AS C FROM wf_form_def ${where}`, params);
    const total = Number(totalRow?.['C'] ?? 0);
    const rows = all(
      `SELECT ${FORM_DEF_COLS} FROM wf_form_def ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ).map(asFormDef) as FormDefRow[];
    ok(res, pageResponse(rows.map(formDefDtoJson), page, size, total));
  }),
);

/** GET /api/v1/form-definitions/by-key/{key} —— 须先于 /{id} 注册 */
formRouter.get(
  '/api/v1/form-definitions/by-key/:key',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const r = formDefByKeyLatest(req.params['key'] as string, tenantId);
    ok(res, formDefDetailJson(r));
  }),
);

/** GET /api/v1/form-definitions/{id} */
formRouter.get(
  '/api/v1/form-definitions/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    ok(res, formDefDetailJson(formDefById(req.params['id'] as string, tenantId)));
  }),
);

/** PUT /api/v1/form-definitions/{id} —— 原地更新（null 字段不更新） */
formRouter.put(
  '/api/v1/form-definitions/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = req.params['id'] as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = body['name'] == null ? null : String(body['name']);
    const key = body['key'] == null ? null : String(body['key']);
    const schema = body['schema'] == null ? null : String(body['schema']);
    const columnConfig = body['columnConfig'] == null ? null : String(body['columnConfig']);
    const processKey = body['processKey'] == null ? null : String(body['processKey']);

    const tx = getDb().transaction(() => {
      formDefById(id, tenantId);
      const sets: string[] = ['updated_at = ?'];
      const params: unknown[] = [nowText()];
      if (name != null) { sets.push('"name" = ?'); params.push(name); }
      if (key != null) { sets.push('"key" = ?'); params.push(key); }
      if (schema != null) { sets.push('"schema" = ?'); params.push(schema); }
      if (columnConfig != null) { sets.push('"column_config" = ?'); params.push(columnConfig); }
      if (processKey != null) { sets.push('"process_key" = ?'); params.push(processKey); }
      params.push(id, tenantId);
      run(`UPDATE wf_form_def SET ${sets.join(', ')} WHERE "id" = ? AND tenant_id = ?`, params);
    });
    tx();
    ok(res, formDefEntityJson(formDefById(id, tenantId)));
  }),
);

/** DELETE /api/v1/form-definitions/{id} —— 软删除（PUBLISHED 拒绝） */
formRouter.delete(
  '/api/v1/form-definitions/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = req.params['id'] as string;
    const tx = getDb().transaction(() => {
      const r = formDefById(id, tenantId);
      if (r.status === 'PUBLISHED') {
        throw new BusinessException('已发布的表单不能删除', 400);
      }
      run(`UPDATE wf_form_def SET status = 'ARCHIVED', updated_at = ? WHERE "id" = ? AND tenant_id = ?`, [nowText(), id, tenantId]);
    });
    tx();
    ok(res);
  }),
);

/** POST /api/v1/form-definitions/{id}/publish */
formRouter.post(
  '/api/v1/form-definitions/:id/publish',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = req.params['id'] as string;
    const tx = getDb().transaction(() => {
      const draft = formDefById(id, tenantId);
      const republish = draft.status === 'PUBLISHED';
      if (draft.status !== 'DRAFT' && !republish) {
        throw new BusinessException(`仅草稿或已发布表单可发布，当前状态: ${draft.status}`, 400);
      }

      // 同 key 最新 PUBLISHED（republish 时排除自身）
      const lastPublished = republish
        ? asFormDef(
            one(
              `SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' AND "id" != ? ORDER BY "version" DESC LIMIT 1`,
              [tenantId, draft.key, draft.id],
            ),
          )
        : asFormDef(
            one(
              `SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' ORDER BY "version" DESC LIMIT 1`,
              [tenantId, draft.key],
            ),
          );
      if (lastPublished && lastPublished.schema === draft.schema) {
        throw new BusinessException('表单内容未变化，无需发布', 400);
      }

      // 业务表单：schema/引用校验 + 受控 DDL
      if (draft.type === 'BUSINESS') {
        validateBusinessSchema(draft.schema);
        validatePickerReferences(draft.schema, tenantId);
        const externalDisplayFields = collectExternalDisplayFields(draft.schema);
        const columns = parseColumnConfig(draft.column_config)
          .filter((c) => c.componentType !== 'page-list-cards')
          .filter((c) => c.key == null || !externalDisplayFields.has(c.key));
        if (columns.length > 0) {
          ensureTable(draft.key, columns);
        }
        for (const c of columns) {
          if (c.subColumns != null && c.subColumns.length > 0) {
            ensureSubTable(draft.key, c.key as string, c.subColumns);
          }
        }
      }

      if (lastPublished) {
        run(`UPDATE wf_form_def SET status = 'ARCHIVED', updated_at = ? WHERE "id" = ?`, [nowText(), lastPublished.id]);
      }
      run(`UPDATE wf_form_def SET status = 'PUBLISHED', published_version = ?, updated_at = ? WHERE "id" = ?`, [
        draft.version,
        nowText(),
        draft.id,
      ]);
    });
    tx();
    ok(res, formDefEntityJson(formDefById(id, tenantId)));
  }),
);

/** GET /api/v1/form-definitions/{id}/versions */
formRouter.get(
  '/api/v1/form-definitions/:id/versions',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const r = formDefById(req.params['id'] as string, tenantId);
    const versions = all(
      `SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "key" = ? ORDER BY "version" DESC`,
      [tenantId, r.key],
    ).map(asFormDef) as FormDefRow[];
    ok(res, versions.map(formVersionJson));
  }),
);

/** GET /api/v1/form-definitions/{id}/versions/{version} */
formRouter.get(
  '/api/v1/form-definitions/:id/versions/:version',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const version = intPath(req, 'version');
    const r = formDefById(req.params['id'] as string, tenantId);
    const found = asFormDef(
      one(`SELECT ${FORM_DEF_COLS} FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND "version" = ?`, [tenantId, r.key, version]),
    );
    if (!found) throw new Error(`Form version not found: ${r.key} v${version}`);
    ok(res, formDefDetailJson(found));
  }),
);

// ---------------------------------------------------------------- 表单数据行读

interface FormDataRow {
  id: string;
  tenant_id: string;
  form_def_id: string;
  form_version: number;
  process_instance_id: string | null;
  task_id: string | null;
  data_json: string | null;
  is_snapshot: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const FORM_DATA_COLS = `"id","tenant_id","form_def_id","form_version","process_instance_id","task_id","data_json","is_snapshot","created_by","created_at","updated_at"`;

function asFormData(r: Row | null | undefined): FormDataRow | null {
  if (!r) return null;
  return {
    id: String(r['id']),
    tenant_id: String(r['tenant_id']),
    form_def_id: String(r['form_def_id']),
    form_version: Number(r['form_version']),
    process_instance_id: (r['process_instance_id'] as string | null) ?? null,
    task_id: (r['task_id'] as string | null) ?? null,
    data_json: (r['data_json'] as string | null) ?? null,
    is_snapshot: Number(r['is_snapshot'] ?? 0),
    created_by: (r['created_by'] as string | null) ?? null,
    created_at: String(r['created_at']),
    updated_at: String(r['updated_at']),
  };
}

/** FormData 实体 JSON（默认构造器 → 全字母序，含 tenantId） */
function formDataEntityJson(r: FormDataRow): Record<string, unknown> {
  return {
    createdAt: toIsoText(r.created_at),
    createdBy: r.created_by,
    dataJson: r.data_json,
    formDefId: r.form_def_id,
    formVersion: r.form_version,
    id: r.id,
    isSnapshot: r.is_snapshot === 1,
    processInstanceId: r.process_instance_id,
    taskId: r.task_id,
    tenantId: r.tenant_id,
    updatedAt: toIsoText(r.updated_at),
  };
}

/** FormDataDTO（默认构造器 → 全字母序，无 tenantId） */
function formDataDtoJson(r: FormDataRow): Record<string, unknown> {
  return {
    createdAt: toIsoText(r.created_at),
    createdBy: r.created_by,
    dataJson: r.data_json,
    formDefId: r.form_def_id,
    formVersion: r.form_version,
    id: r.id,
    isSnapshot: r.is_snapshot === 1,
    processInstanceId: r.process_instance_id,
    taskId: r.task_id,
    updatedAt: toIsoText(r.updated_at),
  };
}

function formDataById(id: string, tenantId: string): FormDataRow {
  const r = asFormData(one(`SELECT ${FORM_DATA_COLS} FROM wf_form_data WHERE "id" = ? AND tenant_id = ?`, [id, tenantId]));
  if (!r) throw new Error(`Form data not found: ${jstr(id)}`);
  return r;
}

/** FormDataSaveRequest{formDefId, processInstanceId?, taskId?, dataJson}（body 缺省按 {}，缺失字段为 null） */
function readSaveRequest(req: AuthedRequest): {
  formDefId: string | null;
  processInstanceId: string | null;
  taskId: string | null;
  dataJson: string | null;
} {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    formDefId: body['formDefId'] == null ? null : String(body['formDefId']),
    processInstanceId: body['processInstanceId'] == null ? null : String(body['processInstanceId']),
    taskId: body['taskId'] == null ? null : String(body['taskId']),
    dataJson: body['dataJson'] == null ? null : String(body['dataJson']),
  };
}

function requireFormDef(formDefId: string | null, tenantId: string): { id: string; version: number } {
  const r = one(`SELECT "id","version" FROM wf_form_def WHERE "id" = ? AND tenant_id = ?`, [formDefId, tenantId]);
  if (!r) throw new Error(`Form definition not found: ${jstr(formDefId)}`);
  return { id: String(r['id']), version: Number(r['version']) };
}

// ---------------------------------------------------------------- 表单数据路由

/** POST /api/v1/form-data —— save（upsert 当前数据） */
formRouter.post(
  '/api/v1/form-data',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const body = readSaveRequest(req);
    const now = nowText();
    let resultId = '';
    const tx = getDb().transaction(() => {
      const def = requireFormDef(body.formDefId, tenantId);
      // 与 Hibernate 一致：process_instance_id = NULL 比较永不命中（null 参数不匹配任何行）
      const existing = asFormData(
        one(
          `SELECT ${FORM_DATA_COLS} FROM wf_form_data WHERE tenant_id = ? AND process_instance_id = ? AND form_def_id = ? AND is_snapshot = 0`,
          [tenantId, body.processInstanceId, body.formDefId],
        ),
      );
      if (existing) {
        run(
          `UPDATE wf_form_data SET data_json = ?, task_id = ?, form_version = ?, updated_at = ? WHERE "id" = ?`,
          [body.dataJson, body.taskId, def.version, now, existing.id],
        );
        resultId = existing.id;
      } else {
        resultId = crypto.randomUUID().replace(/-/g, '');
        run(
          `INSERT INTO wf_form_data (${FORM_DATA_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [resultId, tenantId, def.id, def.version, body.processInstanceId, body.taskId, body.dataJson, 0, null, now, now],
        );
      }
    });
    tx();
    ok(res, formDataEntityJson(formDataById(resultId, tenantId)));
  }),
);

/** POST /api/v1/form-data/snapshot —— 不可变快照 */
formRouter.post(
  '/api/v1/form-data/snapshot',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const body = readSaveRequest(req);
    const now = nowText();
    let resultId = '';
    const tx = getDb().transaction(() => {
      const def = requireFormDef(body.formDefId, tenantId);
      resultId = crypto.randomUUID().replace(/-/g, '');
      run(
        `INSERT INTO wf_form_data (${FORM_DATA_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [resultId, tenantId, def.id, def.version, body.processInstanceId, body.taskId, body.dataJson, 1, null, now, now],
      );
    });
    tx();
    ok(res, formDataEntityJson(formDataById(resultId, tenantId)));
  }),
);

/** POST /api/v1/form-data/draft —— 发起页草稿（processInstanceId IS NULL） */
formRouter.post(
  '/api/v1/form-data/draft',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const body = readSaveRequest(req);
    const now = nowText();
    let resultId = '';
    const tx = getDb().transaction(() => {
      const def = requireFormDef(body.formDefId, tenantId);
      const existing = asFormData(
        one(
          `SELECT ${FORM_DATA_COLS} FROM wf_form_data WHERE tenant_id = ? AND form_def_id = ? AND process_instance_id IS NULL AND is_snapshot = 0`,
          [tenantId, body.formDefId],
        ),
      );
      if (existing) {
        run(`UPDATE wf_form_data SET data_json = ?, form_version = ?, updated_at = ? WHERE "id" = ?`, [
          body.dataJson,
          def.version,
          now,
          existing.id,
        ]);
        resultId = existing.id;
      } else {
        resultId = crypto.randomUUID().replace(/-/g, '');
        run(
          `INSERT INTO wf_form_data (${FORM_DATA_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [resultId, tenantId, def.id, def.version, null, null, body.dataJson, 0, null, now, now],
        );
      }
    });
    tx();
    ok(res, formDataEntityJson(formDataById(resultId, tenantId)));
  }),
);

/** GET /api/v1/form-data/draft/{formDefId} */
formRouter.get(
  '/api/v1/form-data/draft/:formDefId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const r = asFormData(
      one(
        `SELECT ${FORM_DATA_COLS} FROM wf_form_data WHERE tenant_id = ? AND form_def_id = ? AND process_instance_id IS NULL AND is_snapshot = 0`,
        [tenantId, req.params['formDefId']],
      ),
    );
    ok(res, r ? formDataDtoJson(r) : null);
  }),
);

/** DELETE /api/v1/form-data/draft/{formDefId} */
formRouter.delete(
  '/api/v1/form-data/draft/:formDefId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const tx = getDb().transaction(() => {
      const r = asFormData(
        one(
          `SELECT "id" FROM wf_form_data WHERE tenant_id = ? AND form_def_id = ? AND process_instance_id IS NULL AND is_snapshot = 0`,
          [tenantId, req.params['formDefId']],
        ),
      );
      if (r) run(`DELETE FROM wf_form_data WHERE "id" = ?`, [r.id]);
    });
    tx();
    ok(res);
  }),
);

/** GET /api/v1/form-data —— 按 pid+formDefId 查当前数据 */
formRouter.get(
  '/api/v1/form-data',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const pid = qs(req, 'processInstanceId');
    if (pid == null) throw new Error("Required request parameter 'processInstanceId' for method parameter type String is not present");
    const formDefId = qs(req, 'formDefId');
    if (formDefId == null) throw new Error("Required request parameter 'formDefId' for method parameter type String is not present");
    const r = asFormData(
      one(
        `SELECT ${FORM_DATA_COLS} FROM wf_form_data WHERE tenant_id = ? AND process_instance_id = ? AND form_def_id = ? AND is_snapshot = 0`,
        [tenantId, pid, formDefId],
      ),
    );
    ok(res, r ? formDataDtoJson(r) : null);
  }),
);

/** GET /api/v1/form-data/task/{taskId} —— 最新审批快照 */
formRouter.get(
  '/api/v1/form-data/task/:taskId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const r = asFormData(
      one(
        `SELECT ${FORM_DATA_COLS} FROM wf_form_data WHERE tenant_id = ? AND task_id = ? AND is_snapshot = 1 ORDER BY created_at DESC LIMIT 1`,
        [tenantId, req.params['taskId']],
      ),
    );
    ok(res, r ? formDataDtoJson(r) : null);
  }),
);

/** GET /api/v1/form-data/process-instance/{pid}/snapshots —— 快照列表（时间倒序） */
formRouter.get(
  '/api/v1/form-data/process-instance/:pid/snapshots',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const rows = all(
      `SELECT ${FORM_DATA_COLS} FROM wf_form_data WHERE tenant_id = ? AND process_instance_id = ? AND is_snapshot = 1 ORDER BY created_at DESC`,
      [tenantId, req.params['pid']],
    ).map(asFormData) as FormDataRow[];
    ok(res, rows.map(formDataDtoJson));
  }),
);

/** GET /api/v1/form-data/process-instance/{pid} —— 全部表单数据 */
formRouter.get(
  '/api/v1/form-data/process-instance/:pid',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const rows = all(
      `SELECT ${FORM_DATA_COLS} FROM wf_form_data WHERE tenant_id = ? AND process_instance_id = ?`,
      [tenantId, req.params['pid']],
    ).map(asFormData) as FormDataRow[];
    ok(res, rows.map(formDataDtoJson));
  }),
);

/** GET /api/v1/form-data/{id} —— 单条（须后于前缀字面量路由注册） */
formRouter.get(
  '/api/v1/form-data/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    ok(res, formDataDtoJson(formDataById(req.params['id'] as string, tenantId)));
  }),
);

/** PUT /api/v1/form-data/{id} —— 更新 dataJson */
formRouter.put(
  '/api/v1/form-data/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = req.params['id'] as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const dataJson = body['dataJson'] == null ? null : String(body['dataJson']);
    const tx = getDb().transaction(() => {
      formDataById(id, tenantId);
      run(`UPDATE wf_form_data SET data_json = ?, updated_at = ? WHERE "id" = ? AND tenant_id = ?`, [dataJson, nowText(), id, tenantId]);
    });
    tx();
    ok(res, formDataEntityJson(formDataById(id, tenantId)));
  }),
);
