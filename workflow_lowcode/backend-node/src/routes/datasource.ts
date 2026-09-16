/**
 * datasource.ts — /api/v1/data-sources/* + /api/v1/internal/system/*（Task 13-5b 主线程补写）
 *
 * 对齐 DataSourceController(18) + SystemInternalController(10)。
 * params 为 JSON 文本：{queryMode?: 'config'|'sql', query?, columns?, joins?, ...}
 * SQLite 元数据：sqlite_master（表）+ PRAGMA table_info（列）；
 * 类型归一对齐 H2 实测输出（Task 9/10）：TEXT→VARCHAR(1e9)（CLOB 等价）、INTEGER→INT、
 * REAL→DECIMAL、其余→VARCHAR。
 */
import { Router } from 'express';
import { getDb, all, one, run, type Row } from '../lib/db';
import { R, BusinessException, IllegalArgumentError } from '../lib/errors';
import { authGuard, ah, ok, requireBody, type AuthedRequest } from '../lib/http';
import { pageResponse, parsePaging } from '../lib/page';
import { pathId, jsonBody, bodyStr } from '../lib/params';
import { fmtIso } from '../lib/serialize';
import { COLUMN_KINDS } from '../db/schema.generated';

export const datasourceRouter = Router();
export const internalSystemRouter = Router();

const randomUUID = (): string => crypto.randomUUID().replace(/-/g, '');

function nowText(): string {
  return fmtIso(new Date()).replace('T', ' ');
}

// ---------------------------------------------------------------- DTO

interface DsRow extends Row {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  form_key: string | null;
  source_key: string | null;
  form_id: string | null;
  params: string | null;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

function dsDTO(r: DsRow): Record<string, unknown> {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    type: r.type,
    formKey: r.form_key,
    sourceKey: r.source_key,
    params: r.params,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at ? r.created_at.replace(' ', 'T') : null,
    updatedAt: r.updated_at ? r.updated_at.replace(' ', 'T') : null,
  };
}

function dsById(id: string, tenantId: string): DsRow | null {
  return (one('SELECT * FROM wf_data_source WHERE "id" = ? AND "tenant_id" = ?', [id, tenantId]) as DsRow | null) ?? null;
}

// ---------------------------------------------------------------- CRUD（18 端点之 9）

