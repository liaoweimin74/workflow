/**
 * 表单定义模块 —— FormDefinitionController + FormDefinitionService 移植（Task 13-5）
 * mount 前缀：/api/v1/form-definitions（9 端点）
 *
 * 语义对齐：create→v1/DRAFT；update 原地更新不建版本；publish 原地改 PUBLISHED
 * （同 key 其他 PUBLISHED→ARCHIVED，BUSINESS 触发动态表 DDL）；delete 软删 ARCHIVED。
 * 发布事件同步数据源（DataSourceSyncListener 语义：BUSINESS→FORM / WORKFLOW→WORKFLOW 数据源）。
 */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok } from "../../lib/http";
import { BusinessException } from "../../lib/errors";
import { query, queryOne, queryRows, exec, tx } from "../../lib/db";
import { nowStr, normTs, uuid32 } from "../../lib/dialect";
import {
  ColumnConfig,
  ensureTable,
  ensureSubTable,
  IllegalArgumentException,
  validateFormKey,
  validateColumns,
} from "./dynamic-table";

const router = Router();

// ==================== 基础工具 ====================

export function tenantOf(req: Request): string {
  return ((req as Request & { tenantId?: string }).tenantId) || "default";
}

function throwNotFound(msg: string): never {
  // Java RuntimeException → HTTP 500 + R.fail(500, msg)
  throw new Error(msg);
}

/** WF_FORM_DEF 原始行 → FormDefinition 实体 JSON（camelCase + ts 归一） */
export function formDefJSON(r: Record<string, unknown>): Record<string, unknown> {
  return {
    id: r.id as string,
    tenantId: r.tenantId as string,
    name: r.name as string,
    key: r.key as string,
    type: r.type as string,
    columnConfig: (r.columnConfig as string) ?? null,
    schema: (r.schema as string) ?? null,
    version: r.version as number,
    status: r.status as string,
    processKey: (r.processKey as string) ?? null,
    publishedVersion: (r.publishedVersion as number) ?? null,
    createdBy: (r.createdBy as string) ?? null,
    createdAt: r.createdAt ?? null,
    updatedAt: r.updatedAt ?? null,
  };
}

function formDefById(tenantId: string, id: string): Record<string, unknown> | null {
  const rows = queryRows(
    "WF_FORM_DEF",
    "SELECT * FROM WF_FORM_DEF WHERE ID = ? AND TENANT_ID = ? LIMIT 1",
    [id, tenantId],
  );
  return rows.length ? formDefJSON(rows[0]) : null;
}

function formDefByKeyLatest(tenantId: string, key: string): Record<string, unknown> | null {
  const rows = queryRows(
    "WF_FORM_DEF",
    'SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? ORDER BY VERSION DESC LIMIT 1',
    [tenantId, key],
  );
  return rows.length ? formDefJSON(rows[0]) : null;
}

// ==================== 列映射/schema 解析（FormSchemaColumnExtractor 移植） ====================

const UNSUPPORTED_SCHEMA_COMPONENTS = new Set([
  "userPicker", "deptPicker", "divider", "groupContainer", "dataTable",
  "group", "tableForm", "subForm", "formContainer",
]);
const COL_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;

/** form-create 组件类型 → 推断列类型（inferColumnType） */
function inferColumnType(componentType: string | null | undefined): string {
  if (!componentType) return "VARCHAR";
  switch (componentType) {
    case "inputNumber": case "rate": return "INT";
    case "inputTextarea": case "editor": return "TEXT";
    case "date": case "datetime": case "time": case "dateRange": case "dateTimeRange": return "DATETIME";
    case "switch": case "checkbox": return "TINYINT";
    default: return "VARCHAR";
  }
}

/** columnConfig JSON → ColumnConfig[]（非法返回空列表） */
export function parseColumnConfig(columnConfig: string | null | undefined): ColumnConfig[] {
  if (!columnConfig || !columnConfig.trim()) return [];
  try {
    const arr = JSON.parse(columnConfig);
    return Array.isArray(arr) ? (arr as ColumnConfig[]) : [];
  } catch {
    return [];
  }
}

