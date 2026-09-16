/**
 * import-seed.ts — 从 Flyway SQL 提取种子数据导入 SQLite。
 *
 * 用法：bun run db:seed （先执行 bun run db:init）
 *
 * 输入：backend/src/main/resources/db/migration/V*.sql（按版本号顺序全量扫描）
 * 范围：仅 sys_* / msg_* 目标表的 INSERT / UPDATE / DELETE（wf_* 引擎表与
 *       Flowable ACT_/FLW_ 语句一律跳过——本轮只迁平台种子）。
 *
 * 方言转换点（H2/MySQL → SQLite）：
 *  - INSERT IGNORE → INSERT（SQLite 无 IGNORE；种子首跑无重复问题，
 *    V3/V7/V12/… 的授权语句自带 NOT EXISTS 幂等守卫）
 *  - NOW() / CURRENT_TIMESTAMP → 运行时生成的 "yyyy-MM-dd HH:mm:ss" 文本
 *    （仅替换引号外的出现，避免污染字符串字面量）
 *  - TRUE/FALSE → 1/0（引号外）
 *  - INSERT INTO ... SELECT ...（V2 角色分配、V3/V7/V12/V15/V20/V21/V26/V29 菜单授权）
 *    与 V21 的 UPDATE、V32 的 INSERT...SELECT...FROM DUAL WHERE NOT EXISTS：
 *    翻译后（去掉 FROM DUAL）交给 SQLite 原生执行，保证派生行与已导入数据一致
 *  - '' 转义引号保持原语义（解析时还原为单个 '）
 *  - SET @x / PREPARE / EXECUTE / DEALLOCATE / ALTER / CREATE TABLE / CREATE INDEX
 *    语句跳过（列变更已烘焙进 schema.generated.ts）
 *
 * 解析策略：语句级扫描（-- 注释剥离、引号感知）+ VALUES 行级 CSV 感知 splitter
 * （处理引号内逗号/括号）；解析或列校验失败的行打印警告并计数，最后输出每表行数汇总。
 */
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MIGRATIONS_DIR = path.resolve(import.meta.dir, "../../backend/src/main/resources/db/migration");
const DB_PATH = path.resolve(import.meta.dir, "../data/workflow.db");

// ---------------------------------------------------------------------------
// 工具：运行时时间戳（与 Java 端 LocalDateTime 视觉一致）
// ---------------------------------------------------------------------------
function nowString(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const NOW = nowString();

// ---------------------------------------------------------------------------
// 工具：引号感知的语句切分（-- 行注释剥离；'' 转义正确处理）
// ---------------------------------------------------------------------------
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inString = false;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i]!;
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          current += "''";
          i += 2;
          continue;
        }
        inString = false;
      }
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      // 行注释：吞到行尾
      while (i < sql.length && sql[i] !== "\n") i += 1;
      continue;
    }
    if (ch === ";") {
      statements.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += ch;
    i += 1;
  }
  if (current.trim()) statements.push(current);
  return statements;
}

