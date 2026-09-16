/**
 * process-definition.ts — 流程定义模块（对齐 ProcessDesignController + ProcessDefinitionController）
 *
 * 路径自带 /api/v1 前缀，主线程直接 app.use(processDefinitionRouter) 即可。
 *
 * 流程设计-草稿（ProcessDesignController，/api/v1/process-definitions）— 7 个：
 *  POST   /api/v1/process-definitions/drafts            createDraft（@RequestParam name,key,categoryId?）
 *  GET    /api/v1/process-definitions/drafts            listDrafts（page,size,categoryId?,name?；name 优先）
 *  GET    /api/v1/process-definitions/{id}/editor       loadEditor（BPMN XML + 当前编辑中节点配置）
 *  PUT    /api/v1/process-definitions/{id}/design       saveDesign（替换节点配置；DEPLOYED→MODIFIED）
 *  POST   /api/v1/process-definitions/{id}/deploy       deploy（IR 生成 + WF_PROC_DEPLOY 落库 + 配置快照）
 *  POST   /api/v1/process-definitions/{id}/copy         copyProcess（name+" (副本)"、key+"_copy_"+8位）
 *  DELETE /api/v1/process-definitions/{id}              deleteDraft（已部署拒绝删除）
 *
 * 流程定义-已部署（ProcessDefinitionController，/api/v1/deployed-processes）— 8 个：
 *  GET    /api/v1/deployed-processes                    list（page=1,size=20,categoryId?,name?,status?；latest per key）
 *  GET    /api/v1/deployed-processes/summaries          summaries（按 key 去重精简列表）
 *  GET    /api/v1/deployed-processes/key/{key}/versions listVersions（多段路径避免与 /{id} 冲突）
 *  GET    /api/v1/deployed-processes/versions/{procDefId}/editor getVersionEditor（XML+配置快照）
 *  GET    /api/v1/deployed-processes/{id}               get（+formDefId/fieldPermissions 解析）
 *  GET    /api/v1/deployed-processes/{id}/xml           getXml（BPMN 原文）
 *  POST   /api/v1/deployed-processes/{id}/suspend       suspend
 *  POST   /api/v1/deployed-processes/{id}/activate      activate
 *
 * 对齐要点（2026-09-16 8080 实测金标准）：
 *  - 分页 1-based（PageRequest.of(max(page,1)-1, size)），信封 PageResponse{content,pageNumber,
 *    pageSize,totalElements,totalPages}；size<1 → HTTP400 "Page size must not be less than one"；
 *    page/size 非整数 → HTTP500 Failed to convert ... 'int'
 *  - ProcessDraft/Category 实体 JSON 字母序；EditorDTO 字母序（bpmnXml,categoryId,id,key,name,
 *    nodeConfigs,status）；ProcessVersionVO 字母序（deploymentTime,isLatest,name,procDefId,version；
 *    boolean latest 经 @JsonProperty 输出为 isLatest）；PageResponse 显式构造器序 + totalPages
 *  - toMap/resolveFormDefIds/nodeConfigs 为 Java HashMap → javaHashMapOrdered 复刻桶序
 *    （11 键 cap16 / 15 键 cap32，已与 8080 实测逐字节核对）
 *  - 错误逐字：草稿未找到 → HTTP500 "Process draft not found: {id}"；部署未变化 →
 *    HTTP200 code400 "流程数据未变化，无需部署"；已部署删除 → HTTP200 code400
 *    "已部署过的流程不允许删除，请先停用"；定义未找到（suspend/activate）→ HTTP400
 *    "流程引擎错误: Cannot find process definition for id '{id}'"；重复挂起/激活 →
 *    "流程引擎错误: Cannot set suspension state 'suspended|active' for ProcessDefinitionEntity[{id}]': already in state '...'."
 *  - XML 读取失败 → HTTP500 "Failed to read process model"；历史版本 editor 失败 →
 *    HTTP200 code404 "历史版本数据读取失败"
 *  - deploymentTime（java.util.Date）→ ISO UTC 毫秒 Z（"2026-09-10T07:30:21.030Z"）
 *  - ProcessDefinition.category = BPMN targetNamespace（Flowable 语义，非 deployment category）
 *  - procDefId 契约（Node 引擎）：`{KEY_}:{VERSION}:{WF_PROC_DEPLOY.ID}`
 */
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { getDb, all, one, run, type Row } from '../lib/db';
import { BusinessException, IllegalArgumentError, EngineError, R } from '../lib/errors';
import { ok, authGuard, ah, type AuthedRequest } from '../lib/http';
import { toIsoText, javaHashMapOrdered } from '../lib/serialize';
import { pageResponse } from '../lib/page';
import { nowText, jsonBody, bodyStr } from '../lib/params';
import { tenantOf, qs, intParam, strParam, hasText } from './shared';
import {
  parseBpmnToIr,
  rewriteMultiInstance,
  injectEventNames,
  deployHash,
  parseNodeTypes,
  extractInitiatorNodeId,
  hasDiagramInfo,
  extractTargetNamespace,
} from '../engine/bpmn-ir';
import { validateFormMappings } from '../engine/form-mapping';