/** 从 form-create schema 解析列定义（WORKFLOW 表单 metadata 用；递归 children/props.rule/props.columns[].rule） */
export function extractSchemaColumns(schemaJson: string | null | undefined): ColumnConfig[] {
  if (!schemaJson || !schemaJson.trim()) return [];
  let rules: unknown;
  try {
    const root = JSON.parse(schemaJson);
    rules = Array.isArray(root) ? root : root?.rule;
  } catch {
    return [];
  }
  if (!Array.isArray(rules) || rules.length === 0) return [];
  const cols: ColumnConfig[] = [];
  collectColumnsFromRules(rules as Record<string, unknown>[], cols);
  return cols;
}

type RuleNode = Record<string, unknown>;

function nodeGet(n: RuleNode, k: string): unknown {
  return n?.[k];
}

function asArray(v: unknown): RuleNode[] | null {
  return Array.isArray(v) ? (v as RuleNode[]) : null;
}

function collectColumnsFromRules(rules: RuleNode[], cols: ColumnConfig[]): void {
  for (const rule of rules) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) continue;
    const field = nodeGet(rule, "field") == null ? null : String(nodeGet(rule, "field"));
    const type = nodeGet(rule, "type") == null ? null : String(nodeGet(rule, "type"));

    // 外部数据组件整体跳过（不提取列、不递归）
    if (type === "formContainer" || type === "page-table" || type === "page-list-cards") continue;

    if (field && COL_PATTERN.test(field)) {
      if (!type || !UNSUPPORTED_SCHEMA_COMPONENTS.has(type)) {
        let label = nodeGet(rule, "title") == null ? null : String(nodeGet(rule, "title"));
        if (!label) label = nodeGet(rule, "label") == null ? field : String(nodeGet(rule, "label"));
        if (!label) label = field;
        const c: ColumnConfig = {
          key: field,
          label,
          columnType: inferColumnType(type),
        };
        if (type) c.componentType = type;
        cols.push(c);
      }
    }

    const children = asArray(nodeGet(rule, "children"));
    if (children) collectColumnsFromRules(children, cols);

    const props = (nodeGet(rule, "props") ?? {}) as RuleNode;
    const propsRule = asArray(props?.rule);
    if (propsRule) collectColumnsFromRules(propsRule, cols);

    const propsColumns = asArray(props?.columns);
    if (propsColumns) {
      for (const col of propsColumns) {
        const colRule = asArray(col?.rule);
        if (colRule) collectColumnsFromRules(colRule, cols);
      }
    }
  }
}

// ==================== 已发布业务表单列映射（跨模块复用） ====================

/** 按 key 获取已发布业务表单的列映射（对齐 FormDefinitionService.getBusinessColumnsByKey） */
export function getBusinessColumnsByKey(tenantId: string, key: string): ColumnConfig[] {
  const rows = queryRows(
    "WF_FORM_DEF",
    'SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? AND STATUS = ? ORDER BY VERSION DESC LIMIT 1',
    [tenantId, key, "PUBLISHED"],
  );
  if (!rows.length) throw new BusinessException("业务表单不存在或未发布: " + key, 404);
  const def = formDefJSON(rows[0]);
  if (def.type !== "BUSINESS") throw new BusinessException("表单 " + key + " 不是业务表单", 400);
  return parseColumnConfig(def.columnConfig as string);
}

// ==================== 数据源同步（DataSourceSyncListener 内联移植） ====================

function findDsByFormKey(tenantId: string, formKey: string): Record<string, unknown> | null {
  return queryOne("SELECT * FROM WF_DATA_SOURCE WHERE TENANT_ID = ? AND FORM_KEY = ? LIMIT 1", [tenantId, formKey]);
}

