/**
 * 逻辑流 DSL ↔ vue-flow 画布数据 转换工具。
 *
 * 契约（worklog Task 2）：
 * - nodes[]: { id, type: START|END|HTTP|BEAN|SCRIPT|CONDITION, name, x, y,
 *              config{...}, resultVar?, errorAction?: FAIL_FLOW|IGNORE_CONTINUE }
 *   - HTTP   config = { url, method, headers{...}, queryParams[{source,target}],
 *                       bodyParams[{source,target}], connTimeoutMs, readTimeoutMs, retryCount }
 *   - BEAN   config = { beanName, methodName, params[{source,target}] }
 *   - SCRIPT config = { language: 'groovy', source }
 *   - CONDITION config = { variable, operator: EQ|NE|GT|LT|GTE|LTE|EMPTY|NOT_EMPTY, value? }
 * - edges[]: { id?, source, target, branch?: 'true'|'false'（仅 CONDITION 出边用） }
 *
 * vue-flow 侧：
 * - node.type 固定为 'logic'（自定义节点渲染槽 #node-logic），
 *   节点业务类型存 node.data.nodeType
 * - position 需要 {x,y}；契约的顶层 x/y 与之对应
 * - branch 存到 edge.data.branch
 * - 序列化时剥离 vue-flow 内部字段（selected/handles/dimensions...），只留契约字段
 */

// ==================== 契约类型 ====================

export type LogicNodeType = 'START' | 'END' | 'HTTP' | 'BEAN' | 'SCRIPT' | 'CONDITION'

export type ErrorAction = 'FAIL_FLOW' | 'IGNORE_CONTINUE'

export type ConditionOperator = 'EQ' | 'NE' | 'GT' | 'LT' | 'GTE' | 'LTE' | 'EMPTY' | 'NOT_EMPTY'

/** 变量映射对：source=变量名，target=参数名 */
export interface ParamPair {
  source: string
  target: string
}

export interface HttpNodeConfig {
  url: string
  method: string
  headers: Record<string, string>
  queryParams: ParamPair[]
  bodyParams: ParamPair[]
  connTimeoutMs: number
  readTimeoutMs: number
  retryCount: number
}

export interface BeanNodeConfig {
  beanName: string
  methodName: string
  params: ParamPair[]
}

export interface ScriptNodeConfig {
  language: string
  source: string
}

export interface ConditionNodeConfig {
  variable: string
  operator: ConditionOperator
  /** EMPTY/NOT_EMPTY 时不需要；支持字面量或 {{var}} */
  value?: string
}

export type NodeConfig = HttpNodeConfig | BeanNodeConfig | ScriptNodeConfig | ConditionNodeConfig

/** DSL 契约节点 */
export interface DslNode {
  id: string
  type: LogicNodeType
  name: string
  x: number
  y: number
  config?: NodeConfig
  resultVar?: string
  errorAction?: ErrorAction
}

/** DSL 契约边 */
export interface DslEdge {
  id?: string
  source: string
  target: string
  branch?: 'true' | 'false'
}

export interface LogicFlowDsl {
  nodes: DslNode[]
  edges: DslEdge[]
}

// ==================== vue-flow 画布类型 ====================

/** 自定义节点 data（node.type 固定 'logic'，业务类型在 nodeType） */
export interface FlowNodeData {
  nodeType: LogicNodeType
  name: string
  config?: NodeConfig
  resultVar?: string
  errorAction?: ErrorAction
}

/** vue-flow 节点（本设计器使用的最小形状） */
export interface FlowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: FlowNodeData
}

/** vue-flow 边（branch 挂在 data 上） */
export interface FlowEdge {
  id: string
  source: string
  target: string
  data?: { branch?: 'true' | 'false' }
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
}

// ==================== 常量 ====================

/** vue-flow 自定义节点类型名（对应模板 #node-logic 槽） */
export const FLOW_NODE_TYPE = 'logic'

/** 有 config 的业务节点类型 */
export const CONFIG_TYPES: LogicNodeType[] = ['HTTP', 'BEAN', 'SCRIPT', 'CONDITION']

export function isLogicNodeType(type: unknown): type is LogicNodeType {
  return (
    type === 'START' || type === 'END' || type === 'HTTP' ||
    type === 'BEAN' || type === 'SCRIPT' || type === 'CONDITION'
  )
}

/** 各类型默认名称 */
export function defaultNodeName(type: LogicNodeType): string {
  const names: Record<LogicNodeType, string> = {
    START: '开始',
    END: '结束',
    HTTP: 'HTTP 调用',
    BEAN: 'Bean 方法',
    SCRIPT: 'Groovy 脚本',
    CONDITION: '条件判断',
  }
  return names[type]
}

/** 各类型默认 config（新建节点用；数字字段按契约默认值） */
export function defaultConfig(type: LogicNodeType): NodeConfig | undefined {
  switch (type) {
    case 'HTTP':
      return {
        url: '',
        method: 'GET',
        headers: {},
        queryParams: [],
        bodyParams: [],
        connTimeoutMs: 3000,
        readTimeoutMs: 5000,
        retryCount: 0,
      }
    case 'BEAN':
      return { beanName: '', methodName: '', params: [] }
    case 'SCRIPT':
      return { language: 'groovy', source: '' }
    case 'CONDITION':
      return { variable: '', operator: 'EQ', value: '' }
    default:
      return undefined
  }
}