export const processDefinitionRouter = Router();

processDefinitionRouter.use(authGuard);

// ---------------------------------------------------------------- 公共小件

function trimToNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t === '' ? null : t;
}

/** map 相等（NodeConfig 快照比较，Java Map.equals 语义） */
function mapEquals(a: Record<string, string>, b: Record<string, string>): boolean {
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (a[k] !== b[k]) return false;
  return true;
}

/** Collectors.toMap(nodeId → configJson)（(a,b)->a 首值胜出） */
function configMap(rows: Row[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const r of rows) {
    const nodeId = String(r['node_id']);
    if (nodeId in map) continue;
    map[nodeId] = r['config_json'] == null ? '' : String(r['config_json']);
  }
  return map;
}

/** 当前编辑中的节点配置（process_definition_id IS NULL） */
function currentConfigRows(draftId: string): Row[] {
  return all(
    `SELECT "node_id", "config_json" FROM wf_node_config WHERE "process_def_id" = ? AND "process_definition_id" IS NULL ORDER BY rowid ASC`,
    [draftId],
  );
}

/** 部署版本配置快照 */
function snapshotConfigRows(procDefId: string): Row[] {
  return all(
    `SELECT "node_id", "config_json" FROM wf_node_config WHERE "process_definition_id" = ? ORDER BY rowid ASC`,
    [procDefId],
  );
}