datasourceRouter.post(
  '/api/v1/data-sources',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const b = requireBody(req.body);
    const name = bodyStr(b['name']);
    const type = bodyStr(b['type']);
    if (!name || !type) throw new BusinessException('名称与类型不能为空');
    if (!['FORM', 'SQL', 'API'].includes(type)) throw new BusinessException('未知数据源类型: ' + type);
    const dup = one('SELECT "id" FROM wf_data_source WHERE "tenant_id" = ? AND "name" = ?', [tenantId, name]);
    if (dup) throw new BusinessException('数据源名称已存在: ' + name);
    const id = randomUUID();
    const now = nowText();
    run(
      `INSERT INTO wf_data_source ("id","tenant_id","name","type","form_key","source_key","form_id","params","status","created_by","created_at","updated_at")
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, tenantId, name, type, bodyStr(b['formKey']), bodyStr(b['sourceKey']), null, bodyStr(b['params']) ?? null, 'DRAFT', 'admin', now, now],
    );
    ok(res, dsDTO(dsById(id, tenantId) as DsRow));
  }),
);

datasourceRouter.put(
  '/api/v1/data-sources/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const row = dsById(id, tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + id);
    const b = requireBody(req.body);
    const name = bodyStr(b['name']) ?? row.name;
    const dup = one(`SELECT "id" FROM wf_data_source WHERE "tenant_id" = ? AND "name" = ? AND "id" != ?`, [tenantId, name, id]);
    if (dup) throw new BusinessException('数据源名称已存在: ' + name);
    run(
      `UPDATE wf_data_source SET "name"=?, "type"=?, "form_key"=?, "source_key"=?, "params"=?, "updated_at"=? WHERE "id"=? AND "tenant_id"=?`,
      [name, bodyStr(b['type']) ?? row.type, bodyStr(b['formKey']), bodyStr(b['sourceKey']), bodyStr(b['params']) ?? row.params, nowText(), id, tenantId],
    );
    ok(res, dsDTO(dsById(id, tenantId) as DsRow));
  }),
);

datasourceRouter.delete(
  '/api/v1/data-sources/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const row = dsById(id, tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + id);
    if (row.status !== 'DRAFT') throw new BusinessException('仅草稿状态的数据源可删除');
    run(`DELETE FROM wf_data_source WHERE "id" = ? AND "tenant_id" = ?`, [id, tenantId]);
    ok(res);
  }),
);

datasourceRouter.post(
  '/api/v1/data-sources/:id/enable',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const row = dsById(id, tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + id);
    if (row.type === 'SQL' && (row.params == null || isBlank(row.params))) {
      throw new BusinessException('SQL 数据源启用前必须配置 params');
    }
    if (row.type === 'FORM' && (row.form_key == null || isBlank(row.form_key))) {
      throw new BusinessException('FORM 数据源启用前必须绑定表单 formKey');
    }
    run(`UPDATE wf_data_source SET "status"='ENABLED', "updated_at"=? WHERE "id"=? AND "tenant_id"=?`, [nowText(), id, tenantId]);
    ok(res, dsDTO(dsById(id, tenantId) as DsRow));
  }),
);

datasourceRouter.post(
  '/api/v1/data-sources/:id/disable',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const id = String(req.params['id'] ?? '');
    const row = dsById(id, tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + id);
    run(`UPDATE wf_data_source SET "status"='DISABLED', "updated_at"=? WHERE "id"=? AND "tenant_id"=?`, [nowText(), id, tenantId]);
    ok(res, dsDTO(dsById(id, tenantId) as DsRow));
  }),
);

datasourceRouter.get(
  '/api/v1/data-sources',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const { page, size, offset } = parsePaging(req.query as Record<string, unknown>, { size: 20 });
    const wheres: string[] = ['"tenant_id" = ?'];
    const params: unknown[] = [tenantId];
    const q = req.query as Record<string, unknown>;
    if (typeof q['type'] === 'string' && q['type'] !== '') { wheres.push('"type" = ?'); params.push(q['type']); }
    if (typeof q['status'] === 'string' && q['status'] !== '') { wheres.push('"status" = ?'); params.push(q['status']); }
    const where = `WHERE ${wheres.join(' AND ')}`;
    const total = Number(one(`SELECT COUNT(*) AS C FROM wf_data_source ${where}`, params)?.['C'] ?? 0);
    const rows = all(`SELECT * FROM wf_data_source ${where} ORDER BY "created_at" DESC LIMIT ? OFFSET ?`, [...params, size, offset]) as DsRow[];
    // Java PageImpl: page 请求 1-based 时 getNumber 为 0-based；实测输出 pageNumber=1 当 page=1
    const reqPage = Number((req.query as Record<string, unknown>)['page'] ?? 1);
    ok(res, pageResponse(rows.map(dsDTO), Math.max(reqPage, 1), size, total));
  }),
);

datasourceRouter.get(
  '/api/v1/data-sources/enabled',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const rows = all(`SELECT * FROM wf_data_source WHERE "tenant_id" = ? AND "status" = 'ENABLED' ORDER BY "created_at" DESC`, [tenantId]) as DsRow[];
    ok(res, rows.map(dsDTO));
  }),
);

datasourceRouter.get(
  '/api/v1/data-sources/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const row = dsById(String(req.params['id'] ?? ''), tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + String(req.params['id'] ?? ''));
    ok(res, dsDTO(row));
  }),
);

// ---------------------------------------------------------------- db 元数据（2）

datasourceRouter.get(
  '/api/v1/data-sources/db/tables',
  authGuard,
  ah(async (_req, res) => {
    const rows = all(`SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'sqlite_sequence' ORDER BY name`);
    const names = rows.map((r) => String(r['name'])).filter((n) => n.toLowerCase() !== 'flyway_schema_history');
    ok(res, names);
  }),
);

/** ColumnInfo DTO（对齐 H2 实测：columnType/key/length/nullable/scale/unique） */
function sqliteColumnInfo(table: string): Record<string, unknown>[] {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return [];
  const exists = one(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [table]);
  if (!exists) return [];
  const infos = all(`PRAGMA table_info("${table}")`);
  const kinds = (COLUMN_KINDS[table] ?? {}) as Record<string, string>;
  const isPk = new Set(infos.filter((c) => Number(c['pk']) > 0).map((c) => String(c['name'])));
  return infos.map((c) => {
    const col = String(c['name']);
    const rawType = String(c['type'] ?? 'TEXT').toUpperCase();
    const kind = kinds[col];
    // 归一以 COLUMN_KINDS 语义类型优先（对齐 H2 information_schema 实测输出），其次 SQLite 声明类型
    let columnType = 'VARCHAR';
    let length: number | null = 255;
    if (kind === 'datetime') { columnType = 'DATETIME'; length = null; }
    else if (kind === 'long') { columnType = 'INT'; length = 64; }
    else if (kind === 'int') { columnType = 'INT'; length = null; }
    else if (kind === 'bool') { columnType = 'TINYINT'; length = null; }
    else if (kind === 'decimal') { columnType = 'DECIMAL'; length = null; }
    else if (rawType.includes('INT')) { columnType = 'INT'; length = null; }
    else if (rawType.includes('REAL') || rawType.includes('FLOA') || rawType.includes('DOUB')) { columnType = 'DECIMAL'; length = null; }
    else if (rawType.includes('TEXT') || rawType.includes('CLOB')) { columnType = 'VARCHAR'; length = 1000000000; }
    return {
      key: col,
      columnType,
      length,
      scale: null,
      // H2 语义：主键列 nullable=false；Node 端 unique 一律 false（对齐 Java 实测输出）
      nullable: !isPk.has(col) && Number(c['notnull']) === 0,
      unique: false,
    };
  });
}

datasourceRouter.get(
  '/api/v1/data-sources/db/tables/:table/columns',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    ok(res, sqliteColumnInfo(String(req.params['table'] ?? '')));
  }),
);

// ---------------------------------------------------------------- explore-sql（探测）

function assertReadOnlySql(sql: string): void {
  const t = sql.replace(/--[^\n]*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (t === '') throw new BusinessException('SQL 不能为空', 400);
  if (/;/.test(t.replace(/;'[^']*'/g, "''").replace(/;[^']*'/g, "''")) && /;\s*\S/.test(t.replace(/'[^']*'/g, "''"))) {
    throw new BusinessException('仅允许单条 SELECT 语句', 400);
  }
  if (!/^SELECT\b/i.test(t) && !/^WITH\b/i.test(t)) {
    throw new BusinessException('仅允许 SELECT 查询', 400);
  }
}

datasourceRouter.post(
  '/api/v1/data-sources/explore-sql',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b = requireBody(req.body);
    const sql = bodyStr(b['sql']);
    if (!sql) throw new BusinessException('SQL 不能为空', 400);
    assertReadOnlySql(sql);
    let probe = sql.trim().replace(/;+\s*$/, '');
    if (!/\bLIMIT\b|\bFETCH\b/i.test(probe)) probe += ' LIMIT 1';
    try {
      const rows = all(probe);
      const out: Record<string, unknown>[] = [];
      if (rows.length > 0) {
        for (const k of Object.keys(rows[0] as Row)) {
          const v = (rows[0] as Row)[k];
          let columnType = 'VARCHAR';
          if (typeof v === 'number') columnType = Number.isInteger(v) ? 'INT' : 'DECIMAL';
          out.push({ key: k, columnType, length: columnType === 'VARCHAR' ? 255 : null, scale: null, nullable: true, unique: false });
        }
      }
      ok(res, out);
    } catch (e) {
      throw new BusinessException('SQL 执行失败: ' + (e instanceof Error ? e.message : String(e)), 400);
    }
  }),
);

datasourceRouter.post(
  '/api/v1/data-sources/explore-api',
  authGuard,
  ah(async (_req, res) => {
    throw new BusinessException('API 数据源在当前环境不可用', 400);
  }),
);

// ---------------------------------------------------------------- 统一数据访问（metadata + data CRUD）

function parseParams(row: DsRow): Record<string, unknown> {
  if (row.params == null || isBlank(row.params)) return {};
  try { return JSON.parse(row.params) as Record<string, unknown>; } catch { return {}; }
}

/** BizDataPageVO 第三种分页形态：{records,total,page,size} */
function bizPage(records: Record<string, unknown>[], total: number, page: number, size: number): Record<string, unknown> {
  return { records, total, page, size };
}

datasourceRouter.get(
  '/api/v1/data-sources/:id/metadata',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const row = dsById(String(req.params['id'] ?? ''), tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + String(req.params['id'] ?? ''));
    const params = parseParams(row);
    if (row.type === 'SQL') {
      const query = String(params['query'] ?? '');
      assertReadOnlySql(query);
      const probe = query.trim().replace(/;+\s*$/, '') + (/\bLIMIT\b/i.test(query) ? '' : ' LIMIT 1');
      try {
        const rows = all(probe);
        const keys = rows.length > 0 ? Object.keys(rows[0] as Row) : [];
        ok(res, {
          columns: keys.map((k) => ({ key: k, label: k, columnType: 'VARCHAR', length: null, scale: null, nullable: true, unique: false, required: false, hidden: false, indexed: false, sortable: true, filterable: true, matchType: null, componentType: null, pickerConfig: null, storageMode: null, subColumns: null })),
          writable: false,
          formKey: row.form_key,
        });
      } catch (e) {
        throw new BusinessException('SQL 执行失败: ' + (e instanceof Error ? e.message : String(e)), 400);
      }
      return;
    }
    // FORM：columnConfig 来自 wf_form_def
    const def = row.form_key ? one(`SELECT "column_config" FROM wf_form_def WHERE "tenant_id" = ? AND "key" = ?`, [tenantId, row.form_key]) : null;
    let columns: unknown = [];
    if (def && def['column_config']) {
      try { columns = JSON.parse(String(def['column_config'])); } catch { columns = []; }
    }
    ok(res, { columns, writable: true, formKey: row.form_key });
  }),
);

datasourceRouter.get(
  '/api/v1/data-sources/:id/data',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const row = dsById(String(req.params['id'] ?? ''), tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + String(req.params['id'] ?? ''));
    const params = parseParams(row);
    const q = req.query as Record<string, unknown>;
    const { page, size, offset } = parsePaging(q, { size: 20 });
    if (row.type === 'SQL') {
      const query = String(params['query'] ?? '');
      assertReadOnlySql(query);
      const base = query.trim().replace(/;+\s*$/, '');
      const total = Number(one(`SELECT COUNT(*) AS C FROM (${base})`, [])?.['C'] ?? 0);
      const rows = all(`SELECT * FROM (${base}) LIMIT ? OFFSET ?`, [size, offset]) as Row[];
      ok(res, bizPage(rows.map(rowToVOData), total, page, size));
      return;
    }
    // FORM：查物理表 wf_biz_<formKey>
    const table = 'wf_biz_' + row.form_key;
    const exists = one(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [table]);
    if (!exists) { ok(res, bizPage([], 0, page, size)); return; }
    const total = Number(one(`SELECT COUNT(*) AS C FROM "${table}" WHERE "tenant_id" = ?`, [tenantId])?.['C'] ?? 0);
    const rows = all(`SELECT * FROM "${table}" WHERE "tenant_id" = ? ORDER BY "created_at" DESC LIMIT ? OFFSET ?`, [tenantId, size, offset]) as Row[];
    ok(res, bizPage(rows.map(rowToVOData), total, page, size));
  }),
);

function rowToVOData(r: Row): Record<string, unknown> {
  const data: Record<string, unknown> = { ...r };
  const id = String(data['id'] ?? '');
  delete data['id'];
  delete (data as Record<string, unknown>)['tenant_id'];
  return { id, data, version: null, createdAt: null, updatedAt: null };
}

datasourceRouter.get(
  '/api/v1/data-sources/:id/data/:rowId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const row = dsById(String(req.params['id'] ?? ''), tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + String(req.params['id'] ?? ''));
    if (row.type === 'SQL') throw new BusinessException('SQL 数据源不支持单行读取', 400);
    const table = 'wf_biz_' + row.form_key;
    const r = one(`SELECT * FROM "${table}" WHERE "id" = ? AND "tenant_id" = ?`, [String(req.params['rowId'] ?? ''), tenantId]);
    if (!r) throw new BusinessException('业务数据不存在: ' + String(req.params['rowId'] ?? ''), 404);
    ok(res, rowToVOData(r));
  }),
);

datasourceRouter.post(
  '/api/v1/data-sources/:id/data',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const row = dsById(String(req.params['id'] ?? ''), tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + String(req.params['id'] ?? ''));
    if (row.type === 'SQL') throw new BusinessException('只读数据源不支持写入', 400);
    const table = 'wf_biz_' + row.form_key;
    if (!one(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`, [table])) {
      throw new BusinessException('业务表尚未创建: ' + table, 400);
    }
    const data = requireBody(req.body);
    const cols = Object.keys(data);
    const id = randomUUID();
    const now = nowText();
    run(
      `INSERT INTO "${table}" ("id","tenant_id",${cols.map((c) => `"${c}"`).join(',')},"created_at","updated_at") VALUES (?,?${cols.map(() => ',?').join('')},?,?)`,
      [id, tenantId, ...cols.map((c) => (data[c] as unknown)), now, now],
    );
    ok(res, id);
  }),
);

