import { EngineException } from '../../../common/exception/engine-exception'
import type { ParsedNode, ParsedProcess } from './bpmn-parser'
import { parseBpmnXml } from './bpmn-parser'
import type { CompiledApproval, CompiledFlow, CompiledNode, MultiMode, ProcessModel } from './process-model'

/**
 * BPMN 图 + NodeConfig → 运行时流程模型（§4.2 部署期编译）。
 *
 * 编译是**部署期**的一次性动作，产物（ProcessModel）落库并随版本冻结，运行时不再解析 XML。
 *
 * 这个文件承担两件事：
 *   1. **校验**：不支持的 BPMN 元素、结构错误在部署时就报错，
 *      而不是像 Flowable 那样在运行时以难以定位的方式失败。
 *   2. **合并**：把 wf_node_config 的业务配置（审批人、多审批模式、按钮）并进模型 ——
 *      现状是部署时把 MI 语义拼成 XML 字符串塞给 Flowable（MultiInstanceBpmnRewriter），
 *      编译方案下这些语义直接进模型字段，不再有字符串表达式。
 */

/** wf_node_config.config_json 里我们关心的部分（其余字段原样透传）。 */
interface NodeConfigJson {
  basic?: { name?: string }
  approval?: {
    userIds?: unknown
    roleCodes?: unknown
    multiMode?: unknown
  }
  operations?: Record<string, unknown>
  [key: string]: unknown
}

export const PROCESS_LEVEL_CONFIG_KEY = '__PROCESS__'

const MULTI_MODES: readonly MultiMode[] = ['countersign', 'or_sign', 'sequential']

export interface CompileInput {
  /** BPMN XML 原文（真源）。 */
  bpmnXml: string
  /** nodeId → configJson 字符串。可缺省。 */
  nodeConfigs?: Record<string, string>
  /** 期望的 processKey；与 XML 内的 process id 不一致时报错。 */
  expectedProcessKey?: string
}

function parseConfig(configJson: string | undefined): NodeConfigJson {
  if (configJson === undefined || configJson.trim() === '') return {}
  try {
    const parsed = JSON.parse(configJson) as unknown
    return parsed !== null && typeof parsed === 'object' ? (parsed as NodeConfigJson) : {}
  } catch {
    // 配置坏了不该让整个部署崩掉 —— 与 Java 侧一致（解析失败仅记日志并跳过）
    return {}
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string | number => typeof v === 'string' || typeof v === 'number')
    .map((v) => String(v).trim())
    .filter((v) => v !== '')
}

/** 把 NodeConfig 的 multiMode 归一到受支持取值；空/未知 → single。 */
function normalizeMultiMode(value: unknown): MultiMode {
  if (typeof value !== 'string') return 'single'
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === 'single') return 'single'
  return (MULTI_MODES as readonly string[]).includes(trimmed) ? (trimmed as MultiMode) : 'single'
}

/** 汇总校验错误，一次性报出全部问题（而不是修一个报一个）。 */
class CompileErrors {
  private readonly messages: string[] = []

  add(message: string): void {
    this.messages.push(message)
  }

  throwIfAny(): void {
    if (this.messages.length === 0) return
    throw new EngineException(
      `流程部署校验失败，共 ${this.messages.length} 处问题：\n` +
        this.messages.map((m, i) => `  ${i + 1}. ${m}`).join('\n'),
    )
  }
}

/** 校验图结构。这些错误一律在**部署期**抛出。 */
function validate(parsed: ParsedProcess, errors: CompileErrors, expectedProcessKey?: string): void {
  if (parsed.processKey === '') {
    errors.add('<process> 缺少 id 属性（它同时是流程 key）')
  } else if (expectedProcessKey !== undefined && parsed.processKey !== expectedProcessKey) {
    errors.add(
      `BPMN 的 process id "${parsed.processKey}" 与流程定义的 key "${expectedProcessKey}" 不一致`,
    )
  }

  const nodeIds = new Set(parsed.nodes.map((n) => n.nodeId))

  // 顶层必须有且仅有一个 startEvent
  const topStart = parsed.nodes.filter((n) => n.nodeType === 'startEvent' && n.containerId === null)
  if (topStart.length === 0) errors.add('顶层缺少 startEvent')
  if (topStart.length > 1) errors.add(`顶层有 ${topStart.length} 个 startEvent，只允许一个`)

  // 内嵌子流程内部必须有 start 与 end（与前端 bpmnValidation 的规则一致）
  const containerIds = parsed.nodes.filter((n) => n.nodeType === 'subProcess').map((n) => n.nodeId)
  for (const containerId of containerIds) {
    const children = parsed.nodes.filter((n) => n.containerId === containerId)
    if (!children.some((n) => n.nodeType === 'startEvent')) {
      errors.add(`内嵌子流程 "${containerId}" 缺少 startEvent`)
    }
    if (!children.some((n) => n.nodeType === 'endEvent')) {
      errors.add(`内嵌子流程 "${containerId}" 缺少 endEvent`)
    }
  }

  // 连线两端必须存在
  for (const flow of parsed.flows) {
    if (!nodeIds.has(flow.sourceId)) {
      errors.add(`连线 "${flow.flowId}" 的 sourceRef "${flow.sourceId}" 不存在`)
    }
    if (!nodeIds.has(flow.targetId)) {
      errors.add(`连线 "${flow.flowId}" 的 targetRef "${flow.targetId}" 不存在`)
    }
  }

  const flowIds = new Set(parsed.flows.map((f) => f.flowId))

  for (const node of parsed.nodes) {
    for (const flowId of [...node.incoming, ...node.outgoing]) {
      if (!flowIds.has(flowId)) {
        errors.add(`节点 "${node.nodeId}" 引用了不存在的连线 "${flowId}"`)
      }
    }

    // 必须有出边（endEvent 除外）；必须有入边（startEvent 除外）
    if (node.nodeType !== 'endEvent' && node.outgoing.length === 0) {
      errors.add(`节点 "${node.nodeId}"（${node.nodeType}）没有出边，流程会走死`)
    }
    if (node.nodeType !== 'startEvent' && node.incoming.length === 0) {
      errors.add(`节点 "${node.nodeId}"（${node.nodeType}）没有入边，永远无法到达`)
    }

    // 网关分支规则
    if (node.nodeType === 'exclusiveGateway' && node.outgoing.length > 1) {
      const flows = node.outgoing.map((id) => parsed.flows.find((f) => f.flowId === id)!)
      const hasDefault = flows.some((f) => f.isDefault)
      const unconditonal = flows.filter((f) => f.condition === null && !f.isDefault)
      if (unconditonal.length > 1) {
        errors.add(
          `排他网关 "${node.nodeId}" 有 ${unconditonal.length} 条无条件分支，无法确定走哪条`,
        )
      }
      if (!hasDefault && unconditonal.length === 0) {
        errors.add(
          `排他网关 "${node.nodeId}" 的所有分支都带条件且没有默认分支，条件全不命中时会卡死`,
        )
      }
    }
  }
}