function insertNodeConfig(id: string, tenantId: string, draftId: string, processDefinitionId: string | null, nodeId: string, nodeType: string, configJson: string): void {
  const now = nowText();
  run(
    `INSERT INTO wf_node_config ("id","tenant_id","process_def_id","process_definition_id","node_id","node_type","config_json","created_at","updated_at")
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [id, tenantId, draftId, processDefinitionId, nodeId, nodeType, configJson, now, now],
  );
}

// ---------------------------------------------------------------- ProcessDraft 行读

function draftById(id: string, tenant: string): Row {
  const r = one(`SELECT * FROM wf_process_draft WHERE "id" = ? AND "tenant_id" = ?`, [id, tenant]);
  if (!r) throw new Error(`Process draft not found: ${id}`);
  return r;
}

/** ProcessDraft 实体 JSON（Jackson 3 字母序，8080 实测） */
function draftJson(r: Row): Record<string, unknown> {
  return {
    bpmnXml: r['bpmn_xml'] == null ? null : String(r['bpmn_xml']),
    categoryId: r['category_id'] == null ? null : String(r['category_id']),
    createdAt: toIsoText(r['created_at']),
    createdBy: r['created_by'] == null ? null : String(r['created_by']),
    deployId: r['deploy_id'] == null ? null : String(r['deploy_id']),
    deployedConfigHash: r['deployed_config_hash'] == null ? null : String(r['deployed_config_hash']),
    deployedXml: r['deployed_xml'] == null ? null : String(r['deployed_xml']),
    id: String(r['id']),
    key: String(r['process_key']),
    lastDeployedAt: r['last_deployed_at'] == null ? null : toIsoText(r['last_deployed_at']),
    name: String(r['name']),
    processDefinitionId: r['process_definition_id'] == null ? null : String(r['process_definition_id']),
    status: String(r['status']),
    tenantId: String(r['tenant_id']),
    updatedAt: toIsoText(r['updated_at']),
    version: Number(r['version']),
  };
}

/** ProcessDesignService#buildEmptyBpmnXml 移植（逐字对齐，含 targetNamespace 约定） */
function buildEmptyBpmnXml(processKey: string, processName: string, categoryId: string | null): string {
  const targetNamespace = hasText(categoryId) ? categoryId : 'http://flowable.org/bpmn';
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
    'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
    'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ' +
    'xmlns:di="http://www.omg.org/spec/DD/20100524/DI" ' +
    'xmlns:flowable="http://flowable.org/bpmn" ' +
    'targetNamespace="' +
    targetNamespace +
    '">\n' +
    '  <bpmn:process id="' +
    processKey +
    '" name="' +
    processName +
    '" isExecutable="true">\n' +
    '    <bpmn:startEvent id="startEvent_1"/>\n' +
    '  </bpmn:process>\n' +
    '  <bpmndi:BPMNDiagram id="BPMNDiagram_1">\n' +
    '    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="' +
    processKey +
    '">\n' +
    '      <bpmndi:BPMNShape id="startEvent_1_di" bpmnElement="startEvent_1">\n' +
    '        <dc:Rect x="160" y="160" width="36" height="36"/>\n' +
    '      </bpmndi:BPMNShape>\n' +
    '    </bpmndi:BPMNPlane>\n' +
    '  </bpmndi:BPMNDiagram>\n' +
    '</bpmn:definitions>'
  );
}

// ---------------------------------------------------------------- 已部署定义行读

/** procDefId（Node 契约 `{key}:{version}:{rowId}`）解析 */
function parseProcDefId(id: string): { key: string; version: number; rowId: number } | null {
  const i1 = id.lastIndexOf(':');
  if (i1 <= 0) return null;
  const rowId = Number(id.slice(i1 + 1));
  if (!Number.isInteger(rowId) || rowId <= 0) return null;
  const i2 = id.lastIndexOf(':', i1 - 1);
  if (i2 < 0) return null;
  const version = Number(id.slice(i2 + 1, i1));
  if (!Number.isInteger(version) || version <= 0) return null;
  return { key: id.slice(0, i2), version, rowId };
}

function deployRowByProcDefId(id: string): Row | null {
  const p = parseProcDefId(id);
  if (!p) return null;
  const row = one(`SELECT * FROM WF_PROC_DEPLOY WHERE ID = ?`, [p.rowId]);
  if (!row) return null;
  if (String(row['KEY_'] ?? '') !== p.key || Number(row['VERSION'] ?? -1) !== p.version) return null;
  return row;
}

function procDefIdOf(row: Row): string {
  return `${row['KEY_']}:${Number(row['VERSION'])}:${Number(row['ID'])}`;
}

/** ProcessDefinitionController#toMap（HashMap 桶序经 javaHashMapOrdered 复刻） */
function deployedMap(row: Row): Record<string, unknown> {
  const plain: Record<string, unknown> = {
    id: procDefIdOf(row),
    key: String(row['KEY_'] ?? ''),
    name: row['NAME'] == null ? null : String(row['NAME']),
    version: Number(row['VERSION'] ?? 0),
    description: null, // Flowable DESCRIPTION_ 本应用从不写入
    deploymentId: String(row['ID'] ?? ''),
    resourceName: row['RESOURCE_NAME'] == null ? null : String(row['RESOURCE_NAME']),
    diagramResourceName: row['DIAGRAM_RESOURCE_NAME'] == null ? null : String(row['DIAGRAM_RESOURCE_NAME']),
    tenantId: row['TENANT_ID'] == null ? null : String(row['TENANT_ID']),
    category: row['CATEGORY'] == null ? null : String(row['CATEGORY']),
    suspended: Number(row['SUSPENSION_STATE'] ?? 1) === 2,
  };
  return javaHashMapOrdered(plain);
}

/** deploymentTime（TEXT "yyyy-MM-dd HH:mm:ss" → java.util.Date Jackson ISO UTC 毫秒 Z） */
function isoMillisZ(text: unknown): string | null {
  if (text == null) return null;
  const s = String(text).replace(' ', 'T');
  const d = new Date(s.endsWith('Z') ? s : s + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 部署版本 BPMN XML：WF_PROC_DEPLOY.BPMN_XML 优先，回退草稿 deployed_xml（历史数据） */
function deployedXmlOf(procDefId: string, deployRow: Row | null): string | null {
  if (deployRow && deployRow['BPMN_XML'] != null && String(deployRow['BPMN_XML']) !== '') {
    return String(deployRow['BPMN_XML']);
  }
  const r = one(
    `SELECT "deployed_xml" FROM wf_process_draft WHERE "process_definition_id" = ? AND "deployed_xml" IS NOT NULL ORDER BY rowid DESC LIMIT 1`,
    [procDefId],
  );
  return r && r['deployed_xml'] != null ? String(r['deployed_xml']) : null;
}

// ---------------------------------------------------------------- 已部署详情的表单解析

interface FormConfig {
  formDefId: string;
  fieldPermissions: Record<string, string> | null;
}

/** ProcessDefinitionController#extractFormConfig 移植 */
function extractFormConfig(configJson: string): FormConfig | null {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(configJson) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (json == null || typeof json !== 'object') return null;
  const form = json['form'];
  if (form == null || typeof form !== 'object' || Array.isArray(form)) return null;
  const f = form as Record<string, unknown>;
  if (f['formDefId'] == null) return null;
  const val = typeof f['formDefId'] === 'string' ? f['formDefId'] : String(f['formDefId']);
  if (val === '') return null;
  const permNode = f['fieldPermissions'];
  let permissions: Record<string, string> | null = null;
  if (permNode != null && typeof permNode === 'object' && !Array.isArray(permNode)) {
    permissions = {};
    for (const [k, v] of Object.entries(permNode as Record<string, unknown>)) {
      permissions[k] = typeof v === 'string' ? v : String(v);
    }
    permissions = javaHashMapOrdered(permissions) as Record<string, string>;
  }
  return { formDefId: val, fieldPermissions: permissions };
}

/**
 * ProcessDefinitionController#resolveFormDefIds 移植：
 * 优先级 发起人节点表单 > 流程默认表单（表单与字段权限同层取，不跨层合并）。
 * 返回插入序：formDefId, fieldPermissions, initiatorFormDefId, processFormDefId。
 */
function resolveFormDefIds(procDefId: string, deployRow: Row | null): Record<string, unknown> {
  const out: Record<string, unknown> = {
    formDefId: null,
    fieldPermissions: null,
    initiatorFormDefId: null,
    processFormDefId: null,
  };
  const configs = snapshotConfigRows(procDefId);
  let processCfg: FormConfig | null = null;
  let initiatorCfg: FormConfig | null = null;

  for (const nc of configs) {
    try {
      const cfg = extractFormConfig(String(nc['config_json'] ?? ''));
      if (cfg == null) continue;
      if (String(nc['node_id']) === '__PROCESS__') {
        processCfg = cfg;
      }
    } catch {
      // 忽略解析错误
    }
  }

  const xml = deployedXmlOf(procDefId, deployRow);
  const initiatorNodeId = xml == null ? null : extractInitiatorNodeId(parseBpmnToIr(xml));
  if (initiatorNodeId != null) {
    for (const nc of configs) {
      if (String(nc['node_id']) === initiatorNodeId) {
        try {
          initiatorCfg = extractFormConfig(String(nc['config_json'] ?? ''));
        } catch {
          // 忽略解析错误
        }
        break;
      }
    }
  }

  const effective = initiatorCfg != null ? initiatorCfg : processCfg;
  out['formDefId'] = effective != null ? effective.formDefId : null;
  out['fieldPermissions'] = effective != null ? effective.fieldPermissions : null;
  out['initiatorFormDefId'] = initiatorCfg != null ? initiatorCfg.formDefId : null;
  out['processFormDefId'] = processCfg != null ? processCfg.formDefId : null;
  return out;
}

// ---------------------------------------------------------------- 部署语义（ProcessDesignService#deploy 移植）

function isSameAsLastDeployment(draft: Row, effectiveBpmnXml: string, nodeConfigMap: Record<string, string>): boolean {
  if (trimToNull(draft['deployed_xml'] == null ? null : String(draft['deployed_xml'])) !== trimToNull(effectiveBpmnXml)) {
    return false; // XML 变化
  }
  const procDefId = draft['process_definition_id'] == null ? null : String(draft['process_definition_id']);
  if (procDefId == null) {
    return true; // 无历史部署记录且 XML 相同，视为未变化
  }
  const snapshotMap = configMap(all(`SELECT "node_id", "config_json" FROM wf_node_config WHERE "process_def_id" = ? AND "process_definition_id" = ?`, [
    String(draft['id']),
    procDefId,
  ]));
  return mapEquals(snapshotMap, nodeConfigMap);
}

function doDeploy(tenant: string, draftId: string): Record<string, unknown> {
  const draft = draftById(draftId, tenant);

  // 当前编辑中配置 + MultiInstanceBpmnRewriter 改写（会签/或签 → MI；单实例 → assignee/candidateUsers）
  const nodeConfigMap = configMap(currentConfigRows(draftId));
  let effectiveBpmnXml = rewriteMultiInstance(draft['bpmn_xml'] == null ? null : String(draft['bpmn_xml']), nodeConfigMap);
  // 注入 StartEvent/EndEvent 默认名称
  effectiveBpmnXml = injectEventNames(effectiveBpmnXml);

  // 变化检测：hash 优先，历史数据（deployed_config_hash 为空）降级比较
  const currentHash = deployHash(effectiveBpmnXml, nodeConfigMap);
  const storedHash = trimToNull(draft['deployed_config_hash'] == null ? null : String(draft['deployed_config_hash']));
  const unchanged = storedHash != null ? storedHash === currentHash : isSameAsLastDeployment(draft, effectiveBpmnXml, nodeConfigMap);
  if (unchanged) {
    throw new BusinessException('流程数据未变化，无需部署', 400);
  }

  // Flowable 引擎校验/解析对位：XML 解析失败 → 部署失败（消息含 BPMN → 流程定义不完整）
  const key = String(draft['process_key']);
  let ir;
  try {
    ir = parseBpmnToIr(effectiveBpmnXml, { nodeConfigs: nodeConfigMap });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('BPMN')) {
      throw new BusinessException(`流程定义不完整：${msg}`, 400);
    }
    throw new BusinessException(`部署失败：${msg || '未知错误'}`, 400);
  }

  const now = nowText();
  const resourceName = `${key}.bpmn20.xml`;
  const diagramResourceName = hasDiagramInfo(effectiveBpmnXml) ? `${key}.${key}.png` : null;
  // Flowable ProcessDefinition.category = BPMN targetNamespace（非 deployment category）
  const category = extractTargetNamespace(effectiveBpmnXml);

  run(
    `INSERT INTO WF_PROC_DEPLOY (NAME, KEY_, CATEGORY, VERSION, DEPLOY_TIME, RESOURCE_NAME, DIAGRAM_RESOURCE_NAME, TENANT_ID, SUSPENSION_STATE, BPMN_XML, CONFIG_JSON)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [String(draft['name']), key, category, 0, now, resourceName, diagramResourceName, tenant, effectiveBpmnXml, JSON.stringify(ir)],
  );
  const rowId = Number(one(`SELECT last_insert_rowid() AS ID`)!['ID']);

  let procDefId: string | null = null;
  let version = Number(draft['version'] ?? 0);

  if (ir.procKey != null) {
    // version = 同 key+租户 已部署最大版本 + 1（Flowable 语义，首版 = 1）
    version = Number(one(`SELECT MAX(VERSION) AS V FROM WF_PROC_DEPLOY WHERE KEY_ = ? AND TENANT_ID = ? AND ID != ?`, [key, tenant, rowId])!['V'] ?? 0) + 1;
    procDefId = `${key}:${version}:${rowId}`;
    run(`UPDATE WF_PROC_DEPLOY SET VERSION = ? WHERE ID = ?`, [version, rowId]);
  }

  run(
    `UPDATE wf_process_draft SET "status" = 'DEPLOYED', "deploy_id" = ?, "last_deployed_at" = ?, "deployed_xml" = ?, "deployed_config_hash" = ?, "process_definition_id" = ?, "version" = ?, "updated_at" = ? WHERE "id" = ?`,
    [String(rowId), now, effectiveBpmnXml, currentHash, procDefId, version, now, draftId],
  );

  if (procDefId != null) {
    // 版本快照：复制当前配置绑定新部署版本（幂等：先删同版本旧快照）
    const currentRows = currentConfigRows(draftId);
    if (currentRows.length > 0) {
      run(`DELETE FROM wf_node_config WHERE "process_def_id" = ? AND "process_definition_id" = ?`, [draftId, procDefId]);
      const nodeTypes = parseNodeTypes(effectiveBpmnXml);
      for (const src of currentRows) {
        const nodeId = String(src['node_id']);
        const nodeType = nodeId === '__PROCESS__' ? 'process' : (nodeTypes[nodeId] ?? 'unknown');
        insertNodeConfig(randomUUID().replace(/-/g, ''), tenant, draftId, procDefId, nodeId, nodeType, String(src['config_json'] ?? ''));
      }
    }
    // 表单映射校验（字段存在性/变量名唯一/循环引用），失败抛 IllegalArgumentError 阻止部署
    validateFormMappings(procDefId, effectiveBpmnXml);
  }

  return draftJson(one(`SELECT * FROM wf_process_draft WHERE "id" = ?`, [draftId])!);
}

