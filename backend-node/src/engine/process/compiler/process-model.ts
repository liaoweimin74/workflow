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

/**
 * 用户任务节点类别（wf:nodeRole 扩展属性）。
 *
 * - initiator：发起节点（发起人填报表单后提交）
 * - approver：审批节点（通过/拒绝/退回/转派/加签）——**缺省值**（旧数据无 nodeRole 时按此处理）
 * - handler：办理节点（提交/转派/退回/加签，无通过/拒绝语义）
 */
export type TaskRole = 'initiator' | 'approver' | 'handler'

/** 审批类型（审批节点专用）：人工审批 / 自动通过 / 自动拒绝。 */
export type ApprovalType = 'artificial' | 'auto_pass' | 'auto_reject'

/**
 * 找不到办理人/审批人时的策略。
 *
 * 空/未配置 = 兼容旧语义：照旧建无 assignee 任务（候选人认领）。
 */
export type NoAssigneePolicy =
  | ''
  | 'auto_pass'
  | 'block'
  | 'to_admin'
  | 'to_user'
  | 'skip'
  | 'supervisor'

/** 审批/办理人解析类型（设计器可见的完整集合；引擎 v1 只解析部分，见 resolveAssignees）。 */
export type AssigneeType =
  | 'user'
  | 'initiator_select'
  | 'post'
  | 'member_group'
  | 'role'
  | 'initiator_self'
  | 'dept_head'
  | 'multi_level'
  | 'report_superior'
  | 'approval_role'
  | 'matrix'
  | 'form_user'
  | 'form_dept_leader'
  | 'form_dept_approval_role'
  | 'approver_designate'
  | 'external'
  | 'external_push'
  | 'expression'

/** 办理/审批人设置（两类节点共用）。 */
export interface AssigneeOptions {
  allowInitiatorAdjust?: boolean
  noAssigneePolicy?: NoAssigneePolicy
  toUserId?: string | null
}

/** 审批节点高级设置——退回行为与必须加签。 */
export interface ReturnOptions {
  restartFromHere?: boolean
  chooseStartNode?: boolean
  mustAddSign?: boolean
}

/** 审批人去重。 */
export interface DedupOptions {
  enabled?: boolean
  skipSameAsInitiator?: boolean
}

/** 手写签名。 */
export interface SignatureOptions {
  enabled?: boolean
  useLast?: boolean
  allowUpload?: boolean
  required?: boolean
}

/** 消息通知。 */
export interface NotifyOptions {
  sms?: boolean
}

/** 发起节点专用配置（发起人设置）。 */
export interface InitiatorOptions {
  disallowRecall?: boolean
  urge?: { enabled?: boolean; interval?: number; unit?: 'minute' | 'hour' | 'day' }
  reInitiate?: boolean
  smsOnEnd?: boolean
}

/** 流程级超时规则（规则组；对齐设计器「添加超时规则」）。 */
export interface ProcessTimeoutRule {
  id: string
  action: 'remind' | 'transfer' | 'pass' | 'refuse'
  duration: number
  unit: 'minute' | 'hour' | 'day'
  /** 重复提醒（仅 remind；间隔 = duration） */
  repeat?: boolean
  /** 被提醒人：当前审批人 */
  notifyAssignee?: boolean
  /** 被提醒人：审批管理员 */
  notifyAdmin?: boolean
  /** 被提醒人：更多员工 */
  notifyUserIds?: string[]
  /** 通知方式：短信 */
  sms?: boolean
}

/**
 * 流程级策略（wf_node_config `__PROCESS__` 行 config_json 的归一化产物；
 * 由服务层 parseProcessPolicy 解析后注入引擎/门禁，引擎本身不读 DB）。
 */
