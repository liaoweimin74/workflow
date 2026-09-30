/**
 * H2 dump → SQLite 一次性导入器（Task 13-2）
 * 数据源：docs/migration/h2-dump/*.json（DumpTool.java 导出）
 * 规则：
 *  - 业务表（SYS_xxx / WF_xxx / MSG_xxx）1:1 镜像导入（保留原 ID）
 *  - Flowable 历史/运行时表 → 自研引擎表（WF_PROC_INST/WF_TASK_INST/WF_ACTIVITY_INST/WF_TASK_CANDIDATE）
 *    保留原 Flowable ID：WF_TASK_COMMENT.TASK_ID 等既有关联不断裂
 *  - Flowable 内部表/flyway_schema_history/EVENT_PUBLICATION 本体不导入
 * 运行：bun run db:import [--force]
 */
import fs from "fs";
import path from "path";
import { config } from "../config";
import { db, exec, queryOne, tx } from "../lib/db";

interface DumpTable {
  table: string;
  columns: { name: string; typeName: string; nullable: boolean; defaultValue: string | null }[];
  columnNames: string[];
  rows: unknown[][];
}

const SKIP_TABLE = /^(ACT_|FLW_|EVENT_PUBLICATION|flyway_schema_history)/;
const BUS_TABLE = /^(SYS_|WF_|MSG_)/;
/** 历史转换需要的 Flowable 源表 */
const FLOWABLE_SOURCE = /^(ACT_HI_PROCINST|ACT_HI_TASKINST|ACT_HI_ACTINST|ACT_HI_VARINST|ACT_HI_IDENTITYLINK|ACT_RU_TASK|ACT_RU_EXECUTION|ACT_RU_VARIABLE)$/;

function loadDumps(): DumpTable[] {
  const dir = config.h2DumpDir;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) as DumpTable)
    .filter((t) => BUS_TABLE.test(t.table) || FLOWABLE_SOURCE.test(t.table));
}

/** dump 值 → SQLite 存储值（dump 中 TIMESTAMP 是字符串、BOOLEAN 是 true/false、JSON/CLOB 是字符串、BLOB 是 base64） */
function toSqlValue(typeName: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  const t = typeName.toUpperCase();
  if (t === "BOOLEAN") return v === true || v === "true" ? 1 : 0;
  if (typeof v === "object") return JSON.stringify(v);
  return v;
}

function insertRows(t: DumpTable): number {
  if (!t.rows.length) return 0;
  const cols = t.columnNames.map((c) => `"${c}"`).join(",");
  const placeholders = t.columnNames.map(() => "?").join(",");
  const typeByName = new Map(t.columns.map((c) => [c.name, c.typeName]));
  const stmt = db().query(`INSERT INTO "${t.table}" (${cols}) VALUES (${placeholders})`);
  for (const row of t.rows) {
    stmt.run(...(t.columnNames.map((c, i) => toSqlValue(typeByName.get(c) ?? "VARCHAR", row[i])) as never[]));
  }
  return t.rows.length;
}

// ---- Flowable 历史 → 自研引擎表 ----

function varValue(row: Record<string, unknown>): unknown {
  const type = String(row["TYPE_"] ?? row["VAR_TYPE_"] ?? "");
  if (type.includes("long") || type.includes("Long")) return row["LONG_"];
  if (type.includes("double") || type.includes("Double")) return row["DOUBLE_"];
  if (type === "serializable" || type === "Serializable") return null; // 无法反序列化的 Java 对象，丢弃
  if (type.includes("json")) return JSON.parse(String(row["TEXT_"] ?? "null"));
  return row["TEXT_"];
}

function procDefKeyOf(procDefId: unknown): { key: string; version: number } {
  const s = String(procDefId ?? "");
  const parts = s.split(":");
  if (parts.length >= 2) return { key: parts[0], version: Number(parts[1]) || 1 };
  return { key: s, version: 1 };
}

