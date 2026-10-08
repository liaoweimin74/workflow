/**
 * 动态物理表管理器（SQLite 版）—— DdlBuilder + DynamicTableManager 移植（Task 13-5）
 *
 * 对齐 Java: engine/form/column/DdlBuilder.java + DynamicTableManager.java
 * SQLite 适配（规格 §10.1/§10.2）：
 *  - 表名大写：WF_BIZ_<FORMKEY>（H2 未引号标识符即大写存储，行为对齐）；列名同步大写
 *  - 列类型映射：VARCHAR/TEXT/LONGTEXT/DATE/DATETIME/JSON → TEXT；INT/TINYINT → INTEGER；DECIMAL → REAL
 *  - information_schema → sqlite_master（表清单/存在性）+ PRAGMA table_info（列信息）
 *  - 无 MODIFY COLUMN：结构不兼容（NOT NULL 属性变化）走「建新表 → INSERT SELECT → DROP → RENAME」重建策略，数据不丢
 *  - 只加不减：desired 中不存在的现有列忽略（禁止 DROP COLUMN）；跨类变更拒绝（收窄长度 SQLite 不落盘，无从检测，应用层已校验）
 *  - 索引：CREATE [UNIQUE] INDEX IF NOT EXISTS（SQLite 不能内联 KEY/UNIQUE KEY）
 *
 * 注意：本模块不开事务；调用方（表单发布）用 db.ts 的 tx() 包裹以获得 DDL 原子性与串行化。
 */
import { query, queryOne, exec } from "../../lib/db";

// ==================== 类型 ====================

/** 列映射配置项（对齐 ColumnConfig，仅 DDL 相关字段） */
export interface ColumnConfig {
  key: string;
  label?: string | null;
  columnType?: string | null;
  length?: number | null;
  scale?: number | null;
  required?: boolean;
  unique?: boolean;
  indexed?: boolean;
  hidden?: boolean;
  pickerConfig?: string | null;
  storageMode?: string | null;
  componentType?: string | null;
  sortable?: boolean | null;
  filterable?: boolean | null;
  matchType?: string | null;
  subColumns?: ColumnConfig[] | null;
  subMode?: string | null;
}

/** 物理表列信息（对齐 ColumnInfo；来自 PRAGMA table_info 归一化） */
export interface ColumnInfo {
  key: string;
  columnType: string;
  length: number | null;
  scale: number | null;
  nullable: boolean;
  unique: boolean;
}

// ==================== 白名单/校验（DdlBuilder 移植） ====================

const COLUMN_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
const RESERVED_COLUMNS = new Set(["id", "tenant_id", "version", "created_by", "created_at", "updated_at"]);
const SUB_RESERVED_COLUMNS = new Set([...RESERVED_COLUMNS, "biz_id", "sort_no"]);
const MAX_VARCHAR_LENGTH = 255;
const ALLOWED_TYPES = new Set(["VARCHAR", "TEXT", "LONGTEXT", "INT", "DECIMAL", "DATE", "DATETIME", "TINYINT", "JSON"]);

/** Java IllegalArgumentException 对齐：HTTP 400 + R.fail(400, msg) */
export class IllegalArgumentException extends Error {}

export function validateFormKey(formKey: string | null | undefined): void {
  if (!formKey || !COLUMN_KEY_PATTERN.test(formKey)) {
    throw new IllegalArgumentException("非法表单 key（仅允许字母开头，含字母/数字/下划线，最长 64）: " + formKey);
  }
}

export function validateSubField(field: string | null | undefined): void {
  if (!field || !COLUMN_KEY_PATTERN.test(field)) {
    throw new IllegalArgumentException("非法子表字段名（仅允许字母开头，含字母/数字/下划线，最长 64）: " + field);
  }
}

function isSubtableField(c: ColumnConfig): boolean {
  return Array.isArray(c.subColumns) && c.subColumns.length > 0;
}

/** 列映射列表校验（列名/保留字/类型白名单/长度范围；DdlBuilder.validateColumns 移植） */
export function validateColumns(columns: ColumnConfig[]): void {
  for (const c of columns) {
    if (!c.key || !COLUMN_KEY_PATTERN.test(c.key)) {
      throw new IllegalArgumentException("非法列名（仅允许字母开头，含字母/数字/下划线，最长 64）: " + c.key);
    }
    if (isSubtableField(c)) {
      validateSubColumns(c.subColumns!);
      continue;
    }
    if (RESERVED_COLUMNS.has(c.key)) {
      throw new IllegalArgumentException("列名 " + c.key + " 为系统保留列，不允许作为业务列");
    }
    if (!c.columnType || !ALLOWED_TYPES.has(c.columnType)) {
      throw new IllegalArgumentException("非法列类型: " + c.columnType);
    }
    if (c.columnType === "VARCHAR") {
      const len = c.length == null ? 255 : c.length;
      if (len < 1 || len > MAX_VARCHAR_LENGTH) {
        throw new IllegalArgumentException("VARCHAR 长度必须在 1~255 之间: " + c.key);
      }
    }
    if (c.columnType === "DECIMAL") {
      const len = c.length == null ? 18 : c.length;
      const scale = c.scale == null ? 0 : c.scale;
      if (len < 1 || len > 30 || scale < 0 || scale > len) {
        throw new IllegalArgumentException("DECIMAL 长度/精度非法: " + c.key);
      }
    }
  }
}