datasourceRouter.put(
  '/api/v1/data-sources/:id/data/:rowId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const row = dsById(String(req.params['id'] ?? ''), tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + String(req.params['id'] ?? ''));
    if (row.type === 'SQL') throw new BusinessException('只读数据源不支持写入', 400);
    const table = 'wf_biz_' + row.form_key;
    const data = requireBody(req.body);
    const cols = Object.keys(data).filter((c) => !['id', 'tenant_id', 'created_at'].includes(c));
    if (cols.length === 0) { ok(res); return; }
    const sets = cols.map((c) => `"${c}" = ?`).join(', ');
    const info = run(
      `UPDATE "${table}" SET ${sets}, "updated_at" = ? WHERE "id" = ? AND "tenant_id" = ?`,
      [...cols.map((c) => (data[c] as unknown)), nowText(), String(req.params['rowId'] ?? ''), tenantId],
    );
    if (info.changes === 0) throw new BusinessException('业务数据不存在: ' + String(req.params['rowId'] ?? ''), 404);
    ok(res);
  }),
);

datasourceRouter.delete(
  '/api/v1/data-sources/:id/data/:rowId',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const tenantId = tenantOf(req);
    const row = dsById(String(req.params['id'] ?? ''), tenantId);
    if (!row) throw new BusinessException('数据源不存在: ' + String(req.params['id'] ?? ''));
    if (row.type === 'SQL') throw new BusinessException('只读数据源不支持删除', 400);
    const table = 'wf_biz_' + row.form_key;
    const info = run(`DELETE FROM "${table}" WHERE "id" = ? AND "tenant_id" = ?`, [String(req.params['rowId'] ?? ''), tenantId]);
    if (info.changes === 0) throw new BusinessException('业务数据不存在: ' + String(req.params['rowId'] ?? ''), 404);
    ok(res);
  }),
);

