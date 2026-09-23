import { XMLParser } from 'fast-xml-parser'
import type { NodeType } from './process-model'

/**
 * BPMN XML → 图结构。
 *
 * 用 `removeNSPrefix: true`：BPMN 文件里同时有 `bpmn:` / `wf:` / `flowable:` 三个命名空间前缀，
 * 去掉前缀后 `wf:nodeRole` 变成 `nodeRole`、`flowable:assignee` 变成 `assignee`，
 * 与 Java 侧 InitiatorNodeResolver 的兼容做法一致（它同时接受 `wf:nodeRole` 与 `nodeRole`）。
 *
 * 本文件只做「XML → 图」，不做校验、不合并 NodeConfig —— 那是 process-compiler 的职责。
 */

export interface ParsedFlow {
  flowId: string
  sourceId: string
  targetId: string
  condition: string | null
  isDefault: boolean
}

export interface ParsedNode {
  nodeId: string
  nodeType: NodeType
  name: string
  /** 所属容器（内嵌子流程）节点 ID；顶层为 null。 */
  containerId: string | null
  incoming: string[]
  outgoing: string[]
  isInitiator: boolean
  assignee: string | null
  candidateUsers: string[]
  /** 是否声明了多实例（具体模式由 NodeConfig 决定）。 */
  isMultiInstance: boolean
  /** 元素上的其它属性，原样保留供后续使用。 */
  attributes: Record<string, string>
}

export interface ParsedProcess {
  processKey: string
  processName: string
  nodes: ParsedNode[]
  flows: ParsedFlow[]
}

/** 元素名 → 我们的 NodeType。未识别返回 null（由编译期报错）。 */
const ELEMENT_TYPES: Record<string, NodeType> = {
  startEvent: 'startEvent',
  endEvent: 'endEvent',
  userTask: 'userTask',
  serviceTask: 'serviceTask',
  callActivity: 'callActivity',
  subProcess: 'subProcess',
  exclusiveGateway: 'exclusiveGateway',
  parallelGateway: 'parallelGateway',
  inclusiveGateway: 'inclusiveGateway',
}

/** fast-xml-parser 的节点形状（去掉命名空间前缀后）。 */
type XmlNode = Record<string, unknown>

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  // 同名子元素一律成数组，便于统一处理（incoming/outgoing 可能出现多次）
  isArray: (name) =>
    ['incoming', 'outgoing', 'userTask', 'serviceTask', 'startEvent', 'endEvent'].includes(name),
})

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

/** 取元素的文本值：可能是字符串，也可能是 `{ '#text': '...' }`。 */
function textOf(value: unknown): string | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object') {
    const text = (value as Record<string, unknown>)['#text']
    if (typeof text === 'string') return text
  }
  return null
}

function attrOf(node: XmlNode, name: string): string | null {
  const value = node[`@_${name}`]
  return typeof value === 'string' && value !== '' ? value : null
}

/** 提取元素上的全部属性（去掉 `@_` 前缀）。 */
function attributesOf(node: XmlNode): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('@_') && typeof value === 'string') {
      out[key.slice(2)] = value
    }
  }
  return out
}

/** 递归收集容器（process / subProcess）内的元素。 */
function collectElements(container: XmlNode, containerId: string | null, out: {
  nodes: ParsedNode[]
  flows: ParsedFlow[]
}): void {
  for (const [elementName, rawValue] of Object.entries(container)) {
    if (elementName.startsWith('@_') || elementName.startsWith('#') || elementName === 'extensionElements') {
      continue
    }
    // 只处理元素节点（对象），文本节点跳过
    for (const element of toArray(rawValue as XmlNode | XmlNode[])) {
      if (typeof element !== 'object' || element === null) continue

      if (elementName === 'sequenceFlow') {
        const flowId = attrOf(element, 'id')
        const sourceId = attrOf(element, 'sourceRef')
        const targetId = attrOf(element, 'targetRef')
        if (flowId === null || sourceId === null || targetId === null) continue
        const conditionNode = element.conditionExpression
        // 条件表达式可能是字符串、{ '#text': ... }，或数组
        const conditionRaw = Array.isArray(conditionNode) ? conditionNode[0] : conditionNode
        out.flows.push({
          flowId,
          sourceId,
          targetId,
          condition: textOf(conditionRaw),
          // BPMN 里默认分支写作 `default="Flow_x"`（挂在网关元素上），
          // 也有的建模工具在连线上标 default="true"，两种都认。
          isDefault: attrOf(element, 'default') === 'true',
        })
        continue
      }

      const nodeType = ELEMENT_TYPES[elementName]
      if (nodeType === undefined) continue

      const nodeId = attrOf(element, 'id')
      if (nodeId === null) continue

      const incoming = toArray(element.incoming as unknown)
        .map((v) => textOf(v))
        .filter((v): v is string => v !== null)
      const outgoing = toArray(element.outgoing as unknown)
        .map((v) => textOf(v))
        .filter((v): v is string => v !== null)

      const candidateUsersRaw = attrOf(element, 'candidateUsers')
      const attributes = attributesOf(element)

      out.nodes.push({
        nodeId,
        nodeType,
        name: attrOf(element, 'name') ?? '',
        containerId,
        incoming,
        outgoing,
        // 发起人节点在 XML 上带 wf:nodeRole="initiator"（去前缀后是 nodeRole）
        isInitiator: attributes.nodeRole === 'initiator',
        assignee: attrOf(element, 'assignee'),
        candidateUsers:
          candidateUsersRaw === null
            ? []
            : candidateUsersRaw
                .split(',')
                .map((s) => s.trim())
                .filter((s) => s !== ''),
        isMultiInstance: element.multiInstanceLoopCharacteristics !== undefined,
        attributes,
      })

      // 内嵌子流程：递归收集其内部元素，并把子流程自身登记为容器
      if (nodeType === 'subProcess') {
        collectElements(element, nodeId, out)
      }
    }
  }
}

/**
 * 解析 BPMN XML。只支持子集内的元素；遇到不支持的 BPMN 元素**不在这里报错** ——
 * 由 process-compiler 统一校验并给出可读错误（部署期失败优于运行时静默失效）。
 */
export function parseBpmnXml(xml: string): ParsedProcess {
  const doc = parser.parse(xml) as XmlNode

  // 顶层可能是 definitions；也可能直接给 process
  const definitions = (doc.definitions ?? doc) as XmlNode
  const processNode = toArray(definitions.process as XmlNode | XmlNode[])[0]
  if (processNode === undefined) {
    throw new Error('BPMN XML 中没有找到 <process> 元素')
  }

  const result = { nodes: [] as ParsedNode[], flows: [] as ParsedFlow[] }
  collectElements(processNode, null, result)

  // 网关的 default="Flow_x" 表示该连线是默认分支
  for (const node of result.nodes) {
    const defaultFlow = node.attributes.default
    if (defaultFlow !== undefined) {
      const flow = result.flows.find((f) => f.flowId === defaultFlow)
      if (flow !== undefined) flow.isDefault = true
    }
  }

  return {
    processKey: attrOf(processNode, 'id') ?? '',
    processName: attrOf(processNode, 'name') ?? '',
    nodes: result.nodes,
    flows: result.flows,
  }
}
