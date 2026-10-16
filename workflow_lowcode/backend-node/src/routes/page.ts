/**
 * page.ts — 低代码页面模块（对齐 PageDefinitionController + PageQueryController + PageMenuController）
 *
 * 端点（路径为绝对路径，主线程直接 app.use(pageRouter) 即可，无需前缀）：
 *  POST   /api/v1/pages                                  create（body PageDefinitionSaveRequest）
 *  GET    /api/v1/pages                                  list（page,size,status?,name?,type?）
 *  GET    /api/v1/pages/{id}                             getById（含 schema）
 *  GET    /api/v1/pages/{key}/definition                 getByKey（preview=false 走 PageAccessGuard + 已发布；preview=true 取最新）
 *  PUT    /api/v1/pages/{id}                             update
 *  DELETE /api/v1/pages/{id}                             delete（软删，PUBLISHED 拒绝）
 *  POST   /api/v1/pages/{id}/publish                     publish（PAGE 走基础校验）
 *  POST   /api/v1/pages/{id}/mount-menu                  mountMenu（仅 PUBLISHED；admin 自动授权 ROLE_ADMIN）
 *  GET    /api/v1/pages/{key}/menus                      getMenus（按 path 反查未删菜单）
 *  DELETE /api/v1/pages/menus/{menuId}                   unmountMenu（软删菜单）
 *  GET    /api/v1/pages/{pageKey}/ds/{dataSourceId}/data queryPageDataSource（自定义页面数据源查询；委托 datasource 模块）
 *
 * 对齐要点：
 *  - 分页 1-based，PageResponse 信封（同 form.ts）；页面错误为 BusinessException → HTTP200+code（404/400/403）
 *  - JSON key 序：PageDefinition 实体/DTO/MenuItem 均默认构造器 → 全字母序
 *  - PageAccessGuard：path=/page/{key} 且 is_deleted=0 的菜单为空 → 404"页面不存在或未挂接菜单"；
 *    status=1 且权限码非空的菜单任一命中用户权限（admin 绕过）→ 放行，否则 403"无页面访问权限"
 *  - /data 两端点的取数来源（BizDataService.query / DataSourceDefinitionService.queryData）属 bizdata/datasource
 *    模块，本文件仅实现 PageQueryController 层逻辑（守卫/类型/绑定/白名单），最终取数经 setPageDataDelegates 注入，
 *    未注入时返回 HTTP500（部署时由 bizdata/datasource 子任务接线）
 *  - schema JSON 原样透传字符串；发布/预览编译产物按 Jackson ObjectNode 插入序合并后重序列化
 */
import { Router } from 'express';
import { getDb, all, one, run, type Row } from '../lib/db';
import { BusinessException, TenantNotSetError } from '../lib/errors';
import { ok, authGuard, ah, type AuthedRequest } from '../lib/http';
import { toIsoText, fmtIso } from '../lib/serialize';
import { pageResponse } from '../lib/page';

export const pageRouter = Router();

// ---------------------------------------------------------------- 公共小件

const COLUMN_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const FORM_KEY_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const DATA_COMPONENT_TYPES = new Set(['page-table', 'page-tree']);

function jstr(v: unknown): string {
  return v == null ? 'null' : String(v);
}

function nowText(): string {
  return fmtIso(new Date()).replace('T', ' ');
}

function qs(req: AuthedRequest, name: string): string | null {
  const v = req.query[name];
  if (v == null) return null;
  if (Array.isArray(v)) return typeof v[0] === 'string' ? (v[0] as string) : null;
  return typeof v === 'string' ? v : null;
}

function tenantOf(req: AuthedRequest): string {
  const h = req.headers['x-tenant-id'];
  const v = Array.isArray(h) ? h[0] : h;
  if (v == null || String(v).trim() === '') {
    throw new TenantNotSetError('Tenant ID is not set. Ensure X-Tenant-Id header is provided.');
  }
  return String(v);
}

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

/** 路径变量 Long（unmountMenu；非整数 → 500，type 名为 java.lang.Long） */
function longPath(req: AuthedRequest, name: string): number {
  const raw = String(req.params[name] ?? '');
  const n = Number(raw);
  if (raw.trim() === '' || !Number.isInteger(n)) {
    throw new Error(
      `Method parameter '${name}': Failed to convert value of type 'java.lang.String' to required type 'java.lang.Long'; For input string: "${raw}"`,
    );
  }
  return n;
}

