/**
 * 页面定义模块 —— PageDefinitionController + PageQueryController + PageMenuController + 
 * PageDefinitionService / ViewCompiler(简化) / PageAccessGuard / PageValidator(基础) 移植（Task 13-5）
 * mount 前缀：/api/v1/pages（12 端点 = 定义 7 + 查询 2 + 菜单 3）
 *
 * 关键语义：
 *  - 路由顺序：/menus/:menuId、/:key/definition、/:pageKey/data 等具体路径注册在 /:id 之前
 *  - PageAccessGuard：按路径 /page/<pageKey> 查菜单（is_deleted=0）；无菜单 404、启用菜单权限码
 *    任一命中放行（admin 自动放行）、全部无权限 403（BusinessException → HTTP200 + R.code）
 *  - publish：VIEW 走基础校验 + 编译产物 {rule,option} 合并进 schema；内容未变化（剔除 rule/option 后比对）拒绝
 *  - mount-menu：仅 PUBLISHED；固定 path=/page/{key}、permission=page:read:{key}；admin 挂接自动授权 ROLE_ADMIN
 */
/* mount: /api/v1/pages */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { exec, query, queryOne, queryRows, tx } from "../../lib/db";
import { nowStr, uuid32 } from "../../lib/dialect";
import { getBusinessColumnsByKey, parseColumnConfig, tenantOf } from "../form/form-definition";
import { bizQuery, bizQueryJoin, bizQuerySql, bizQuerySqlRaw, parseFormQueryConfig } from "../form/bizdata";
import type { ColumnConfig } from "../form/dynamic-table";

const router = Router();

type Row = Record<string, unknown>;
type Data = Record<string, unknown>;

// ==================== PageAccessGuard ====================

/** 当前用户是否 admin（PermissionEvaluator admin 放行语义） */
function isAdmin(req: Request): boolean {
  const lu = req.loginUser!;
  return lu.roles.includes("ROLE_ADMIN") || lu.username === "admin";
}

/** 页面访问校验（OR 语义；BusinessException → HTTP200 + R.code 404/403） */
function assertPageAccess(req: Request, pageKey: string): void {
  const menus = queryRows(
    "SYS_MENU",
    "SELECT * FROM SYS_MENU WHERE PATH = ? AND IS_DELETED = 0",
    ["/page/" + pageKey],
  );
  if (menus.length === 0) throw new BusinessException("页面不存在或未挂接菜单", 404);
  if (isAdmin(req)) return;
  const granted = menus
    .filter((m) => Number(m.STATUS) === 1)
    .some((m) => m.PERMISSION && req.loginUser!.permissions.has(String(m.PERMISSION)));
  if (!granted) throw new BusinessException("无页面访问权限", 403);
}

// ==================== 实体映射 ====================

function pageJSON(r: Row, withSchema = false): Row {
  const out: Row = {
    id: r.id as string,
    name: r.name as string,
    key: r.key as string,
    type: r.type as string,
    formKey: (r.formKey as string | null) ?? null,
    dataSourceId: (r.dataSourceId as string | null) ?? null,
    version: r.version as number,
    status: r.status as string,
    publishedVersion: (r.publishedVersion as number | null) ?? null,
    createdBy: (r.createdBy as string | null) ?? null,
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
  };
  if (withSchema) out.schema = (r.schema as string | null) ?? null;
  return out;
}

function pageById(tenantId: string, id: string): Row {
  const rows = queryRows("WF_PAGE_DEF", "SELECT * FROM WF_PAGE_DEF WHERE ID = ? AND TENANT_ID = ? LIMIT 1", [id, tenantId]);
  if (!rows.length) throw new BusinessException("页面不存在: " + id, 404);
  return rows[0];
}

function publishedByKey(tenantId: string, key: string): Row {
  const rows = queryRows(
    'SELECT * FROM WF_PAGE_DEF WHERE TENANT_ID = ? AND "key" = ? AND STATUS = ? ORDER BY VERSION DESC LIMIT 1',
    [tenantId, key, "PUBLISHED"],
  );
  if (!rows.length) throw new BusinessException("页面未发布或不存在: " + key, 404);
  return rows[0];
}

