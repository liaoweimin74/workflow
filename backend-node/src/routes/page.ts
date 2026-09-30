/**
 * page.ts — 低代码页面模块（对齐 PageDefinitionController + PageQueryController + PageMenuController）
 *
 * 端点（路径为绝对路径，主线程直接 app.use(pageRouter) 即可，无需前缀）：
 *  POST   /api/v1/pages                                  create（body PageDefinitionSaveRequest）
 *  GET    /api/v1/pages                                  list（page,size,status?,name?,type?）
 *  GET    /api/v1/pages/{id}                             getById（含 schema）
 *  GET    /api/v1/pages/{key}/definition                 getByKey（preview=false 走 PageAccessGuard + 已发布；preview=true 取最新+动态编译）
 *  PUT    /api/v1/pages/{id}                             update
 *  DELETE /api/v1/pages/{id}                             delete（软删，PUBLISHED 拒绝）
 *  POST   /api/v1/pages/{id}/publish                     publish（VIEW 编译 {rule,option} 合并进 schema）
 *  POST   /api/v1/pages/{id}/mount-menu                  mountMenu（仅 PUBLISHED；admin 自动授权 ROLE_ADMIN）
 *  GET    /api/v1/pages/{key}/menus                      getMenus（按 path 反查未删菜单）
 *  DELETE /api/v1/pages/menus/{menuId}                   unmountMenu（软删菜单）
 *  GET    /api/v1/pages/{pageKey}/data                   query（视图数据查询；最终取数委托 bizdata 模块）
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
const NON_FILTERABLE_TYPES = new Set(['JSON', 'TEXT', 'LONGTEXT']);
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
 * 页面数据查询/校验委托（由 bizdata 与 datasource 模块任务注入）：
 *  - queryBizData: BizDataService.query（遗留 formKey 直连 wf_biz_* 表）
 *  - queryDataSource: DataSourceDefinitionService.queryData（数据源 SPI）
 *  - dataSourceMetadata: DataSourceDefinitionService.metadata（VIEW 发布取列）
 *  - enabledDataSourceIds: DataSourceDefinitionService.getEnabled 的 id 集合（PAGE 发布校验）
 */