// ---------------------------------------------------------------- 草稿路由

/** POST /api/v1/process-definitions/drafts — 创建草稿 */
processDefinitionRouter.post(
  '/api/v1/process-definitions/drafts',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const name = strParam(req as AuthedRequest, 'name');
    const key = strParam(req as AuthedRequest, 'key');
    const categoryId = qs(req as AuthedRequest, 'categoryId');
    const id = randomUUID().replace(/-/g, '');
    const defaultXml = buildEmptyBpmnXml(key, name, categoryId);
    const now = nowText();
    run(
      `INSERT INTO wf_process_draft ("id","tenant_id","name","process_key","category_id","bpmn_xml","status","version","created_by","created_at","updated_at")
       VALUES (?,?,?,?,?,?, 'DRAFT', 0, NULL, ?, ?)`,
      [id, tenant, name, key, categoryId, defaultXml, now, now],
    );
    ok(res, draftJson(one(`SELECT * FROM wf_process_draft WHERE "id" = ?`, [id])!));
  }),
);

/** GET /api/v1/process-definitions/drafts — 草稿分页（name 搜索优先于 categoryId 过滤） */
processDefinitionRouter.get(
  '/api/v1/process-definitions/drafts',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const page = intParam(req as AuthedRequest, 'page', 1);
    const size = intParam(req as AuthedRequest, 'size', 20);
    if (size < 1) throw new IllegalArgumentError('Page size must not be less than one');
    const norm = Math.max(page, 1);
    const name = qs(req as AuthedRequest, 'name');
    const categoryId = qs(req as AuthedRequest, 'categoryId');

    let whereSql = `WHERE "tenant_id" = ?`;
    const params: unknown[] = [tenant];
    if (hasText(name)) {
      // Spring Data Containing → %name%（H2 LIKE 大小写敏感，PRAGMA 已对齐）
      whereSql += ` AND "name" LIKE ?`;
      params.push(`%${name}%`);
    } else if (hasText(categoryId)) {
      whereSql += ` AND "category_id" = ?`;
      params.push(categoryId);
    }
    const totalRow = one(`SELECT COUNT(*) AS C FROM wf_process_draft ${whereSql}`, params);
    const total = Number(totalRow?.['C'] ?? 0);
    const rows = all(
      `SELECT * FROM wf_process_draft ${whereSql} ORDER BY "updated_at" DESC, rowid DESC LIMIT ? OFFSET ?`,
      [...params, size, (norm - 1) * size],
    );
    ok(res, pageResponse(rows.map(draftJson), norm, size, total));
  }),
);

