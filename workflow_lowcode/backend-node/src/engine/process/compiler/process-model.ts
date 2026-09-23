/**
 * 运行时流程模型（部署期编译产物）。
 *
 * 依据：docs/superpowers/specs/2026-09-16-nodejs-backend-migration-design.md §4.3
 *
 * 设计要点（对应决策 D6「部署期编译」）：
 *   BPMN XML 是唯一真源，但**运行时不再解析 XML** ——
 *   部署时把 XML + NodeConfig 编译成下面这个扁平模型并落库（wfe_process_def.model_json），
 *   运行时只在这个模型上推进 token。
 *
 *   这样做的收益：
 *     - 把 Flowable 最复杂的部分（execution 树、并发汇聚）挡在编译期之外
 *     - 现有多实例改写器（MultiInstanceBpmnRewriter 拼 XML 字符串注入 MI）消失，
 *       多实例语义直接进 approval.multiMode，不再依赖
 *       `${rejected || nrOfCompletedInstances == nrOfInstances}` 这类字符串表达式
 *     - 高亮 / 预测 / 历史都基于同一套活动实例与 token 表
 *
 * 编译产物在部署后**不可变**，随 wfe_process_def 版本一起冻结。
 */

/** 受约束的 BPMN 子集（权威来源：前端 NodePalette.vue）。 */
export type NodeType =
  | 'startEvent'
  | 'endEvent'
  | 'userTask'
  | 'serviceTask'
  | 'callActivity'
  | 'subProcess'
  | 'exclusiveGateway'
  | 'parallelGateway'
  | 'inclusiveGateway'

/** 网关类型（便于运行时分支）。 */
export const GATEWAY_TYPES: readonly NodeType[] = [
  'exclusiveGateway',
  'parallelGateway',
  'inclusiveGateway',
]

/** 多实例审批模式。 */
export type MultiMode = 'single' | 'countersign' | 'or_sign' | 'sequential'

export interface CompiledFlow {
  flowId: string
  sourceId: string
  targetId: string
  /** 条件表达式原文（如 `${amount > 100}`），无则为 null。运行时求值。 */
  condition: string | null
  /** 是否为默认分支（无条件命中时走它）。 */
  isDefault: boolean
}

export interface CompiledApproval {
  userIds: string[]
  roleCodes: string[]
  multiMode: MultiMode
}

export interface CompiledNode {
  nodeId: string
  nodeType: NodeType
  name: string
  /** 所属内嵌子流程节点 ID；顶层为 null。 */
  containerId: string | null
  /** 入边 flowId 列表。 */
  incoming: string[]
  /** 出边 flowId 列表（保持 XML 中的声明顺序，排他网关按序求值）。 */
  outgoing: string[]
  /** 是否为发起人节点（BPMN 上的 wf:nodeRole="initiator"）。 */
  isInitiator: boolean
  /** userTask 的审批配置；非 userTask 为 undefined。 */
  approval?: CompiledApproval
  /** userTask 上直接写死的 assignee（如 flowable:assignee="1"）。 */
  assignee?: string
  /** userTask 上直接写死的候选人（flowable:candidateUsers 逗号分隔）。 */
  candidateUsers?: string[]
  /** serviceTask / callActivity 的配置，原样透传。 */
  config?: Record<string, unknown>
}

export interface ProcessModel {
  processKey: string
  processName: string
  /** 顶层起始节点 ID。 */
  startNodeId: string
  /** 发起人节点 ID；没有则 null（编译期会告警）。 */
  initiatorNodeId: string | null
  nodes: Record<string, CompiledNode>
  flows: Record<string, CompiledFlow>
  /** 容器（内嵌子流程）节点 ID → 其直接子节点 ID 列表。 */
  containers: Record<string, string[]>
}

/** 节点的出边（已解析成对象，按声明顺序）。 */
export function outgoingFlows(model: ProcessModel, node: CompiledNode): CompiledFlow[] {
  return node.outgoing.map((flowId) => model.flows[flowId]).filter((f): f is CompiledFlow => !!f)
}

/** 节点的入边。 */
export function incomingFlows(model: ProcessModel, node: CompiledNode): CompiledFlow[] {
  return node.incoming.map((flowId) => model.flows[flowId]).filter((f): f is CompiledFlow => !!f)
}

/** 取节点所属作用域的起始节点（子流程内部为内部 startEvent，顶层为顶层 startEvent）。 */
export function isGateway(nodeType: NodeType): boolean {
  return GATEWAY_TYPES.includes(nodeType)
}
