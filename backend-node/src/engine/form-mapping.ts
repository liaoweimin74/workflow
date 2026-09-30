/**
 * form-mapping.ts — FormMappingValidator 移植（Task 13-6a）
 *
 * 部署时校验流程定义版本下所有节点的表单字段映射与流程变量映射：
 *  - form.dataMappings[].targetField 必须存在于目标表单（本节点 form.formDefId）schema
 *  - form:* 源的 sourceField 必须存在于源表单 schema（form:initiator → 发起人节点表单，
 *    form:<nodeId> → 该节点表单；源表单无法解析时跳过字段校验，仅记依赖边）
 *  - variableMappings[].variable 全局唯一
 *  - 节点间映射（含 form:initiator 解析后的实际源节点）无循环引用
 * 校验失败抛 IllegalArgumentException 语义（IllegalArgumentError → HTTP 400），消息逐字对齐：
 *   "节点 {nodeId} 的映射目标字段不存在: {field}"
 *   "节点 {nodeId} 的映射源字段不存在: {field}（source={source}）"
 *   "流程变量名重复: {variable}"
 *   "节点映射存在循环引用: {node}"
 */
import { all, one, type Row } from '../lib/db';
import { IllegalArgumentError } from '../lib/errors';
import { extractInitiatorNodeId, parseBpmnToIr } from './bpmn-ir';

const FORM_PREFIX = 'form:';
const INITIATOR_SOURCE = 'form:initiator';

interface MappingRow {
  nodeId: string;
  config: Record<string, unknown>;
}

function loadConfigRows(processDefinitionId: string): MappingRow[] {
  const rows: Row[] = all(
    `SELECT "node_id", "config_json" FROM wf_node_config WHERE "process_definition_id" = ?`,
    [processDefinitionId],
  );
  const out: MappingRow[] = [];
  for (const r of rows) {
    const configJson = r['config_json'] == null ? null : String(r['config_json']);
    if (configJson == null || configJson.trim() === '') continue;
    try {
      const parsed = JSON.parse(configJson) as unknown;
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
      out.push({ nodeId: String(r['node_id']), config: parsed as Record<string, unknown> });
    } catch {
      // 节点配置解析失败：跳过（Java log.warn 后 continue）
    }
  }
  return out;
}

/** 表单 schema 字段名全集（布局容器 children / props.rule / props.columns[].rule 递归穿透） */
function loadFieldNames(formDefId: string): Set<string> {
  const names = new Set<string>();
  const row = one(`SELECT "schema" FROM wf_form_def WHERE "id" = ?`, [formDefId]);
  const schema = row == null || row['schema'] == null ? null : String(row['schema']);
  if (schema == null) return names;
  let root: unknown;
  try {
    root = JSON.parse(schema);
  } catch {
    return names; // schema 非法：返回空集合，不阻断
  }
  const rule = Array.isArray(root) ? root : (root as Record<string, unknown> | null)?.['rule'];
  collectFieldNames(rule, names);
  return names;
}

function collectFieldNames(rules: unknown, names: Set<string>): void {
  if (!Array.isArray(rules)) return;
  for (const item of rules) {
    if (item == null || typeof item !== 'object') continue;
    const rule = item as Record<string, unknown>;
    const field = rule['field'];
    if (typeof field === 'string' && field.trim() !== '') names.add(field);
    if (Array.isArray(rule['children'])) collectFieldNames(rule['children'], names);
    const props = rule['props'];
    if (props != null && typeof props === 'object' && !Array.isArray(props)) {
      const p = props as Record<string, unknown>;
      if (Array.isArray(p['rule'])) collectFieldNames(p['rule'], names);
      if (Array.isArray(p['columns'])) {
        for (const col of p['columns']) {
          if (col != null && typeof col === 'object') {
            const cRule = (col as Record<string, unknown>)['rule'];
            if (Array.isArray(cRule)) collectFieldNames(cRule, names);
          }
        }
      }
    }
  }
}

function mappingsOf(config: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = config[key];
  return Array.isArray(v) ? (v as Record<string, unknown>[]).filter((m) => m != null && typeof m === 'object') : [];
}