/** GET /api/v1/process-definitions/{id}/editor — 设计器加载 */
processDefinitionRouter.get(
  '/api/v1/process-definitions/:id/editor',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const id = String(req.params['id'] ?? '');
    const draft = draftById(id, tenant);
    const nodeConfigMap = javaHashMapOrdered(configMap(currentConfigRows(id)));
    ok(res, {
      bpmnXml: draft['bpmn_xml'] == null ? null : String(draft['bpmn_xml']),
      categoryId: draft['category_id'] == null ? null : String(draft['category_id']),
      id: String(draft['id']),
      key: String(draft['process_key']),
      name: String(draft['name']),
      nodeConfigs: nodeConfigMap,
      status: String(draft['status']),
    });
  }),
);

/** PUT /api/v1/process-definitions/{id}/design — 保存设计（事务内更新 XML + 替换节点配置） */
processDefinitionRouter.put(
  '/api/v1/process-definitions/:id/design',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const id = String(req.params['id'] ?? '');
    const body = jsonBody(
      req,
      'public com.workflow.common.domain.R<com.workflow.engine.process.entity.ProcessDraft> com.workflow.api.controller.ProcessDesignController.saveDesign(java.lang.String,com.workflow.api.dto.DesignSaveRequest)',
    );
    const name = bodyStr(body['name']);
    const key = bodyStr(body['key']);
    const categoryId = bodyStr(body['categoryId']);
    const bpmnXml = bodyStr(body['bpmnXml']);
    let nodeConfigs: Record<string, string> | null = null;
    const rawConfigs = body['nodeConfigs'];
    if (rawConfigs != null) {
      if (typeof rawConfigs !== 'object' || Array.isArray(rawConfigs)) {
        throw new Error('Cannot deserialize value of type `java.util.Map<java.lang.String,java.lang.String>` from non-object value');
      }
      nodeConfigs = {};
      for (const [k, v] of Object.entries(rawConfigs as Record<string, unknown>)) {
        if (v == null) {
          nodeConfigs[k] = null as unknown as string;
          continue;
        }
        if (typeof v === 'string') {
          nodeConfigs[k] = v;
        } else if (typeof v === 'number' || typeof v === 'boolean') {
          nodeConfigs[k] = String(v);
        } else {
          throw new Error('Cannot deserialize value of type `java.lang.String` from Object value');
        }
      }
    }

    const db = getDb();
    const result = db.transaction(() => {
      const draft = draftById(id, tenant);
      const status = String(draft['status']);
      const nextStatus = status === 'DEPLOYED' ? 'MODIFIED' : status;
      const now = nowText();
      run(
        `UPDATE wf_process_draft SET "bpmn_xml" = ?, "name" = ?, "process_key" = ?, "category_id" = ?, "status" = ?, "updated_at" = ? WHERE "id" = ?`,
        [bpmnXml, name ?? String(draft['name']), key ?? String(draft['process_key']), categoryId ?? (draft['category_id'] == null ? null : String(draft['category_id'])), nextStatus, now, id],
      );

      // 只删除"当前编辑中"的配置，保留已部署版本快照
      run(`DELETE FROM wf_node_config WHERE "process_def_id" = ? AND "process_definition_id" IS NULL`, [id]);

      if (nodeConfigs != null && Object.keys(nodeConfigs).length > 0) {
        const nodeTypeMap = parseNodeTypes(bpmnXml);
        for (const [nodeId, configJson] of Object.entries(nodeConfigs)) {
          const nodeType = nodeId === '__PROCESS__' ? 'process' : (nodeTypeMap[nodeId] ?? 'unknown');
          insertNodeConfig(randomUUID().replace(/-/g, ''), tenant, id, null, nodeId, nodeType, configJson);
        }
      }
      return draftJson(one(`SELECT * FROM wf_process_draft WHERE "id" = ?`, [id])!);
    })();
    ok(res, result);
  }),
);