// ==================== schema 工具 ====================

function parseSchema(schemaJson: string | null | undefined): Data {
  if (!schemaJson || schemaJson.trim() === "") return {};
  try {
    const root = JSON.parse(schemaJson);
    return root && typeof root === "object" && !Array.isArray(root) ? root : {};
  } catch {
    throw new BusinessException("页面 schema 解析失败", 400);
  }
}

/** 内容比对：剔除编译产物键 rule/option 后 JSON 比对 */
function schemaEquals(a: string | null, b: string | null): boolean {
  const strip = (s: string | null): string => {
    if (!s || s.trim() === "") return "{}";
    try {
      const n = JSON.parse(s);
      if (n && typeof n === "object" && !Array.isArray(n)) {
        delete n.rule;
        delete n.option;
        return JSON.stringify(n);
      }
      return JSON.stringify(n);
    } catch {
      return String(s);
    }
  };
  return strip(a) === strip(b);
}

// ==================== ViewCompiler（声明 → 编译产物，简化移植） ====================

function compileView(decl: Data, bindColumns: ColumnConfig[]): { rule: Data[]; option: Data } {
  const rule: Data[] = [];
  const searchFields = Array.isArray(decl.searchFields) ? (decl.searchFields as Data[]) : [];
  for (const sf of searchFields) {
    const key = String(sf.key ?? "");
    const label = String(sf.label ?? key);
    const matchType = String(sf.matchType ?? "eq");
    if (!["eq", "like", "range"].includes(matchType)) {
      throw new BusinessException("非法 matchType: " + matchType, 400);
    }
    if (matchType === "range") {
      rule.push({
        type: "datePicker",
        field: "search_" + key,
        title: label,
        props: { type: "datetimerange", valueFormat: "yyyy-MM-dd HH:mm:ss" },
      });
    } else {
      rule.push({ type: "input", field: "search_" + key, title: label, props: { placeholder: label } });
    }
  }
  const columns = Array.isArray(decl.columns) ? (decl.columns as Data[]) : [];
  rule.push({
    type: "el-table",
    field: "bizTable",
    props: {
      columns: columns.map((c) => ({ key: String(c.key ?? ""), label: String(c.label ?? c.key ?? "") })),
    },
  });
  const pagination = (decl.pagination ?? {}) as Data;
  const pageSize = Number(pagination.pageSize ?? 20);
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new BusinessException("pagination.pageSize 非法", 400);
  const option: Data = {
    pagination: {
      show: pagination.show !== false,
      pageSize,
      pageSizes: Array.isArray(pagination.pageSizes) && pagination.pageSizes.length ? pagination.pageSizes : [10, 20, 50],
    },
    sortableFields: Array.isArray(decl.sortableFields) ? decl.sortableFields : [],
  };
  if (decl.display != null) option.display = decl.display;
  void bindColumns;
  return { rule, option };
}

