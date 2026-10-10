/**
 * BPMN XML → IR 解析器（Task 13-6）
 * 轻量正则/状态机实现——BPMN 由自家设计器（bpmn-js / wf-moddle）生成，结构稳定，
 * 规格依据 engine-semantics.md A/B 章：process 下 startEvent/userTask/serviceTask/
 * callActivity/subProcess/exclusiveGateway/parallelGateway/inclusiveGateway/endEvent
 * 嵌套 + sequenceFlow(sourceRef/targetRef/conditionExpression) + flowable:/wf: 扩展属性。
 * 不引入 XML 库（硬性约定：禁装新包）。
 */
import type { DiagramIR, FlowIR, NodeIR, NodeConfig, NodeType, ProcessConfig, ProcessIR } from "./types";

const NODE_TYPES = new Set([
  "startEvent", "endEvent", "userTask", "serviceTask", "callActivity",
  "subProcess", "exclusiveGateway", "parallelGateway", "inclusiveGateway",
]);

interface Tag {
  kind: "open" | "close" | "self";
  name: string; // 本地名（去前缀）
  attrs: Record<string, string>;
}

/** 去掉 XML 注释 */
function stripComments(xml: string): string {
  return xml.replace(/<!--[\s\S]*?-->/g, "");
}

/** 属性解析：支持双引号；wf:/flowable:/xsi:/bpmn: 前缀保留为小写本地名 */
function parseAttrs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const key = m[1].includes(":") ? m[1].slice(m[1].indexOf(":") + 1).toLowerCase() : m[1].toLowerCase();
    out[key] = m[2];
  }
  return out;
}

/** 词法扫描：把 XML 切成 tag 序列（文本丢弃，自闭合识别） */
function tokenize(xml: string): Tag[] {
  const clean = stripComments(xml).replace(/<\?[\s\S]*?\?>/g, "");
  const tags: Tag[] = [];
  const re = /<(\/?)([A-Za-z_][\w.:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(clean))) {
    const closing = m[1] === "/";
    const local = m[2].includes(":") ? m[2].slice(m[2].indexOf(":") + 1) : m[2];
    tags.push({ kind: closing ? "close" : m[4] === "/" ? "self" : "open", name: local, attrs: parseAttrs(m[3]) });
  }
  return tags;
}

/** 解析 process 内一个容器（process 或 subProcess）的直属节点与连线 */
function parseContainer(tags: Tag[], start: number, containerName: string): { process: ProcessIR; next: number } {
  const process: ProcessIR = { id: "", nodes: [], flows: [] };
  let i = start;
  let pendingFlow: FlowIR | null = null; // sequenceFlow 的 conditionExpression 子元素
  let pendingNode: NodeIR | null = null; // 当前正在收集子元素的节点
  let conditionBody = "";

  while (i < tags.length) {
    const t = tags[i];
    if (t.kind === "close") {
      if (t.name === containerName) return { process, next: i + 1 };
      if (pendingFlow && t.name === "sequenceFlow") { process.flows.push(pendingFlow); pendingFlow = null; }
      else if (pendingNode && t.name === pendingNode.type) {
        // multiInstanceLoopCharacteristics / completionCondition 已在 open/self 分支处理
        process.nodes.push(pendingNode);
        pendingNode = null;
      }
      i++;
      continue;
    }
    // open / self
    if (t.name === "sequenceFlow") {
      if (t.kind === "self") {
        process.flows.push({ id: t.attrs.id, name: t.attrs.name, sourceRef: t.attrs.sourceref, targetRef: t.attrs.targetref });
      } else {
        pendingFlow = { id: t.attrs.id, name: t.attrs.name, sourceRef: t.attrs.sourceref, targetRef: t.attrs.targetref };
        conditionBody = "";
      }
      i++;
      continue;
    }
    if (t.name === "conditionexpression" && pendingFlow) {
      if (t.kind === "open") {
        // 收集 body 到对应 close —— 文本已被丢弃，需从原文取；改为第二次扫描太重，
        // 设计器产物条件都是单行 ${...}，用 attrs 不可行，这里用 index 原文回查由 parseBpmn 统一处理。
      }
      i++;
      continue;
    }
    // 容器型 subProcess：必须先于 NODE_TYPES 分支（"subProcess" 在 NODE_TYPES 中，
    // 且原 lowercase 比较是死代码——tokenizer 保留大小写，open 标签永远先被 NODE_TYPES 捕获成 pendingNode，
    // 内层元素因此错拍平进外层容器、children 永远为空）。
    // open：递归解析内图挂 node.children；self：空内图直接落节点。
    if (t.name.toLowerCase() === "subprocess") {
      if (t.kind === "open") {
        const node: NodeIR = { id: t.attrs.id ?? "", type: "subProcess", name: t.attrs.name };
        const inner = parseContainer(tags, i + 1, t.name);
        node.children = inner.process;
        process.nodes.push(node);
        i = inner.next;
      } else {
        process.nodes.push({ id: t.attrs.id ?? "", type: "subProcess", name: t.attrs.name });
        i++;
      }
      continue;
    }
    if (NODE_TYPES.has(t.name)) {
      const node: NodeIR = { id: t.attrs.id ?? "", type: t.name as NodeType, name: t.attrs.name };
      if (t.attrs.assignee) node.assignee = t.attrs.assignee;
      if (t.attrs.candidateusers) node.candidateUsers = t.attrs.candidateusers.split(",").map((s) => s.trim()).filter(Boolean);
      if (t.attrs.noderole) node.nodeRole = t.attrs.noderole; // wf:nodeRole / nodeRole → 小写本地名 noderole
      if (t.attrs.calledelement) node.calledElement = t.attrs.calledelement;
      if (t.kind === "self") {
        process.nodes.push(node);
      } else {
        pendingNode = node;
      }
      i++;
      continue;
    }
    if (t.name === "multiinstanceloopcharacteristics" && pendingNode) {
      const isSequential = String(t.attrs.issequential ?? "false").toLowerCase() === "true";
      const mi = { isSequential, collection: t.attrs.collection, elementVariable: t.attrs.elementvariable, completionCondition: undefined as string | undefined };
      if (t.kind === "open") {
        // 收集 completionCondition body：向后扫描到 close
        let depth = 1;
        let j = i + 1;
        for (; j < tags.length && depth > 0; j++) {
          const u = tags[j];
          if (u.name === "multiinstanceloopcharacteristics") depth += u.kind === "close" ? -1 : u.kind === "open" ? 1 : 0;
          if (depth > 0 && u.name === "completioncondition" && u.kind === "self") mi.completionCondition = u.attrs.body ?? u.attrs.value ?? "";
        }
        // completionCondition 的文本体不在 attrs 里——由 parseBpmn 的原文回查补齐
        pendingNode.multiInstance = mi;
        i = j;
        continue;
      }
      pendingNode.multiInstance = mi;
      i++;
      continue;
    }
    if (t.name === "completioncondition" && pendingNode?.multiInstance) {
      if (t.kind === "self") pendingNode.multiInstance.completionCondition = t.attrs.body ?? "";
      i++;
      continue;
    }
    i++;
  }
  return { process, next: i };
}