// ---------------------------------------------------------------- 内部 system（10 端点）

function isBlank(v: string | null | undefined): boolean {
  return v == null || v.trim() === '';
}

function userBizVO(r: Row): Record<string, unknown> {
  return {
    id: String(r['ID']),
    data: { username: r['USERNAME'], nickname: r['NICKNAME'], orgId: r['ORG_ID'], orgName: null, status: r['STATUS'] },
    version: null,
    createdAt: null,
    updatedAt: null,
  };
}

function deptBizVO(r: Row): Record<string, unknown> {
  return {
    id: String(r['ID']),
    data: { orgName: r['ORG_NAME'], orgCode: r['ORG_CODE'], parentId: r['PARENT_ID'], status: r['STATUS'] },
    version: null,
    createdAt: null,
    updatedAt: null,
  };
}

const USERS_META_COLUMNS = [
  ['username', '用户名'], ['nickname', '姓名'], ['orgId', '部门ID'], ['orgName', '部门名称'], ['status', '状态'],
].map(([k, label]) => ({ key: k, label, columnType: null, length: null, scale: null, nullable: false, unique: false, required: false, hidden: false, indexed: false, sortable: null, filterable: null, matchType: null, componentType: null, pickerConfig: null, storageMode: 'JSON', subColumns: null }));

