/**
 * db-init.ts — 幂等初始化器：重建 backend-node/data/workflow.db 并建全部表。
 *
 * 用法：bun run db:init
 *  - 目录不存在则创建；库文件已存在则先删除重建（含 -wal/-shm）
 *  - 单事务内执行 SCHEMA_SQL（平台表）+ ENGINE_TABLES_SQL（引擎 7 表）
 *  - 种子数据请随后执行 `bun run db:seed`（scripts/import-seed.ts）
 */
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { ENGINE_TABLES_SQL, SCHEMA_SQL } from "../src/db/schema.generated";

const DB_PATH = path.resolve(import.meta.dir, "../data/workflow.db");

// 1) 目录与文件清理（幂等）
mkdirSync(path.dirname(DB_PATH), { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) {
  const file = DB_PATH + suffix;
  if (existsSync(file)) {
    rmSync(file);
    console.log(`removed: ${path.basename(file)}`);
  }
}

// 2) 建库建表（单事务）
const db = new Database(DB_PATH);
const statements = [...SCHEMA_SQL, ...ENGINE_TABLES_SQL];

db.exec("BEGIN");
try {
  for (const sql of statements) {
    try {
      db.exec(sql);
    } catch (err) {
      const table = /\bCREATE TABLE\s+([A-Za-z0-9_"]+)/i.exec(sql)?.[1] ?? "<unknown>";
      throw new Error(`建表失败 [${table}]: ${(err as Error).message}\nSQL: ${sql}`);
    }
  }
  db.exec("COMMIT");
} catch (err) {
  db.exec("ROLLBACK");
  db.close();
  console.error((err as Error).message);
  process.exit(1);
}

// 3) 汇总
const row = db
  .query<{ n: number }, []>("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .get();
const tables = db
  .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all()
  .map((r) => r.name);

console.log(`\n✔ SQLite 初始化完成: ${DB_PATH}`);
console.log(`  建表 ${row?.n ?? 0} 张（DDL 语句 ${statements.length} 条）`);
console.log(`  表清单: ${tables.join(", ")}`);

db.close();