function validateSubColumns(columns: ColumnConfig[]): void {
  validateColumns(columns);
  for (const c of columns) {
    if (SUB_RESERVED_COLUMNS.has(c.key)) {
      throw new IllegalArgumentException("子表列名 " + c.key + " 为系统保留列，不允许作为业务列");
    }
  }
}

/** 跨大类变更判定（对齐 ColumnTypeMapper.isCrossTypeChange） */
export function isCrossTypeChange(oldType: string | null | undefined, newType: string | null | undefined): boolean {
  return categoryOf(oldType) !== categoryOf(newType);
}

function categoryOf(type: string | null | undefined): string {
  if (!type) return "UNKNOWN";
  switch (type) {
    case "VARCHAR": case "TEXT": case "LONGTEXT": case "TINYINT": case "JSON": return "STRING";
    case "INT": return "INT";
    case "DECIMAL": return "DECIMAL";
    case "DATE": case "DATETIME": return "DATE";
    default: return "UNKNOWN";
  }
}

// ==================== SQLite 类型映射 ====================

/** 逻辑列类型 → SQLite 声明类型（规格 §10.1） */
function sqliteTypeOf(columnType: string | null | undefined): string {
  switch (columnType) {
    case "INT": case "TINYINT": return "INTEGER";
    case "DECIMAL": return "REAL";
    default: return "TEXT";
  }
}

/** ADD COLUMN 时 NOT NULL 必须带非 NULL 默认值（SQLite 限制） */
function defaultOf(columnType: string | null | undefined): string {
  if (columnType === "INT" || columnType === "TINYINT" || columnType === "DECIMAL") return "0";
  return "''";
}

/** 存储类（差异比较用；逻辑类型 → SQLite 亲和类） */
function storageClass(columnType: string | null | undefined): string {
  if (columnType === "INT" || columnType === "TINYINT") return "INT";
  if (columnType === "DECIMAL") return "DECIMAL";
  return "STRING";
}

/** PRAGMA 声明类型 → 白名单类型（对齐 DynamicTableManager.normalizeType + SQLite 亲和归一） */
export function normalizeSqliteType(declared: string | null | undefined): string {
  if (!declared) return "TEXT";
  const t = declared.toUpperCase();
  if (t.includes("INT")) return "INT";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "VARCHAR";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB") || t.includes("DEC") || t.includes("NUM")) return "DECIMAL";
  if (t.includes("DATETIME") || t.includes("TIMESTAMP")) return "DATETIME";
  if (t === "DATE") return "DATE";
  return t;
}

// ==================== 表名 ====================

/** 动态主表名（大写，对齐 H2 未引号标识符大写化行为） */
export function tableNameOf(formKey: string): string {
  return "WF_BIZ_" + formKey.toUpperCase();
}

/** 动态子表名 */
export function subTableNameOf(formKey: string, field: string): string {
  return "WF_BIZ_" + formKey.toUpperCase() + "_" + field.toUpperCase();
}

// ==================== 元数据读取（替代 information_schema） ====================

export function tableExists(tableName: string): boolean {
  const row = queryOne<{ c: number }>(
    "SELECT COUNT(1) AS c FROM sqlite_master WHERE type = 'table' AND name = ?",
    [tableName],
  );
  return !!row && row.c > 0;
}

export function listTableNames(): string[] {
  return query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  ).map((r) => r.name);
}

function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"';
}

/** 唯一索引首列集合（PRAGMA index_list/index_info；对齐 COLUMN_KEY 含 UNI 语义） */
function uniqueFirstColumns(table: string): Set<string> {
  const out = new Set<string>();
  let idxRows: Array<{ name: string; unique: number }> = [];
  try {
    idxRows = query<{ name: string; unique: number }>("PRAGMA index_list(" + quoteIdent(table) + ")");
  } catch {
    return out;
  }
  for (const idx of idxRows) {
    if (!idx.unique) continue;
    try {
      const cols = query<{ name: string; seqno: number }>("PRAGMA index_info(" + quoteIdent(idx.name) + ")");
      for (const c of cols) if (c.seqno === 0 && c.name) out.add(c.name.toUpperCase());
    } catch {
      // expression index 等无列名场景跳过
    }
  }
  return out;
}