/** 发布基础校验（PageValidator 简化：绑定列存在性） */
function validateForPublish(tenantId: string, page: Row, decl: Data): ColumnConfig[] {
  const dataSourceId = page.dataSourceId as string | null;
  const formKey = page.formKey as string | null;
  let bindColumns: ColumnConfig[] = [];
  if (dataSourceId) {
    const ds = queryOne("SELECT ID FROM WF_DATA_SOURCE WHERE ID = ? AND TENANT_ID = ?", [dataSourceId, tenantId]);
    if (!ds) throw new BusinessException("绑定的数据源不存在", 400);
  } else if (formKey) {
    bindColumns = getBusinessColumnsByKey(tenantId, formKey);
  } else {
    throw new BusinessException("视图页面必须绑定数据源（dataSourceId）或业务表单（formKey）", 400);
  }
  const keys = new Set(bindColumns.map((c) => c.key));
  const searchFields = Array.isArray(decl.searchFields) ? (decl.searchFields as Data[]) : [];
  for (const sf of searchFields) {
    const key = String(sf.key ?? "");
    const col = bindColumns.find((c) => c.key === key);
    if (formKey && !col) throw new BusinessException("查询字段不存在: " + key, 400);
    if (col && (col.columnType === "JSON" || col.columnType === "TEXT" || col.columnType === "LONGTEXT")) {
      throw new BusinessException("查询字段不支持 JSON/TEXT 类型: " + key, 400);
    }
  }
  const columns = Array.isArray(decl.columns) ? (decl.columns as Data[]) : [];
  for (const c of columns) {
    if (c.custom === true) continue;
    const key = String(c.key ?? "");
    if (formKey && !keys.has(key)) throw new BusinessException("展示列不存在: " + key, 400);
  }
  return bindColumns;
}

// ==================== 端点：定义 CRUD（7） ====================

/** POST /api/v1/pages */
router.post("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const body = (req.body ?? {}) as Data;
  const name = String(body.name ?? "");
  const key = String(body.key ?? "");
  const type = String(body.type ?? "VIEW").toUpperCase();
  const formKey = body.formKey == null ? null : String(body.formKey);
  const dataSourceId = body.dataSourceId == null ? null : String(body.dataSourceId);
  const schema = body.schema == null ? "{}" : String(body.schema);
  if (type !== "VIEW" && type !== "PAGE") throw new BusinessException("页面类型非法（VIEW/PAGE）", 400);
  if (queryOne('SELECT ID FROM WF_PAGE_DEF WHERE TENANT_ID = ? AND "key" = ? LIMIT 1', [tenantId, key])) {
    throw new BusinessException("页面 key 已存在: " + key, 400);
  }
  const id = uuid32();
  const now = nowStr();
  exec(
    `INSERT INTO WF_PAGE_DEF (ID, TENANT_ID, NAME, "key", TYPE, FORM_KEY, DATA_SOURCE_ID, "schema", VERSION, STATUS, CREATED_BY, CREATED_AT, UPDATED_AT)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'DRAFT', ?, ?, ?)`,
    [id, tenantId, name, key, type, formKey, dataSourceId, schema, req.loginUser?.username ?? null, now, now],
  );
  ok(res, pageJSON(pageById(tenantId, id)));
});

