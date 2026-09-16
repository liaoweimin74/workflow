/**
 * import-h2.ts — H2 dump（/tmp/h2-dump/*.jsonl）→ SQLite 历史数据导入（Task 13-8）
 *
 * 三层：
 *  A. 业务表镜像（26 表；wf_ 系列列名大写到小写；SYS 与 MSG 系列保持大写；种子表跳过）
 *  B. 引擎历史转换：
 *     ACT_HI_PROCINST → WF_PROC_INST（ID 保留 Flowable 字符串；STATUS: DELETE_REASON→terminated
 *       / END_TIME→completed / else running）
 *     ACT_HI_TASKINST → WF_TASK_INST（同 ID；END→completed / DELETE_REASON→cancelled / else pending）
 *     ACT_HI_ACTINST  → WF_ACTIVITY_INST
 *     ACT_HI_VARINST  → WF_VARIABLE（每 (实例,变量) 取最新一版）
 *     ACT_HI/RU_IDENTITYLINK → WF_TASK_CANDIDATE（candidate user）
 *     ACT_RE_PROCDEF + ACT_GE_BYTEARRAY → WF_PROC_DEPLOY（自增 ID 重分配 + BPMN XML 迁移）
 *       + **procDefId 重映射**：H2 "key:ver:uuid" → Node "key:ver:<新自增ID>"，实例/任务/活动
 *         表的 PROC_DEF_ID 同步替换（按 key:version 映射）
 *  C. 时间戳规范化："2026-09-10 05:40:12.0" → "2026-09-10 05:40:12"
 *
 * 幂等：执行前整库重置（db:init + db:seed 的产物之上增量导入）。
 */
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, existsSync } from 'node:fs';

const DUMP_DIR = process.env.H2_DUMP_DIR ?? '/tmp/h2-dump';
const DB_PATH = new URL('../data/workflow.db', import.meta.url).pathname;

const db = new Database(DB_PATH, { create: true });
// WF_VARIABLE 由运行时 ensureTables 创建；导入器先确保存在
db.exec(`CREATE TABLE IF NOT EXISTS WF_VARIABLE (
  ID INTEGER PRIMARY KEY AUTOINCREMENT,
  PROC_INST_ID TEXT NOT NULL,
  NAME TEXT NOT NULL,
  TYPE TEXT,
  VALUE_TEXT TEXT,
  VALUE_NUM REAL,
  CREATE_TIME TEXT,
  LAST_UPDATED TEXT,
  TENANT_ID TEXT
)`);
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS UX_WF_VARIABLE ON WF_VARIABLE (PROC_INST_ID, NAME);');
db.exec('PRAGMA journal_mode = WAL;');

interface DumpHeader { table: string; columns: string[] }

function loadDump(table: string): { columns: string[]; rows: unknown[][] } | null {
  const f = `${DUMP_DIR}/${table}.jsonl`;
  if (!existsSync(f)) return null;
  const lines = readFileSync(f, 'utf8').split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return null;
  const header = JSON.parse(lines[0] ?? '{}') as DumpHeader;
  const rows = lines.slice(1).map((l) => JSON.parse(l) as unknown[]);
  return { columns: header.columns, rows };
}

function normTs(v: unknown): unknown {
  if (typeof v === 'string') {
    // "2026-09-10 05:40:12.0" → "2026-09-10 05:40:12"（ISO 化留给读取层）
    return v.replace(/\.0+$/, '').replace('T', ' ');
  }
  return v;
}

function col(v: unknown): unknown {
  return v === undefined ? null : v;
}

const SKIP_SEEDED = new Set(['SYS_USER', 'SYS_ROLE', 'SYS_MENU', 'SYS_USER_ROLE', 'SYS_ROLE_MENU', 'MSG_EVENT_DEFINITION', 'MSG_TEMPLATE']);
const counts: Record<string, number> = {};