/**
 * 校验入口（FormMappingValidator.validate 移植）。
 * @param processDefinitionId 部署版本（wf_node_config.process_definition_id）
 * @param deployedBpmnXml 该版本的 BPMN XML（initiator 解析用；缺失时 form:initiator 依赖边不建、源校验跳过）
 */
export function validateFormMappings(processDefinitionId: string, deployedBpmnXml: string | null): void {
  const configs = loadConfigRows(processDefinitionId);
  if (configs.length === 0) return;

  const initiatorNodeId = deployedBpmnXml == null ? null : extractInitiatorNodeId(parseBpmnToIr(deployedBpmnXml));

  const findNodeFormDefId = (nodeId: string): string | null => {
    const cfg = configs.find((c) => c.nodeId === nodeId);
    if (!cfg) return null;
    const form = cfg.config['form'];
    const formDefId = form != null && typeof form === 'object' ? (form as Record<string, unknown>)['formDefId'] : null;
    return typeof formDefId === 'string' && formDefId !== '' ? formDefId : null;
  };

  const resolveSourceFormDefId = (source: string): string | null => {
    if (!source.startsWith(FORM_PREFIX)) return null;
    const sourceNodeId = source === INITIATOR_SOURCE ? initiatorNodeId : source.slice(FORM_PREFIX.length);
    if (sourceNodeId == null) return null;
    return findNodeFormDefId(sourceNodeId);
  };

  const variableNames = new Set<string>();
  const edges = new Map<string, string[]>();

  const validateSource = (nodeId: string, mapping: Record<string, unknown>): void => {
    const source = mapping['source'];
    if (typeof source !== 'string' || !source.startsWith(FORM_PREFIX)) return;
    const sourceNodeId = source === INITIATOR_SOURCE ? initiatorNodeId : source.slice(FORM_PREFIX.length);
    if (sourceNodeId != null) {
      const list = edges.get(nodeId) ?? [];
      list.push(sourceNodeId);
      edges.set(nodeId, list);
    }
    const sourceFormDefId = resolveSourceFormDefId(source);
    if (sourceFormDefId == null) return; // 无法解析源表单：跳过字段存在性校验（Java log.warn）
    const sourceField = mapping['sourceField'];
    if (typeof sourceField !== 'string' || sourceField.trim() === '') return;
    if (!loadFieldNames(sourceFormDefId).has(sourceField)) {
      throw new IllegalArgumentError(`节点 ${nodeId} 的映射源字段不存在: ${sourceField}（source=${source}）`);
    }
  };

  for (const { nodeId, config } of configs) {
    const form = config['form'];
    const formDefId =
      form != null && typeof form === 'object' && !Array.isArray(form)
        ? (form as Record<string, unknown>)['formDefId']
        : null;
    const formDefIdStr = typeof formDefId === 'string' && formDefId !== '' ? formDefId : null;

    for (const mapping of mappingsOf(form != null && typeof form === 'object' && !Array.isArray(form) ? (form as Record<string, unknown>) : {}, 'dataMappings')) {
      const targetField = mapping['targetField'];
      if (typeof targetField !== 'string' || targetField.trim() === '') continue;
      if (formDefIdStr != null && !loadFieldNames(formDefIdStr).has(targetField)) {
        throw new IllegalArgumentError(`节点 ${nodeId} 的映射目标字段不存在: ${targetField}`);
      }
      validateSource(nodeId, mapping);
    }

    for (const mapping of mappingsOf(config, 'variableMappings')) {
      const variable = mapping['variable'];
      if (typeof variable !== 'string' || variable.trim() === '') continue;
      if (variableNames.has(variable)) {
        throw new IllegalArgumentError(`流程变量名重复: ${variable}`);
      }
      variableNames.add(variable);
      validateSource(nodeId, mapping);
    }
  }

  // 环检测（DFS 三色标记，Java 同算法）
  const state = new Map<string, number>();
  const dfs = (node: string): boolean => {
    const s = state.get(node) ?? 0;
    if (s === 2) return false;
    if (s === 1) return true;
    state.set(node, 1);
    for (const next of edges.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    state.set(node, 2);
    return false;
  };
  for (const node of edges.keys()) {
    if (dfs(node)) {
      throw new IllegalArgumentError(`节点映射存在循环引用: ${node}`);
    }
  }
}
