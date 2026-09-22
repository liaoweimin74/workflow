/**
 * 自研工作流引擎 IR 类型（Task 13-6）
 * 依据 docs/migration/engine-semantics.md A 章（设计器 JSON 规格）。
 * IR = 解析 WF_PROC_DEPLOY.DIAGRAM_JSON（BPMN XML）得到的图模型 + 节点配置。
 * NodeConfig 对齐 node_config.configJson（approval/form/operations/backendLogic/callActivity）。
 */

export type NodeType =
  | "startEvent"
  | "endEvent"
  | "userTask"
  | "serviceTask"
  | "callActivity"
  | "subProcess"
  | "exclusiveGateway"
  | "parallelGateway"
  | "inclusiveGateway"
  | "sequenceFlow";

/** bpmn:sequenceFlow */
export interface FlowIR {
  id: string;
  name?: string;
  sourceRef: string;
  targetRef: string;
  /** conditionExpression body（${approved == true} 里的内层表达式） */
  condition?: string;
}

/** 节点级 configJson（NodeConfigData，designerStore.ts） */
export interface NodeApprovalConfig {
  type?: "user" | "dept_head" | "expression";
  userIds?: (string | number)[];
  expression?: string;
  multiMode?: "countersign" | "or_sign" | "sequential" | "";
}

export interface BackendLogicItem {
  id?: string;
  name?: string;
  enabled?: boolean;
  trigger?: "ENTER" | "COMPLETE";
  type?: "http" | "bean" | "script";
  errorAction?: "IGNORE_CONTINUE" | "FAIL_FLOW";
  resultVar?: string;
  http?: { url: string; method?: string; headers?: Record<string, string>; queryParams?: ParamMapping[]; bodyParams?: ParamMapping[] };
  bean?: { beanName: string; methodName: string; params?: ParamMapping[] };
  script?: { language?: string; source: string };
}

export interface ParamMapping {
  source: string;
  target: string;
}

export interface NodeConfig {
  basic?: { name?: string; description?: string };
  approval?: NodeApprovalConfig;
  form?: {
    formDefId?: string;
    fieldPermissions?: Record<string, "EDIT" | "VIEW" | "HIDDEN">;
    dataMappings?: { targetField: string; source: string; sourceField?: string }[];
  };
  operations?: { allowReject?: boolean; allowAddSign?: boolean; allowTransfer?: boolean; allowDelegate?: boolean };
  /** 节点超时（设计器 UserTaskProperty 根级 timeout 配置）：duration 小时，action=remind 提醒 / escalate 升级 */
  timeout?: { duration?: number; action?: "remind" | "escalate" };
  backendLogic?: BackendLogicItem[];
  callActivity?: { calledElement?: string; inParams?: ParamMapping[]; outParams?: ParamMapping[] };
  [k: string]: unknown;
}

/** bpmn 元素 IR */
export interface NodeIR {
  id: string;
  type: NodeType;
  name?: string;
  /** flowable:assignee 原文（可能是 ${initiator} / ${var} / 用户ID） */
  assignee?: string;
  /** flowable:candidateUsers（逗号分隔） */
  candidateUsers?: string[];
  /** wf:nodeRole（initiator，兼容 nodeRole 裸 key） */
  nodeRole?: string;
  /** multiInstanceLoopCharacteristics */
  multiInstance?: {
    isSequential: boolean;
    collection?: string;
    elementVariable?: string;
    completionCondition?: string;
  };
  calledElement?: string;
  /** 子流程内部图 */
  children?: ProcessIR;
}

export interface ProcessIR {
  id: string;
  name?: string;
  nodes: NodeIR[];
  flows: FlowIR[];
}

/** 解析产物：process 图 + 邻接表 */
export interface DiagramIR {
  process: ProcessIR;
  nodeById: Record<string, NodeIR>;
  /** nodeId → 出线列表（保持 XML 顺序） */
  outgoing: Record<string, FlowIR[]>;
  /** nodeId → 入线数量 */
  incomingCount: Record<string, number>;
  /** 流程级 __PROCESS__ 配置 */
  processConfig: ProcessConfig | null;
}

export interface ProcessConfig {
  approvalPolicy?: {
    deduplication?: { enabled?: boolean; scope?: string; action?: string };
    allowRecall?: boolean;
    operations?: { allowReject?: boolean; allowAddSign?: boolean; allowTransfer?: boolean; allowDelegate?: boolean };
  };
  numberRule?: { enabled?: boolean; pattern?: string };
  form?: { formDefId?: string; fieldPermissions?: Record<string, "EDIT" | "VIEW" | "HIDDEN"> };
  variableMappings?: { variable: string; source: string; sourceField?: string }[];
}

export const DEFAULT_NODE_OPERATIONS = {
  allowReject: true,
  allowTransfer: true,
  allowAddSign: false,
  allowDelegate: false,
};

/** extractOperations 语义：流程级 AND 节点级，缺省见 DEFAULT_NODE_OPERATIONS */
export function resolveOperations(nodeConfig: NodeConfig | null | undefined, processConfig: ProcessConfig | null | undefined) {
  const proc = processConfig?.approvalPolicy?.operations ?? {
    allowReject: true, allowTransfer: true, allowAddSign: true, allowDelegate: true,
  };
  const node = nodeConfig?.operations ?? DEFAULT_NODE_OPERATIONS;
  return {
    allowReject: Boolean(proc.allowReject && node.allowReject),
    allowTransfer: Boolean(proc.allowTransfer && node.allowTransfer),
    allowAddSign: Boolean(proc.allowAddSign && node.allowAddSign),
    allowDelegate: Boolean(proc.allowDelegate && node.allowDelegate),
  };
}

/** extractFormConfig 语义：节点级 > __PROCESS__ 级（整体取用不跨层合并） */
export function resolveFormConfig(nodeConfig: NodeConfig | null | undefined, processConfig: ProcessConfig | null | undefined) {
  return nodeConfig?.form ?? processConfig?.form ?? null;
}