const DEPT_META_COLUMNS = [
  ['orgName', '部门名称'], ['orgCode', '部门编码'], ['parentId', '上级部门'], ['status', '状态'],
].map(([k, label]) => ({ key: k, label, columnType: null, length: null, scale: null, nullable: false, unique: false, required: false, hidden: false, indexed: false, sortable: null, filterable: null, matchType: null, componentType: null, pickerConfig: null, storageMode: 'JSON', subColumns: null }));

internalSystemRouter.get(
  '/api/v1/internal/system/dept-tree',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const keyword = typeof req.query['keyword'] === 'string' ? req.query['keyword'] : null;
    let rows = all(`SELECT * FROM SYS_ORGANIZATION WHERE IS_DELETED = 0 ORDER BY SORT_ORDER, ID`);
    if (keyword) rows = rows.filter((r) => String(r['ORG_NAME'] ?? '').includes(keyword));
    ok(res, bizPage(rows.map(deptBizVO), rows.length, 0, 0));
  }),
);

internalSystemRouter.get(
  '/api/v1/internal/system/dept-tree/metadata',
  authGuard,
  ah(async (_req, res) => {
    ok(res, { columns: DEPT_META_COLUMNS, writable: false, formKey: null });
  }),
);

internalSystemRouter.get(
  '/api/v1/internal/system/users/metadata',
  authGuard,
  ah(async (_req, res) => {
    ok(res, { columns: USERS_META_COLUMNS, writable: false, formKey: null });
  }),
);

