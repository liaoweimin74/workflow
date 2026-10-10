/**
 * 元数据探测 —— MetadataProbeController + SqlMetadataProbe 移植（Task 13-5）
 * mount 前缀：/api/v1/data-sources（2 端点）
 *
 * SqlMetadataProbe 11 步行为（规格 docs/migration/data-layer-semantics.md §6）：
 *  1 空校验 400「SQL 不能为空」；2 trim+去尾分号；3 前 6 字符须 SELECT；
 *  4 单语句校验；5 尾随行注释剥离；6 占位符（裸 ? / :name）置 NULL（引号感知）；
 *  7 LIMIT 1 兜底（FETCH FIRST 先经 translateSql 改写为 LIMIT）；8 执行读列元数据；
 *  9 列类型归一（JDBC → 白名单）；10 错误 cause → 中文指引（含 SQLite 形态 no such table/no such column）；
 * 11 探测阶段不强制 :tenantId。
 * 全程 HTTP 400（BusinessException）。
 */
/* mount: /api/v1/data-sources（探测端点，与 datasource 模块同前缀） */
import { Router } from "express";
import type { Request, Response } from "express";
import { ok, failHttp } from "../../lib/http";
import { db } from "../../lib/db";
import { translateSql } from "../../lib/dialect";
// Java SqlMetadataProbe 抛 IllegalArgumentException → GlobalExceptionHandler 映射 HTTP 400（非 BusinessException 的 HTTP200）
import { IllegalArgumentException } from "../form/dynamic-table";

const router = Router();

// ==================== SqlMetadataProbe 移植 ====================

interface ColumnMeta {
  key: string;
  label: string;
  columnType: string;
  length: number | null;
  scale: number | null;
  nullable: boolean;
}

/** JDBC/SQLite 声明类型 → 白名单类型（对齐 mapColumns + normalizeSqliteType） */
function probe400(msg: string): never {
  throw new IllegalArgumentException(msg);
}