function syncDataSourceCreated(tenantId: string, formId: string, formName: string, formKey: string, formType: string): void {
  const dsType = formType === "BUSINESS" ? "FORM" : formType === "WORKFLOW" ? "WORKFLOW" : null;
  if (!dsType) return;
  if (findDsByFormKey(tenantId, formKey)) return;
  exec(
    `INSERT INTO WF_DATA_SOURCE (ID, TENANT_ID, NAME, "type", FORM_KEY, FORM_ID, SOURCE_KEY, STATUS, CREATED_BY, CREATED_AT, UPDATED_AT)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid32(), tenantId, formName + " 数据源", dsType, formKey, formId, formKey, "ENABLED", "system", nowStr(), nowStr()],
  );
}

function syncDataSourceRenamed(tenantId: string, formName: string, formKey: string): void {
  exec("UPDATE WF_DATA_SOURCE SET NAME = ?, UPDATED_AT = ? WHERE TENANT_ID = ? AND FORM_KEY = ?", [
    formName + " 数据源", nowStr(), tenantId, formKey,
  ]);
}

function syncDataSourceDeleted(tenantId: string, formKey: string): void {
  exec("DELETE FROM WF_DATA_SOURCE WHERE TENANT_ID = ? AND FORM_KEY = ?", [tenantId, formKey]);
}

// ==================== 发布校验（BUSINESS schema） ====================

const UNSUPPORTED_PUBLISH_COMPONENTS = new Set(["userPicker", "deptPicker", "divider", "groupContainer", "dataTable"]);

function schemaRules(schema: string | null | undefined): RuleNode[] | null {
  let root: unknown;
  try {
    root = JSON.parse(schema == null || !schema.trim() ? "[]" : schema);
  } catch {
    throw new BusinessException("表单 schema 解析失败", 400);
  }
  const rules = Array.isArray(root) ? root : (root as RuleNode | null)?.rule;
  return Array.isArray(rules) ? (rules as RuleNode[]) : null;
}

function validateBusinessSchema(schema: string | null | undefined): void {
  const rules = schemaRules(schema);
  if (!rules) throw new BusinessException("表单 schema 格式非法", 400);
  for (const field of rules) {
    const type = field?.type == null ? "" : String(field.type);
    if (UNSUPPORTED_PUBLISH_COMPONENTS.has(type)) {
      throw new BusinessException("业务表单暂不支持组件（" + type + "），请移除后发布", 400);
    }
  }
}

function collectExternalDisplayFields(schema: string | null | undefined): Set<string> {
  const fields = new Set<string>();
  const walk = (rules: RuleNode[] | null): void => {
    if (!rules) return;
    for (const field of rules) {
      if (String(field?.type ?? "") === "page-list-cards") {
        const key = String(field?.field ?? "");
        if (key) fields.add(key);
        continue;
      }
      walk(asArray(field?.children));
      const props = (field?.props ?? {}) as RuleNode;
      walk(asArray(props?.rule));
      const columns = asArray(props?.columns);
      if (columns) for (const col of columns) walk(asArray(col?.rule));
    }
  };
  walk(schemaRules(schema));
  return fields;
}

/** data-picker 引用校验（目标表单已发布 BUSINESS、displayField/columns/dependOn/filters 引用列存在） */
function validatePickerReferences(tenantId: string, schema: string | null | undefined): void {
  const rules = schemaRules(schema);
  if (!rules) return;
  for (const field of rules) {
    if (String(field?.type ?? "") !== "dataPicker") continue;
    const fieldKey = String(field?.field ?? "");
    const props = (field?.props ?? {}) as RuleNode;
    const dataSourceId = String(props?.dataSourceId ?? "");
    const sourceFormKey = String(props?.sourceFormKey ?? "");
    if (!dataSourceId && !sourceFormKey) {
      throw new BusinessException("data-picker 字段 " + fieldKey + " 未配置数据源（dataSourceId）", 400);
    }
    if (dataSourceId) continue; // 数据源模式跳过列级校验
    let targetColumns: ColumnConfig[];
    try {
      targetColumns = getBusinessColumnsByKey(tenantId, sourceFormKey);
    } catch {
      throw new BusinessException("data-picker 目标表单不存在或未发布: " + sourceFormKey, 400);
    }
    const targetKeys = new Set(targetColumns.map((c) => c.key));
    const displayField = String(props?.displayField ?? "");
    if (!displayField) throw new BusinessException("data-picker 字段 " + fieldKey + " 未配置显示字段", 400);
    if (!targetKeys.has(displayField)) throw new BusinessException("data-picker 引用列已不存在: " + displayField, 400);
    const propColumns = asArray(props?.columns);
    if (propColumns) {
      for (const col of propColumns) {
        const c = String(col ?? "");
        if (c && !targetKeys.has(c)) throw new BusinessException("data-picker 引用列已不存在: " + c, 400);
      }
    }
    const dependOn = (props?.dependOn ?? {}) as RuleNode;
    const sourceColumn = String(dependOn?.sourceColumn ?? "");
    if (sourceColumn && !targetKeys.has(sourceColumn)) {
      throw new BusinessException("data-picker 级联引用列已不存在: " + sourceColumn, 400);
    }
    const hiddenKeys = new Set(targetColumns.filter((c) => c.hidden).map((c) => c.key));
    const filters = asArray(props?.filters);
    if (filters) {
      for (const filter of filters) {
        const fCol = String((filter as RuleNode)?.column ?? "");
        if (!fCol) continue;
        if (!targetKeys.has(fCol)) throw new BusinessException("data-picker 过滤条件引用列已不存在: " + fCol, 400);
        if (hiddenKeys.has(fCol)) throw new BusinessException("data-picker 过滤条件不能引用隐藏列: " + fCol, 400);
      }
    }
  }
}

/** 解析 column_config（必填校验 + 白名单校验 + SUB_TABLE 拒绝），过滤外部展示列 */
function parseColumnConfigForPublish(columnConfig: string | null | undefined): ColumnConfig[] {
  if (!columnConfig || !columnConfig.trim()) {
    throw new BusinessException("业务表单发布前必须配置列映射（column_config）", 400);
  }
  let columns: ColumnConfig[];
  try {
    const arr = JSON.parse(columnConfig);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error("empty");
    columns = arr as ColumnConfig[];
  } catch {
    throw new BusinessException("业务表单列映射配置非法", 400);
  }
  const reserved = new Set(["id", "tenant_id", "version", "created_by", "created_at", "updated_at"]);
  const allowedTypes = new Set(["VARCHAR", "TEXT", "LONGTEXT", "INT", "DECIMAL", "DATE", "DATETIME", "TINYINT", "JSON"]);
  const validate = (c: ColumnConfig): void => {
    if (!c.key || !COL_PATTERN.test(c.key)) throw new BusinessException("非法列名: " + c.key, 400);
    if (Array.isArray(c.subColumns) && c.subColumns.length > 0) {
      for (const sub of c.subColumns) validate(sub);
      return;
    }
    if (reserved.has(c.key)) throw new BusinessException("列名 " + c.key + " 为系统保留列", 400);
    if (!c.columnType || !allowedTypes.has(c.columnType)) throw new BusinessException("非法列类型: " + c.columnType, 400);
  };
  for (const c of columns) {
    validate(c);
    if (c.storageMode === "SUB_TABLE") throw new BusinessException("子表存储模式暂未实现: " + c.key, 400);
  }
  // DdlBuilder 规则校验提前暴露非法配置
  for (const c of columns) {
    try {
      validateFormKey("a");
      if (Array.isArray(c.subColumns) && c.subColumns.length > 0) continue;
      // 复用 DdlBuilder 级校验（构造单列探测）
      ensureTableDryCheck(c);
    } catch (e) {
      if (e instanceof IllegalArgumentException) throw new BusinessException(e.message, 400);
      throw e;
    }
  }
  return columns;
}

function ensureTableDryCheck(c: ColumnConfig): void {
  // 轻量校验：复用 DdlBuilder 级列规则（列名白名单/保留字/类型白名单/长度范围）
  validateColumns([c]);
}

// ==================== 端点 ====================

/** POST /api/v1/form-definitions?name=&key=&type=&processKey= */
router.post("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const name = String(req.query.name ?? "");
  const key = String(req.query.key ?? "");
  const type = req.query.type == null || String(req.query.type).trim() === "" ? "WORKFLOW" : String(req.query.type);
  const processKey = req.query.processKey == null ? null : String(req.query.processKey);

  const dup = queryOne("SELECT ID FROM WF_FORM_DEF WHERE TENANT_ID = ? AND \"key\" = ? LIMIT 1", [tenantId, key]);
  if (dup) throwNotFound("Form key already exists: " + key);

  const id = uuid32();
  const now = nowStr();
  const createdBy = req.loginUser?.username ?? null;
  exec(
    `INSERT INTO WF_FORM_DEF (ID, TENANT_ID, NAME, "key", TYPE, PROCESS_KEY, "schema", VERSION, STATUS, CREATED_BY, CREATED_AT, UPDATED_AT)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, tenantId, name, key, type, processKey, "[]", 1, "DRAFT", createdBy, now, now],
  );
  syncDataSourceCreated(tenantId, id, name, key, type);
  ok(res, formDefById(tenantId, id));
});