/** 读取物理表列信息（PRAGMA table_info；表不存在返回空数组） */
export function findTableColumns(tableName: string): ColumnInfo[] {
  if (!tableExists(tableName)) return [];
  const rows = query<{ name: string; type: string; notnull: number; pk: number }>(
    "PRAGMA table_info(" + quoteIdent(tableName) + ")",
  );
  const uniqFirst = uniqueFirstColumns(tableName);
  const out: ColumnInfo[] = [];
  for (const r of rows) {
    const declared = (r.type ?? "").trim();
    const m = declared.match(/^(.+?)\s*\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)$/);
    let length: number | null = null;
    let scale: number | null = null;
    if (m) {
      length = Number(m[2]);
      scale = m[3] != null ? Number(m[3]) : null;
    }
    out.push({
      key: r.name,
      columnType: normalizeSqliteType(declared),
      length,
      scale,
      nullable: r.notnull === 0 && r.pk === 0,
      unique: uniqFirst.has(r.name.toUpperCase()),
    });
  }
  return out;
}

// ==================== DDL 构建 ====================

function columnDefinition(c: ColumnConfig): string {
  // required → NOT NULL（长度约束移到发布校验，SQLite 不强制长度）
  return quoteIdent(c.key.toUpperCase()) + " " + sqliteTypeOf(c.columnType) + (c.required ? " NOT NULL" : "");
}

interface SystemCol {
  name: string;
  ddl: string;
}

const MAIN_HEAD_COLS: SystemCol[] = [
  { name: "ID", ddl: '"ID" TEXT NOT NULL PRIMARY KEY' },
  { name: "TENANT_ID", ddl: '"TENANT_ID" TEXT NOT NULL' },
];
const MAIN_TAIL_COLS: SystemCol[] = [
  { name: "VERSION", ddl: '"VERSION" INTEGER NOT NULL DEFAULT 1' },
  { name: "CREATED_BY", ddl: '"CREATED_BY" TEXT' },
  { name: "CREATED_AT", ddl: '"CREATED_AT" TEXT' },
  { name: "UPDATED_AT", ddl: '"UPDATED_AT" TEXT' },
];
const SUB_HEAD_COLS: SystemCol[] = [
  { name: "ID", ddl: '"ID" TEXT NOT NULL PRIMARY KEY' },
  { name: "BIZ_ID", ddl: '"BIZ_ID" TEXT NOT NULL' },
  { name: "TENANT_ID", ddl: '"TENANT_ID" TEXT NOT NULL' },
];
const SUB_TAIL_COLS: SystemCol[] = [
  { name: "SORT_NO", ddl: '"SORT_NO" INTEGER NOT NULL DEFAULT 0' },
  { name: "VERSION", ddl: '"VERSION" INTEGER NOT NULL DEFAULT 1' },
  { name: "CREATED_BY", ddl: '"CREATED_BY" TEXT' },
  { name: "CREATED_AT", ddl: '"CREATED_AT" TEXT' },
  { name: "UPDATED_AT", ddl: '"UPDATED_AT" TEXT' },
];

function buildCreateSql(table: string, head: SystemCol[], cols: ColumnConfig[], tail: SystemCol[]): string {
  const defs = [...head.map((c) => c.ddl), ...cols.map((c) => columnDefinition(c)), ...tail.map((c) => c.ddl)];
  return `CREATE TABLE IF NOT EXISTS ${quoteIdent(table)} (\n    ` + defs.join(",\n    ") + "\n)";
}