function pageParams(req: AuthedRequest): { page: number; size: number; offset: number } {
  const page = intParam(req, 'page', 1);
  const size = intParam(req, 'size', 20);
  if (size < 1) throw new BusinessException('Page size must not be less than one', 400);
  const norm = Math.max(page, 1);
  return { page: norm, size, offset: (norm - 1) * size };
}

function isBlank(v: string | null | undefined): boolean {
  return v == null || v.trim() === '';
}

// ---------------------------------------------------------------- 数据源委托钩子（bizdata / datasource 模块接线点）

/** BizDataQueryRequest（Spring model attribute 绑定，query 参数同名） */
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

/**
 * 页面数据查询/校验委托（由 datasource 模块任务注入）：
 *  - queryDataSource: DataSourceDefinitionService.queryData（数据源 SPI）
 *  - enabledDataSourceIds: DataSourceDefinitionService.getEnabled 的 id 集合（PAGE 发布校验）
 */
export interface PageDataDelegates {
  queryDataSource?(dataSourceId: string, req: BizDataQueryRequest): unknown;
  enabledDataSourceIds?(): string[];
}

const pageDataDelegates: PageDataDelegates = {};

export function setPageDataDelegates(d: PageDataDelegates): void {
  Object.assign(pageDataDelegates, d);
}

function requireDelegate<K extends keyof PageDataDelegates>(key: K): NonNullable<PageDataDelegates[K]> {
  const fn = pageDataDelegates[key];
  if (fn == null) {
    throw new Error(`页面数据能力 ${String(key)} 未接线：等待 biz-data / datasource 模块调用 setPageDataDelegates`);
  }
  return fn as NonNullable<PageDataDelegates[K]>;
}

function readBizQuery(req: AuthedRequest): BizDataQueryRequest {
  const page = intParam(req, 'page', 1);
  const size = intParam(req, 'size', 20);
  return {
    filter: qs(req, 'filter'),
    keyword: qs(req, 'keyword'),
    keywordColumn: qs(req, 'keywordColumn'),
    sort: qs(req, 'sort'),
    order: qs(req, 'order'),
    params: qs(req, 'params'),
    page,
    size,
  };
}

// ---------------------------------------------------------------- wf_page_def 行读