export interface PageDataDelegates {
  queryBizData?(formKey: string, req: BizDataQueryRequest): unknown;
  queryDataSource?(dataSourceId: string, req: BizDataQueryRequest): unknown;
  dataSourceMetadata?(dataSourceId: string): { columns: ColumnConfig[] };
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

// ---------------------------------------------------------------- ViewCompiler（视图编译，逐方法对齐）

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

function jbool(v: unknown, dflt: boolean): boolean {
  if (typeof v === 'boolean') return v;
  return dflt;
}

/** ViewCompiler.compile：声明式配置 → {rule, option}（键序 rule, option, display, sortableFields, pagination, filter） */
function compileView(schema: string | null, bindColumns: ColumnConfig[] | null): string {
  let root: Json;
  try {
    root = JSON.parse(isBlank(schema) ? '{}' : (schema as string)) as Json;
  } catch {
    throw new BusinessException('视图配置解析失败', 400);
  }
  const ro = jobj(root);
  const validKeys = new Set<string>();
  if (bindColumns != null) {
    for (const c of bindColumns) if (c.key != null) validKeys.add(c.key);
  }

  const rule: Record<string, unknown>[] = [];
  const option: Record<string, unknown> = {};
  const result: Record<string, unknown> = { rule, option };

  // compileDisplay（总在产物写 display）
  result['display'] = jtext(ro['display']) === 'card' ? 'card' : 'table';

  // compileSearchFields
  const searchFields = ro['searchFields'];
  if (Array.isArray(searchFields)) {
    for (const field of searchFields) {
      const f = jobj(field);
      const key = jtext(f['key']);
      const label = jtext(f['label'], key);
      const matchType = jtext(f['matchType'], 'eq');
      if (validKeys.size > 0 && !validKeys.has(key)) {
        throw new BusinessException(`查询字段引用列不存在: ${key}`, 400);
      }
      const item: Record<string, unknown> = { type: 'input', field: key, title: label, value: '' };
      const props: Record<string, unknown> = { placeholder: label, style: 'width: 180px' };
      if (matchType === 'range') {
        item['type'] = 'datePicker';
        item['value'] = [];
        props['type'] = 'datetimerange';
        props['valueFormat'] = 'yyyy-MM-dd HH:mm:ss';
        props['startPlaceholder'] = `开始${label}`;
        props['endPlaceholder'] = `结束${label}`;
      } else if (matchType !== 'eq' && matchType !== 'like') {
        throw new BusinessException(`未知查询匹配类型: ${matchType}`, 400);
      }
      item['props'] = props;
      item['matchType'] = matchType;
      rule.push(item);
    }
  }

  // compileColumns
  const columns = ro['columns'];
  if (Array.isArray(columns) && columns.length > 0) {
    const colNodes: Record<string, unknown>[] = [];
    for (const column of columns) {
      const c = jobj(column);
      const key = jtext(c['key']);
      if (key.trim() === '') continue;
      if (jbool(c['hidden'], false)) continue;
      const isCustom = jbool(c['custom'], false);
      if (validKeys.size > 0 && !isCustom && !validKeys.has(key)) {
        throw new BusinessException(`展示列引用列不存在: ${key}`, 400);
      }
      const col: Record<string, unknown> = { prop: key, label: jtext(c['label'], key), minWidth: c['width'] == null ? 130 : Number(c['width']) };
      if (c['align'] != null) col['align'] = jtext(c['align'], 'left');
      for (const field of ['contentType', 'contentValue', 'expression', 'template', 'formatter', 'className', 'styleExpr', 'style', 'custom', 'onCellClick']) {
        if (c[field] !== undefined && c[field] !== null) col[field] = c[field];
      }
      colNodes.push(col);
    }
    rule.push({
      type: 'table',
      field: '__page_table',
      title: '数据列表',
      props: { columns: colNodes },
    });
  }

  // compileSortableFields
  const sortableFields = ro['sortableFields'];
  if (Array.isArray(sortableFields) && sortableFields.length > 0) {
    const out: string[] = [];
    for (const f of sortableFields) {
      const key = jtext(f);
      if (key.trim() === '') continue;
      if (validKeys.size > 0 && !validKeys.has(key)) {
        throw new BusinessException(`排序字段引用列不存在: ${key}`, 400);
      }
      out.push(key);
    }
    result['sortableFields'] = out;
  }

  // compilePagination
  const pagination = ro['pagination'];
  if (pagination != null && typeof pagination === 'object' && !Array.isArray(pagination)) {
    const p = jobj(pagination);
    const pageSize = p['pageSize'] == null ? 20 : Number(p['pageSize']);
    if (pageSize <= 0) {
      throw new BusinessException(`每页条数必须为正整数: ${pageSize}`, 400);
    }
    const sizes: number[] = [];
    const pageSizes = p['pageSizes'];
    if (Array.isArray(pageSizes)) {
      for (const n of pageSizes) {
        if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0) {
          throw new BusinessException(`可选页大小必须为正整数: ${jtext(n, '')}`, 400);
        }
        sizes.push(n);
      }
    }
    if (sizes.length === 0) sizes.push(10, 20, 50);
    result['pagination'] = { show: jbool(p['show'], true), pageSize, pageSizes: sizes };
  }

  // compileFilter
  const filter = ro['filter'];
  if (filter != null && typeof filter === 'object' && !Array.isArray(filter)) {
    const fo = jobj(filter);
    const conditions = fo['conditions'];
    if (Array.isArray(conditions) && conditions.length > 0) {
      const outConditions: Record<string, unknown>[] = [];
      for (const c of conditions) {
        const co = jobj(c);
        const column = jtext(co['column']);
        if (column.trim() === '') continue;
        if (validKeys.size > 0 && !validKeys.has(column)) {
          throw new BusinessException(`筛选条件引用列不存在: ${column}`, 400);
        }
        outConditions.push({ column, op: jtext(co['op'], 'eq'), value: jtext(co['value'], '') });
      }
      if (outConditions.length > 0) {
        result['filter'] = { logic: jtext(fo['logic'], 'AND'), conditions: outConditions };
      }
    }
  }

