/**
 * 发布/部署（Task 13-6）：草稿 → WF_PROC_DEPLOY 快照。
 * 语义对齐 ProcessDesignService.deploy（engine-semantics.md B 章）：
 *   1. 解析 IR 成功才允许发布（BPMN XML 结构校验）
 *   2. SHA-256（改写后 XML + 排序后 nodeConfigs 规范化 JSON）→ 变更检测，未变化拒绝部署
 *   3. version = 同 procKey 最大版本 + 1（WF_ENGINE_SEQ 计数，兼容历史 1/2/3）
 *   4. NodeConfig 版本快照（WF_NODE_CONFIG.PROCESS_DEFINITION_ID = deployId，幂等重建）
 *   5. 事件缺省名（开始/结束）已由 parser 补齐
 */
import { exec, queryOne, query, tx } from "../db";
import { nowStr, uuid32 } from "../dialect";
import { BusinessException } from "../errors";
import { getIR, loadLatestDeployByKey, type DeployRow } from "./engine";
import { parseNodeConfigs, parseProcessConfig } from "./parser";

export interface DraftRow {
  ID: string; BPMN_XML: string; CATEGORY_ID: string | null; CREATED_AT: string | null; CREATED_BY: string | null;
  DEPLOY_ID: string | null; DEPLOYED_CONFIG_HASH: string | null; DEPLOYED_XML: string | null;
  PROCESS_KEY: string; LAST_DEPLOYED_AT: string | null; NAME: string; PROCESS_DEFINITION_ID: string | null;
  STATUS: string; TENANT_ID: string; UPDATED_AT: string | null; VERSION: number;
}

export function getDraft(draftId: string): DraftRow {
  const d = queryOne<DraftRow>("SELECT * FROM WF_PROCESS_DRAFT WHERE ID = ?", [draftId]);
  if (!d) throw new BusinessException("流程草稿不存在", 404);
  return d;
}

/** 读取草稿当前编辑中的节点配置（node_config：process_def_id=draftId AND process_definition_id IS NULL） */
export function loadDraftNodeConfigs(draftId: string): Record<string, string> {
  const rows = query<{ NODE_ID: string; CONFIG_JSON: string }>(
    "SELECT NODE_ID, CONFIG_JSON FROM WF_NODE_CONFIG WHERE PROCESS_DEF_ID = ? AND PROCESS_DEFINITION_ID IS NULL",
    [draftId]);
  const out: Record<string, string> = {};
  for (const r of rows) out[r.NODE_ID] = r.CONFIG_JSON;
  return out;
}

function canonicalConfigs(configs: Record<string, string>): string {
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(configs).sort()) {
    let v: unknown;
    try { v = JSON.parse(configs[k]); } catch { v = configs[k]; }
    sorted[k] = v;
  }
  return JSON.stringify(sorted);
}

function sha256(s: string): string {
  // Bun/Web Crypto 同步摘要：bun:sqlite 环境用 node:crypto
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(s).digest("hex");
}

function nextVersion(procKey: string): number {
  const seqKey = `wf_deploy_version:${procKey}`;
  const row = queryOne<{ SEQ_VALUE: number }>("SELECT SEQ_VALUE FROM WF_ENGINE_SEQ WHERE SEQ_KEY = ?", [seqKey]);
  const historicalMax = queryOne<{ V: number }>("SELECT MAX(VERSION) V FROM WF_PROC_DEPLOY WHERE PROC_KEY = ?", [procKey])?.V ?? 0;
  const next = Math.max(row?.SEQ_VALUE ?? 0, historicalMax) + 1;
  if (row) exec("UPDATE WF_ENGINE_SEQ SET SEQ_VALUE = ? WHERE SEQ_KEY = ?", [next, seqKey]);
  else exec("INSERT INTO WF_ENGINE_SEQ (SEQ_KEY, SEQ_VALUE) VALUES (?,?)", [seqKey, next]);
  return next;
}

export interface DeployResult {
  deployId: string; procKey: string; version: number; changed: true;
}

/**
 * 发布草稿。失败条件：
 *  - BPMN 解析失败（EngineException 透出 → HTTP 400 流程引擎错误）
 *  - 内容未变化（HTTP 400「流程数据未变化」，对齐 Java）
 */