interface PageDefRow {
  id: string;
  tenant_id: string;
  name: string;
  key: string;
  type: string;
  form_key: string | null;
  data_source_id: string | null;
  schema: string | null;
  version: number;
  status: string;
  published_version: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const PAGE_DEF_COLS = `"id","tenant_id","name","key","type","form_key","data_source_id","schema","version","status","published_version","created_by","created_at","updated_at"`;

function asPageDef(r: Row | null | undefined): PageDefRow | null {
  if (!r) return null;
  return {
    id: String(r['id']),
    tenant_id: String(r['tenant_id']),
    name: String(r['name']),
    key: String(r['key']),
    type: String(r['type']),
    form_key: (r['form_key'] as string | null) ?? null,
    data_source_id: (r['data_source_id'] as string | null) ?? null,
    schema: (r['schema'] as string | null) ?? null,
    version: Number(r['version']),
    status: String(r['status']),
    published_version: r['published_version'] == null ? null : Number(r['published_version']),
    created_by: (r['created_by'] as string | null) ?? null,
    created_at: String(r['created_at']),
    updated_at: String(r['updated_at']),
  };
}

function pageDefById(id: string, tenantId: string): PageDefRow {
  const r = asPageDef(one(`SELECT ${PAGE_DEF_COLS} FROM wf_page_def WHERE "id" = ? AND tenant_id = ?`, [id, tenantId]));
  if (!r) throw new BusinessException(`页面不存在: ${jstr(id)}`, 404);
  return r;
}

function pageDefByKeyLatest(key: string, tenantId: string): PageDefRow {
  const r = asPageDef(
    one(`SELECT ${PAGE_DEF_COLS} FROM wf_page_def WHERE tenant_id = ? AND "key" = ? ORDER BY "version" DESC LIMIT 1`, [tenantId, key]),
  );
  if (!r) throw new BusinessException(`页面不存在: ${jstr(key)}`, 404);
  return r;
}

function pageDefPublishedByKey(key: string, tenantId: string): PageDefRow {
  const r = asPageDef(
    one(
      `SELECT ${PAGE_DEF_COLS} FROM wf_page_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' ORDER BY "version" DESC LIMIT 1`,
      [tenantId, key],
    ),
  );
  if (!r) throw new BusinessException(`页面未发布或不存在: ${jstr(key)}`, 404);
  return r;
}

/** PageDefinition 实体 JSON（全字母序，含 tenantId） */
function pageDefEntityJson(r: PageDefRow): Record<string, unknown> {
  return {
    createdAt: toIsoText(r.created_at),
    createdBy: r.created_by,
    dataSourceId: r.data_source_id,
    formKey: r.form_key,
    id: r.id,
    key: r.key,
    name: r.name,
    publishedVersion: r.published_version,
    schema: r.schema,
    status: r.status,
    tenantId: r.tenant_id,
    type: r.type,
    updatedAt: toIsoText(r.updated_at),
    version: r.version,
  };
}

/** PageDefinitionDTO（全字母序，无 tenantId/schema） */
function pageDefDtoJson(r: PageDefRow): Record<string, unknown> {
  return {
    createdAt: toIsoText(r.created_at),
    createdBy: r.created_by,
    dataSourceId: r.data_source_id,
    formKey: r.form_key,
    id: r.id,
    key: r.key,
    name: r.name,
    publishedVersion: r.published_version,
    status: r.status,
    type: r.type,
    updatedAt: toIsoText(r.updated_at),
    version: r.version,
  };
}

/** PageDefinitionDetailDTO（全字母序，含 schema） */
function pageDefDetailJson(r: PageDefRow): Record<string, unknown> {
  return {
    createdAt: toIsoText(r.created_at),
    createdBy: r.created_by,
    dataSourceId: r.data_source_id,
    formKey: r.form_key,
    id: r.id,
    key: r.key,
    name: r.name,
    publishedVersion: r.published_version,
    schema: r.schema,
    status: r.status,
    type: r.type,
    updatedAt: toIsoText(r.updated_at),
    version: r.version,
  };
}

// ---------------------------------------------------------------- 页面访问守卫（PageAccessGuard + PermissionEvaluator）

function loadRoles(userId: number): { id: number; code: string }[] {
  return all('SELECT r.ID, r.ROLE_CODE FROM SYS_ROLE r JOIN SYS_USER_ROLE ur ON ur.ROLE_ID = r.ID WHERE ur.USER_ID = ?', [
    userId,
  ]).map((r) => ({ id: Number(r['ID']), code: String(r['ROLE_CODE']) }));
}

function loadPermissions(userId: number): Set<string> {
  const rows = all(
    `SELECT DISTINCT m.PERMISSION AS P FROM SYS_MENU m
     JOIN SYS_ROLE_MENU rm ON rm.MENU_ID = m.ID
     JOIN SYS_USER_ROLE ur ON ur.ROLE_ID = rm.ROLE_ID
     WHERE ur.USER_ID = ? AND m.PERMISSION IS NOT NULL AND m.PERMISSION != ''`,
    [userId],
  );
  return new Set(rows.map((r) => String(r['P'])));
}

function hasPermission(req: AuthedRequest, permission: string): boolean {
  const roles = loadRoles(req.userId as number);
  const isAdmin = roles.some((r) => r.code === 'admin' || r.code === 'ROLE_ADMIN');
  if (isAdmin) return true;
  return loadPermissions(req.userId as number).has(permission);
}

/** PageAccessGuard.assertPageAccess（OR 语义；无菜单 404 / 无权限 403） */
function assertPageAccess(req: AuthedRequest, pageKey: string): void {
  const menus = all(`SELECT * FROM SYS_MENU WHERE PATH = ? AND IS_DELETED = 0`, [`/page/${pageKey}`]);
  if (menus.length === 0) {
    throw new BusinessException('页面不存在或未挂接菜单', 404);
  }
  const granted = menus.some((m) => {
    const status = m['STATUS'] == null ? null : Number(m['STATUS']);
    const permission = m['PERMISSION'] == null ? null : String(m['PERMISSION']);
    if (status === null || status !== 1) return false;
    if (permission === null || permission.trim() === '') return false;
    return hasPermission(req, permission);
  });
  if (!granted) {
    throw new BusinessException('无页面访问权限', 403);
  }
}

// ---------------------------------------------------------------- 表单列映射（PageValidator 侧解析用）

interface ColumnConfig {
  key: string | null;
  columnType: string | null;
  hidden: boolean;
}

/** PageValidator.parseColumnConfig（与 FormDefinitionService 的版本消息不同） */
function parseColumnConfigForPage(columnConfig: string | null): ColumnConfig[] {
  if (isBlank(columnConfig)) {
    throw new BusinessException('绑定表单未配置列映射（column_config）', 400);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(columnConfig as string);
  } catch {
    throw new BusinessException('绑定表单列映射配置非法', 400);
  }
  if (!Array.isArray(parsed)) {
    throw new BusinessException('绑定表单列映射配置非法', 400);
  }
  return (parsed as Record<string, unknown>[]).map((v) => ({
    key: v['key'] == null ? null : String(v['key']),
    columnType: v['columnType'] == null ? null : String(v['columnType']),
    hidden: v['hidden'] === true,
  }));
}

// ---------------------------------------------------------------- schema JSON 解析工具

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function jobj(v: unknown): Record<string, unknown> {
  return (v ?? {}) as Record<string, unknown>;
}

function jtext(v: unknown, dflt = ''): string {
  if (v == null) return dflt;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return dflt;
}



/** PageDefinitionService.schemaEquals：JSON 规范化比对 */
function schemaEquals(a: string | null, b: string | null): boolean {
  try {
    const na = JSON.parse(isBlank(a) ? '{}' : (a as string)) as Json;
    const nb = JSON.parse(isBlank(b) ? '{}' : (b as string)) as Json;
    return deepEqual(na, nb);
  } catch {
    return false;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b as Record<string, unknown>).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------- PageValidator.validateForPublish

function parseSchemaNode(schema: string | null): Record<string, unknown> {
  let root: Json;
  try {
    root = JSON.parse(isBlank(schema) ? '{}' : (schema as string)) as Json;
  } catch {
    throw new BusinessException('页面 schema 解析失败', 400);
  }
  if (Array.isArray(root)) return { rule: root };
  if (root != null && typeof root === 'object' && !Array.isArray(root)) {
    return root as Record<string, unknown>;
  }
  return {};
}

function validateForPublish(page: PageDefRow, tenantId: string): void {
  validateForPublishPage(page, tenantId);
}

/** PageValidator.validateForPublishPage（PAGE 类型） */
function validateForPublishPage(page: PageDefRow, tenantId: string): void {
  const root = parseSchemaNode(page.schema);
  if (root['rule'] == null || !Array.isArray(root['rule'])) {
    throw new BusinessException('自定义页面 schema 必须为 {rule, option, dataSources, actions}', 400);
  }

  const enabledDsMap = new Set<string>(requireDelegate('enabledDataSourceIds')());

  const dsById = new Map<string, Record<string, unknown>>();
  const dataSources = root['dataSources'];
  if (Array.isArray(dataSources)) {
    for (const entry of dataSources) {
      const e = jobj(entry);
      const id = jtext(e['id']);
      if (id.trim() === '') {
        throw new BusinessException('自定义页面 dataSources 条目 id 不能为空', 400);
      }
      if (dsById.has(id)) {
        throw new BusinessException(`自定义页面 dataSources id 重复: ${id}`, 400);
      }
      const refId = jtext(e['refId']);
      if (refId.trim() === '') {
        throw new BusinessException(`自定义页面 dataSources[${id}] refId 不能为空`, 400);
      }
      if (!enabledDsMap.has(refId)) {
        throw new BusinessException(`自定义页面引用的数据源不存在或未启用: ${refId}`, 400);
      }
      const dsRow = one(`SELECT "type","form_key" FROM wf_data_source WHERE "id" = ?`, [refId]);
      if (dsRow && String(dsRow['type']) === 'FORM') {
        const dsFormKey = (dsRow['form_key'] as string | null) ?? '';
        const formRow = one(
          `SELECT "id","column_config" FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' ORDER BY "version" DESC LIMIT 1`,
          [tenantId, dsFormKey],
        );
        if (!formRow) {
          throw new BusinessException(`自定义页面引用的表单未发布: ${jstr(dsFormKey)}`, 400);
        }
        validatePageDsFields(e, (formRow['column_config'] as string | null) ?? null);
      }
      dsById.set(id, e);
    }
  }

  const rule = root['rule'] as unknown[];
  for (const node of rule) {
    const n = jobj(node);
    if (!DATA_COMPONENT_TYPES.has(jtext(n['type']))) continue;
    const dsId = jtext(jobj(n['props'])['dataSourceId']);
    if (dsId.trim() !== '' && !dsById.has(dsId)) {
      throw new BusinessException(`数据组件 dataSourceId 未在 dataSources 声明: ${dsId}`, 400);
    }
  }

  const actions = root['actions'];
  if (Array.isArray(actions)) {
    for (const action of actions) {
      const steps = jobj(action)['steps'];
      if (!Array.isArray(steps)) continue;
      for (const step of steps) {
        const s = jobj(step);
        if (jtext(s['op']) !== 'set-filter') continue;
        const target = jtext(s['target']);
        const field = jtext(s['field']);
        if (target.trim() === '' || field.trim() === '') continue;
        const dsEntry = dsById.get(target);
        if (dsEntry == null) {
          throw new BusinessException(`set-filter 目标数据源未声明: ${target}`, 400);
        }
        const searchFields = dsEntry['searchFields'];
        if (Array.isArray(searchFields) && searchFields.length > 0) {
          const declared = searchFields.some((sf) => jtext(sf) === field);
          if (!declared) {
            throw new BusinessException(`set-filter 字段未在数据源 searchFields 白名单: ${field}`, 400);
          }
        }
      }
    }
  }
}

function validatePageDsFields(dsEntry: Record<string, unknown>, columnConfig: string | null): void {
  const columns = parseColumnConfigForPage(columnConfig);
  const validKeys = new Set<string>();
  for (const c of columns) if (c.key != null) validKeys.add(c.key);
  const searchFields = dsEntry['searchFields'];
  if (Array.isArray(searchFields)) {
    for (const sf of searchFields) {
      const key = jtext(sf);
      if (key.trim() !== '' && !validKeys.has(key)) {
        throw new BusinessException(`数据源 searchFields 引用列不存在: ${key}`, 400);
      }
    }
  }
  const pageColumns = dsEntry['columns'];
  if (Array.isArray(pageColumns)) {
    for (const col of pageColumns) {
      const key = jtext(col);
      if (key.trim() !== '' && !validKeys.has(key)) {
        throw new BusinessException(`数据源 columns 引用列不存在: ${key}`, 400);
      }
    }
  }
}

// ---------------------------------------------------------------- PageQueryController 白名单逻辑

function parseOr400(text: string | null): Record<string, Json> {
  try {
    return JSON.parse(isBlank(text) ? '{}' : (text as string)) as Record<string, Json>;
  } catch {
    throw new BusinessException('页面 schema 解析失败', 400);
  }
}

function pageDataSources(schema: string | null): unknown[] {
  const root = parseOr400(schema);
  const dataSources = root['dataSources'];
  return Array.isArray(dataSources) ? dataSources : [];
}

function resolveDataSourceRefId(schema: string | null, dataSourceId: string): string {
  for (const entry of pageDataSources(schema)) {
    const e = jobj(entry);
    if (dataSourceId === jtext(e['id'])) {
      const refId = jtext(e['refId']);
      if (refId.trim() !== '') return refId;
    }
  }
  throw new BusinessException(`页面未声明数据源: ${dataSourceId}`, 400);
}

function pageDataSourceSearchFields(schema: string | null, dataSourceId: string): Set<string> {
  const keys = new Set<string>();
  for (const entry of pageDataSources(schema)) {
    const e = jobj(entry);
    if (dataSourceId !== jtext(e['id'])) continue;
    const searchFields = e['searchFields'];
    if (Array.isArray(searchFields)) {
      for (const sf of searchFields) {
        const k = jtext(sf);
        if (k.trim() !== '') keys.add(k);
      }
    }
    break;
  }
  return keys;
}

/** whitelistFilter：支持扁平与结构化两种格式，白名单命中校验（原样重序列化） */
function whitelistFilter(filterJson: string | null, whitelist: Set<string>): string | null {
  if (isBlank(filterJson)) return null;
  if (whitelist.size === 0) return filterJson;
  let filter: Record<string, unknown>;
  try {
    const parsed = JSON.parse(filterJson as string) as unknown;
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not object');
    }
    filter = parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof BusinessException) throw e;
    throw new BusinessException('筛选参数 filter 格式非法，应为 JSON 对象', 400);
  }
  if (Object.keys(filter).length === 0) return null;
  if (Array.isArray(filter['conditions'])) {
    for (const o of filter['conditions'] as unknown[]) {
      if (o != null && typeof o === 'object' && !Array.isArray(o)) {
        const column = String(jobj(o)['column']);
        if (!whitelist.has(column)) {
          throw new BusinessException(`筛选字段不在页面声明白名单: ${column}`, 400);
        }
      }
    }
  } else {
    for (const key of Object.keys(filter)) {
      if (!whitelist.has(key)) {
        throw new BusinessException(`筛选字段不在页面声明白名单: ${key}`, 400);
      }
    }
  }
  return JSON.stringify(filter);
}