  // compileActions
  const actions = ro['actions'];
  if (actions != null && typeof actions === 'object' && !Array.isArray(actions)) {
    const ao = jobj(actions);
    const props: Record<string, unknown> = {};
    if (typeof ao['permissions'] === 'string') props['permissions'] = ao['permissions'];
    if (ao['actionColumnWidth'] != null && Number.isInteger(Number(ao['actionColumnWidth'])) && Number(ao['actionColumnWidth']) > 0) {
      props['actionColumnWidth'] = Number(ao['actionColumnWidth']);
    }
    const buttons = ao['buttons'];
    if (Array.isArray(buttons)) {
      const btnNodes: Record<string, unknown>[] = [];
      for (const btn of buttons) {
        const b = jobj(btn);
        const key = jtext(b['key']);
        if (key.trim() === '') {
          throw new BusinessException('操作按钮 key 不能为空', 400);
        }
        const out: Record<string, unknown> = { key, label: jtext(b['label'], key) };
        const placement = jtext(b['placement'], 'column');
        if (placement !== 'toolbar' && placement !== 'column') {
          throw new BusinessException(`未知操作位置 placement: ${placement}`, 400);
        }
        out['placement'] = placement;
        const style = jtext(b['style'], 'button');
        if (style !== 'icon' && style !== 'text' && style !== 'button') {
          throw new BusinessException(`未知按钮形态 style: ${style}`, 400);
        }
        out['style'] = style;
        if (typeof b['icon'] === 'string' && b['icon'].trim() !== '') out['icon'] = b['icon'];
        if (b['events'] != null) out['events'] = b['events'];
        btnNodes.push(out);
      }
      props['buttons'] = btnNodes;
    } else {
      for (const action of ['create', 'edit', 'delete', 'view']) {
        if (jbool(ao[action], false)) props[action] = true;
      }
      const placement = jtext(ao['placement'], 'column');
      if (placement !== 'toolbar' && placement !== 'column') {
        throw new BusinessException(`未知操作位置 placement: ${placement}`, 400);
      }
      props['placement'] = placement;
      const style = jtext(ao['style'], 'button');
      if (style !== 'icon' && style !== 'text' && style !== 'button') {
        throw new BusinessException(`未知按钮形态 style: ${style}`, 400);
      }
      props['style'] = style;
    }
    rule.push({ type: '__page_actions', field: '__page_actions', title: '操作', props });
  }

  // compileDetail
  const detail = ro['detail'];
  if (detail != null && typeof detail === 'object' && !Array.isArray(detail)) {
    const d = jobj(detail);
    const actionsObj = ro['actions'];
    let viewEnabled = false;
    if (actionsObj != null && typeof actionsObj === 'object' && !Array.isArray(actionsObj)) {
      const a = jobj(actionsObj);
      const btns = a['buttons'];
      if (Array.isArray(btns)) {
        viewEnabled = btns.some((b) => jtext(jobj(b)['key']) === 'view');
      } else {
        viewEnabled = jbool(a['view'], false);
      }
    }
    const legacyEnabled = jbool(d['enabled'], false);
    if (viewEnabled || legacyEnabled) {
      const props: Record<string, unknown> = { enabled: true };
      if (d['width'] != null) props['width'] = jtext(d['width'], '800px');
      if (d['height'] != null && jtext(d['height'], '') !== '') props['height'] = jtext(d['height']);
      if (jtext(d['type'], 'form') === 'form') props['type'] = 'form';
      const formMode = jtext(d['formMode'], 'popup');
      if (formMode === 'drawer' || formMode === 'inline') props['formMode'] = formMode;
      rule.push({ type: '__page_detail', field: '__page_detail', title: '详情', props });
    }
  }

  // compileEvents
  const events = ro['events'];
  if (Array.isArray(events) && events.length > 0) {
    rule.push({ type: '__page_events', field: '__page_events', title: '事件', events });
  }

  return JSON.stringify(result);
}

/** PageDefinitionService.mergeCompiled：编译产物合并进声明 schema（保留原键序，新键按 rule/option/display 追加） */
function mergeCompiled(schema: string | null, compiled: string): string {
  let rootJson: Json;
  let compiledJson: Json;
  try {
    rootJson = JSON.parse(isBlank(schema) ? '{}' : (schema as string)) as Json;
    compiledJson = JSON.parse(compiled) as Json;
  } catch {
    throw new BusinessException('视图编译产物合并失败', 400);
  }
  const root: Record<string, unknown> =
    rootJson != null && typeof rootJson === 'object' && !Array.isArray(rootJson)
      ? { ...(rootJson as Record<string, unknown>) }
      : {};
  const c = jobj(compiledJson);
  if (c['rule'] !== undefined) root['rule'] = c['rule'];
  if (c['option'] !== undefined) root['option'] = c['option'];
  if (c['display'] !== undefined) root['display'] = jtext(c['display']);
  return JSON.stringify(root);
}