function insertRows(table: string, columns: string[], rows: unknown[][], transform?: (row: unknown[]) => unknown[] | null): number {
  if (rows.length === 0) return 0;
  const quoted = columns.map((c) => `"${c}"`).join(',');
  const ph = columns.map(() => '?').join(',');
  let n = 0;
  const stmt = db.prepare(`INSERT OR REPLACE INTO "${table}" (${quoted}) VALUES (${ph})`);
  for (const raw of rows) {
    const row = transform ? transform(raw) : raw;
    if (row == null) continue;
    try {
      stmt.run(...(row as never[]));
      n++;
    } catch (e) {
      console.warn(`  ⚠ ${table} 行插入失败: ${(e as Error).message}`);
    }
  }
  counts[table] = (counts[table] ?? 0) + n;
  return n;
}

// ---------------------------------------------------------------- A. 业务表镜像
console.log('== A. 业务表镜像 ==');
const businessTables = readdirSync(DUMP_DIR)
  .filter((f) => f.endsWith('.jsonl'))
  .map((f) => f.replace('.jsonl', ''))
  .filter((t) => !t.startsWith('ACT_'))
  .filter((t) => !SKIP_SEEDED.has(t));

for (const t of businessTables) {
  const dump = loadDump(t);
  if (!dump) continue;
  // 列名策略：wf_* 全部小写（Node DDL 契约）；其余保持大写
  const lower = t.startsWith('WF_') && !t.startsWith('WF_PROC_') && !t.startsWith('WF_TASK_I') && !t.startsWith('WF_ENGINE');
  const columns = dump.columns.map((c) => (lower ? c.toLowerCase() : c));
  // 时间列规范化
  const timeIdx = columns
    .map((c, i) => (/(_TIME|TIME_|_AT|CREATED|UPDATED|START|END|CLAIM)/.test(c.toUpperCase()) && /TIME|_AT$|_AT_/.test(c.toUpperCase()) ? i : -1))
    .filter((i) => i >= 0);
  insertRows(
    lower ? t.toLowerCase() : t,
    columns,
    dump.rows,
    (row) => row.map((v, i) => (timeIdx.includes(i) ? normTs(col(v)) : col(v))),
  );
}

// ---------------------------------------------------------------- B1. 部署定义 + procDefId 重映射
console.log('== B. 引擎历史转换 ==');
const procdef = loadDump('ACT_RE_PROCDEF');
const bytearray = loadDump('ACT_GE_BYTEARRAY');
const idRemap = new Map<string, string>(); // H2 procDefId → Node procDefId
const keyVerToH2 = new Map<string, string>(); // key:version → H2 procDefId（XML 查找用）

