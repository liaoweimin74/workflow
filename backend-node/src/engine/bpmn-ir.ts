/**
 * bpmn-ir.ts — BPMN 2.0 XML → 节点图 IR 提取器（Task 13-6a 核心新组件，供运行时 13-6b 复用）
 *
 * 组成（全部零依赖，正则/手写扫描，不新增 npm 依赖）：
 *  1. parseXml / serializeXml        —— 轻量 XML DOM（元素/文本/注释；BPMN 机器生成的
 *                                       XML 足够规整，与 Java DOM 语义等价）
 *  2. parseBpmnToIr                  —— BPMN XML → { procKey, procName, nodes, flows } IR，
 *                                       节点携带 assignee/candidateUsers/candidateGroups/
 *                                       formKey/nodeRole/multiInstance/config
 *  3. rewriteMultiInstance           —— MultiInstanceBpmnRewriter 移植（部署时按 NodeConfig
 *                                       approval.multiMode 把 userTask 改写为 MI parallel/sequential，
 *                                       单实例按 approval.userIds 设 flowable:assignee/candidateUsers）
 *  4. injectEventNames               —— ProcessDesignService#injectEventNames 移植
 *                                       （无名称 StartEvent→"开始"、EndEvent→"结束"）
 *  5. deployHash                     —— ProcessDesignService#computeDeployHash 移植
 *                                       （SHA-256( trimToNull(xml) + "|" + TreeMap规范JSON )）
 *  6. extractInitiatorNodeId         —— InitiatorNodeResolver 移植（wf:nodeRole="initiator"
 *                                       的首个 userTask，否则首个 userTask，否则 null）
 *  7. parseNodeTypes                 —— ProcessDesignService#parseNodeTypes 移植
 *                                       （doc 范围 id→标签本地名，saveDesign 写 node_type 用）
 *
 * IR 字段依据 Java 部署器实际使用的信息：
 *  - MultiInstanceBpmnRewriter 用 approval.multiMode / approval.userIds（NodeConfig.configJson）
 *  - InitiatorNodeResolver 用 userTask 的 wf:nodeRole="initiator" 扩展属性
 *  - Flowable 引擎用 flowable:assignee / candidateUsers / candidateGroups / flowable:formKey、
 *    multiInstanceLoopCharacteristics（collection/elementVariable/completionCondition）
 *
 * 与 Java 端已文档化的差异：
 *  - Java 改写后经 javax.xml Transformer 重排（INDENT=yes + standalone="no" 声明），
 *    Node 端 serializeXml 同为规范化 2 空格缩进重排 —— 语义等价，字节级排版可能不同。
 *  - Java Flowable 部署时做 XSD/引用完整性校验（无 target 拒绝等），Node 端仅做
 *    procKey 存在性等基础校验，详细校验留待 13-6b 运行时。
 */
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// 1. 轻量 XML 解析 / 序列化
// ---------------------------------------------------------------------------

export interface XmlAttr {
  /** 原始名（可能含前缀，如 flowable:assignee） */
  name: string;
  /** 前缀（无前缀为 null） */
  prefix: string | null;
  /** 本地名 */
  local: string;
  /** 已解码值 */
  value: string;
}

export interface XmlEl {
  kind: 'element' | 'text' | 'comment';
  /** 元素原始名（可能含前缀） */
  name?: string;
  prefix?: string | null;
  local?: string;
  attrs?: XmlAttr[];
  children: XmlEl[];
  /** text/comment 内容 */
  text?: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, g: string) => {
    if (g.startsWith('#')) {
      const hex = g[1] === 'x' || g[1] === 'X';
      const code = parseInt(g.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[g] ?? m;
  });
}