/** PageDefinitionService.schemaEquals：剔除编译产物后 JSON 规范化比对 */
function schemaEquals(a: string | null, b: string | null): boolean {
  try {
    const na = JSON.parse(isBlank(a) ? '{}' : (a as string)) as Json;
    const nb = JSON.parse(isBlank(b) ? '{}' : (b as string)) as Json;
    return deepEqual(stripCompiled(na), stripCompiled(nb));
  } catch {
    return false;
  }
}

function stripCompiled(node: Json): Json {
  if (node != null && typeof node === 'object' && !Array.isArray(node)) {
    const copy = { ...(node as Record<string, unknown>) };
    delete copy['rule'];
    delete copy['option'];
    return copy as Json;
  }
  return node;
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
  if (page.type === 'PAGE') {
    validateForPublishPage(page, tenantId);
    return;
  }

  const dataSourceId = page.data_source_id;
  const formKey = page.form_key;
  const hasDataSource = !isBlank(dataSourceId);
  const hasFormKey = !isBlank(formKey);

  if (!hasDataSource && !hasFormKey) {
    throw new BusinessException('请选择数据源', 400);
  }

  let columns: ColumnConfig[];
  if (hasDataSource) {
    const meta = requireDelegate('dataSourceMetadata')(dataSourceId as string);
    columns = meta.columns ?? [];
  } else {
    const boundForm = one(
      `SELECT "type","column_config" FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' ORDER BY "version" DESC LIMIT 1`,
      [tenantId, formKey],
    );
    if (!boundForm) {
      throw new BusinessException(`绑定表单不存在或未发布: ${jstr(formKey)}`, 400);
    }
    if (String(boundForm['type']) !== 'BUSINESS') {
      throw new BusinessException(`绑定表单 ${jstr(formKey)} 不是业务表单`, 400);
    }
    columns = parseColumnConfigForPage((boundForm['column_config'] as string | null) ?? null);
  }

  const validKeys = new Set<string>();
  const hiddenKeys = new Set<string>();
  const nonFilterableKeys = new Set<string>();
  for (const c of columns) {
    if (c.key != null) validKeys.add(c.key);
    if (c.hidden && c.key != null) hiddenKeys.add(c.key);
    if (c.columnType != null && NON_FILTERABLE_TYPES.has(c.columnType) && c.key != null) nonFilterableKeys.add(c.key);
  }

  const root = parseSchemaNode(page.schema);
  const searchFields = root['searchFields'];
  if (Array.isArray(searchFields)) {
    for (const field of searchFields) {
      const key = jtext(jobj(field)['key']);
      if (!validKeys.has(key)) {
        throw new BusinessException(`查询字段引用列不存在: ${key}`, 400);
      }
      if (hiddenKeys.has(key)) {
        throw new BusinessException(`查询字段不能引用隐藏列: ${key}`, 400);
      }
      if (nonFilterableKeys.has(key)) {
        throw new BusinessException(`查询字段不能引用大字段列（JSON/TEXT）: ${key}`, 400);
      }
    }
  }

  const pageColumns = root['columns'];
  if (Array.isArray(pageColumns)) {
    for (const column of pageColumns) {
      const c = jobj(column);
      const key = jtext(c['key']);
      const isCustom = jbool(c['custom'], false);
      if (!isCustom && !validKeys.has(key)) {
        throw new BusinessException(`展示列引用列不存在: ${key}`, 400);
      }
      if (hiddenKeys.has(key)) {
        throw new BusinessException(`展示列不能引用隐藏列: ${key}`, 400);
      }
    }
  }
}