// ---------------------------------------------------------------- 页面定义路由

/** POST /api/v1/pages */
pageRouter.post(
  '/api/v1/pages',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = body['name'] == null ? null : String(body['name']);
    const key = body['key'] == null ? null : String(body['key']);
    const type = body['type'] == null ? null : String(body['type']);
    const formKey = body['formKey'] == null ? null : String(body['formKey']);
    const dataSourceId = body['dataSourceId'] == null ? null : String(body['dataSourceId']);

    const now = nowText();
    const id = crypto.randomUUID().replace(/-/g, '');
    const tx = getDb().transaction(() => {
      const exists = one(`SELECT 1 AS X FROM wf_page_def WHERE tenant_id = ? AND "key" = ?`, [tenantId, key]);
      if (exists) throw new BusinessException(`页面 key 已存在: ${jstr(key)}`, 400);
      run(
        `INSERT INTO wf_page_def (${PAGE_DEF_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, tenantId, name, key, isBlank(type) ? 'PAGE' : type, formKey, dataSourceId, null, 1, 'DRAFT', null, null, now, now],
      );
    });
    tx();
    ok(res, pageDefEntityJson(pageDefById(id, tenantId)));
  }),
);

/** GET /api/v1/pages —— list */
pageRouter.get(
  '/api/v1/pages',
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
    if (hasName) {
      where += ` AND "name" LIKE ?`;
      params.push(`%${name}%`);
      if (hasStatus && hasType) {
        where += ` AND status = ? AND "type" = ?`;
        params.push(status, type);
      } else if (hasStatus) {
        where += ` AND status = ?`;
        params.push(status);
      } else if (hasType) {
        where += ` AND "type" = ?`;
        params.push(type);
      }
    } else if (hasStatus && hasType) {
      where += ` AND status = ? AND "type" = ?`;
      params.push(status, type);
    } else if (hasStatus) {
      where += ` AND status = ?`;
      params.push(status);
    } else if (hasType) {
      where += ` AND "type" = ?`;
      params.push(type);
    }

    const totalRow = one(`SELECT COUNT(1) AS C FROM wf_page_def ${where}`, params);
    const total = Number(totalRow?.['C'] ?? 0);
    const rows = all(
      `SELECT ${PAGE_DEF_COLS} FROM wf_page_def ${where} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      [...params, size, offset],
    ).map(asPageDef) as PageDefRow[];
    ok(res, pageResponse(rows.map(pageDefDtoJson), page, size, total));
  }),
);