/** 短随机码（节点 id 兜底去重用） */
function shortCode(): string {
  return Math.random().toString(36).slice(2, 6)
}

/** 生成不与现有节点冲突的节点 id：http_a1b2 形式 */
export function createNodeId(type: LogicNodeType, existingIds: Iterable<string>): string {
  const taken = new Set(existingIds)
  const prefix = type.toLowerCase()
  let id = `${prefix}_${shortCode()}`
  while (taken.has(id)) {
    id = `${prefix}_${shortCode()}${Math.floor(Math.random() * 10)}`
  }
  return id
}

// ==================== 解析：DSL 字符串 → 画布 ====================

/** 宽松取数字：非法/缺失回退默认值 */
function toNum(value: unknown, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeType(raw: unknown): LogicNodeType {
  const upper = String(raw ?? '').toUpperCase()
  return isLogicNodeType(upper) ? upper : 'HTTP'
}

/** 解析 DSL 字符串为 vue-flow 画布数据。非法 JSON / 结构不符时抛错。 */
export function parseDsl(dsl: string): FlowGraph {
  let raw: unknown
  try {
    raw = JSON.parse(dsl)
  } catch (err) {
    throw new Error(`DSL 不是合法的 JSON：${err instanceof Error ? err.message : String(err)}`)
  }
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('DSL 结构不符：顶层应为对象（含 nodes/edges）')
  }
  const obj = raw as { nodes?: unknown; edges?: unknown }
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : []
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : []

  const nodes: FlowNode[] = rawNodes.map((item) => {
    const n = (item ?? {}) as Record<string, unknown>
    const type = normalizeType(n.type)
    return {
      id: String(n.id ?? '') || createNodeId(type, []),
      type: FLOW_NODE_TYPE,
      position: { x: toNum(n.x, 0), y: toNum(n.y, 0) },
      data: {
        nodeType: type,
        name: String(n.name ?? '') || defaultNodeName(type),
        config: (n.config ?? undefined) as NodeConfig | undefined,
        resultVar: n.resultVar ? String(n.resultVar) : undefined,
        errorAction: n.errorAction ? (String(n.errorAction) as ErrorAction) : undefined,
      },
    }
  })

  const edges: FlowEdge[] = rawEdges
    .map((item, index) => {
      const e = (item ?? {}) as Record<string, unknown>
      const branch =
        e.branch === 'true' || e.branch === 'false' ? (e.branch as 'true' | 'false') : undefined
      return {
        id: e.id != null ? String(e.id) : `e_${index}_${shortCode()}`,
        source: String(e.source ?? ''),
        target: String(e.target ?? ''),
        data: branch ? { branch } : undefined,
      }
    })
    .filter((e) => e.source && e.target)

  return { nodes, edges }
}

// ==================== 序列化：画布 → DSL 字符串 ====================

/** START/END/CONDITION 无 resultVar / errorAction（契约：仅业务执行节点有） */
function hasExecutionMeta(type: LogicNodeType): boolean {
  return type === 'HTTP' || type === 'BEAN' || type === 'SCRIPT'
}

/** 画布节点 → 契约节点（剥离 vue-flow 内部字段） */
function toDslNode(node: FlowNode): DslNode | null {
  const data = node?.data
  if (!data) return null
  const type = normalizeType(data.nodeType)
  const out: DslNode = {
    id: node.id,
    type,
    name: String(data.name ?? '') || defaultNodeName(type),
    x: Math.round(node.position?.x ?? 0),
    y: Math.round(node.position?.y ?? 0),
  }
  if (data.config && typeof data.config === 'object') {
    out.config = data.config
  }
  if (hasExecutionMeta(type)) {
    if (data.resultVar) out.resultVar = data.resultVar
    out.errorAction = data.errorAction === 'IGNORE_CONTINUE' ? 'IGNORE_CONTINUE' : 'FAIL_FLOW'
  }
  return out
}

/** 画布边 → 契约边（只留 id/source/target/branch） */
function toDslEdge(edge: FlowEdge): DslEdge | null {
  if (!edge?.source || !edge?.target) return null
  const out: DslEdge = { source: edge.source, target: edge.target }
  if (edge.id) out.id = edge.id
  const branch = edge.data?.branch
  if (branch === 'true' || branch === 'false') out.branch = branch
  return out
}

/** 序列化画布为 DSL JSON 字符串（空画布 → 空节点/空边结构） */
export function serializeDsl(nodes: FlowNode[], edges: FlowEdge[]): string {
  const dsl: LogicFlowDsl = {
    nodes: (nodes || []).map(toDslNode).filter((n): n is DslNode => n !== null),
    edges: (edges || []).map(toDslEdge).filter((e): e is DslEdge => e !== null),
  }
  return JSON.stringify(dsl)
}

/** 规范化 JSON 序列化：对象键按字典序排列（数组保持原序），用于键序无关的深比较 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined'
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

/** 深比较两份 DSL 字符串是否等价（对象键序无关），用于脏检测 */
export function isDslEqual(a: string, b: string): boolean {
  if (a === b) return true
  try {
    return stableStringify(JSON.parse(a)) === stableStringify(JSON.parse(b))
  } catch {
    return false
  }
}