if (procdef) {
  const iKey = procdef.columns.indexOf('KEY_');
  const iVer = procdef.columns.indexOf('VERSION_');
  const iName = procdef.columns.indexOf('NAME_');
  const iRes = procdef.columns.indexOf('RESOURCE_NAME_');
  const iDgrm = procdef.columns.indexOf('DGRM_RESOURCE_NAME_');
  const iTen = procdef.columns.indexOf('TENANT_ID_');
  const iState = procdef.columns.indexOf('SUSPENSION_STATE_');
  const iDeploy = procdef.columns.indexOf('DEPLOYMENT_ID_');
  const deployTimes = new Map<string, string>();
  const dep = loadDump('ACT_RE_DEPLOYMENT');
  if (dep) {
    const ii = dep.columns.indexOf('ID_');
    const it = dep.columns.indexOf('DEPLOY_TIME_');
    for (const r of dep.rows) deployTimes.set(String(col(r[ii])), String(normTs(col(r[it])) ?? ''));
  }
  const bytesByName = new Map<string, string>(); // NAME_ → BPMN XML 文本
  if (bytearray) {
    const iBName = bytearray.columns.indexOf('NAME_');
    const iBBytes = bytearray.columns.indexOf('BYTES_');
    for (const r of bytearray.rows) {
      const name = col(r[iBName]);
      const b64 = col(r[iBBytes]);
      if (typeof name === 'string' && typeof b64 === 'string' && name.endsWith('.bpmn20.xml')) {
        try {
          bytesByName.set(name, Buffer.from(b64, 'base64').toString('utf8'));
        } catch { /* 非 UTF8 资源跳过 */ }
      }
    }
  }
  for (const r of procdef.rows) {
    const key = String(col(r[iKey]));
    const version = Number(col(r[iVer]));
    const h2Id = String(col(r[procdef.columns.indexOf('ID_')]));
    keyVerToH2.set(`${key}:${version}`, h2Id);
    // 插入 WF_PROC_DEPLOY（自增 ID）→ 新 procDefId = `${key}:${version}:${newId}`
    const ins = db.prepare(
      `INSERT INTO WF_PROC_DEPLOY (NAME, KEY_, CATEGORY, VERSION, DEPLOY_TIME, RESOURCE_NAME, DIAGRAM_RESOURCE_NAME, TENANT_ID, SUSPENSION_STATE, BPMN_XML, CONFIG_JSON) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    );
    const xml = bytesByName.get(String(col(r[iRes])) ?? '') ?? null;
    // 挂起状态：H2 1=active 2=suspended（与 Node 语义一致）
    const result = ins.run(...([
      col(r[iName]), key, col(r[procdef.columns.indexOf('CATEGORY_')]), version,
      normTs(deployTimes.get(String(col(r[iDeploy])) ?? '') ?? null), col(r[iRes]), col(r[iDgrm]),
      col(r[iTen]) ?? 'default', Number(col(r[iState]) ?? 1) === 2 ? 2 : 1, xml, null,
    ] as never[]));
    const newId = Number(result.lastInsertRowid);
    const nodeProcDefId = `${key}:${version}:${newId}`;
    idRemap.set(h2Id, nodeProcDefId);
    counts['WF_PROC_DEPLOY'] = (counts['WF_PROC_DEPLOY'] ?? 0) + 1;
  }
  console.log(`  部署定义: ${idRemap.size} 条（含 BPMN XML ${bytesByName.size} 个资源）`);
}

function remapDefId(v: unknown): unknown {
  const s = typeof v === 'string' ? v : null;
  if (s == null) return null;
  return idRemap.get(s) ?? s;
}

// ---------------------------------------------------------------- B2. 实例/任务/活动/变量/候选人

const hiInst = loadDump('ACT_HI_PROCINST');
if (hiInst) {
  const c = hiInst.columns;
  const rows = hiInst.rows.map((r) => {
    const endTime = col(r[c.indexOf('END_TIME_')]);
    const deleteReason = col(r[c.indexOf('DELETE_REASON_')]);
    const status = deleteReason != null ? 'terminated' : endTime != null ? 'completed' : 'running';
    return [
      String(col(r[c.indexOf('ID_')])), remapDefId(col(r[c.indexOf('PROC_DEF_ID_')])),
      col(r[c.indexOf('BUSINESS_KEY_')]), col(r[c.indexOf('START_USER_ID_')]),
      normTs(col(r[c.indexOf('START_TIME_')])), normTs(endTime), col(r[c.indexOf('DURATION_')]),
      status, col(r[c.indexOf('TENANT_ID_')]) ?? 'default',
    ];
  });
  insertRows('WF_PROC_INST', ['ID', 'PROC_DEF_ID', 'BUSINESS_KEY', 'START_USER_ID', 'START_TIME', 'END_TIME', 'DURATION_MS', 'STATUS', 'TENANT_ID'], rows);
}

const hiTask = loadDump('ACT_HI_TASKINST');
if (hiTask) {
  const c = hiTask.columns;
  const rows = hiTask.rows.map((r) => {
    const endTime = col(r[c.indexOf('END_TIME_')]);
    const deleteReason = col(r[c.indexOf('DELETE_REASON_')]);
    const status = deleteReason != null ? 'cancelled' : endTime != null ? 'completed' : 'pending';
    return [
      String(col(r[c.indexOf('ID_')])), String(col(r[c.indexOf('PROC_INST_ID_')])),
      remapDefId(col(r[c.indexOf('PROC_DEF_ID_')])), col(r[c.indexOf('TASK_DEF_KEY_')]),
      col(r[c.indexOf('NAME_')]), col(r[c.indexOf('ASSIGNEE_')]), null,
      col(r[c.indexOf('PRIORITY_')]) == null ? 50 : Number(col(r[c.indexOf('PRIORITY_')])),
      normTs(col(r[c.indexOf('CREATE_TIME_')])), normTs(col(r[c.indexOf('CLAIM_TIME_')])), normTs(endTime),
      col(r[c.indexOf('DURATION_')]), status, col(r[c.indexOf('TENANT_ID_')]) ?? 'default',
      col(r[c.indexOf('FORM_KEY_')]),
    ];
  });
  insertRows('WF_TASK_INST', ['ID', 'PROC_INST_ID', 'PROC_DEF_ID', 'TASK_DEF_KEY', 'NAME', 'ASSIGNEE', 'OWNER', 'PRIORITY', 'CREATE_TIME', 'CLAIM_TIME', 'END_TIME', 'DURATION_MS', 'STATUS', 'TENANT_ID', 'FORM_KEY'], rows);
}

const hiAct = loadDump('ACT_HI_ACTINST');
if (hiAct) {
  const c = hiAct.columns;
  const rows = hiAct.rows.map((r) => {
    const endTime = col(r[c.indexOf('END_TIME_')]);
    return [
      String(col(r[c.indexOf('ID_')])), String(col(r[c.indexOf('PROC_INST_ID_')])),
      remapDefId(col(r[c.indexOf('PROC_DEF_ID_')])), col(r[c.indexOf('ACT_ID_')]),
      col(r[c.indexOf('ACT_NAME_')]), col(r[c.indexOf('ACT_TYPE_')]), col(r[c.indexOf('ASSIGNEE_')]),
      normTs(col(r[c.indexOf('START_TIME_')])), normTs(endTime), col(r[c.indexOf('DURATION_')]),
      endTime != null ? 'completed' : 'running', col(r[c.indexOf('TENANT_ID_')]) ?? 'default',
    ];
  });
  insertRows('WF_ACTIVITY_INST', ['ID', 'PROC_INST_ID', 'PROC_DEF_ID', 'ACT_ID', 'ACT_NAME', 'ACT_TYPE', 'ASSIGNTEE', 'START_TIME', 'END_TIME', 'DURATION_MS', 'STATUS', 'TENANT_ID'], rows);
}

// 变量：每 (PROC_INST_ID_, NAME_) 取最新（按 CREATE_TIME_/LAST_UPDATED_TIME_ 最大）
const hiVar = loadDump('ACT_HI_VARINST');
if (hiVar) {
  const c = hiVar.columns;
  const latest = new Map<string, unknown[]>();
  for (const r of hiVar.rows) {
    const pi = String(col(r[c.indexOf('PROC_INST_ID_')]));
    const name = String(col(r[c.indexOf('NAME_')]));
    const upd = String(normTs(col(r[c.indexOf('LAST_UPDATED_TIME_')])) ?? '');
    const k = `${pi}||${name}`;
    const prev = latest.get(k);
    if (!prev || String(prev[1]) <= upd) {
      const long = col(r[c.indexOf('LONG_')]);
      const dbl = col(r[c.indexOf('DOUBLE_')]);
      const text = col(r[c.indexOf('TEXT_')]);
      const type = col(r[c.indexOf('VAR_TYPE_')]);
      latest.set(k, [
        null, pi, name,
        type == null ? null : String(type),
        text == null ? null : String(text),
        long != null ? Number(long) : dbl != null ? Number(dbl) : null,
        normTs(col(r[c.indexOf('CREATE_TIME_')])),
        normTs(col(r[c.indexOf('LAST_UPDATED_TIME_')])),
        col(r[c.indexOf('TENANT_ID_')]) == null || col(r[c.indexOf('TENANT_ID_')]) === '' ? 'default' : String(col(r[c.indexOf('TENANT_ID_')])),
      ]);
    }
  }
  const rows = [...latest.values()].map((r) => {
    // 填自增 ID：先用占位再 UPDATE 会慢；直接让 AUTOINCREMENT 分配（ID 传 NULL）
    return r;
  });
  const ins = db.prepare(`INSERT OR IGNORE INTO WF_VARIABLE (ID, PROC_INST_ID, NAME, TYPE, VALUE_TEXT, VALUE_NUM, CREATE_TIME, LAST_UPDATED, TENANT_ID) VALUES (NULL,?,?,?,?,?,?,?,?)`);
  let n = 0;
  for (const r of rows) {
    try { ins.run(r[1] as never, r[2] as never, r[3] as never, r[4] as never, r[5] as never, r[6] as never, r[7] as never, r[8] as never); n++; } catch { /* dup */ }
  }
  counts['WF_VARIABLE'] = n;
}

// 候选人（历史 + 运行时，去重）
const cands: unknown[][] = [];
for (const t of ['ACT_HI_IDENTITYLINK', 'ACT_RU_IDENTITYLINK']) {
  const d = loadDump(t);
  if (!d) continue;
  const c = d.columns;
  const iTask = c.indexOf('TASK_ID_');
  const iType = c.indexOf('TYPE_');
  const iUser = c.indexOf('USER_ID_');
  for (const r of d.rows) {
    const task = col(r[iTask]);
    const type = col(r[iType]);
    const user = col(r[iUser]);
    if (task != null && user != null && String(type) === 'candidate') {
      cands.push([null, String(task), 'user', String(user)]);
    }
  }
}
if (cands.length > 0) {
  const seen = new Set<string>();
  const uniq = cands.filter((r) => {
    const k = `${r[1]}|${r[3]}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const ins = db.prepare(`INSERT OR IGNORE INTO WF_TASK_CANDIDATE (ID, TASK_ID, TYPE, CANDIDATE_ID) VALUES (NULL,?,?,?)`);
  let n = 0;
  for (const r of uniq) { try { ins.run(r[1] as never, r[2] as never, r[3] as never); n++; } catch { /* ignore */ } }
  counts['WF_TASK_CANDIDATE'] = n;
}

// ---------------------------------------------------------------- 汇总
console.log('\n== 导入汇总 ==');
let total = 0;
for (const [t, n] of Object.entries(counts).sort()) {
  console.log(`  ${t.padEnd(24)} ${n}`);
  total += n;
}
console.log(`  合计 ${total} 行`);

// 完整性校验
const check = (sql: string) => { try { const r = db.prepare(sql).get() as Record<string, unknown> | null; return Number(r?.['C'] ?? 0); } catch { return -1; } };
console.log('\n== 完整性校验 ==');
console.log(`  WF_PROC_INST 总数=${check('SELECT COUNT(*) AS C FROM WF_PROC_INST')} running=${check("SELECT COUNT(*) AS C FROM WF_PROC_INST WHERE STATUS='running'")}`);
console.log(`  WF_TASK_INST 总数=${check('SELECT COUNT(*) AS C FROM WF_TASK_INST')} pending=${check("SELECT COUNT(*) AS C FROM WF_TASK_INST WHERE STATUS='pending'")}`);
console.log(`  WF_ACTIVITY_INST=${check('SELECT COUNT(*) AS C FROM WF_ACTIVITY_INST')}`);
console.log(`  WF_VARIABLE=${check('SELECT COUNT(*) AS C FROM WF_VARIABLE')}`);
console.log(`  WF_PROC_DEPLOY=${check('SELECT COUNT(*) AS C FROM WF_PROC_DEPLOY')} 含XML=${check('SELECT COUNT(*) AS C FROM WF_PROC_DEPLOY WHERE BPMN_XML IS NOT NULL')}`);
console.log(`  wf_task_comment=${check('SELECT COUNT(*) AS C FROM wf_task_comment')}（Flowable ID 关联保留）`);
const orphan = check(`SELECT COUNT(*) AS C FROM wf_task_comment WHERE task_id IS NOT NULL AND task_id NOT IN (SELECT ID FROM WF_TASK_INST)`);
console.log(`  评论孤儿（应为 0）=${orphan}`);
db.close();