export function deployDraft(draftId: string, userId: string): DeployResult {
  const draft = getDraft(draftId);
  const xml = draft.BPMN_XML;
  const nodeConfigs = loadDraftNodeConfigs(draftId);
  // 1) 解析 IR（必须成功才允许发布）
  const procCfgRaw = nodeConfigs["__PROCESS__"];
  delete nodeConfigs["__PROCESS__"]; // __PROCESS__ 是流程级键，不进 NODE_CONFIGS_JSON
  const procCfg = procCfgRaw ? parseProcessConfig(procCfgRaw) : null;
  const ir = getIR({
    ...(draft as unknown as DeployRow),
    ID: `__draft__${draft.ID}`,
    DIAGRAM_JSON: xml,
    NODE_CONFIGS_JSON: JSON.stringify(nodeConfigs),
    PROCESS_CONFIG_JSON: procCfgRaw ?? null,
  });
  void ir;
  // 2) 变更检测
  const hash = sha256(xml + "|" + canonicalConfigs({ ...nodeConfigs, ...(procCfgRaw ? { __PROCESS__: procCfgRaw } : {}) }));
  if (draft.DEPLOYED_CONFIG_HASH && draft.DEPLOYED_CONFIG_HASH === hash && draft.DEPLOY_ID) {
    throw new BusinessException("流程数据未变化", 400);
  }
  // 3) 版本 + 快照
  return tx(() => {
    const version = nextVersion(draft.PROCESS_KEY);
    const deployId = `dep-${draft.ID}-${version}`;
    const now = nowStr();
    exec(
      `INSERT INTO WF_PROC_DEPLOY (ID, DRAFT_ID, PROC_KEY, PROC_NAME, VERSION, DIAGRAM_JSON, NODE_CONFIGS_JSON, PROCESS_CONFIG_JSON, DEPLOYED_AT, DEPLOYED_BY, TENANT_ID)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [deployId, draft.ID, draft.PROCESS_KEY, draft.NAME, version, xml, JSON.stringify(nodeConfigs), procCfgRaw ?? null, now, userId, draft.TENANT_ID],
    );
    // 草稿版本绑定
    exec(
      `UPDATE WF_PROCESS_DRAFT SET STATUS = 'DEPLOYED', DEPLOY_ID = ?, DEPLOYED_XML = ?, DEPLOYED_CONFIG_HASH = ?, VERSION = ?, PROCESS_DEFINITION_ID = ?, LAST_DEPLOYED_AT = ?, UPDATED_AT = ? WHERE ID = ?`,
      [deployId, xml, hash, version, deployId, now, now, draft.ID],
    );
    // NodeConfig 版本快照（幂等重建：先删同 process_definition_id 再拷贝）
    exec("DELETE FROM WF_NODE_CONFIG WHERE PROCESS_DEFINITION_ID = ?", [deployId]);
    const rows = query<{ ID: string; NODE_ID: string; NODE_TYPE: string; CONFIG_JSON: string; TENANT_ID: string }>(
      "SELECT ID, NODE_ID, NODE_TYPE, CONFIG_JSON, TENANT_ID FROM WF_NODE_CONFIG WHERE PROCESS_DEF_ID = ? AND PROCESS_DEFINITION_ID IS NULL",
      [draft.ID]);
    for (const r of rows) {
      exec(
        `INSERT INTO WF_NODE_CONFIG (ID, CONFIG_JSON, CREATED_AT, NODE_ID, NODE_TYPE, PROCESS_DEF_ID, PROCESS_DEFINITION_ID, TENANT_ID, UPDATED_AT)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uuid32(), r.CONFIG_JSON, now, r.NODE_ID, r.NODE_TYPE, draft.ID, deployId, r.TENANT_ID, now],
      );
    }
    return { deployId, procKey: draft.PROCESS_KEY, version, changed: true };
  });
}

/** 解析 deploy 的配置 map / 流程级配置（模块层组装 VO 用） */
export function deployConfigViews(deploy: DeployRow) {
  return {
    nodeConfigs: parseNodeConfigs(deploy.NODE_CONFIGS_JSON),
    processConfig: parseProcessConfig(deploy.PROCESS_CONFIG_JSON),
  };
}

/** 按 key 取最新部署（对外模块用） */
export { loadLatestDeployByKey };