/** GET /api/v1/pages/{key}/definition —— 渲染取数（先于 /{id} 注册） */
pageRouter.get(
  '/api/v1/pages/:key/definition',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const key = req.params['key'] as string;
    const previewRaw = qs(req, 'preview') ?? 'false';
    const preview = ['true', 'on', 'yes', '1'].includes(previewRaw);
    if (!['true', 'false', 'on', 'off', 'yes', 'no', '1', '0'].includes(previewRaw)) {
      throw new Error(
        `Method parameter 'preview': Failed to convert value of type 'java.lang.String' to required type 'boolean'; For input string: "${previewRaw}"`,
      );
    }
    if (!preview) {
      assertPageAccess(req, key);
    }
    let page: PageDefRow;
    if (preview) {
      page = pageDefByKeyLatest(key, tenantId);
    } else {
      page = pageDefPublishedByKey(key, tenantId);
    }
    ok(res, pageDefDetailJson(page));
  }),
);

/** GET /api/v1/pages/{id} */
pageRouter.get(
  '/api/v1/pages/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    ok(res, pageDefDetailJson(pageDefById(req.params['id'] as string, tenantId)));
  }),
);

/** PUT /api/v1/pages/{id} */
pageRouter.put(
  '/api/v1/pages/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = req.params['id'] as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = body['name'] == null ? null : String(body['name']);
    const key = body['key'] == null ? null : String(body['key']);
    const schema = body['schema'] == null ? null : String(body['schema']);
    const formKey = body['formKey'] == null ? null : String(body['formKey']);
    const dataSourceId = body['dataSourceId'] == null ? null : String(body['dataSourceId']);

    const tx = getDb().transaction(() => {
      pageDefById(id, tenantId);
      const sets: string[] = ['updated_at = ?'];
      const params: unknown[] = [nowText()];
      if (name != null) { sets.push('"name" = ?'); params.push(name); }
      if (key != null) { sets.push('"key" = ?'); params.push(key); }
      if (schema != null) { sets.push('"schema" = ?'); params.push(schema); }
      if (formKey != null) { sets.push('"form_key" = ?'); params.push(formKey); }
      if (dataSourceId != null) { sets.push('"data_source_id" = ?'); params.push(dataSourceId); }
      params.push(id, tenantId);
      run(`UPDATE wf_page_def SET ${sets.join(', ')} WHERE "id" = ? AND tenant_id = ?`, params);
    });
    tx();
    ok(res, pageDefEntityJson(pageDefById(id, tenantId)));
  }),
);