function normalizeType(declared: string | null | undefined): string {
  if (!declared) return "VARCHAR";
  const t = declared.toUpperCase();
  if (t === "VARCHAR" || t === "CHAR" || t.includes("CHAR") || t === "NVARCHAR") return "VARCHAR";
  if (t.includes("LONGVARCHAR") || t.includes("CLOB") || t === "TEXT" || t.includes("MEDIUMTEXT") || t.includes("TINYTEXT")) return "TEXT";
  if (t.includes("LONGNVARCHAR") || t.includes("NCLOB") || t.includes("LONGTEXT")) return "LONGTEXT";
  if (t.includes("INT") || t.includes("BIGINT") || t.includes("SMALLINT") || t.includes("TINYINT")) return "INT";
  if (t.includes("DECIMAL") || t.includes("NUMERIC") || t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "DECIMAL";
  if (t === "DATE") return "DATE";
  if (t.includes("TIMESTAMP") || t.includes("DATETIME")) return "DATETIME";
  if (t === "BOOLEAN" || t === "BIT") return "TINYINT";
  return "VARCHAR"; // default
}

/** 步骤 5：尾随行注释剥离（`--` 后同行无内容且左侧引号计数为偶 → 截断） */
function stripTrailingLineComment(sql: string): string {
  const idx = sql.lastIndexOf("--");
  if (idx < 0) return sql;
  const tail = sql.slice(idx + 2);
  const nl = tail.indexOf("\n");
  const sameLineTail = (nl < 0 ? tail : tail.slice(0, nl)).trim();
  if (sameLineTail !== "") return sql; // 注释后有换行内容 → 保留
  const head = sql.slice(0, idx);
  let quotes = 0;
  for (let i = 0; i < head.length; i++) {
    const c = head[i];
    if (c === "'" || c === '"') {
      if (i > 0 && head[i - 1] === "\\") continue; // 未转义计数（简化：反斜杠转义）
      quotes++;
    }
  }
  if (quotes % 2 === 0) return head;
  return sql;
}

/** 步骤 6：占位符置 NULL（引号感知单遍扫描；裸 ? → NULL，:name → NULL） */
function bindPlaceholdersNull(sql: string): string {
  const out: string[] = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"' || c === "`") {
      // 引号段逐字复制（支持成对转义）
      const quote = c;
      out.push(c);
      i++;
      while (i < sql.length) {
        if (sql[i] === quote) {
          if (sql[i + 1] === quote) {
            out.push(quote, quote);
            i += 2;
            continue;
          }
          break;
        }
        out.push(sql[i]);
        i++;
      }
      if (i < sql.length) {
        out.push(quote);
        i++;
      }
      continue;
    }
    if (c === "?") {
      out.push("NULL");
      i++;
      continue;
    }
    if (c === ":" && /[A-Za-z]/.test(sql[i + 1] ?? "")) {
      let j = i + 1;
      while (j < sql.length && /[A-Za-z0-9_]/.test(sql[j])) j++;
      out.push("NULL");
      i = j;
      continue;
    }
    out.push(c);
    i++;
  }
  return out.join("");
}

/** 步骤 7：LIMIT 1 兜底（已有限制行数则原样） */
function hasTailLimit(sql: string): boolean {
  return /(\s)LIMIT\s+\d+\s*(,\s*\d+\s*)?$/i.test(sql) || /(\s)LIMIT\s+\d+\s+OFFSET\s+\d+\s*$/i.test(sql);
}

/** 步骤 10：错误根因 → 中文自助指引（cause 链下探在 JS 中即 message 本身；SQLite 关键词补充） */
function describeRootCause(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err);
  const cut = msg.indexOf("; SQL statement:");
  if (cut >= 0) msg = msg.slice(0, cut);
  msg = msg.replace(/\s*--\s*\[[0-9]+\](\.[0-9]+)?\s*$/, ""); // H2 错误码标注（对 SQLite 无害）
  msg = msg.trim();
  if (msg.length > 220) msg = msg.slice(0, 220);
  if (!msg) msg = "执行异常，请检查 SQL";
  const lower = msg.toLowerCase();
  const hint = (extra: string): string => msg + "。" + extra;
  if (lower.includes("duplicate column name")) return hint("JOIN 时请显式列出所需列或加别名，避免 SELECT *");
  if (lower.includes("table not found") || lower.includes("no such table") || /table\s+"?[a-z0-9_]+"?\s+not\s+found/i.test(msg)) {
    return hint("平台表使用大写表名（如 WF_FORM_DEF），业务表 wf_biz_* 在表单发布后生成");
  }
  if (lower.includes("column not found") || lower.includes("no such column")) {
    return hint("请核对列名，可在表/字段下拉中查看");
  }
  if (lower.includes("syntax error") || lower.includes("near \"")) {
    return hint("请检查 SQL 关键字与标点");
  }
  return msg;
}

/** 探测主流程（11 步） */
export function probeSql(rawSql: string | null | undefined): ColumnMeta[] {
  // 1 空校验
  if (rawSql == null || rawSql.trim() === "") {
    probe400("SQL 不能为空");
  }
  // 2 预处理：trim + 去尾单个分号
  let sql = rawSql.trim();
  if (sql.endsWith(";")) sql = sql.slice(0, -1);
  // 3 语句类型
  if (sql.slice(0, 6).toUpperCase() !== "SELECT") {
    probe400("仅支持 SELECT 查询");
  }
  // 4 单语句
  if (/.*;(\s*)(FROM|UPDATE|DELETE|INSERT|DROP|ALTER|CREATE|TRUNCATE).*/is.test(sql)) {
    probe400("仅支持单条 SELECT 查询");
  }
  // 5 尾随行注释剥离
  sql = stripTrailingLineComment(sql);
  // 6 占位符置 NULL
  sql = bindPlaceholdersNull(sql);
  // 7a H2 方言 → SQLite（FETCH FIRST n ROWS ONLY 等先改写；§10.6）
  sql = translateSql(sql);
  // 7b LIMIT 1 兜底
  if (!hasTailLimit(sql)) sql = sql + " LIMIT 1";

  // 8 执行：只读元数据（LIMIT 1 保证代价可控）
  let columns: Array<{ name: string; type: string | null }> = [];
  try {
    const stmt = db().prepare(sql);
    stmt.all(); // 消费执行（错误在此抛出）
    // bun 1.3.x：元数据为 getter 属性 columnNames/columnTypes（非 columns() 方法）
    const s2 = stmt as unknown as { columnNames?: string[]; columnTypes?: Array<string | null> };
    const names = s2.columnNames ?? [];
    const types = s2.columnTypes ?? [];
    columns = names.map((n, i) => ({ name: n, type: types[i] ?? null }));
  } catch (err) {
    // 10 错误转 400 中文
    throw new IllegalArgumentException("SQL 执行失败：" + describeRootCause(err));
  }
  // 9 列映射
  const out: ColumnMeta[] = [];
  for (const c of columns) {
    out.push({
      key: c.name,
      label: c.name,
      columnType: normalizeType(c.type),
      length: null,
      scale: null,
      nullable: true,
    });
  }
  return out;
}

// ==================== API 探测（explore-api） ====================

const TIMEOUT_MS = 10000;

/** 定位响应 JSON 中第一个数组节点 */
function findFirstArray(node: unknown): unknown[] | null {
  if (Array.isArray(node)) return node;
  if (node && typeof node === "object") {
    for (const v of Object.values(node as Record<string, unknown>)) {
      const hit = findFirstArray(v);
      if (hit) return hit;
    }
  }
  return null;
}

function inferType(v: unknown): string {
  if (v == null) return "VARCHAR";
  if (typeof v === "string") return "VARCHAR";
  if (typeof v === "number") return Number.isInteger(v) ? "INT" : "DECIMAL";
  if (typeof v === "boolean") return "TINYINT";
  if (Array.isArray(v) || typeof v === "object") return "JSON";
  return "VARCHAR";
}

/** POST /api/v1/data-sources/explore-api */
export async function exploreApi(body: Record<string, unknown> | null): Promise<ColumnMeta[]> {
  if (!body || body.action == null) {
    throw new IllegalArgumentException("缺少 action（list 操作地址）");
  }
  let action = String(body.action);
  const method = String(body.method ?? "GET").toUpperCase();
  const vars: Record<string, unknown> = { ...(typeof body.data === "object" && body.data ? (body.data as Record<string, unknown>) : {}) };
  vars.page = 1;
  vars.size = 1;
  // {{var}} / :var 占位替换（HttpLogicExecutor 简化移植）
  for (const [k, v] of Object.entries(vars)) {
    action = action.split("{{" + k + "}}").join(String(v)).split(":" + k).join(String(v));
  }
  if (method === "GET" && !action.includes("page=")) {
    action += (action.includes("?") ? "&" : "?") + "page=1&size=1";
  }
  let raw: unknown;
  try {
    const resp = await fetch(action, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(vars),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    raw = await resp.json();
  } catch (e) {
    if (e instanceof IllegalArgumentException) throw e;
    throw new IllegalArgumentException("接口调用失败: " + (e instanceof Error ? e.message : String(e)));
  }
  const arr = findFirstArray(raw);
  if (!arr || arr.length === 0) {
    throw new IllegalArgumentException("接口返回中未找到数组数据，无法推断字段");
  }
  const sample = arr[0];
  const out: ColumnMeta[] = [];
  if (sample && typeof sample === "object" && !Array.isArray(sample)) {
    for (const [k, v] of Object.entries(sample as Record<string, unknown>)) {
      out.push({ key: k, label: k, columnType: inferType(v), length: null, scale: null, nullable: true });
    }
  }
  return out;
}

// ==================== 端点 ====================

/** 探测端点：IllegalArgumentException → HTTP 400 + R.fail(400)（Java GlobalExceptionHandler 语义） */
function probe400Response(res: Response, e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  failHttp(res, 400, 400, msg);
}

/** POST /api/v1/data-sources/explore-sql */
router.post("/explore-sql", (req: Request, res: Response) => {
  const sql = req.body ? (req.body as Record<string, string>).sql : undefined;
  try {
    ok(res, probeSql(sql));
  } catch (e) {
    if (e instanceof IllegalArgumentException) return probe400Response(res, e);
    throw e;
  }
});

/** POST /api/v1/data-sources/explore-api */
router.post("/explore-api", (req: Request, res: Response) => {
  Promise.resolve(exploreApi(req.body as Record<string, unknown> | null))
    .then((cols) => ok(res, cols))
    .catch((e) => {
      if (e instanceof IllegalArgumentException) return probe400Response(res, e);
      throw e;
    });
});

export default router;