// ---------------------------------------------------------------------------
// 工具：引号感知的字面量替换（NOW()/CURRENT_TIMESTAMP/TRUE/FALSE）与 FROM DUAL 删除
// ---------------------------------------------------------------------------
function translateOutsideStrings(sql: string, now: string): string {
  let out = "";
  let inString = false;
  let i = 0;
  const rest = () => sql.slice(i);
  while (i < sql.length) {
    const ch = sql[i]!;
    if (inString) {
      out += ch;
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += ch;
      i += 1;
      continue;
    }
    // NOW() / CURRENT_TIMESTAMP（大小写不敏感）
    const slice = rest();
    if (/^NOW\(\)/i.test(slice)) {
      out += `'${now}'`;
      i += 5;
      continue;
    }
    if (/^CURRENT_TIMESTAMP\b/i.test(slice)) {
      out += `'${now}'`;
      i += "CURRENT_TIMESTAMP".length;
      continue;
    }
    if (/^TRUE\b/i.test(slice)) {
      out += "1";
      i += 4;
      continue;
    }
    if (/^FALSE\b/i.test(slice)) {
      out += "0";
      i += 5;
      continue;
    }
    if (/^FROM\s+DUAL\b/i.test(slice)) {
      out += "";
      i += /^FROM\s+DUAL\b/i.exec(slice)![0].length;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** 单行 VALUES 元组内的字面量切分（仅引号内逗号保护） */
function splitValueLiterals(row: string): string[] {
  const parts: string[] = [];
  let inString = false;
  let current = "";
  for (let i = 0; i < row.length; i += 1) {
    const ch = row[i]!;
    if (inString) {
      current += ch;
      if (ch === "'") {
        if (row[i + 1] === "'") {
          current += "'";
          i += 1;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      current += ch;
      continue;
    }
    if (ch === ",") {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

/** 字面量 → SQLite 绑定值 */
function toValue(literal: string, now: string): string | number | null {
  const upper = literal.toUpperCase();
  if (upper === "NULL") return null;
  if (literal === "NOW()" || upper === "CURRENT_TIMESTAMP") return now;
  if (upper === "TRUE") return 1;
  if (upper === "FALSE") return 0;
  if (literal.startsWith("'") && literal.endsWith("'")) {
    // 还原 '' → '（去首尾引号）
    return literal.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+(\.\d+)?$/.test(literal)) return Number(literal);
  return literal; // 兜底：原样文本
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
type Counts = Record<string, { inserted: number; executed: number; failed: number }>;
const counts: Counts = {};
function bump(table: string, kind: "inserted" | "executed" | "failed", n = 1): void {
  counts[table] ??= { inserted: 0, executed: 0, failed: 0 };
  counts[table]![kind] += n;
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((f) => /^V\d+__.*\.sql$/.test(f))
  .sort((a, b) => {
    const na = Number(/V(\d+)__/.exec(a)![1]);
    const nb = Number(/V(\d+)__/.exec(b)![1]);
    return na - nb;
  });

console.log(`种子导入: ${MIGRATIONS_DIR}`);
console.log(`迁移文件 ${files.length} 个, 时间基准 NOW='${NOW}'\n`);

const db = new Database(DB_PATH);
db.exec("PRAGMA foreign_keys = OFF");

const INSERT_RE = /^INSERT\s+(?:IGNORE\s+)?INTO\s+([A-Za-z0-9_]+)\s*(\([^)]*\))?\s*(VALUES|SELECT)\s*([\s\S]*)$/i;
const isSeedTarget = (table: string) => /^(sys|msg)_/i.test(table);

let skippedOther = 0;
let warnedRows = 0;

db.exec("BEGIN");
try {
  for (const file of files) {
    const raw = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    for (const stmt of splitStatements(raw)) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      const first = trimmed.replace(/\s+/g, " ").toUpperCase();
      if (first.startsWith("INSERT")) {
        const m = INSERT_RE.exec(trimmed);
        if (!m) {
          skippedOther += 1;
          console.warn(`⚠ [${file}] 无法解析的 INSERT（跳过）: ${first.slice(0, 80)}...`);
          continue;
        }
        const [, rawTable, rawColumns, verb, tail] = m as unknown as [string, string, string | undefined, string, string];
        const table = rawTable.toLowerCase();
        if (!isSeedTarget(table)) {
          skippedOther += 1;
          continue;
        }
        if (verb.toUpperCase() === "SELECT") {
          // INSERT INTO ... SELECT ...：翻译后原生执行（FROM DUAL 已在 translate 中去除）
          const sql = translateOutsideStrings(trimmed, NOW).replace(/^INSERT\s+IGNORE/i, "INSERT");
          try {
            db.run(sql);
            const c = (db.query("SELECT changes() AS c").get() as { c: number }).c;
            bump(table, "executed", c);
          } catch (err) {
            bump(table, "failed");
            console.warn(`⚠ [${file}] INSERT...SELECT 执行失败: ${(err as Error).message}\n   SQL: ${sql.slice(0, 160)}...`);
          }
          continue;
        }
        // VALUES 分支：逐行解析
        const sqlColumns = rawColumns
          ? rawColumns
              .slice(1, -1)
              .split(",")
              .map((c) => c.trim().replace(/^`|`$/g, "").replace(/^"|"$/g, ""))
              .filter(Boolean)
          : [];
        if (sqlColumns.length === 0) {
          bump(table, "failed");
          console.warn(`⚠ [${file}] INSERT 无显式列清单（跳过）: ${table}`);
          continue;
        }
        // 按 () 深度切分行元组
        const rows: string[] = [];
        let depth = 0;
        let inString = false;
        let tuple = "";
        for (let i = 0; i < tail.length; i += 1) {
          const ch = tail[i]!;
          if (inString) {
            tuple += ch;
            if (ch === "'") {
              if (tail[i + 1] === "'") {
                tuple += "'";
                i += 1;
                continue;
              }
              inString = false;
            }
            continue;
          }
          if (ch === "'") {
            inString = true;
            tuple += ch;
            continue;
          }
          if (ch === "(") {
            depth += 1;
            if (depth === 1) {
              tuple = "";
              continue;
            }
          }
          if (ch === ")") {
            depth -= 1;
            if (depth === 0) {
              rows.push(tuple);
              tuple = "";
              continue;
            }
          }
          if (depth >= 1) tuple += ch;
        }
        for (const row of rows) {
          const literals = splitValueLiterals(row);
          if (literals.length !== sqlColumns.length) {
            warnedRows += 1;
            bump(table, "failed");
            console.warn(`⚠ [${file}] 行列数不匹配（${literals.length} 值 vs ${sqlColumns.length} 列，跳过）: ${row.slice(0, 100)}...`);
            continue;
          }
          const values = literals.map((l) => toValue(l, NOW));
          try {
            const placeholders = values.map(() => "?").join(",");
            const colList = sqlColumns.map((c) => `"${c}"`).join(",");
            db.run(`INSERT INTO "${table}" (${colList}) VALUES (${placeholders})`, values);
            bump(table, "inserted");
          } catch (err) {
            warnedRows += 1;
            bump(table, "failed");
            console.warn(`⚠ [${file}] 行导入失败: ${(err as Error).message}\n   行: ${row.slice(0, 120)}...`);
          }
        }
        continue;
      }
      if (first.startsWith("UPDATE") || first.startsWith("DELETE")) {
        const m = /^\s*(?:UPDATE|DELETE\s+FROM)\s+([A-Za-z0-9_]+)/i.exec(trimmed);
        const table = m?.[1]?.toLowerCase() ?? "";
        if (!table || !isSeedTarget(table)) {
          skippedOther += 1;
          continue;
        }
        const sql = translateOutsideStrings(trimmed, NOW);
        try {
          db.run(sql);
          const c = (db.query("SELECT changes() AS c").get() as { c: number }).c;
          bump(table, "executed", c);
        } catch (err) {
          bump(table, "failed");
          console.warn(`⚠ [${file}] ${first.split(" ")[0]} 执行失败: ${(err as Error).message}`);
        }
        continue;
      }
      // SET/PREPARE/EXECUTE/DEALLOCATE/ALTER/CREATE/... 一律跳过
      skippedOther += 1;
    }
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  db.close();
  console.error(`导入事务失败，已回滚: ${(err as Error).message}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 运行时口令对齐（幂等 fixup）
// Java 沙箱库的 test 用户口令曾在运行期重置为 123456（worklog Task 5b），
// 该改动不在 Flyway 种子里 —— 种子导入后统一把演示口令对齐到平台默认，
// 保证 Node 库与 Java 库凭据行为一致（admin 的种子哈希未变过，无需处理）。
// ---------------------------------------------------------------------------
try {
  const bcrypt = await import("bcryptjs");
  const hash = bcrypt.hashSync("123456", 10);
  const r = db
    .query("UPDATE sys_user SET password = ? WHERE username = 'test'")
    .run(hash);
  if (r.changes > 0) console.log("\n口令对齐: test -> 123456（BCrypt, 与 Java 沙箱库一致）");
} catch (err) {
  console.warn(`⚠ 口令对齐跳过: ${(err as Error).message}`);
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
console.log("\n每表导入汇总:");
let total = 0;
for (const [table, c] of Object.entries(counts).sort()) {
  const n = c.inserted + c.executed;
  total += n;
  const parts = [`${n} 行`];
  if (c.inserted) parts.push(`VALUES ${c.inserted}`);
  if (c.executed) parts.push(`SELECT/UPDATE ${c.executed}`);
  if (c.failed) parts.push(`⚠ 失败 ${c.failed}`);
  console.log(`  ${table.padEnd(22)} ${parts.join(" | ")}`);
}
console.log(`\n合计 ${total} 行 | 跳过非种子语句 ${skippedOther} 条 | 解析失败行 ${warnedRows}`);

// 校验实际行数（sqlite_sequence 自增表除外）
console.log("\n实库行数复核:");
const seeded = ["sys_role", "sys_user", "sys_user_role", "sys_menu", "sys_role_menu", "msg_event_definition", "msg_template"];
for (const t of seeded) {
  const r = db.query(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number };
  console.log(`  ${t.padEnd(22)} ${r.n}`);
}

db.close();