/** GET /api/v1/form-definitions?page=&size=&status=&name=&type= → PageResponse */
router.get("/", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const page = Math.max(Number(req.query.page ?? 1) || 1, 1);
  const size = Number(req.query.size ?? 20) || 20;
  const status = req.query.status == null ? null : String(req.query.status);
  const name = req.query.name == null ? null : String(req.query.name);
  const type = req.query.type == null ? null : String(req.query.type);

  const where: string[] = ["TENANT_ID = ?"];
  const params: unknown[] = [tenantId];
  if (type) { where.push("TYPE = ?"); params.push(type); }
  if (name) { where.push("NAME LIKE ?"); params.push("%" + name + "%"); }
  if (status) { where.push("STATUS = ?"); params.push(status); }

  const totalRow = queryOne<{ c: number }>(
    `SELECT COUNT(1) AS c FROM WF_FORM_DEF WHERE ${where.join(" AND ")}`,
    params,
  );
  const rows = queryRows(
    "WF_FORM_DEF",
    `SELECT * FROM WF_FORM_DEF WHERE ${where.join(" AND ")} ORDER BY UPDATED_AT DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  const totalElements = totalRow?.c ?? 0;
  ok(res, {
    content: rows.map(formDefJSON),
    pageNumber: page,
    pageSize: size,
    totalElements,
    totalPages: size > 0 ? Math.ceil(totalElements / size) : 0,
  });
});

/** GET /api/v1/form-definitions/by-key/{key}（先于 /:id 注册） */
router.get("/by-key/:key", (req: Request, res: Response) => {
  const def = formDefByKeyLatest(tenantOf(req), req.params.key);
  if (!def) throwNotFound("Form definition not found: " + req.params.key);
  ok(res, def);
});

/** GET /api/v1/form-definitions/{id}/versions/{version}（先于 /:id 注册） */
router.get("/:id/versions/:version", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const def = formDefById(tenantId, req.params.id);
  if (!def) throwNotFound("Form definition not found: " + req.params.id);
  const rows = queryRows(
    "WF_FORM_DEF",
    'SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? AND VERSION = ? LIMIT 1',
    [tenantId, def.key, Number(req.params.version)],
  );
  if (!rows.length) throwNotFound(`Form version not found: ${def.key} v${req.params.version}`);
  ok(res, formDefJSON(rows[0]));
});

/** GET /api/v1/form-definitions/{id}/versions */
router.get("/:id/versions", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const def = formDefById(tenantId, req.params.id);
  if (!def) throwNotFound("Form definition not found: " + req.params.id);
  const rows = queryRows(
    "WF_FORM_DEF",
    'SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? ORDER BY VERSION DESC',
    [tenantId, def.key],
  );
  ok(res, rows.map((r) => ({
    id: r.id as string,
    version: r.version as number,
    status: r.status as string,
    createdBy: (r.createdBy as string) ?? null,
    createdAt: r.createdAt ?? null,
  })));
});

/** GET /api/v1/form-definitions/{id} */
router.get("/:id", (req: Request, res: Response) => {
  const def = formDefById(tenantOf(req), req.params.id);
  if (!def) throwNotFound("Form definition not found: " + req.params.id);
  ok(res, def);
});

/** PUT /api/v1/form-definitions/{id}（原地更新，null 字段不更新） */
router.put("/:id", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const id = req.params.id;
  const body = req.body ?? {};
  const current = formDefById(tenantId, id);
  if (!current) throwNotFound("Form definition not found: " + id);

  const name = body.name ?? null;
  const key = body.key ?? null;
  const schema = body.schema ?? null;
  const columnConfig = body.columnConfig ?? null;
  const processKey = body.processKey ?? null;

  const next = {
    name: name != null ? String(name) : (current.name as string),
    key: key != null ? String(key) : (current.key as string),
    schema: schema != null ? String(schema) : (current.schema as string),
    columnConfig: columnConfig != null ? String(columnConfig) : (current.columnConfig as string),
    processKey: processKey != null ? String(processKey) : (current.processKey as string),
  };
  exec(
    `UPDATE WF_FORM_DEF SET NAME = ?, "key" = ?, "schema" = ?, COLUMN_CONFIG = ?, PROCESS_KEY = ?, UPDATED_AT = ? WHERE ID = ? AND TENANT_ID = ?`,
    [next.name, next.key, next.schema, next.columnConfig, next.processKey, nowStr(), id, tenantId],
  );
  if (name != null || key != null) syncDataSourceRenamed(tenantId, next.name, next.key);
  ok(res, formDefById(tenantId, id));
});

/** DELETE /api/v1/form-definitions/{id}（软删 ARCHIVED；PUBLISHED 拒绝） */
router.delete("/:id", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const def = formDefById(tenantId, req.params.id);
  if (!def) throwNotFound("Form definition not found: " + req.params.id);
  if (def.status === "PUBLISHED") throw new BusinessException("已发布的表单不能删除", 400);
  exec("UPDATE WF_FORM_DEF SET STATUS = 'ARCHIVED', UPDATED_AT = ? WHERE ID = ? AND TENANT_ID = ?", [
    nowStr(), req.params.id, tenantId,
  ]);
  syncDataSourceDeleted(tenantId, String(def.key));
  ok(res);
});

/** POST /api/v1/form-definitions/{id}/publish */
router.post("/:id/publish", (req: Request, res: Response) => {
  const tenantId = tenantOf(req);
  const id = req.params.id;
  const result = tx(() => publishInTx(tenantId, id));
  ok(res, result);
});

function publishInTx(tenantId: string, id: string): Record<string, unknown> {
  // 悲观锁替代：tx() 为 BEGIN IMMEDIATE（库级写串行化），发布流程串行
  const rows = queryRows("WF_FORM_DEF", "SELECT * FROM WF_FORM_DEF WHERE ID = ? AND TENANT_ID = ?", [id, tenantId]);
  if (!rows.length) throwNotFound("Form definition not found: " + id);
  const draft = formDefJSON(rows[0]);

  const republish = draft.status === "PUBLISHED";
  if (draft.status !== "DRAFT" && !republish) {
    throw new BusinessException("仅草稿或已发布表单可发布，当前状态: " + draft.status, 400);
  }

  const lastPublishedRows = republish
    ? queryRows(
        "WF_FORM_DEF",
        'SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? AND STATUS = ? AND ID <> ? ORDER BY VERSION DESC LIMIT 1',
        [tenantId, draft.key, "PUBLISHED", id],
      )
    : queryRows(
        "WF_FORM_DEF",
        'SELECT * FROM WF_FORM_DEF WHERE TENANT_ID = ? AND "key" = ? AND STATUS = ? ORDER BY VERSION DESC LIMIT 1',
        [tenantId, draft.key, "PUBLISHED"],
      );
  const lastPublished = lastPublishedRows.length ? formDefJSON(lastPublishedRows[0]) : null;
  if (lastPublished && lastPublished.schema === draft.schema) {
    throw new BusinessException("表单内容未变化，无需发布", 400);
  }

  // 业务表单：校验 schema 并同步物理表结构（DDL 先于版本记录，同事务原子）
  if (draft.type === "BUSINESS") {
    validateBusinessSchema(draft.schema as string);
    validatePickerReferences(tenantId, draft.schema as string);
    const externalDisplayFields = collectExternalDisplayFields(draft.schema as string);
    const columns = parseColumnConfigForPublish(draft.columnConfig as string)
      .filter((c) => c.componentType !== "page-list-cards")
      .filter((c) => !externalDisplayFields.has(c.key));
    if (columns.length > 0) {
      ensureTable(String(draft.key), columns);
      for (const c of columns) {
        if (Array.isArray(c.subColumns) && c.subColumns.length > 0) {
          ensureSubTable(String(draft.key), c.key, c.subColumns);
        }
      }
    }
  }

  if (lastPublished) {
    exec("UPDATE WF_FORM_DEF SET STATUS = 'ARCHIVED', UPDATED_AT = ? WHERE ID = ?", [nowStr(), lastPublished.id]);
  }
  exec("UPDATE WF_FORM_DEF SET STATUS = 'PUBLISHED', PUBLISHED_VERSION = ?, UPDATED_AT = ? WHERE ID = ?", [
    draft.version, nowStr(), id,
  ]);
  syncDataSourceCreated(tenantId, String(draft.id), String(draft.name), String(draft.key), String(draft.type));
  return formDefById(tenantId, id)!;
}

export default router;