/** POST /api/v1/process-definitions/{id}/deploy — 部署（事务；IR 落 WF_PROC_DEPLOY.CONFIG_JSON） */
processDefinitionRouter.post(
  '/api/v1/process-definitions/:id/deploy',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const id = String(req.params['id'] ?? '');
    const db = getDb();
    const result = db.transaction(() => doDeploy(tenant, id))();
    ok(res, result);
  }),
);

/** POST /api/v1/process-definitions/{id}/copy — 复制草稿（含 BPMN XML + 当前编辑中配置） */
processDefinitionRouter.post(
  '/api/v1/process-definitions/:id/copy',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const sourceDraftId = String(req.params['id'] ?? '');
    const db = getDb();
    const result = db.transaction(() => {
      const source = draftById(sourceDraftId, tenant);
      const newId = randomUUID().replace(/-/g, '');
      const now = nowText();
      run(
        `INSERT INTO wf_process_draft ("id","tenant_id","name","process_key","category_id","bpmn_xml","status","version","created_by","created_at","updated_at")
         VALUES (?, ?, ?, ?, ?, ?, 'DRAFT', 0, ?, ?, ?)`,
        [
          newId,
          tenant,
          `${String(source['name'])} (副本)`,
          `${String(source['process_key'])}_copy_${newId.slice(0, 8)}`,
          source['category_id'] == null ? null : String(source['category_id']),
          source['bpmn_xml'] == null ? null : String(source['bpmn_xml']),
          source['created_by'] == null ? null : String(source['created_by']),
          now,
          now,
        ],
      );
      const sourceConfigs = currentConfigRows(sourceDraftId);
      for (const nc of sourceConfigs) {
        insertNodeConfig(
          randomUUID().replace(/-/g, ''),
          tenant,
          newId,
          null,
          String(nc['node_id']),
          String(nc['node_type'] ?? 'unknown'),
          String(nc['config_json'] ?? ''),
        );
      }
      return draftJson(one(`SELECT * FROM wf_process_draft WHERE "id" = ?`, [newId])!);
    })();
    ok(res, result);
  }),
);