/** conditionExpression 文本体回查：按 sequenceFlow id 定位其子条件体 */
function extractConditionBodies(xml: string, flows: FlowIR[]): void {
  for (const f of flows) {
    if (!f.id) continue;
    // 匹配 <sequenceFlow id="f.id" ...> ... </sequenceFlow>，再从中取 conditionExpression 体
    const idEsc = f.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flowRe = new RegExp(`<([\\w-]+:)?sequenceFlow\\b[^>]*\\bid="${idEsc}"[\\s\\S]*?</([\\w-]+:)?sequenceFlow>`, "m");
    const fm = flowRe.exec(xml);
    if (!fm) continue;
    const cm = /<([\w-]+:)?conditionExpression[^>]*>([\s\S]*?)<\/([\w-]+:)?conditionExpression>/.exec(fm[0]);
    if (cm) f.condition = cm[2].trim();
  }
}

/** completionCondition 文本体回查 */
function extractCompletionConditions(xml: string, nodes: NodeIR[]): void {
  const re = /<([\w-]+:)?completionCondition[^>]*>([\s\S]*?)<\/([\w-]+:)?completionCondition>/g;
  const bodies: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) bodies.push(m[2].trim());
  let idx = 0;
  const walk = (ns: NodeIR[]) => {
    for (const n of ns) {
      if (n.multiInstance && idx < bodies.length) n.multiInstance.completionCondition = bodies[idx++];
      if (n.children) walk(n.children.nodes);
    }
  };
  walk(nodes);
}

/** 多实例 collection 属性兜底回查（flowable:collection） */
function extractMiCollections(xml: string, nodes: NodeIR[]): void {
  const re = /<([\w-]+:)?multiInstanceLoopCharacteristics([^>]*)>/g;
  const attrsList: Record<string, string>[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) attrsList.push(parseAttrs(m[2]));
  let idx = 0;
  const walk = (ns: NodeIR[]) => {
    for (const n of ns) {
      if (n.multiInstance && idx < attrsList.length) {
        const a = attrsList[idx++];
        if (!n.multiInstance.collection && a.collection) n.multiInstance.collection = a.collection;
        if (!n.multiInstance.elementVariable && a.elementvariable) n.multiInstance.elementVariable = a.elementvariable;
      }
      if (n.children) walk(n.children.nodes);
    }
  };
  walk(nodes);
}