export function encodeAttrValue(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function encodeText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function splitName(raw: string): { prefix: string | null; local: string } {
  const i = raw.indexOf(':');
  return i < 0 ? { prefix: null, local: raw } : { prefix: raw.slice(0, i), local: raw.slice(i + 1) };
}

function parseAttrs(src: string): XmlAttr[] {
  const attrs: XmlAttr[] = [];
  const re = /([^\s=/<>"']+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const name = m[1]!;
    const { prefix, local } = splitName(name);
    attrs.push({ name, prefix, local, value: decodeEntities(m[2] ?? m[3] ?? '') });
  }
  return attrs;
}

/** 解析 XML 文档；解析失败抛异常（调用方按 Java 语义降级处理） */
export function parseXml(xml: string): XmlEl {
  const doc: XmlEl = { kind: 'element', name: '#doc', prefix: null, local: '#doc', attrs: [], children: [] };
  const stack: XmlEl[] = [doc];
  const len = xml.length;
  let i = 0;
  const pushText = (t: string): void => {
    if (t === '') return;
    stack[stack.length - 1]!.children.push({ kind: 'text', children: [], text: decodeEntities(t) });
  };
  while (i < len) {
    const lt = xml.indexOf('<', i);
    if (lt < 0) {
      pushText(xml.slice(i));
      break;
    }
    pushText(xml.slice(i, lt));
    if (xml.startsWith('<!--', lt)) {
      const end = xml.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('unclosed comment');
      stack[stack.length - 1]!.children.push({ kind: 'comment', children: [], text: xml.slice(lt + 4, end) });
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<![CDATA[', lt)) {
      const end = xml.indexOf(']]>', lt + 9);
      if (end < 0) throw new Error('unclosed CDATA');
      stack[stack.length - 1]!.children.push({ kind: 'text', children: [], text: xml.slice(lt + 9, end) });
      i = end + 3;
      continue;
    }
    if (xml.startsWith('<?', lt)) {
      const end = xml.indexOf('?>', lt + 2);
      if (end < 0) throw new Error('unclosed processing instruction');
      i = end + 2;
      continue;
    }
    if (xml.startsWith('<!', lt)) {
      const end = xml.indexOf('>', lt + 2);
      if (end < 0) throw new Error('unclosed doctype');
      i = end + 1;
      continue;
    }
    if (xml.startsWith('</', lt)) {
      const end = xml.indexOf('>', lt);
      if (end < 0) throw new Error('unclosed end tag');
      const raw = xml.slice(lt + 2, end).trim();
      const top = stack.pop()!;
      if (top.kind === 'element' && top.name !== undefined && top.name !== raw && top.local !== raw) {
        throw new Error(`mismatched end tag: expected </${top.name}>, got </${raw}>`);
      }
      i = end + 1;
      continue;
    }
    // open tag：找引号外的 '>'
    let j = lt + 1;
    let quote: string | null = null;
    while (j < len) {
      const c = xml[j]!;
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === '>') {
        break;
      }
      j++;
    }
    if (j >= len) throw new Error('unclosed tag');
    let inner = xml.slice(lt + 1, j);
    let selfClose = false;
    if (inner.endsWith('/')) {
      selfClose = true;
      inner = inner.slice(0, -1);
    }
    const nameM = /^[^\s/>]+/.exec(inner);
    if (!nameM) throw new Error('invalid tag name');
    const name = nameM[0];
    const { prefix, local } = splitName(name);
    const el: XmlEl = { kind: 'element', name, prefix, local, attrs: parseAttrs(inner.slice(name.length)), children: [] };
    stack[stack.length - 1]!.children.push(el);
    if (!selfClose) stack.push(el);
    i = j + 1;
  }
  if (stack.length !== 1) throw new Error('unclosed elements');
  return doc;
}

/** 文档元素（首个元素子节点） */
export function rootElement(doc: XmlEl): XmlEl | null {
  for (const ch of doc.children) if (ch.kind === 'element') return ch;
  return null;
}

/** 元素子节点（跳过 text/comment） */
export function childElements(el: XmlEl): XmlEl[] {
  return el.children.filter((c) => c.kind === 'element');
}

/** 取属性（本地名匹配 + 可选前缀限定；prefix 省略时任意前缀含无前缀） */
export function attr(el: XmlEl, local: string, prefix?: string): string | null {
  for (const a of el.attrs ?? []) {
    if (a.local === local && (prefix === undefined || a.prefix === prefix)) return a.value;
  }
  return null;
}

/** Java Transformer INDENT=yes 同风格序列化（声明 + 2 空格缩进规范化） */
export function serializeXml(doc: XmlEl): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8" standalone="no"?>'];
  const walk = (el: XmlEl, depth: number): void => {
    const pad = '  '.repeat(depth);
    for (const ch of el.children) {
      if (ch.kind === 'comment') {
        out.push(`${pad}<!--${ch.text}-->`);
        continue;
      }
      if (ch.kind === 'text') {
        if (ch.text == null || ch.text.trim() === '') continue; // 元素间空白 → 规范化掉
        out.push(pad + encodeText(ch.text));
        continue;
      }
      const attrs = (ch.attrs ?? []).map((a) => ` ${a.name}="${encodeAttrValue(a.value)}"`).join('');
      const kids = ch.children;
      if (kids.length === 0) {
        out.push(`${pad}<${ch.name}${attrs}/>`);
        continue;
      }
      const onlyText = kids.every((k) => k.kind === 'text');
      if (onlyText) {
        const text = kids.map((k) => encodeText(k.text ?? '')).join('');
        out.push(`${pad}<${ch.name}${attrs}>${text}</${ch.name}>`);
        continue;
      }
      out.push(`${pad}<${ch.name}${attrs}>`);
      walk(ch, depth + 1);
      out.push(`${pad}</${ch.name}>`);
    }
  };
  for (const ch of doc.children) {
    if (ch.kind === 'comment') {
      out.push(`<!--${ch.text}-->`);
      continue;
    }
    if (ch.kind === 'text') continue;
    const attrs = (ch.attrs ?? []).map((a) => ` ${a.name}="${encodeAttrValue(a.value)}"`).join('');
    out.push(`<${ch.name}${attrs}>`);
    walk(ch, 1);
    out.push(`</${ch.name}>`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// 2. BPMN → IR
// ---------------------------------------------------------------------------

export interface BpmnMultiInstance {
  sequential: boolean;
  collection?: string;
  elementVariable?: string;
  completionCondition?: string;
}

export interface BpmnIrNode {
  id: string;
  name: string | null;
  /** BPMN 标签本地名：startEvent / endEvent / userTask / serviceTask / exclusiveGateway / ... */
  type: string;
  assignee?: string;
  candidateUsers?: string;
  candidateGroups?: string;
  formKey?: string;
  /** 扩展属性 wf:nodeRole（initiator 识别用） */
  nodeRole?: string;
  multiInstance?: BpmnMultiInstance;
  /** NodeConfig.configJson 原文（JSON 字符串；保持快照字节级可还原） */
  config?: string;
}

export interface BpmnIrFlow {
  id: string;
  source: string;
  target: string;
  /** bpmn:conditionExpression 文本（网关路由用） */
  condition?: string;
}

export interface BpmnIr {
  /** <process id="...">（Flowable processDefinitionKey） */
  procKey: string | null;
  procName: string | null;
  nodes: BpmnIrNode[];
  flows: BpmnIrFlow[];
  /** 部署时顶层 definitions 的 targetNamespace（Flowable ProcessDefinition.category 来源） */
  targetNamespace?: string;
  /** __PROCESS__ 节点配置（流程级表单/变量映射快照） */
  processConfig?: string;
}

function multiInstanceOf(userTask: XmlEl): BpmnMultiInstance | undefined {
  for (const ch of childElements(userTask)) {
    if (ch.local === 'multiInstanceLoopCharacteristics') {
      let completionCondition: string | undefined;
      for (const cc of childElements(ch)) {
        if (cc.local === 'completionCondition') {
          completionCondition = cc.children.map((c) => c.text ?? '').join('').trim() || undefined;
        }
      }
      const mi: BpmnMultiInstance = {
        sequential: attr(ch, 'isSequential') === 'true',
      };
      const collection = attr(ch, 'collection', 'flowable');
      if (collection != null) mi.collection = collection;
      const elementVariable = attr(ch, 'elementVariable', 'flowable');
      if (elementVariable != null) mi.elementVariable = elementVariable;
      if (completionCondition != null) mi.completionCondition = completionCondition;
      return mi;
    }
  }
  return undefined;
}

/**
 * BPMN XML → IR。nodeConfigs 提供（nodeId → configJson）时按节点挂载 config 原文，
 * __PROCESS__ 挂到 ir.processConfig（不产生 IR 节点，与 Java「流程级配置不是 BPMN 节点」一致）。
 * 解析失败抛异常；procKey 缺失时为 null（由调用方决定失败语义）。
 */
export function parseBpmnToIr(xml: string, opts: { nodeConfigs?: Record<string, string> } = {}): BpmnIr {
  const doc = parseXml(xml);
  const defs = rootElement(doc);
  if (!defs || defs.local !== 'definitions') throw new Error('BPMN XML: definitions element not found');
  const ir: BpmnIr = { procKey: null, procName: null, nodes: [], flows: [] };
  const tns = attr(defs, 'targetNamespace');
  if (tns != null) ir.targetNamespace = tns;
  const processEl = childElements(defs).find((c) => c.local === 'process');
  if (processEl) {
    ir.procKey = attr(processEl, 'id');
    ir.procName = attr(processEl, 'name');
    for (const ch of childElements(processEl)) {
      const id = attr(ch, 'id');
      if (id == null || id === '') continue;
      if (ch.local === 'sequenceFlow') {
        const flow: BpmnIrFlow = {
          id,
          source: attr(ch, 'sourceRef') ?? '',
          target: attr(ch, 'targetRef') ?? '',
        };
        for (const cc of childElements(ch)) {
          if (cc.local === 'conditionExpression') {
            const cond = cc.children.map((c) => c.text ?? '').join('').trim();
            if (cond !== '') flow.condition = cond;
          }
        }
        ir.flows.push(flow);
        continue;
      }
      const node: BpmnIrNode = { id, name: attr(ch, 'name'), type: ch.local! };
      const assignee = attr(ch, 'assignee');
      if (assignee != null) node.assignee = assignee;
      const candidateUsers = attr(ch, 'candidateUsers');
      if (candidateUsers != null) node.candidateUsers = candidateUsers;
      const candidateGroups = attr(ch, 'candidateGroups');
      if (candidateGroups != null) node.candidateGroups = candidateGroups;
      const formKey = attr(ch, 'formKey');
      if (formKey != null) node.formKey = formKey;
      const nodeRole = attr(ch, 'nodeRole');
      if (nodeRole != null) node.nodeRole = nodeRole;
      const mi = multiInstanceOf(ch);
      if (mi) node.multiInstance = mi;
      const cfg = opts.nodeConfigs?.[id];
      if (cfg != null) node.config = cfg;
      ir.nodes.push(node);
    }
  }
  const processConfig = opts.nodeConfigs?.['__PROCESS__'];
  if (processConfig != null) ir.processConfig = processConfig;
  return ir;
}

/**
 * InitiatorNodeResolver 移植：优先 wf:nodeRole="initiator" 的 userTask，
 * 否则第一个 userTask；无 userTask 返回 null。
 */
export function extractInitiatorNodeId(ir: BpmnIr): string | null {
  let firstUserTask: string | null = null;
  for (const n of ir.nodes) {
    if (n.type !== 'userTask') continue;
    if (firstUserTask == null) firstUserTask = n.id;
    if (n.nodeRole === 'initiator') return n.id;
  }
  return firstUserTask;
}

/**
 * ProcessDesignService#parseNodeTypes 移植：doc 范围带 id 元素 → 标签本地名。
 * 跳过 BPMNDiagram/BPMNPlane/BPMNShape/BPMNEdge/definitions/process（大小写不敏感）。
 * 解析失败返回空 Map（nodeType 留空 → "unknown"）。
 */
export function parseNodeTypes(bpmnXml: string | null | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (bpmnXml == null || bpmnXml.trim() === '') return result;
  try {
    const doc = parseXml(bpmnXml);
    const skip = new Set(['bpmndiagram', 'bpmnplane', 'bpmnshape', 'bpmnedge', 'definitions', 'process']);
    const walk = (el: XmlEl): void => {
      for (const ch of el.children) {
        if (ch.kind !== 'element') continue;
        const local = (ch.local ?? '').toLowerCase();
        const id = attr(ch, 'id');
        if (id != null && id !== '' && !skip.has(local)) {
          result[id] = ch.local!;
        }
        walk(ch);
      }
    };
    walk(doc);
  } catch {
    // XML 解析失败时返回空 map（Java 同语义）
  }
  return result;
}

// ---------------------------------------------------------------------------
// 3. MultiInstanceBpmnRewriter 移植
// ---------------------------------------------------------------------------

const COLLECTION_EXPR = '${approverList}';
const ELEMENT_VAR = 'approver';
const ELEMENT_VAR_EXPR = '${approver}';
export const COUNTERSIGN_CONDITION = '${rejected || (nrOfCompletedInstances == nrOfInstances)}';
export const OR_SIGN_CONDITION = '${rejected || (nrOfCompletedInstances >= 1)}';
const MI_MODES = new Set(['countersign', 'or_sign', 'sequential']);

/** approval.userIds 提取（字符串/数字数组，trim、去空；解析失败 → []） */
export function extractApprovalUserIds(configJson: string | null | undefined): string[] {
  if (configJson == null || configJson.trim() === '') return [];
  try {
    const root = JSON.parse(configJson) as unknown;
    const approval = (root as Record<string, unknown>)?.['approval'];
    if (approval == null || typeof approval !== 'object' || Array.isArray(approval)) return [];
    const userIds = (approval as Record<string, unknown>)['userIds'];
    if (!Array.isArray(userIds)) return [];
    const out: string[] = [];
    for (const v of userIds) {
      if (typeof v === 'string' || typeof v === 'number') {
        const id = String(v).trim();
        if (id !== '') out.push(id);
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** approval.multiMode 提取（countersign/or_sign/sequential 之外的值视为未配置） */
export function extractMultiMode(configJson: string | null | undefined): string | null {
  if (configJson == null || configJson.trim() === '') return null;
  try {
    const root = JSON.parse(configJson) as unknown;
    const approval = (root as Record<string, unknown>)?.['approval'];
    if (approval == null || typeof approval !== 'object' || Array.isArray(approval)) return null;
    const mode = (approval as Record<string, unknown>)['multiMode'];
    if (mode == null || typeof mode !== 'string') return null;
    return MI_MODES.has(mode) ? mode : null;
  } catch {
    return null;
  }
}

function setAttr(el: XmlEl, name: string, value: string): void {
  el.attrs = el.attrs ?? [];
  const existing = el.attrs.find((a) => a.name === name);
  if (existing) {
    existing.value = value;
    return;
  }
  const { prefix, local } = splitName(name);
  el.attrs.push({ name, prefix, local, value });
}

function ensureExtensionElements(userTask: XmlEl): XmlEl {
  const existing = childElements(userTask).find((c) => c.local === 'extensionElements');
  if (existing) return existing;
  const ext: XmlEl = { kind: 'element', name: 'bpmn:extensionElements', prefix: 'bpmn', local: 'extensionElements', attrs: [], children: [] };
  const firstChild = childElements(userTask)[0];
  if (firstChild) {
    const idx = userTask.children.indexOf(firstChild);
    userTask.children.splice(idx, 0, ext);
  } else {
    userTask.children.push(ext);
  }
  return ext;
}

/** applyMultiInstance 移植（已有 MI 仍会设置 assignee=${approver}，与 Java 行为一致） */
function applyMultiInstance(userTask: XmlEl, multiMode: string): void {
  setAttr(userTask, 'flowable:assignee', ELEMENT_VAR_EXPR);
  const existing = childElements(userTask).find((c) => c.local === 'multiInstanceLoopCharacteristics');
  if (existing) return;

  const ext = ensureExtensionElements(userTask);
  ext.children.push({
    kind: 'element',
    name: 'flowable:executionListener',
    prefix: 'flowable',
    local: 'executionListener',
    attrs: [
      { name: 'event', prefix: null, local: 'event', value: 'start' },
      { name: 'delegateExpression', prefix: null, local: 'delegateExpression', value: '${multiInstanceApproverListener}' },
    ],
    children: [],
  });

  const miLoop: XmlEl = {
    kind: 'element',
    name: 'bpmn:multiInstanceLoopCharacteristics',
    prefix: 'bpmn',
    local: 'multiInstanceLoopCharacteristics',
    attrs: [
      { name: 'isSequential', prefix: null, local: 'isSequential', value: String(multiMode === 'sequential') },
      { name: 'flowable:collection', prefix: 'flowable', local: 'collection', value: COLLECTION_EXPR },
      { name: 'flowable:elementVariable', prefix: 'flowable', local: 'elementVariable', value: ELEMENT_VAR },
    ],
    children: [
      {
        kind: 'element',
        name: 'bpmn:completionCondition',
        prefix: 'bpmn',
        local: 'completionCondition',
        attrs: [],
        children: [{ kind: 'text', children: [], text: multiMode === 'or_sign' ? OR_SIGN_CONDITION : COUNTERSIGN_CONDITION }],
      },
    ],
  };

  // BPMN XSD 顺序：extensionElements? → incoming* → outgoing* → ... → loopCharacteristics?
  // 插入到首个非 extensionElements/incoming/outgoing 的元素子节点之前（Java 同逻辑）
  const insertBefore = childElements(userTask).find(
    (c) => !(c.local === 'extensionElements' || c.local === 'incoming' || c.local === 'outgoing'),
  );
  if (insertBefore) {
    const idx = userTask.children.indexOf(insertBefore);
    userTask.children.splice(idx, 0, miLoop);
  } else {
    userTask.children.push(miLoop);
  }
}

/**
 * rewriteMultiInstance — MultiInstanceBpmnRewriter#rewrite 移植。
 * 无配置/解析失败时原样返回（Java 同语义）。
 */
export function rewriteMultiInstance(bpmnXml: string | null | undefined, nodeConfigs: Record<string, string>): string {
  if (bpmnXml == null || bpmnXml.trim() === '' || nodeConfigs == null || Object.keys(nodeConfigs).length === 0) {
    return bpmnXml as string;
  }
  try {
    const doc = parseXml(bpmnXml);
    let modified = false;
    const defs = rootElement(doc);
    const processEl = defs ? childElements(defs).find((c) => c.local === 'process') : null;
    if (!processEl) return bpmnXml;
    for (const el of childElements(processEl)) {
      if (el.local !== 'userTask') continue;
      const nodeId = attr(el, 'id');
      if (nodeId == null || nodeId === '') continue;
      const configJson = nodeConfigs[nodeId];
      if (configJson == null || configJson.trim() === '') continue;

      const multiMode = extractMultiMode(configJson);
      if (multiMode != null) {
        applyMultiInstance(el, multiMode);
        modified = true;
        continue;
      }
      // 单实例节点：approval.userIds（1 人 → assignee；多人 → candidateUsers）
      const userIds = extractApprovalUserIds(configJson);
      if (userIds.length === 0) continue;
      if (userIds.length === 1) {
        setAttr(el, 'flowable:assignee', userIds[0]!);
      } else {
        setAttr(el, 'flowable:candidateUsers', userIds.join(','));
      }
      modified = true;
    }
    if (!modified) return bpmnXml;
    return serializeXml(doc);
  } catch {
    return bpmnXml;
  }
}

// ---------------------------------------------------------------------------
// 4. injectEventNames + deployHash
// ---------------------------------------------------------------------------

/**
 * ProcessDesignService#injectEventNames 移植：
 * StartEvent 补 name="开始"、EndEvent 补 name="结束"（已有名称不覆盖）。
 * 未修改时原样返回；修改失败时原样返回。
 */
export function injectEventNames(bpmnXml: string | null | undefined): string {
  if (bpmnXml == null || bpmnXml.trim() === '') return bpmnXml as string;
  try {
    const doc = parseXml(bpmnXml);
    let modified = false;
    const visit = (el: XmlEl): void => {
      for (const ch of el.children) {
        if (ch.kind !== 'element') continue;
        if (ch.local === 'startEvent' || ch.local === 'endEvent') {
          const name = attr(ch, 'name');
          if (name == null || name.trim() === '') {
            setAttr(ch, 'name', ch.local === 'startEvent' ? '开始' : '结束');
            modified = true;
          }
        }
        visit(ch);
      }
    };
    visit(doc);
    if (!modified) return bpmnXml;
    return serializeXml(doc);
  } catch {
    return bpmnXml;
  }
}

function trimToNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t === '' ? null : t;
}

/**
 * ProcessDesignService#computeDeployHash 移植：
 * SHA-256( trimToNull(effectiveXml) + "|" + TreeMap(nodeConfigs) 的 Jackson 规范 JSON )
 * TreeMap 排序 = String.compareTo（UTF-16 码元序）= JS 默认字符串排序；
 * JSON.stringify 与 Jackson 对 Map 的转义语义一致（非 ASCII 原样、控制字符 \uXXXX）。
 * Java 侧 trimToNull 为 null 时字符串拼接得到 "null"。
 */
export function deployHash(effectiveBpmnXml: string | null, nodeConfigs: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(nodeConfigs).sort()) sorted[k] = nodeConfigs[k]!;
  const input = (trimToNull(effectiveBpmnXml) ?? 'null') + '|' + JSON.stringify(sorted);
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** XML 是否携带 BPMNDiagram（Flowable 部署时据此生成 diagramResourceName） */
export function hasDiagramInfo(bpmnXml: string): boolean {
  return /<[A-Za-z0-9_]*:?BPMNDiagram[\s>]/.test(bpmnXml);
}

/** definitions 的 targetNamespace（Flowable ProcessDefinition.category = targetNamespace） */
export function extractTargetNamespace(bpmnXml: string): string | null {
  try {
    const doc = parseXml(bpmnXml);
    const defs = rootElement(doc);
    if (!defs || defs.local !== 'definitions') return null;
    return attr(defs, 'targetNamespace');
  } catch {
    return null;
  }
}