/** DELETE /api/v1/process-definitions/{id} — 删除草稿（已部署拒绝） */
processDefinitionRouter.delete(
  '/api/v1/process-definitions/:id',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const id = String(req.params['id'] ?? '');
    const db = getDb();
    db.transaction(() => {
      const draft = draftById(id, tenant);
      if (draft['deploy_id'] != null) {
        throw new BusinessException('已部署过的流程不允许删除，请先停用', 400);
      }
      run(`DELETE FROM wf_node_config WHERE "process_def_id" = ?`, [id]);
      run(`DELETE FROM wf_process_draft WHERE "id" = ?`, [id]);
    })();
    ok(res);
  }),
);

// ---------------------------------------------------------------- 已部署路由
// 注意注册顺序：字面量段（summaries/key/versions）先于 /:id

/** GET /api/v1/deployed-processes — 已部署定义分页（latest per key） */
processDefinitionRouter.get(
  '/api/v1/deployed-processes',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const page = intParam(req as AuthedRequest, 'page', 1);
    const size = intParam(req as AuthedRequest, 'size', 20);
    if (size < 1) throw new IllegalArgumentError('Page size must not be less than one');
    const norm = Math.max(page, 1);
    const categoryId = qs(req as AuthedRequest, 'categoryId');
    const name = qs(req as AuthedRequest, 'name');
    const status = qs(req as AuthedRequest, 'status');

    let whereSql = `WHERE TENANT_ID = ? AND VERSION = (SELECT MAX(V2.VERSION) FROM WF_PROC_DEPLOY V2 WHERE V2.KEY_ = D.KEY_ AND V2.TENANT_ID = D.TENANT_ID)`;
    const params: unknown[] = [tenant];
    if (hasText(categoryId)) {
      whereSql += ` AND CATEGORY LIKE ?`; // Flowable processDefinitionCategoryLike：原样 pattern
      params.push(categoryId);
    }
    if (hasText(name)) {
      whereSql += ` AND NAME LIKE ?`; // Flowable processDefinitionNameLike：原样 pattern（不自动加 %）
      params.push(name);
    }
    if (status != null && status.trim() !== '' && status.toLowerCase() === 'active') {
      whereSql += ` AND SUSPENSION_STATE = 1`;
    } else if (status != null && status.trim() !== '' && status.toLowerCase() === 'suspended') {
      whereSql += ` AND SUSPENSION_STATE = 2`;
    }
    const totalRow = one(`SELECT COUNT(*) AS C FROM WF_PROC_DEPLOY D ${whereSql}`, params);
    const total = Number(totalRow?.['C'] ?? 0);
    const rows = all(`SELECT * FROM WF_PROC_DEPLOY D ${whereSql} ORDER BY VERSION DESC, ID DESC LIMIT ? OFFSET ?`, [
      ...params,
      size,
      (norm - 1) * size,
    ]);
    ok(res, pageResponse(rows.map(deployedMap), norm, size, total));
  }),
);

/** GET /api/v1/deployed-processes/summaries — 按 key 去重精简列表（子流程选择） */
processDefinitionRouter.get(
  '/api/v1/deployed-processes/summaries',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const rows = all(
      `SELECT * FROM WF_PROC_DEPLOY D WHERE TENANT_ID = ? AND VERSION = (SELECT MAX(V2.VERSION) FROM WF_PROC_DEPLOY V2 WHERE V2.KEY_ = D.KEY_ AND V2.TENANT_ID = D.TENANT_ID)
       ORDER BY NAME ASC, ID ASC`,
      [tenant],
    );
    ok(
      res,
      rows.map((r) => ({
        id: procDefIdOf(r),
        key: String(r['KEY_'] ?? ''),
        name: r['NAME'] == null ? String(r['KEY_'] ?? '') : String(r['NAME']),
        version: Number(r['VERSION'] ?? 0),
      })),
    );
  }),
);