/** ACT_HI_VARINST 按实例聚合最新值 → VARIABLES_JSON */
function latestVarsPerInstance(dump: Map<string, DumpTable>): Map<string, Record<string, unknown>> {
  const hiVar = dump.get("ACT_HI_VARINST");
  const result = new Map<string, Record<string, unknown>>();
  if (!hiVar) return result;
  const idx = Object.fromEntries(hiVar.columnNames.map((c, i) => [c, i]));
  const latestTime = new Map<string, string>();
  for (const row of hiVar.rows) {
    const instId = String(row[idx["PROC_INST_ID_"]]);
    const t = String(row[idx["LAST_UPDATED_TIME_"]] ?? row[idx["CREATE_TIME_"]] ?? "");
    if ((latestTime.get(instId) ?? "") >= t) continue;
    latestTime.set(instId, t);
    const name = String(row[idx["NAME_"]]);
    const val = varValue(Object.fromEntries(hiVar.columnNames.map((c, i) => [c, row[i]])));
    const cur = result.get(instId) ?? {};
    if (val !== null) cur[name] = val;
    result.set(instId, cur);
  }
  return result;
}

function importFlowableHistory(dump: Map<string, DumpTable>): void {
  const varsByInst = latestVarsPerInstance(dump);
  const get = (t: string) => dump.get(t);

  // 1. 流程实例
  const hiProc = get("ACT_HI_PROCINST");
  if (hiProc) {
    const idx = Object.fromEntries(hiProc.columnNames.map((c, i) => [c, i]));
    const draftByKey = new Map<string, Record<string, unknown>>();
    for (const d of db().query('SELECT * FROM WF_PROCESS_DRAFT').all() as Record<string, unknown>[]) {
      const key = String(d["PROCESS_KEY"] ?? "");
      const prev = draftByKey.get(key);
      if (!prev || Number(d["VERSION"] ?? 0) >= Number(prev["VERSION"] ?? 0)) draftByKey.set(key, d);
    }
    const stmt = db().query(
      `INSERT INTO WF_PROC_INST ("ID","PROC_KEY","PROC_VERSION","DRAFT_ID","BUSINESS_KEY","TITLE","START_USER","START_TIME","END_TIME","STATUS","DELETE_REASON","VARIABLES_JSON","CURRENT_NODE_KEYS") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const row of hiProc.rows) {
      const r = Object.fromEntries(hiProc.columnNames.map((c, i) => [c, row[i]]));
      const { key, version } = procDefKeyOf(r["PROC_DEF_ID_"]);
      const draft = draftByKey.get(key);
      const end = r["END_TIME_"] as string | null;
      const reason = (r["DELETE_REASON_"] as string | null) ?? "";
      const status = !end ? "RUNNING" : reason.includes("驳回") || /reject|refuse/i.test(reason) ? "REJECTED" : "COMPLETED";
      stmt.run(...([
        r["ID_"], key, version, draft ? String(draft["ID"]) : null,
        r["BUSINESS_KEY_"] ?? null, r["NAME_"] ?? null, r["START_USER_ID_"] ?? null,
        r["START_TIME_"] ?? null, end ?? null, status, reason || null,
        JSON.stringify(varsByInst.get(String(r["ID_"])) ?? {}),
        JSON.stringify([]),
      ] as never[]));
    }
    console.log(`  WF_PROC_INST ← ${hiProc.rows.length}`);
  }

  // 2. 任务实例（ACT_HI_TASKINST 全量；运行中任务用 ACT_RU_TASK 覆盖最新 assignee/claim）
  const hiTask = get("ACT_HI_TASKINST");
  if (hiTask) {
    const idx = Object.fromEntries(hiTask.columnNames.map((c, i) => [c, i]));
    const ruTask = get("ACT_RU_TASK");
    const ruById = new Map<string, Record<string, unknown>>();
    if (ruTask) {
      const ridx = Object.fromEntries(ruTask.columnNames.map((c, i) => [c, i]));
      for (const row of ruTask.rows) ruById.set(String(row[ridx["ID_"]]), Object.fromEntries(ruTask.columnNames.map((c, i) => [c, row[i]])));
    }
    // procKey per instance
    const procKeyById = new Map(db().query('SELECT "ID","PROC_KEY" FROM WF_PROC_INST').all().map((p: any) => [String(p["ID"]), String(p["PROC_KEY"])]));
    const stmt = db().query(
      `INSERT INTO WF_TASK_INST ("ID","PROC_INST_ID","PROC_KEY","NODE_KEY","NODE_NAME","ASSIGNEE","OWNER","STATUS","CLAIM_TIME","START_TIME","END_TIME","COMPLETED_BY","DELETE_REASON","TENANT_ID") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const row of hiTask.rows) {
      const r = Object.fromEntries(hiTask.columnNames.map((c, i) => [c, row[i]]));
      const end = r["END_TIME_"] as string | null;
      const reason = (r["DELETE_REASON_"] as string | null) ?? "";
      const status = !end ? "PENDING" : reason === "completed" ? "COMPLETED" : "CANCELED";
      const ru = ruById.get(String(r["ID_"]));
      stmt.run(...([
        r["ID_"], r["PROC_INST_ID_"], procKeyById.get(String(r["PROC_INST_ID_"])) ?? null,
        r["TASK_DEF_KEY_"], r["NAME_"],
        ru ? (ru["ASSIGNEE_"] ?? null) : (r["ASSIGNEE_"] ?? null),
        r["OWNER_"] ?? null,
        status,
        ru ? (ru["CLAIM_TIME_"] ?? null) : (r["CLAIM_TIME_"] ?? null),
        r["START_TIME_"], end, r["COMPLETED_BY_"] ?? null, reason || null, r["TENANT_ID_"] ?? null,
      ] as never[]));
    }
    console.log(`  WF_TASK_INST ← ${hiTask.rows.length}`);
  }

  // 3. 节点轨迹
  const hiAct = get("ACT_HI_ACTINST");
  if (hiAct) {
    const idx = Object.fromEntries(hiAct.columnNames.map((c, i) => [c, i]));
    const stmt = db().query(
      `INSERT INTO WF_ACTIVITY_INST ("ID","PROC_INST_ID","NODE_KEY","NODE_NAME","NODE_TYPE","STATUS","START_TIME","END_TIME","ASSIGNEE") VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    for (const row of hiAct.rows) {
      const r = Object.fromEntries(hiAct.columnNames.map((c, i) => [c, row[i]]));
      const end = r["END_TIME_"] as string | null;
      stmt.run(...([
        r["ID_"], r["PROC_INST_ID_"], r["ACT_ID_"], r["ACT_NAME_"] ?? null, r["ACT_TYPE_"] ?? null,
        !end ? "RUNNING" : "COMPLETED", r["START_TIME_"], end, r["ASSIGNEE_"] ?? null,
      ] as never[]));
    }
    console.log(`  WF_ACTIVITY_INST ← ${hiAct.rows.length}`);
  }

  // 4. 候选人
  const hiIdl = get("ACT_HI_IDENTITYLINK");
  if (hiIdl) {
    const idx = Object.fromEntries(hiIdl.columnNames.map((c, i) => [c, i]));
    const stmt = db().query(`INSERT INTO WF_TASK_CANDIDATE ("ID","TASK_ID","PROC_INST_ID","USER_ID","CREATED_AT") VALUES (?,?,?,?,?)`);
    let n = 0;
    for (const row of hiIdl.rows) {
      const r = Object.fromEntries(hiIdl.columnNames.map((c, i) => [c, row[i]]));
      if (String(r["TYPE_"]) !== "candidate" || !r["USER_ID_"] || !r["TASK_ID_"]) continue;
      stmt.run(...([`cand-${r["ID_"]}`, r["TASK_ID_"], r["PROC_INST_ID_"] ?? null, r["USER_ID_"], r["CREATE_TIME_"] ?? null] as never[]));
      n++;
    }
    console.log(`  WF_TASK_CANDIDATE ← ${n}`);
  }

  // 5. 运行中实例的当前节点与最新变量（ACT_RU_*）
  const ruExec = get("ACT_RU_EXECUTION");
  if (ruExec) {
    const idx = Object.fromEntries(ruExec.columnNames.map((c, i) => [c, i]));
    const ruVar = get("ACT_RU_VARIABLE");
    const vars = new Map<string, Record<string, unknown>>();
    if (ruVar) {
      const vidx = Object.fromEntries(ruVar.columnNames.map((c, i) => [c, i]));
      for (const row of ruVar.rows) {
        const r = Object.fromEntries(ruVar.columnNames.map((c, i) => [c, row[i]]));
        const instId = String(r["PROC_INST_ID_"]);
        const cur = vars.get(instId) ?? {};
        const val = varValue(r);
        if (val !== null) cur[String(r["NAME_"])] = val;
        vars.set(instId, cur);
      }
    }
    const nodesByInst = new Map<string, string[]>();
    const procKeyById = new Map<string, string>();
    for (const row of ruExec.rows) {
      const r = Object.fromEntries(ruExec.columnNames.map((c, i) => [c, row[i]]));
      const instId = String(r["PROC_INST_ID_"]);
      const parentId = r["PARENT_ID_"];
      if (parentId && String(parentId) !== instId) continue; // 子执行（多实例分支）不作为当前节点
      const actId = r["ACT_ID_"];
      if (actId) {
        const arr = nodesByInst.get(instId) ?? [];
        arr.push(String(actId));
        nodesByInst.set(instId, arr);
      }
      procKeyById.set(instId, procDefKeyOf(r["PROC_DEF_ID_"]).key);
    }
    for (const [instId, nodes] of nodesByInst) {
      const upd: string[] = [`"CURRENT_NODE_KEYS" = ?`];
      const args: unknown[] = [JSON.stringify(nodes)];
      if (vars.has(instId)) {
        upd.push(`"VARIABLES_JSON" = ?`);
        args.push(JSON.stringify(vars.get(instId)));
      }
      args.push(instId);
      exec(`UPDATE WF_PROC_INST SET ${upd.join(",")} WHERE "ID" = ?`, args);
    }
    console.log(`  running instances refreshed: ${nodesByInst.size}`);
  }
}

// ---- 部署快照（WF_PROC_DEPLOY ← 草稿 + 节点配置）----

function importDeploys(): void {
  const drafts = db().query("SELECT * FROM WF_PROCESS_DRAFT").all() as Record<string, unknown>[];
  for (const d of drafts) {
    const draftId = String(d["ID"]);
    const defId = d["PROCESS_DEFINITION_ID"] ? String(d["PROCESS_DEFINITION_ID"]) : null;
    const { version } = procDefKeyOf(defId);
    if (!defId) continue; // 从未部署
    const nodeConfigs = db()
      .query('SELECT * FROM WF_NODE_CONFIG WHERE "PROCESS_DEFINITION_ID" = ?')
      .all(defId) as Record<string, unknown>[];
    const map: Record<string, unknown> = {};
    const processConfigRow = nodeConfigs.find((n) => String(n["NODE_ID"]) === "__PROCESS__");
    if (processConfigRow) {
      try { map["__PROCESS__"] = JSON.parse(String(processConfigRow["CONFIG_JSON"])); } catch { /* ignore */ }
    }
    for (const n of nodeConfigs) {
      const nodeId = String(n["NODE_ID"]);
      if (nodeId === "__PROCESS__") continue;
      try { map[nodeId] = JSON.parse(String(n["CONFIG_JSON"])); } catch { /* ignore */ }
    }
    db().query(
      `INSERT INTO WF_PROC_DEPLOY ("ID","DRAFT_ID","PROC_KEY","PROC_NAME","VERSION","DIAGRAM_JSON","NODE_CONFIGS_JSON","PROCESS_CONFIG_JSON","DEPLOYED_AT") VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      `dep-${draftId}-${version}`, draftId, String(d["PROCESS_KEY"] ?? ""), d["NAME"] ? String(d["NAME"]) : null,
      version, d["BPMN_XML"] ? String(d["BPMN_XML"]) : null, JSON.stringify(map),
      map["__PROCESS__"] ? JSON.stringify(map["__PROCESS__"]) : null,
      d["LAST_DEPLOYED_AT"] ? String(d["LAST_DEPLOYED_AT"]) : null,
    );
  }
  console.log(`  WF_PROC_DEPLOY ← ${drafts.length} drafts`);
}

// ---- main ----

function main(): void {
  const force = process.argv.includes("--force");
  const existing = queryOne<{ c: number }>("SELECT COUNT(*) AS c FROM SYS_USER");
  if (existing && existing.c > 0 && !force) {
    console.log("数据库已有数据（SYS_USER > 0），跳过导入。使用 --force 强制重导。");
    return;
  }
  const dumps = loadDumps();
  const allByName = new Map(dumps.map((d) => [d.table, d]));
  console.log(`导入业务表（源：${config.h2DumpDir}）`);
  tx(() => {
    for (const t of dumps) {
      if (!BUS_TABLE.test(t.table)) continue;
      const n = insertRows(t);
      if (n) console.log(`  ${t.table} ← ${n}`);
    }
    console.log("转换 Flowable 历史 → 自研引擎表:");
    importFlowableHistory(allByName);
    importDeploys();
    // 引擎序列复位：SYS_xxx/MSG_xxx 主键为 AUTOINCREMENT，显式插入后 sqlite_sequence 已同步
  });
  console.log("DONE");
}

main();