/**
 * 开始/结束事件的默认名称。
 *
 * 对齐 Java `ProcessDesignService.injectEventNames` —— 它在**部署期**给没有名字的
 * startEvent / endEvent 注入中文名。流程跟踪与待办预测会用这些名字展示，
 * 不注入就会与 Java 的响应不一致（实测：prediction 里 End_1 的 activityName 是「结束」）。
 */
function defaultEventName(nodeType: string): string {
  if (nodeType === 'startEvent') return '开始'
  if (nodeType === 'endEvent') return '结束'
  return ''
}

/** 合并 NodeConfig，产出最终的节点配置。 */
function mergeNode(node: ParsedNode, configJson: string | undefined): CompiledNode {
  const config = parseConfig(configJson)
  const approvalConfig = config.approval ?? {}

  const userIds = asStringArray(approvalConfig.userIds)
  const roleCodes = asStringArray(approvalConfig.roleCodes)
  const multiMode = normalizeMultiMode(approvalConfig.multiMode)

  const compiled: CompiledNode = {
    nodeId: node.nodeId,
    nodeType: node.nodeType,
    name: node.name !== '' ? node.name : (config.basic?.name ?? defaultEventName(node.nodeType)),
    containerId: node.containerId,
    incoming: [...node.incoming],
    outgoing: [...node.outgoing],
    isInitiator: node.isInitiator,
  }

  if (node.nodeType === 'userTask') {
    const approval: CompiledApproval = { userIds, roleCodes, multiMode }
    compiled.approval = approval
    // BPMN 上直接写死的 assignee / candidateUsers 保留（单实例且无 NodeConfig 审批人时生效）
    if (node.assignee !== null) compiled.assignee = node.assignee
    if (node.candidateUsers.length > 0) compiled.candidateUsers = [...node.candidateUsers]
  }

  if (node.nodeType === 'serviceTask' || node.nodeType === 'callActivity') {
    compiled.config = config as Record<string, unknown>
  }

  return compiled
}

/**
 * 编译入口：BPMN XML + NodeConfig → ProcessModel。
 *
 * 失败一律抛 EngineException（→ HTTP 400 + 「流程引擎错误: 」前缀），
 * 与 Java 侧 FlowableException 的响应语义一致。
 */
export function compileProcess(input: CompileInput): ProcessModel {
  const parsed = parseBpmnXml(input.bpmnXml)
  const errors = new CompileErrors()
  validate(parsed, errors, input.expectedProcessKey)
  errors.throwIfAny()

  const configs = input.nodeConfigs ?? {}
  const nodes: Record<string, CompiledNode> = {}
  const containers: Record<string, string[]> = {}

  for (const node of parsed.nodes) {
    nodes[node.nodeId] = mergeNode(node, configs[node.nodeId])
    if (node.nodeType === 'subProcess') {
      containers[node.nodeId] = []
    }
  }

  // 容器 → 直接子节点
  for (const node of parsed.nodes) {
    if (node.containerId !== null && containers[node.containerId] !== undefined) {
      containers[node.containerId].push(node.nodeId)
    }
  }

  const flows: Record<string, CompiledFlow> = {}
  for (const flow of parsed.flows) {
    flows[flow.flowId] = { ...flow }
  }

  const topStart = parsed.nodes.find((n) => n.nodeType === 'startEvent' && n.containerId === null)
  const initiator = parsed.nodes.find((n) => n.isInitiator && n.containerId === null)

  return {
    processKey: parsed.processKey,
    // process 名优先取 XML；为空时回退到流程级 NodeConfig 的 basic.name
    processName:
      parsed.processName !== ''
        ? parsed.processName
        : (parseConfig(configs[PROCESS_LEVEL_CONFIG_KEY]).basic?.name ?? ''),
    startNodeId: topStart?.nodeId ?? '',
    initiatorNodeId: initiator?.nodeId ?? null,
    nodes,
    flows,
    containers,
  }
}