/** GET /api/v1/deployed-processes/key/{key}/versions — 该 key 全部历史版本（版本号倒序） */
processDefinitionRouter.get(
  '/api/v1/deployed-processes/key/:key/versions',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const key = String(req.params['key'] ?? '');
    const rows = all(`SELECT * FROM WF_PROC_DEPLOY WHERE KEY_ = ? AND TENANT_ID = ? ORDER BY VERSION DESC`, [key, tenant]);
    const maxVersion = rows.length === 0 ? -1 : Math.max(...rows.map((r) => Number(r['VERSION'] ?? 0)));
    ok(
      res,
      rows.map((r) => ({
        deploymentTime: isoMillisZ(r['DEPLOY_TIME']),
        isLatest: Number(r['VERSION'] ?? 0) === maxVersion,
        name: r['NAME'] == null ? null : String(r['NAME']),
        procDefId: procDefIdOf(r),
        version: Number(r['VERSION'] ?? 0),
      })),
    );
  }),
);

/** GET /api/v1/deployed-processes/versions/{procDefId}/editor — 历史版本编辑器数据 */
processDefinitionRouter.get(
  '/api/v1/deployed-processes/versions/:procDefId/editor',
  ah(async (req, res) => {
    const procDefId = String(req.params['procDefId'] ?? '');
    try {
      const deployRow = deployRowByProcDefId(procDefId);
      const xml = deployRow ? deployedXmlOf(procDefId, deployRow) : null;
      if (xml == null) {
        res.status(200).json(R.fail(404, '历史版本数据读取失败'));
        return;
      }
      const nodeConfigMap = javaHashMapOrdered(configMap(snapshotConfigRows(procDefId)));
      ok(res, {
        bpmnXml: xml,
        categoryId: null,
        id: null,
        key: null,
        name: null,
        nodeConfigs: nodeConfigMap,
        status: 'DEPLOYED',
      });
    } catch {
      res.status(200).json({ code: 404, msg: '历史版本数据读取失败', data: null });
    }
  }),
);

/** GET /api/v1/deployed-processes/{id} — 定义详情（+ 表单解析；未找到 → code404） */
processDefinitionRouter.get(
  '/api/v1/deployed-processes/:id',
  ah(async (req, res) => {
    const tenant = tenantOf(req as AuthedRequest);
    const id = String(req.params['id'] ?? '');
    const row = deployRowByProcDefId(id);
    if (!row || String(row['TENANT_ID'] ?? '') !== tenant) {
      res.status(200).json({ code: 404, msg: 'Process definition not found', data: null });
      return;
    }
    const map = deployedMap(row);
    // 4 个解析键并入同一 HashMap（Java 插入序：toMap 11 键 → formDefId/fieldPermissions/
    // initiatorFormDefId/processFormDefId），统一按桶序输出
    Object.assign(map, resolveFormDefIds(id, row));
    ok(res, javaHashMapOrdered(map));
  }),
);

/** GET /api/v1/deployed-processes/{id}/xml — BPMN XML 原文（失败 → HTTP500 "Failed to read process model"） */
processDefinitionRouter.get(
  '/api/v1/deployed-processes/:id/xml',
  ah(async (req, res) => {
    const id = String(req.params['id'] ?? '');
    const deployRow = deployRowByProcDefId(id);
    const xml = deployRow ? deployedXmlOf(id, deployRow) : null;
    if (xml == null) {
      throw new Error('Failed to read process model');
    }
    ok(res, xml);
  }),
);

/** POST /api/v1/deployed-processes/{id}/suspend — 挂起定义 */
processDefinitionRouter.post(
  '/api/v1/deployed-processes/:id/suspend',
  ah(async (req, res) => {
    const id = String(req.params['id'] ?? '');
    const row = deployRowByProcDefId(id);
    if (!row) {
      throw new EngineError(`Cannot find process definition for id '${id}'`);
    }
    if (Number(row['SUSPENSION_STATE'] ?? 1) === 2) {
      throw new EngineError(`Cannot set suspension state 'suspended' for ProcessDefinitionEntity[${id}]': already in state 'suspended'.`);
    }
    run(`UPDATE WF_PROC_DEPLOY SET SUSPENSION_STATE = 2 WHERE ID = ?`, [Number(row['ID'])]);
    ok(res);
  }),
);

/** POST /api/v1/deployed-processes/{id}/activate — 激活定义 */
processDefinitionRouter.post(
  '/api/v1/deployed-processes/:id/activate',
  ah(async (req, res) => {
    const id = String(req.params['id'] ?? '');
    const row = deployRowByProcDefId(id);
    if (!row) {
      throw new EngineError(`Cannot find process definition for id '${id}'`);
    }
    if (Number(row['SUSPENSION_STATE'] ?? 1) === 1) {
      throw new EngineError(`Cannot set suspension state 'active' for ProcessDefinitionEntity[${id}]': already in state 'active'.`);
    }
    run(`UPDATE WF_PROC_DEPLOY SET SUSPENSION_STATE = 1 WHERE ID = ?`, [Number(row['ID'])]);
    ok(res);
  }),
);