/** GET /api/v1/pages?page=&size=&status=&name=&type= → PageResponse */
router.get("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const page = Math.max(Number(req.query.page ?? 1) || 1, 1);
  const size = Number(req.query.size ?? 20) || 20;
  const where: string[] = ["TENANT_ID = ?"];
  const params: unknown[] = [tenantId];
  if (req.query.status != null) { where.push("STATUS = ?"); params.push(String(req.query.status)); }
  if (req.query.name != null) { where.push("NAME LIKE ?"); params.push("%" + String(req.query.name) + "%"); }
  if (req.query.type != null) { where.push("TYPE = ?"); params.push(String(req.query.type)); }
  const totalRow = queryOne<{ c: number }>(`SELECT COUNT(1) AS c FROM WF_PAGE_DEF WHERE ${where.join(" AND ")}`, params);
  const rows = queryRows(
    "WF_PAGE_DEF",
    `SELECT * FROM WF_PAGE_DEF WHERE ${where.join(" AND ")} ORDER BY UPDATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  const totalElements = totalRow?.c ?? 0;
  ok(res, {
    content: rows.map((r) => pageJSON(r)),
    pageNumber: page,
    pageSize: size,
    totalElements,
    totalPages: size > 0 ? Math.ceil(totalElements / size) : 0,
  });
});

/** DELETE /api/v1/pages/menus/{menuId}（软删 + 404 兜底；必须先于 DELETE /:id 注册） */
router.delete("/menus/:menuId", (req: Request, res: Response) => {
  const menuId = Number(req.params.menuId);
  const menu = queryOne("SELECT ID FROM SYS_MENU WHERE ID = ? AND IS_DELETED = 0", [menuId]);
  if (!menu) throw new BusinessException("菜单不存在", 404);
  exec("UPDATE SYS_MENU SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?", [nowStr(), menuId]);
  ok(res);
});

/** GET /api/v1/pages/{key}/definition?preview= */
router.get("/:key/definition", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const preview = String(req.query.preview ?? "false") === "true";
  if (!preview) assertPageAccess(req, req.params.key);
  let row: Row;
  if (preview) {
    // 动态编译：任意 key 取最新版本，DRAFT VIEW 内存合并编译产物（不持久化）
    const rows = queryRows(
      'SELECT * FROM WF_PAGE_DEF WHERE TENANT_ID = ? AND "key" = ? ORDER BY VERSION DESC LIMIT 1',
      [tenantId, req.params.key],
    );
    if (!rows.length) throw new BusinessException("页面不存在: " + req.params.key, 404);
    row = rows[0];
    if (row.type === "VIEW" && row.status === "DRAFT") {
      const decl = parseSchema(row.schema as string);
      const bindColumns = row.formKey ? getBusinessColumnsByKey(tenantId, String(row.formKey)) : [];
      const compiled = compileView(decl, bindColumns);
      row = { ...row, schema: JSON.stringify({ ...decl, ...compiled }) };
    }
  } else {
    row = publishedByKey(tenantId, req.params.key);
  }
  ok(res, pageJSON(row, true));
});

/** GET /api/v1/pages/{pageKey}/data —— VIEW 页数据出口（先于 /:id 注册） */
router.get("/:pageKey/data", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  assertPageAccess(req, req.params.pageKey);
  const page = publishedByKey(tenantId, req.params.pageKey);
  if (page.TYPE !== "VIEW") throw new BusinessException("页面 " + req.params.pageKey + " 不是视图类型，不支持数据查询", 400);
  const hasDataSourceId = !!(page.DATA_SOURCE_ID && String(page.DATA_SOURCE_ID).trim() !== "");
  const hasFormKey = !!(page.FORM_KEY && String(page.FORM_KEY).trim() !== "");
  if (!hasDataSourceId && !hasFormKey) throw new BusinessException("页面 " + req.params.pageKey + " 未绑定数据源", 400);
  const req2 = queryRequestOf(req);
  // filter 白名单：仅保留 schema 声明的 searchFields key + filter.conditions 列
  const decl = parseSchema(page.schema as string);
  const whitelist = new Set<string>();
  for (const sf of Array.isArray(decl.searchFields) ? (decl.searchFields as Data[]) : []) {
    if (sf.key != null) whitelist.add(String(sf.key));
  }
  const filter = Array.isArray(decl.filter) ? null : (decl.filter ?? null);
  if (filter && typeof filter === "object" && Array.isArray((filter as Data).conditions)) {
    for (const c of (filter as Data).conditions as Data[]) {
      if (c.column != null) whitelist.add(String(c.column));
    }
  }
  if (req2.filter) {
    let parsed: Data;
    try {
      parsed = JSON.parse(req2.filter);
    } catch {
      throw new BusinessException("筛选参数 filter 格式非法", 400);
    }
    const kept: Data = {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.conditions)) {
        kept.conditions = (parsed.conditions as Data[]).filter((c) => whitelist.has(String(c.column ?? "")));
        kept.logic = parsed.logic ?? "AND";
      } else {
        for (const [k, v] of Object.entries(parsed)) if (whitelist.has(k)) kept[k] = v;
      }
    }
    req2.filter = JSON.stringify(kept);
  }
  // 排序白名单：schema 声明 sortableFields 时 sort 必须命中
  const sortable = new Set<string>(Array.isArray(decl.sortableFields) ? (decl.sortableFields as unknown[]).map(String) : []);
  if (req2.sort && sortable.size > 0 && !sortable.has(req2.sort)) {
    throw new BusinessException("排序字段不在页面声明的可排序字段中: " + req2.sort, 400);
  }
  if (hasDataSourceId) {
    ok(res, dsQueryData(tenantId, String(page.dataSourceId), req2));
    return;
  }
  ok(res, bizQuery(tenantId, { orgId: userOrgId(req) }, String(page.formKey), req2));
});

/** GET /api/v1/pages/{pageKey}/ds/{dataSourceId}/data —— PAGE 自定义页数据源查询 */
router.get("/:pageKey/ds/:dataSourceId/data", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  assertPageAccess(req, req.params.pageKey);
  const page = publishedByKey(tenantId, req.params.pageKey);
  if (page.TYPE !== "PAGE") throw new BusinessException("页面 " + req.params.pageKey + " 不是自定义页面类型", 400);
  const schema = parseSchema(page.schema as string);
  const sources = Array.isArray(schema.dataSources) ? (schema.dataSources as Data[]) : [];
  let refId: string | null = null;
  let searchWhitelist: string[] | null = null;
  for (const entry of sources) {
    if (String(entry.id ?? "") === req.params.dataSourceId) {
      refId = String(entry.refId ?? "");
      const sfs = Array.isArray(entry.searchFields) ? (entry.searchFields as unknown[]).map(String) : [];
      if (sfs.length) searchWhitelist = sfs;
      break;
    }
  }
  if (!refId) throw new BusinessException("页面未声明数据源: " + req.params.dataSourceId, 400);
  const req2 = queryRequestOf(req);
  if (req2.filter && searchWhitelist) {
    let parsed: Data;
    try {
      parsed = JSON.parse(req2.filter);
    } catch {
      throw new BusinessException("筛选参数 filter 格式非法", 400);
    }
    const keep = new Set(searchWhitelist);
    const kept: Data = {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (Array.isArray(parsed.conditions)) {
        kept.conditions = (parsed.conditions as Data[]).filter((c) => keep.has(String(c.column ?? "")));
        kept.logic = parsed.logic ?? "AND";
      } else {
        for (const [k, v] of Object.entries(parsed)) if (keep.has(k)) kept[k] = v;
      }
    }
    req2.filter = JSON.stringify(kept);
  }
  ok(res, dsQueryData(tenantId, refId, req2));
});

function userOrgId(req: Request): number | null {
  const row = queryOne<{ ORG_ID: number | null }>("SELECT ORG_ID FROM SYS_USER WHERE ID = ?", [Number(req.loginUser!.userId)]);
  return row?.ORG_ID ?? null;
}

/** 数据源查询数据（dsService.queryData：要求 ENABLED；简化不引入 datasource 模块防循环依赖） */
function dsQueryData(tenantId: string, dsId: string, req2: ReturnType<typeof queryRequestOf>): Row {
  const ds = queryRows("WF_DATA_SOURCE", "SELECT * FROM WF_DATA_SOURCE WHERE ID = ? AND TENANT_ID = ? LIMIT 1", [dsId, tenantId])[0];
  if (!ds) throw new BusinessException("数据源不存在: " + dsId, 404);
  if (ds.status !== "ENABLED") throw new BusinessException("数据源未启用，无法访问: " + ds.name, 400);
  const type = ds.type as string;
  const fk = ds.formKey as string | null;
  if (type === "FORM") {
    const cfg = parseFormQueryConfig((ds.params as string | null) ?? "{}");
    if (cfg.queryMode === "config" && cfg.joins.length > 0) return bizQueryJoin(tenantId, fk!, req2, cfg.joins);
    if (cfg.queryMode === "sql" && cfg.query) return bizQuerySql(tenantId, fk!, req2, cfg);
    return bizQuery(tenantId, null, fk!, req2);
  }
  if (type === "WORKFLOW") return bizQuery(tenantId, null, fk!, req2); // WORKFLOW 页面查询走通用路径简化（数据源模块另有完整实现）
  if (type === "SQL") {
    const cfg = parseFormQueryConfig((ds.params as string | null) ?? "{}");
    if (cfg.queryMode === "visual") return bizQuerySqlRaw(tenantId, fk!, req2, cfg);
    if (cfg.queryMode === "sql") return bizQuerySql(tenantId, fk!, req2, cfg);
    throw new BusinessException("SQL 数据源缺少查询配置", 400);
  }
  if (type === "SYSTEM") {
    throw new BusinessException("系统数据源不支持页面查询", 400);
  }
  throw new BusinessException("数据源类型未启用: " + type, 400);
}

/** GET /api/v1/pages/{key}/menus（按 path 反查） */
router.get("/:key/menus", (req: Request, res: Response) => {
  const menus = queryRows("SYS_MENU", "SELECT * FROM SYS_MENU WHERE PATH = ? AND IS_DELETED = 0", ["/page/" + req.params.key]);
  ok(res, {
    items: menus.map((m) => ({
      id: String(m.id),
      name: m.menuName,
      path: m.path,
      component: m.component ?? null,
      permission: m.permission ?? null,
      parentId: m.parentId == null ? null : String(m.parentId),
      sortOrder: m.sortOrder ?? 0,
      status: m.status,
    })),
  });
});

/** GET /api/v1/pages/{id}（详情含 schema） */
router.get("/:id", (req: Request, res: Response) => {
  ok(res, pageJSON(pageById(tenantOf(req), req.params.id), true));
});

/** PUT /api/v1/pages/{id}（原地更新，null 字段不更新） */
router.put("/:id", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const cur = pageById(tenantId, req.params.id);
  const body = (req.body ?? {}) as Data;
  const name = body.name == null ? null : String(body.name);
  const key = body.key == null ? null : String(body.key);
  const schema = body.schema == null ? null : String(body.schema);
  const formKey = body.formKey === undefined ? undefined : body.formKey == null ? null : String(body.formKey);
  const dataSourceId = body.dataSourceId === undefined ? undefined : body.dataSourceId == null ? null : String(body.dataSourceId);
  if (key && key !== cur.key && queryOne('SELECT ID FROM WF_PAGE_DEF WHERE TENANT_ID = ? AND "key" = ? AND ID <> ?', [tenantId, key, cur.id])) {
    throw new BusinessException("页面 key 已存在: " + key, 400);
  }
  exec(
    `UPDATE WF_PAGE_DEF SET NAME = ?, "key" = ?, "schema" = ?, FORM_KEY = ?, DATA_SOURCE_ID = ?, UPDATED_AT = ? WHERE ID = ?`,
    [
      name ?? cur.name,
      key ?? cur.key,
      schema ?? cur.schema,
      formKey === undefined ? cur.formKey : formKey,
      dataSourceId === undefined ? cur.dataSourceId : dataSourceId,
      nowStr(),
      req.params.id,
    ],
  );
  ok(res, pageJSON(pageById(tenantId, req.params.id)));
});

function pageRefCountUnused() {}
void pageRefCountUnused;

/** DELETE /api/v1/pages/{id}（软删；PUBLISHED 拒绝） */
router.delete("/:id", (req: Request, res: Response) => {
  const cur = pageById(tenantOf(req), req.params.id);
  if (cur.status === "PUBLISHED") throw new BusinessException("已发布的页面不能删除", 400);
  exec("UPDATE WF_PAGE_DEF SET STATUS = 'ARCHIVED', UPDATED_AT = ? WHERE ID = ?", [nowStr(), req.params.id]);
  ok(res);
});

/** POST /api/v1/pages/{id}/publish */
router.post("/:id/publish", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const result = tx(() => publishInTx(tenantId, req.params.id));
  ok(res, result);
});

function publishInTx(tenantId: string, id: string): Row {
  const rows = queryRows("WF_PAGE_DEF", "SELECT * FROM WF_PAGE_DEF WHERE ID = ? AND TENANT_ID = ?", [id, tenantId]);
  if (!rows.length) throw new BusinessException("页面不存在: " + id, 404);
  const cur = rows[0];
  if (cur.status === "ARCHIVED") throw new BusinessException("已归档页面不能发布", 400);
  const oldPublished = queryRows(
    'SELECT * FROM WF_PAGE_DEF WHERE TENANT_ID = ? AND "key" = ? AND STATUS = ? AND ID <> ? ORDER BY VERSION DESC LIMIT 1',
    [tenantId, cur.key, "PUBLISHED", id],
  );
  if (
    oldPublished.length &&
    schemaEquals(cur.schema as string, oldPublished[0].schema as string)
  ) {
    throw new BusinessException("页面内容与已发布版本未变化，无需发布", 400);
  }
  let nextSchema = cur.schema as string;
  if (cur.type === "VIEW") {
    const decl = parseSchema(cur.schema as string);
    const bindColumns = validateForPublish(tenantId, cur, decl);
    const compiled = compileView(decl, bindColumns);
    nextSchema = JSON.stringify({ ...decl, ...compiled });
    exec('UPDATE WF_PAGE_DEF SET "schema" = ? WHERE ID = ?', [nextSchema, id]);
  }
  if (oldPublished.length) {
    exec("UPDATE WF_PAGE_DEF SET STATUS = 'ARCHIVED', UPDATED_AT = ? WHERE ID = ?", [nowStr(), oldPublished[0].id]);
  }
  exec("UPDATE WF_PAGE_DEF SET STATUS = 'PUBLISHED', PUBLISHED_VERSION = ?, UPDATED_AT = ? WHERE ID = ?", [
    Number(cur.version), nowStr(), id,
  ]);
  return pageJSON(pageById(tenantId, id));
}

/** POST /api/v1/pages/{id}/mount-menu */
router.post("/:id/mount-menu", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const page = pageById(tenantId, req.params.id);
  if (page.status !== "PUBLISHED") throw new BusinessException("仅已发布页面可挂接菜单", 400);
  const body = (req.body ?? {}) as Data;
  const menuName = body.name == null || String(body.name).trim() === "" ? String(page.name) : String(body.name);
  const parentId = body.parentId == null || String(body.parentId).trim() === "" ? null : Number(body.parentId);
  const now = nowStr();
  const r = exec(
    `INSERT INTO SYS_MENU (MENU_NAME, MENU_TYPE, PARENT_ID, PATH, COMPONENT, PERMISSION, SORT_ORDER, STATUS, IS_DELETED, CREATED_BY, CREATED_AT, UPDATED_AT)
     VALUES (?, 1, ?, ?, 'page/PageRenderer', ?, 0, 1, 0, ?, ?, ?)`,
    [menuName, parentId, "/page/" + page.key, "page:read:" + page.key, req.loginUser?.username ?? null, now, now],
  );
  // 管理员挂接自动授权 ROLE_ADMIN
  if (isAdmin(req)) {
    const role = queryOne<{ ID: number }>("SELECT ID FROM SYS_ROLE WHERE ROLE_CODE = 'ROLE_ADMIN' AND IS_DELETED = 0 LIMIT 1");
    if (role) {
      exec("INSERT INTO SYS_ROLE_MENU (ROLE_ID, MENU_ID) VALUES (?, ?)", [role.ID, r.lastInsertRowid]);
    }
  }
  const menu = queryOne("SELECT * FROM SYS_MENU WHERE ID = ?", [r.lastInsertRowid]);
  ok(res, {
    id: String(menu!.ID),
    name: menu!.MENU_NAME,
    path: menu!.PATH,
    component: menu!.COMPONENT ?? null,
    permission: menu!.PERMISSION ?? null,
    parentId: menu!.PARENT_ID == null ? null : String(menu!.PARENT_ID),
    sortOrder: menu!.SORT_ORDER ?? 0,
    status: menu!.STATUS,
  });
});

function queryRequestOf(req: Request) {
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

export default router;