/**
 * 主入口：BPMN XML → DiagramIR。
 * nodeConfigs = WF_PROC_DEPLOY.NODE_CONFIGS_JSON（nodeId→configJson 映射）；
 * processConfig = PROCESS_CONFIG_JSON（__PROCESS__ 节点配置）。
 * 嵌套 subProcess（Task 17）：内层节点/连线拍平进 nodeById/outgoing/incomingCount
 * （BPMN 规范要求元素 id 全局唯一、设计器 bpmn-js 生成 uuid 型 id 不会冲突；冲突时保留外层定义），
 * 令牌泵即可直接在内图导航；process.nodes 保持仅顶层（startEvent 定位/initiator 解析/predict 顶层游走用）。
 */
export function parseBpmn(xml: string, nodeConfigs: Record<string, NodeConfig> = {}, processConfig: ProcessConfig | null = null): DiagramIR {
  const tags = tokenize(xml);
  // 定位顶层 process（跳过嵌套 subProcess 之前先找到最外层 process open）
  let start = -1;
  for (let i = 0; i < tags.length; i++) {
    if (tags[i].name === "process" && tags[i].kind === "open") { start = i; break; }
  }
  if (start < 0) throw new Error("BPMN XML 中未找到 <process> 元素");
  const { process } = parseContainer(tags, start + 1, "process");
  process.id = tags[start].attrs.id ?? process.id;
  process.name = tags[start].attrs.name;

  // 条件线体回查：需覆盖内层 subProcess 连线（回查正则按 id 全文定位，与层级无关）
  const allFlows: FlowIR[] = [...process.flows];
  collectInnerFlows(process.nodes, allFlows);
  extractConditionBodies(xml, allFlows);
  extractCompletionConditions(xml, process.nodes);
  extractMiCollections(xml, process.nodes);

  // 事件缺省名（部署管线语义 B-2）：StartEvent 缺名补「开始」、EndEvent 缺名补「结束」（递归含内层）
  setDefaultEventNames(process.nodes);

  const nodeById: Record<string, NodeIR> = {};
  for (const n of process.nodes) nodeById[n.id] = n;
  const outgoing: Record<string, FlowIR[]> = {};
  const incomingCount: Record<string, number> = {};
  for (const f of process.flows) {
    (outgoing[f.sourceRef] ??= []).push(f);
    incomingCount[f.targetRef] = (incomingCount[f.targetRef] ?? 0) + 1;
  }
  // 嵌套 subProcess 拍平：内层节点/连线并入顶层索引
  flattenInner(process.nodes, nodeById, outgoing, incomingCount);
  return { process, nodeById, outgoing, incomingCount, processConfig };
}

/** 收集内层 subProcess 连线（递归，供条件体回查） */
function collectInnerFlows(ns: NodeIR[], out: FlowIR[]): void {
  for (const n of ns) {
    if (!n.children) continue;
    out.push(...n.children.flows);
    collectInnerFlows(n.children.nodes, out);
  }
}

/** 事件缺省名（递归含内层） */
function setDefaultEventNames(ns: NodeIR[]): void {
  for (const n of ns) {
    if ((n.type === "startEvent" || n.type === "endEvent") && !n.name) {
      n.name = n.type === "startEvent" ? "开始" : "结束";
    }
    if (n.children) setDefaultEventNames(n.children.nodes);
  }
}

/** 内层节点/连线并入顶层索引（递归；id 冲突时保留外层定义） */
function flattenInner(
  ns: NodeIR[],
  nodeById: Record<string, NodeIR>,
  outgoing: Record<string, FlowIR[]>,
  incomingCount: Record<string, number>,
): void {
  for (const n of ns) {
    if (!n.children) continue;
    for (const c of n.children.nodes) {
      if (!nodeById[c.id]) nodeById[c.id] = c;
    }
    for (const f of n.children.flows) {
      (outgoing[f.sourceRef] ??= []).push(f);
      incomingCount[f.targetRef] = (incomingCount[f.targetRef] ?? 0) + 1;
    }
    flattenInner(n.children.nodes, nodeById, outgoing, incomingCount);
  }
}

export function parseNodeConfigs(raw: unknown): Record<string, NodeConfig> {
  if (!raw) return {};
  let obj: Record<string, unknown> = {};
  if (typeof raw === "object") obj = raw as Record<string, unknown>;
  else {
    try { obj = JSON.parse(String(raw)); } catch { return {}; }
  }
  // 归一：value 可能是「配置 JSON 字符串」（草稿期 CONFIG_JSON 原文直存）——统一解为对象
  const out: Record<string, NodeConfig> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string") {
      try { out[k] = JSON.parse(v) as NodeConfig; } catch { out[k] = { basic: { name: v } }; }
    } else {
      out[k] = v as NodeConfig;
    }
  }
  return out;
}

export function parseProcessConfig(raw: unknown): ProcessConfig | null {
  if (!raw) return null;
  if (typeof raw === "object") return raw as ProcessConfig;
  try { return JSON.parse(String(raw)); } catch { return null; }
}