/** DELETE /api/v1/pages/{id} —— 软删除（PUBLISHED 拒绝） */
pageRouter.delete(
  '/api/v1/pages/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = req.params['id'] as string;
    const tx = getDb().transaction(() => {
      const r = pageDefById(id, tenantId);
      if (r.status === 'PUBLISHED') {
        throw new BusinessException('已发布的页面不能删除', 400);
      }
      run(`UPDATE wf_page_def SET status = 'ARCHIVED', updated_at = ? WHERE "id" = ? AND tenant_id = ?`, [nowText(), id, tenantId]);
    });
    tx();
    ok(res);
  }),
);

/** POST /api/v1/pages/{id}/publish */
pageRouter.post(
  '/api/v1/pages/:id/publish',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = req.params['id'] as string;
    const tx = getDb().transaction(() => {
      const current = pageDefById(id, tenantId);
      if (current.status === 'ARCHIVED') {
        throw new BusinessException('已归档页面不能发布', 400);
      }

      const oldPublished = asPageDef(
        one(
          `SELECT ${PAGE_DEF_COLS} FROM wf_page_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' AND "id" != ? ORDER BY "version" DESC LIMIT 1`,
          [tenantId, current.key, current.id],
        ),
      );
      if (oldPublished && schemaEquals(current.schema, oldPublished.schema)) {
        throw new BusinessException('页面内容与已发布版本未变化，无需发布', 400);
      }

      validateForPublish(current, tenantId);
      const schema = current.schema;

      if (oldPublished) {
        run(`UPDATE wf_page_def SET status = 'ARCHIVED', updated_at = ? WHERE "id" = ?`, [nowText(), oldPublished.id]);
      }
      run(`UPDATE wf_page_def SET status = 'PUBLISHED', published_version = ?, "schema" = ?, updated_at = ? WHERE "id" = ?`, [
        current.version,
        schema,
        nowText(),
        current.id,
      ]);
    });
    tx();
    ok(res, pageDefEntityJson(pageDefById(id, tenantId)));
  }),
);