internalSystemRouter.get(
  '/api/v1/internal/system/users',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const { page, size, offset } = parsePaging(req.query as Record<string, unknown>, { size: 20 });
    const keyword = typeof req.query['keyword'] === 'string' ? req.query['keyword'] : null;
    const where = keyword ? `WHERE IS_DELETED = 0 AND (USERNAME LIKE ? OR NICKNAME LIKE ?)` : `WHERE IS_DELETED = 0`;
    const params = keyword ? [`%${keyword}%`, `%${keyword}%`] : [];
    const total = Number(one(`SELECT COUNT(*) AS C FROM SYS_USER ${where}`, params)?.['C'] ?? 0);
    const rows = all(`SELECT * FROM SYS_USER ${where} ORDER BY ID LIMIT ? OFFSET ?`, [...params, size, offset]);
    ok(res, bizPage(rows.map(userBizVO), total, page, size));
  }),
);

internalSystemRouter.get(
  '/api/v1/internal/system/users/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const r = one(`SELECT * FROM SYS_USER WHERE ID = ? AND IS_DELETED = 0`, [String(req.params['id'] ?? '')]);
    if (!r) throw new BusinessException('用户不存在', 404);
    ok(res, userBizVO(r));
  }),
);

internalSystemRouter.post(
  '/api/v1/internal/system/dept',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b = requireBody(req.body);
    const orgName = b['orgName'];
    if (typeof orgName !== 'string' || orgName.trim() === '') throw new BusinessException('部门名称不能为空');
    const idNum = run(
      `INSERT INTO SYS_ORGANIZATION (ORG_NAME, ORG_CODE, PARENT_ID, SORT_ORDER, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT) VALUES (?,?,NULL,0,1,0,?,?)`,
      [orgName, typeof b['orgCode'] === 'string' ? b['orgCode'] : null, nowText(), nowText()],
    );
    const r = one(`SELECT * FROM SYS_ORGANIZATION WHERE ID = ?`, [Number(idNum.lastInsertRowid)]);
    ok(res, r ? deptBizVO(r) : null);
  }),
);

internalSystemRouter.delete(
  '/api/v1/internal/system/dept/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const info = run(`DELETE FROM SYS_ORGANIZATION WHERE ID = ?`, [String(req.params['id'] ?? '')]);
    if (info.changes === 0) throw new BusinessException('部门不存在', 404);
    ok(res);
  }),
);

internalSystemRouter.post(
  '/api/v1/internal/system/user',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const b = requireBody(req.body);
    const username = b['username'];
    if (typeof username !== 'string' || username.trim() === '') throw new BusinessException('用户名不能为空');
    const dup = one(`SELECT ID FROM SYS_USER WHERE USERNAME = ?`, [username]);
    if (dup) throw new BusinessException('用户名已存在');
    const bcrypt = await import('bcryptjs');
    const idNum = run(
      `INSERT INTO SYS_USER (USERNAME, NICKNAME, PASSWORD, STATUS, IS_DELETED, CREATED_AT, UPDATED_AT) VALUES (?,?,?,1,0,?,?)`,
      [username, typeof b['nickname'] === 'string' ? b['nickname'] : null, bcrypt.hashSync('123456', 10), nowText(), nowText()],
    );
    const r = one(`SELECT * FROM SYS_USER WHERE ID = ?`, [Number(idNum.lastInsertRowid)]);
    ok(res, r ? userBizVO(r) : null);
  }),
);

internalSystemRouter.delete(
  '/api/v1/internal/system/user/:id',
  authGuard,
  ah(async (req: AuthedRequest, res) => {
    const info = run(`UPDATE SYS_USER SET IS_DELETED = 1, UPDATED_AT = ? WHERE ID = ?`, [nowText(), String(req.params['id'] ?? '')]);
    if (info.changes === 0) throw new BusinessException('用户不存在', 404);
    ok(res);
  }),
);

/** X-Tenant-Id 必填校验（shared.tenantOf 语义） */
function tenantOf(req: AuthedRequest): string {
  const h = req.headers['x-tenant-id'];
  const v = Array.isArray(h) ? h[0] : h;
  if (v == null || String(v).trim() === '') {
    throw new IllegalArgumentError('Tenant ID is not set. Ensure X-Tenant-Id header is provided.');
  }
  return String(v);
}