export interface ProcessPolicy {
  /** 审批人去重（流程级）：命中口径 + 发起人同人免审。 */
  dedup: {
    enabled: boolean
    mode: 'CONSECUTIVE' | 'FIRST' | 'LAST'
    skipSameAsInitiator: boolean
  }
  /** 审批处理意见必填：scope=REJECT_RETURN 拒绝/退回必填；ALL 全部操作必填。 */
  commentPolicy: { enabled: boolean; scope: 'REJECT_RETURN' | 'ALL' }
  /** 手写签名流程级总控+默认值（节点未显式配置时生效）。 */
  signaturePolicy: {
    enabled: boolean
    useLast: boolean
    allowUpload: boolean
    required: boolean
  }
  /** 评论管理（详情 VO 透出 + 未来评论端点门禁）。 */
  comment: { disabled: boolean; disallowDelete: boolean; disallowAttachment: boolean }
  /** 审批召回：审批人可在下个节点审批前召回自己已办的审批。 */
  approveRecall: boolean
  /** 流程退回后重新审批时，已通过节点无需再审批。 */
  retakeSkipApproved: boolean
  /** 流程级超时规则组（节点未开启 timeout 时兜底）。 */
  timeoutRules: ProcessTimeoutRule[]
  /** 自定义审批标题模板（{{processName}}/{{initiator}}/{{date}}/{{表单字段}}）。 */
  titlePattern: string | null
  /** 自定义摘要字段（≤5）+ 短信展示摘要。 */
  summaryFields: string[]
  summaryShowInSms: boolean
}

/**
 * 审批/办理人解析上下文（服务层预计算，注入纯内存引擎）。
 *
 * 引擎刻意不碰 DB（spec：纯内存确定性），凡是需要组织架构/用户表的解析
 * 都由服务层查好后经此传入；查不到的字段留 null，引擎按策略降级。
 */
export interface ResolutionContext {
  /** 系统管理员用户 ID（审批管理员/转交兜底）。 */
  adminUserId?: string | null
  /** 发起人的部门负责人（supervisor/dept_head 策略兜底；org 表无负责人字段时为 null）。 */
  initiatorSupervisor?: string | null
  /** 角色编码 → 成员用户 ID 列表（服务层预查；approval.type=role 的解析用）。 */
  roleMemberships?: Record<string, string[]>
}

/** 超时动作（审批：提醒/转派/通过/拒绝；办理：提醒/转派）。 */
export type TimeoutAction = 'remind' | 'escalate' | 'transfer' | 'pass' | 'refuse'

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
  /**
   * 办理/审批人类型（nodeConfigs approval.type 原文；缺省 'user'）。
   * 引擎据此做类型化解析（initiator_self / initiator_select / role / expression），
   * 其余类型走「找不到办理人」策略。
   */
  type?: string
  userIds: string[]
  roleCodes: string[]
  /** 表达式（type=expression 时有值，如 `${initiator.deptManager}`）。 */
  expression?: string
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
  /**
   * 用户任务节点类别（BPMN wf:nodeRole；缺省 approver）。发起节点恒为 initiator。
   * 非 userTask 为 undefined。
   */
  taskRole?: TaskRole
  /** 审批类型（审批节点）；缺省 artificial。 */
  approvalType?: ApprovalType
  /** userTask 的审批配置；非 userTask 为 undefined。 */
  approval?: CompiledApproval
  /** 办理/审批人设置（找不到人策略、允许发起人调整）。 */
  assigneeOptions?: AssigneeOptions
  /** 审批退回行为与必须加签（审批节点）。 */
  returnOptions?: ReturnOptions
  /** 处理/审批意见必填。 */
  commentRequired?: boolean
  /** 流程到达此节点后禁止撤销/撤回。 */
  blockRecall?: boolean
  /** 审批人去重（审批节点）。 */
  dedup?: DedupOptions
  /** 手写签名。 */
  signature?: SignatureOptions
  /** 消息通知。 */
  notify?: NotifyOptions
  /** 发起节点专用配置。 */
  initiatorOptions?: InitiatorOptions
  /** 超时配置（服务层调度器读取）。 */
  timeout?: { enabled?: boolean; duration?: number; action?: TimeoutAction }
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