/** 索引语句（SQLite 需独立语句；幂等 IF NOT EXISTS） */
function indexStatements(kind: "main" | "sub", formKey: string, field: string | null, cols: ColumnConfig[]): string[] {
  const table = kind === "main" ? tableNameOf(formKey) : subTableNameOf(formKey, field!);
  const stmts: string[] = [];
  if (kind === "sub") {
    stmts.push(`CREATE INDEX IF NOT EXISTS idx_${formKey}_${field}_biz ON ${quoteIdent(table)} ("TENANT_ID", "BIZ_ID")`);
  }
  for (const c of cols) {
    if (c.unique) {
      const name = kind === "main" ? `uk_${formKey}_${c.key}` : `uk_${formKey}_${field}_${c.key}`;
      const columns =
        kind === "main"
          ? `"TENANT_ID", ${quoteIdent(c.key.toUpperCase())}`
          : `"TENANT_ID", "BIZ_ID", ${quoteIdent(c.key.toUpperCase())}`;
      stmts.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${name} ON ${quoteIdent(table)} (${columns})`);
    }
    if (c.indexed) {
      const name = kind === "main" ? `idx_${formKey}_${c.key}` : `idx_${formKey}_${field}_${c.key}`;
      stmts.push(`CREATE INDEX IF NOT EXISTS ${name} ON ${quoteIdent(table)} (${quoteIdent(c.key.toUpperCase())})`);
    }
  }
  return stmts;
}

// ==================== ensureTable / ensureSubTable（差异变更 + 重建策略） ====================

/** 重建表策略：建新表 → 复制交集数据 → DROP → RENAME → 重建索引（已有数据列不丢） */
function rebuildTable(
  table: string,
  head: SystemCol[],
  tail: SystemCol[],
  desired: ColumnConfig[],
  buildIndexStmts: () => string[],
): void {
  const tmp = table + "__NEW";
  exec(`DROP TABLE IF EXISTS ${quoteIdent(tmp)}`);
  exec(buildCreateSql(tmp, head, desired, tail));
  const oldCols = new Set(findTableColumns(table).map((c) => c.key.toUpperCase()));
  const newCols = findTableColumns(tmp).map((c) => c.key.toUpperCase()).filter((k) => oldCols.has(k));
  if (newCols.length > 0) {
    const colList = newCols.map(quoteIdent).join(", ");
    exec(`INSERT INTO ${quoteIdent(tmp)} (${colList}) SELECT ${colList} FROM ${quoteIdent(table)}`);
  }
  exec(`DROP TABLE ${quoteIdent(table)}`);
  exec(`ALTER TABLE ${quoteIdent(tmp)} RENAME TO ${quoteIdent(table)}`);
  for (const stmt of buildIndexStmts()) exec(stmt);
}

function diffAndApply(
  table: string,
  head: SystemCol[],
  tail: SystemCol[],
  desired: ColumnConfig[],
  buildIndexStmts: () => string[],
  errPrefix: string,
): void {
  const existing = findTableColumns(table);
  const byUpper = new Map(existing.map((c) => [c.key.toUpperCase(), c]));

  const addCols: ColumnConfig[] = [];
  let needsRebuild = false;

  for (const c of desired) {
    const cur = byUpper.get(c.key.toUpperCase());
    if (!cur) {
      addCols.push(c);
      continue;
    }
    // 已存在列：禁止类型跨类变更（对齐 DdlBuilder）
    if (isCrossTypeChange(cur.columnType, c.columnType)) {
      throw new IllegalArgumentException(
        `${errPrefix}列 ${c.key} 类型跨类变更不被支持: ${cur.columnType} -> ${c.columnType}`,
      );
    }
    // NOT NULL 属性变化：SQLite 无 MODIFY COLUMN → 重建表（数据保留）
    if (cur.nullable !== !c.required) needsRebuild = true;
  }

  if (needsRebuild) {
    rebuildTable(table, head, tail, desired, buildIndexStmts);
    return;
  }

  for (const c of addCols) {
    let ddl = `ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${quoteIdent(c.key.toUpperCase())} ${sqliteTypeOf(c.columnType)}`;
    if (c.required) ddl += ` NOT NULL DEFAULT ${defaultOf(c.columnType)}`;
    exec(ddl);
  }
  for (const stmt of buildIndexStmts()) exec(stmt);
}

/** 确保主表存在且结构与 column_config 一致（SQLite 差异变更/重建策略） */
export function ensureTable(formKey: string, columns: ColumnConfig[]): void {
  validateFormKey(formKey);
  validateColumns(columns);
  const table = tableNameOf(formKey);
  const desired = columns.filter((c) => !isSubtableField(c));
  if (!tableExists(table)) {
    exec(buildCreateSql(table, MAIN_HEAD_COLS, desired, MAIN_TAIL_COLS));
    for (const stmt of indexStatements("main", formKey, null, desired)) exec(stmt);
    return;
  }
  diffAndApply(table, MAIN_HEAD_COLS, MAIN_TAIL_COLS, desired, () => indexStatements("main", formKey, null, desired), "");
}

/** 确保子表存在且结构与子列一致（WF_BIZ_<formKey>_<field>） */
export function ensureSubTable(formKey: string, field: string, subColumns: ColumnConfig[]): void {
  validateFormKey(formKey);
  validateSubField(field);
  validateSubColumns(subColumns);
  const table = subTableNameOf(formKey, field);
  if (!tableExists(table)) {
    exec(buildCreateSql(table, SUB_HEAD_COLS, subColumns, SUB_TAIL_COLS));
    for (const stmt of indexStatements("sub", formKey, field, subColumns)) exec(stmt);
    return;
  }
  diffAndApply(table, SUB_HEAD_COLS, SUB_TAIL_COLS, subColumns, () => indexStatements("sub", formKey, field, subColumns), "子表");
}