function resolveBindColumns(page: PageDefRow, tenantId: string): ColumnConfig[] {
  const dataSourceId = page.data_source_id;
  if (!isBlank(dataSourceId)) {
    const meta = requireDelegate('dataSourceMetadata')(dataSourceId as string);
    return meta.columns ?? [];
  }
  if (isBlank(page.form_key)) {
    throw new BusinessException('视图必须绑定业务表单', 400);
  }
  const boundForm = one(
    `SELECT "column_config" FROM wf_form_def WHERE tenant_id = ? AND "key" = ? AND status = 'PUBLISHED' ORDER BY "version" DESC LIMIT 1`,
    [tenantId, page.form_key],
  );
  if (!boundForm) {
    throw new BusinessException(`绑定表单不存在或未发布: ${jstr(page.form_key)}`, 400);
  }
  return parseColumnConfigForPage((boundForm['column_config'] as string | null) ?? null);
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

function searchFieldKeys(schema: string | null): Set<string> {
  const keys = new Set<string>();
  const root = parseOr400(schema);
  const searchFields = root['searchFields'];
  if (Array.isArray(searchFields)) {
    for (const field of searchFields) {
      keys.add(jtext(jobj(field)['key']));
    }
  }
  const filter = root['filter'];
  if (filter != null && typeof filter === 'object' && !Array.isArray(filter)) {
    const conditions = jobj(filter)['conditions'];
    if (Array.isArray(conditions)) {
      for (const c of conditions) {
        const column = jtext(jobj(c)['column']);
        if (column.trim() !== '') keys.add(column);
      }
    }
  }
  return keys;
}

function sortableFieldKeys(schema: string | null): Set<string> {
  const keys = new Set<string>();
  const root = parseOr400(schema);
  const fields = root['sortableFields'];
  if (Array.isArray(fields)) {
    for (const f of fields) keys.add(jtext(f));
  }
  return keys;
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
        [id, tenantId, name, key, isBlank(type) ? 'VIEW' : type, formKey, dataSourceId, null, 1, 'DRAFT', null, null, now, now],
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
      if (page.type === 'VIEW') {
        let hasCompiled = false;
        try {
          const parsed = JSON.parse(isBlank(page.schema) ? '{}' : (page.schema as string)) as Json;
          hasCompiled = parsed != null && typeof parsed === 'object' && !Array.isArray(parsed) && 'rule' in (parsed as Record<string, unknown>);
        } catch {
          hasCompiled = false;
        }
        if (!hasCompiled) {
          validateForPublish(page, tenantId);
          const bindColumns = resolveBindColumns(page, tenantId);
          const compiled = compileView(page.schema, bindColumns);
          page = { ...page, schema: mergeCompiled(page.schema, compiled) };
        }
      }
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
      let schema = current.schema;
      if (current.type === 'VIEW') {
        const bindColumns = resolveBindColumns(current, tenantId);
        const compiled = compileView(current.schema, bindColumns);
        schema = mergeCompiled(current.schema, compiled);
      }

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

/** GET /api/v1/pages/{pageKey}/data —— 视图数据查询 */
pageRouter.get(
  '/api/v1/pages/:pageKey/data',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const pageKey = req.params['pageKey'] as string;
    const bizReq = readBizQuery(req);

    assertPageAccess(req, pageKey);
    const page = pageDefPublishedByKey(pageKey, tenantId);
    if (page.type !== 'VIEW') {
      throw new BusinessException(`页面 ${pageKey} 不是视图类型，不支持数据查询`, 400);
    }
    const hasDataSourceId = !isBlank(page.data_source_id);
    const hasFormKey = !isBlank(page.form_key);
    if (!hasDataSourceId && !hasFormKey) {
      throw new BusinessException(`页面 ${pageKey} 未绑定数据源`, 400);
    }

    const whitelist = searchFieldKeys(page.schema);
    const filter = whitelistFilter(bizReq.filter, whitelist);
    const sortable = sortableFieldKeys(page.schema);
    if (!isBlank(bizReq.sort) && sortable.size > 0 && !sortable.has(bizReq.sort as string)) {
      throw new BusinessException(`排序字段不在页面声明的可排序字段中: ${bizReq.sort}`, 400);
    }

    const delegated = { ...bizReq, filter };
    if (hasDataSourceId) {
      ok(res, requireDelegate('queryDataSource')(page.data_source_id as string, delegated));
      return;
    }
    ok(res, requireDelegate('queryBizData')(page.form_key as string, delegated));
  }),
);

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
