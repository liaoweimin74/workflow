/**
 * db.ts — bun:sqlite 单例封装
 * SQLite 只允许单写者；Node 后端单进程，直接全同步 API（性能足够，语义可预测）。
 */
import { Database } from 'bun:sqlite';
import { config } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __workflowDb: Database | undefined;
}

export function getDb(): Database {
  if (!globalThis.__workflowDb) {
    globalThis.__workflowDb = new Database(config.dbPath, { create: true });
    globalThis.__workflowDb.exec('PRAGMA journal_mode = WAL;');
    globalThis.__workflowDb.exec('PRAGMA foreign_keys = OFF;');
  }
  return globalThis.__workflowDb;
}

export type Row = Record<string, unknown>;

/** 全部行（SELECT ...） */
export function all(sql: string, params: unknown[] = []): Row[] {
  return getDb().prepare(sql).all(...(params as never[])) as Row[];
}

/** 单行或 null */
export function one(sql: string, params: unknown[] = []): Row | null {
  return (getDb().prepare(sql).get(...(params as never[])) as Row | null) ?? null;
}

/** 执行写操作，返回受影响行数 */
export function run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
  const stmt = getDb().prepare(sql);
  const info = stmt.run(...(params as never[]));
  return { changes: Number(info.changes), lastInsertRowid: info.lastInsertRowid };
}

/** 取序列下一个值并步进（引擎 ID 池） */
export function nextSeq(name: string): number {
  const tx = getDb().transaction(() => {
    const row = one('SELECT NEXT_VAL FROM WF_ENGINE_SEQ WHERE NAME = ?', [name]);
    const cur = row ? Number(row['NEXT_VAL']) : 1;
    if (row) {
      run('UPDATE WF_ENGINE_SEQ SET NEXT_VAL = ? WHERE NAME = ?', [cur + 1, name]);
    } else {
      run('INSERT INTO WF_ENGINE_SEQ (NAME, NEXT_VAL) VALUES (?, ?)', [name, 2]);
    }
    return cur;
  });
  return tx() as number;
}