// ---------------------------------------------------------------- 页面挂菜单（PageMenuController）

interface MenuItemRow {
  menuId: number;
  menuName: string | null;
  path: string | null;
  parentId: number | null;
  permission: string | null;
  status: number | null;
}

/** PageMenuResponse.MenuItem（全字母序） */
function menuItemJson(m: MenuItemRow): Record<string, unknown> {
  return {
    menuId: m.menuId,
    menuName: m.menuName,
    parentId: m.parentId,
    path: m.path,
    permission: m.permission,
    status: m.status,
  };
}

function menuRowToItem(r: Row): MenuItemRow {
  return {
    menuId: Number(r['ID']),
    menuName: (r['MENU_NAME'] as string | null) ?? null,
    path: (r['PATH'] as string | null) ?? null,
    parentId: r['PARENT_ID'] == null ? null : Number(r['PARENT_ID']),
    permission: (r['PERMISSION'] as string | null) ?? null,
    status: r['STATUS'] == null ? null : Number(r['STATUS']),
  };
}

/** POST /api/v1/pages/{id}/mount-menu */
pageRouter.post(
  '/api/v1/pages/:id/mount-menu',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = req.params['id'] as string;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const name = body['name'] == null ? null : String(body['name']);
    let parentId: number | null = null;
    if (body['parentId'] != null) {
      const n = Number(body['parentId']);
      if (!Number.isInteger(n)) {
        throw new Error(`Cannot coerce value ("${jstr(body['parentId'])}") to \`java.lang.Long\``);
      }
      parentId = n;
    }

    let itemId: MenuItemRow;
    const tx = getDb().transaction(() => {
      const page = pageDefById(id, tenantId);
      if (page.status !== 'PUBLISHED') {
        throw new BusinessException('仅可挂接已发布的页面', 400);
      }
      const now = nowText();
      run(
        `INSERT INTO SYS_MENU (MENU_NAME, PATH, COMPONENT, PERMISSION, MENU_TYPE, PARENT_ID, SORT_ORDER, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name ?? page.name,
          `/page/${page.key}`,
          'page/PageRenderer',
          `page:read:${page.key}`,
          1,
          parentId,
          0,
          1,
          0,
          now,
          now,
        ],
      );
      const menuId = Number(one(`SELECT LAST_INSERT_ROWID() AS ID`)?.['ID'] ?? 0);
      const item: MenuItemRow = {
        menuId,
        menuName: name ?? page.name,
        path: `/page/${page.key}`,
        parentId,
        permission: `page:read:${page.key}`,
        status: 1,
      };

      // grantAdminRoleIfAdmin：管理员挂接自动授权 ROLE_ADMIN
      const roles = loadRoles(req.userId as number);
      const isAdmin = roles.some((r) => r.code === 'admin' || r.code === 'ROLE_ADMIN');
      if (isAdmin) {
        const adminRole = one(`SELECT ID FROM SYS_ROLE WHERE ROLE_CODE = 'ROLE_ADMIN' LIMIT 1`);
        if (adminRole) {
          const roleId = Number(adminRole['ID']);
          const exists = one(`SELECT 1 AS X FROM SYS_ROLE_MENU WHERE ROLE_ID = ? AND MENU_ID = ?`, [roleId, menuId]);
          if (!exists) {
            run(`INSERT INTO SYS_ROLE_MENU (ROLE_ID, MENU_ID) VALUES (?, ?)`, [roleId, menuId]);
          }
        }
      }
      itemId = item;
    });
    tx();
    ok(res, menuItemJson(itemId!));
  }),
);

/** GET /api/v1/pages/{key}/menus */
pageRouter.get(
  '/api/v1/pages/:key/menus',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const key = req.params['key'] as string;
    const page = pageDefPublishedByKey(key, tenantId);
    const menus = all(`SELECT * FROM SYS_MENU WHERE PATH = ? AND IS_DELETED = 0`, [`/page/${page.key}`]).map(menuRowToItem);
    ok(res, { items: menus.map(menuItemJson) });
  }),
);

/** DELETE /api/v1/pages/menus/{menuId} —— 软删菜单 */
pageRouter.delete(
  '/api/v1/pages/menus/:menuId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const menuId = longPath(req, 'menuId');
    const tx = getDb().transaction(() => {
      const menu = one(`SELECT ID FROM SYS_MENU WHERE ID = ?`, [menuId]);
      if (!menu) throw new BusinessException('菜单不存在或已解除', 404);
      run(`UPDATE SYS_MENU SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?`, [nowText(), menuId]);
    });
    tx();
    ok(res);
  }),
);

// ---------------------------------------------------------------- 页面数据查询（PageQueryController 层逻辑 + 委托）

/** GET /api/v1/pages/{pageKey}/ds/{dataSourceId}/data —— 自定义页面数据源查询 */
pageRouter.get(
  '/api/v1/pages/:pageKey/ds/:dataSourceId/data',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const pageKey = req.params['pageKey'] as string;
    const dataSourceId = req.params['dataSourceId'] as string;
    const bizReq = readBizQuery(req);

    assertPageAccess(req, pageKey);
    const page = pageDefPublishedByKey(pageKey, tenantId);
    if (page.type !== 'PAGE') {
      throw new BusinessException(`页面 ${pageKey} 不是自定义页面类型`, 400);
    }
    const refId = resolveDataSourceRefId(page.schema, dataSourceId);
    const whitelist = pageDataSourceSearchFields(page.schema, dataSourceId);
    const filter = whitelistFilter(bizReq.filter, whitelist);
    ok(res, requireDelegate('queryDataSource')(refId, { ...bizReq, filter }));
  }),
);

// 语义化占位：避免 ts6133
export const _pageInternal = { FORM_KEY_RE, COLUMN_KEY_RE };
