/**
 * 逻辑流 DSL ↔ vue-flow 画布数据 转换工具。
 *
 * 契约（worklog Task 2 + SUBFLOW/inputVars 增量 + DATA_UPDATE）：
 * - nodes[]: { id, type: START|END|HTTP|BEAN|SCRIPT|CONDITION|BATCH|SUBFLOW|DATA_UPDATE, name, x, y,
 *              config{...}, resultVar?, errorAction?: FAIL_FLOW|IGNORE_CONTINUE }
 *   - HTTP   config = { url, method, headers{...}, queryParams[{source,target}],
 *                       bodyParams[{source,target}], connTimeoutMs, readTimeoutMs, retryCount }
 *   - BEAN   config = { beanName, methodName, params[{source,target}] }
 *   - SCRIPT config = { language: 'groovy', source }
 *   - CONDITION config = { variable, operator: EQ|NE|GT|LT|GTE|LTE|EMPTY|NOT_EMPTY, value? }
 *   - BATCH  config = { collection, itemVar?, indexVar?, body?: BatchBodyNode[](循环体链，
 *                       按序逐项执行；节点可选 x/y 画布绝对坐标——仅拖离默认排布位才
 *                       写入，缺省时回显自动居中排布)，stopOnError?, maxItems? }
 *                       （legacy 兼容：actionType: HTTP|SCRIPT|BEAN + actionConfig 单动作，
 *                         读取时自动合成为单节点循环体，保存后升级为 body 形态）
 *   - SUBFLOW config = { flowId, passAllVars=true, varsMapping[{source,target}] }
 *   - DATA_UPDATE config = { table, setOps[{column, mode: SET|ADD|SUB, value}],
 *                            where[{column, op: EQ|NE|GT|GTE|LT|LTE|IS_NULL|NOT_NULL, value?}] }
 *       值支持字面量或 {{var}}/{{formData.xxx}} 点路径；受影响行数写回 resultVar
 * - edges[]: { id?, source, target, branch?: 'true'|'false'（仅 CONDITION 出边用） }
 *   - BATCH 循环体边（画布 data.loop=true）为设计器内部结构，序列化时剔除；
 *     循环体内容编入 BATCH.config.body[]
 * - 顶层 inputVars[]: 入参声明（可选）：[{ name, type: string|number|boolean|json, required?, desc? }]
 *
 * vue-flow 侧：
 * - node.type 固定为 'logic'（自定义节点渲染槽 #node-logic），
 *   节点业务类型存 node.data.nodeType
 * - position 需要 {x,y}；契约的顶层 x/y 与之对应
 * - branch 存到 edge.data.branch
 * - 序列化时剥离 vue-flow 内部字段（selected/handles/dimensions...），只留契约字段
 */

// ==================== 契约类型 ====================

export type LogicNodeType =
  | 'START'
  | 'END'
  | 'HTTP'
  | 'BEAN'
  | 'SCRIPT'
  | 'CONDITION'
  | 'BATCH'
  | 'SUBFLOW'
  | 'DATA_UPDATE'

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

/** 批处理节点内嵌动作类型（仅业务执行三型，legacy 配置用） */
export type BatchActionType = 'HTTP' | 'SCRIPT' | 'BEAN'

/** 循环体允许的节点类型（业务执行六型，含 BATCH = 支持嵌套批处理；START/END/CONDITION 不可入循环体） */
export type BatchBodyType = 'HTTP' | 'BEAN' | 'SCRIPT' | 'DATA_UPDATE' | 'SUBFLOW' | 'BATCH'

export const BATCH_BODY_TYPES: BatchBodyType[] = ['HTTP', 'BEAN', 'SCRIPT', 'DATA_UPDATE', 'SUBFLOW', 'BATCH']

/** 循环体节点（线性链一环，按序逐项执行） */
export interface BatchBodyNode {
  /** 画布节点 id（回显时按它复用画布节点） */
  id?: string
  type: BatchBodyType
  name: string
  config?: NodeConfig
  resultVar?: string
  errorAction?: ErrorAction
  /** 画布绝对坐标（可选）：仅当节点被拖离「批处理下方居中」默认排布位时持久化，
   *  缺省 = 回显时按批处理位置自动居中排布——保证旧 DSL / 未移动场景往返稳定 */
  x?: number
  y?: number
}

export interface BatchNodeConfig {
  /** 集合表达式：{{var}} 或 JSON 数组字面量 */
  collection: string
  /** 迭代项变量名（默认 item） */
  itemVar: string
  /** 迭代序号变量名（默认 index） */
  indexVar: string
  /** 循环体链（画布循环连线上的节点序列；空 = 未配置） */
  body?: BatchBodyNode[]
  /** legacy：每项执行的动作类型（有 body 时忽略） */
  actionType?: BatchActionType
  /** legacy：内嵌动作配置（同型节点 config 形态） */
  actionConfig?: Record<string, unknown>
  /** 单项失败是否中断整批（默认 true） */
  stopOnError: boolean
  /** 单次最大迭代数（默认 100，硬上限 1000） */
  maxItems: number
}

export interface SubflowNodeConfig {
  /** 目标逻辑流 id（必须是已发布流） */
  flowId: string
  /** 是否全量继承当前上下文变量（默认 true；varsMapping 在此基础上覆盖/改名） */
  passAllVars: boolean
  /** 变量映射：当前流 source → 子流入参 target */
  varsMapping: ParamPair[]
}

/** 数据更新写值模式 */
export type DataUpdateMode = 'SET' | 'ADD' | 'SUB'

export interface DataUpdateSetOp {
  column: string
  mode: DataUpdateMode
  /** 字面量或 {{var}}/{{formData.xxx}} 点路径；ADD/SUB 须数值 */
  value: string
}

/** 数据更新条件算子 */
export type DataUpdateWhereOp = 'EQ' | 'NE' | 'GT' | 'GTE' | 'LT' | 'LTE' | 'IS_NULL' | 'NOT_NULL'

export interface DataUpdateWhereCond {
  column: string
  op: DataUpdateWhereOp
  /** IS_NULL/NOT_EMPTY 不需要 */
  value?: string
}

export interface DataUpdateNodeConfig {
  /** 目标动态表（运行期校验须存在且以 wf_biz_/wf_form_data 开头） */
  table: string
  setOps: DataUpdateSetOp[]
  where: DataUpdateWhereCond[]
}

export type NodeConfig =
  | HttpNodeConfig
  | BeanNodeConfig
  | ScriptNodeConfig
  | ConditionNodeConfig
  | BatchNodeConfig
  | SubflowNodeConfig
  | DataUpdateNodeConfig

/** 入参声明（运行测试表单 / 文档展示用，引擎不消费） */
export interface InputVarDef {
  name: string
  type: 'string' | 'number' | 'boolean' | 'json'
  required?: boolean
  desc?: string
}

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
  inputVars?: InputVarDef[]
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

/** vue-flow 边（branch 挂在 data 上；CONDITION 出边需 sourceHandle 定位 真/假 连接点） */
export interface FlowEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  type?: string
  markerEnd?: string
  deletable?: boolean
  class?: string
  data?: { branch?: 'true' | 'false'; loop?: boolean }
}

export interface FlowGraph {
  nodes: FlowNode[]
  edges: FlowEdge[]
  inputVars: InputVarDef[]
}

// ==================== 常量 ====================

/** vue-flow 自定义节点类型名（对应模板 #node-logic 槽） */
export const FLOW_NODE_TYPE = 'logic'

/** BATCH 循环体起点/终点连接点（节点侧面，闭合循环连线两端） */
export const LOOP_HANDLE_START = 'loop_start'
export const LOOP_HANDLE_END = 'loop_end'

/** 判断是否循环体边（设计器内部结构，不进 DSL edges） */
export function isLoopEdge(edge: FlowEdge | undefined | null): boolean {
  return edge?.data?.loop === true
}

/**
 * 循环边默认渲染（折线 + 箭头 + 虚线紫罗兰，见 logicflow-theme.css .lf-edge-loop）。
 * 自环（空循环 batch→batch 直连）走自定义 'loop' 边：右侧 U 形外凸 44px（LoopEdge.vue），
 * 内置 smoothstep 对同侧自环仅 20px 凸出且被节点标签遮挡，视觉上不可见。
 * 注意：不设 deletable:false —— vue-flow removeEdges 会静默跳过不可删边，
 * 导致程序化拆线（吸附接入）失效；防误删由设计器双击拦截 + 删除后自愈重建保障。
 */
export function createLoopEdge(
  source: string,
  target: string,
  sourceHandle?: string,
  targetHandle?: string
): FlowEdge {
  return {
    id: `loop_${Math.random().toString(36).slice(2, 9)}`,
    source,
    target,
    sourceHandle,
    targetHandle,
    type: source === target ? 'loop' : 'smoothstep',
    markerEnd: 'arrowclosed',
    class: 'lf-edge-loop',
    data: { loop: true },
  }
}

/** 有 config 的业务节点类型 */
export const CONFIG_TYPES: LogicNodeType[] = [
  'HTTP',
  'BEAN',
  'SCRIPT',
  'CONDITION',
  'BATCH',
  'SUBFLOW',
  'DATA_UPDATE',
]

export function isLogicNodeType(type: unknown): type is LogicNodeType {
  return (
    type === 'START' || type === 'END' || type === 'HTTP' ||
    type === 'BEAN' || type === 'SCRIPT' || type === 'CONDITION' ||
    type === 'BATCH' || type === 'SUBFLOW' || type === 'DATA_UPDATE'
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
    BATCH: '批处理',
    SUBFLOW: '子流程',
    DATA_UPDATE: '数据更新',
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
    case 'BATCH':
      return {
        collection: '',
        itemVar: 'item',
        indexVar: 'index',
        body: [],
        stopOnError: true,
        maxItems: 100,
      }
    case 'SUBFLOW':
      return { flowId: '', passAllVars: true, varsMapping: [] }
    case 'DATA_UPDATE':
      return { table: '', setOps: [{ column: '', mode: 'SET', value: '' }], where: [] }
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

/** 循环体类型归一：非法类型返回 null（调用方跳过该节点） */
function toBatchBodyType(raw: unknown): BatchBodyType | null {
  const upper = String(raw ?? '').toUpperCase()
  return (BATCH_BODY_TYPES as string[]).includes(upper) ? (upper as BatchBodyType) : null
}

/**
 * 为每个 BATCH 节点合成循环体画布结构与闭合循环连线：
 * - config.body 非空 → 循环体节点沿链 loop_start→b0→…→loop_end；
 *   节点已持久化 x/y（曾拖离默认位）→ 用绝对坐标回显，位置不再丢失；
 *   未持久化 → 横排在批处理下方居中排布（默认位）；
 * - legacy（无 body 有 actionType/actionConfig）→ 合成单个循环体节点；
 * - 两者皆无 → loop_start 直连 loop_end（空循环虚线）。
 * 循环边均为 deletable:false + data.loop=true（设计器内部结构，serialize 时剔除）。
 */
function synthesizeBatchLoops(nodes: FlowNode[], edges: FlowEdge[]): void {
  for (const batch of nodes) {
    if (batch.data.nodeType !== 'BATCH') continue
    const cfg = (batch.data.config ?? {}) as Partial<BatchNodeConfig>
    const rawBody = Array.isArray(cfg.body) ? cfg.body : []

    // legacy 单动作 → 合成为单节点循环体
    let bodyItems = rawBody
    if (!bodyItems.length && cfg.actionType) {
      const legacyType = toBatchBodyType(cfg.actionType)
      if (legacyType) {
        bodyItems = [
          {
            type: legacyType,
            name: defaultNodeName(legacyType as LogicNodeType),
            config: cfg.actionConfig as NodeConfig | undefined,
          },
        ]
      }
    }

    const valid = bodyItems
      .map((bn) => {
        const type = toBatchBodyType(bn?.type)
        return type ? { bn, type } : null
      })
      .filter((x): x is { bn: BatchBodyNode; type: BatchBodyType } => x !== null)

    if (valid.length) {
      const count = valid.length
      const bodyNodes: FlowNode[] = valid.map(({ bn, type }, i) => ({
        id: bn.id || `${batch.id}__b${i}`,
        type: FLOW_NODE_TYPE,
        position: {
          // 已持久化的绝对坐标优先（拖动位置不丢失）；否则按默认位：批处理下方居中横排
          x:
            Number.isFinite(bn.x) && Number.isFinite(bn.y)
              ? Math.round(bn.x as number)
              : Math.round(batch.position.x + (i - (count - 1) / 2) * 180),
          y:
            Number.isFinite(bn.x) && Number.isFinite(bn.y)
              ? Math.round(bn.y as number)
              : Math.round(batch.position.y + 130),
        },
        data: {
          nodeType: type as LogicNodeType,
          name: bn.name || defaultNodeName(type as LogicNodeType),
          config: bn.config,
          resultVar: bn.resultVar || undefined,
          errorAction: bn.errorAction || undefined,
        },
      }))
      nodes.push(...bodyNodes)
      edges.push(createLoopEdge(batch.id, bodyNodes[0].id, LOOP_HANDLE_START, 'in'))
      for (let i = 1; i < bodyNodes.length; i++) {
        edges.push(createLoopEdge(bodyNodes[i - 1].id, bodyNodes[i].id, 'out', 'in'))
      }
      edges.push(
        createLoopEdge(bodyNodes[bodyNodes.length - 1].id, batch.id, 'out', LOOP_HANDLE_END)
      )
    } else {
      edges.push(createLoopEdge(batch.id, batch.id, LOOP_HANDLE_START, LOOP_HANDLE_END))
    }
  }
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
  const obj = raw as { nodes?: unknown; edges?: unknown; inputVars?: unknown }
  const rawNodes = Array.isArray(obj.nodes) ? obj.nodes : []
  const rawEdges = Array.isArray(obj.edges) ? obj.edges : []
  const rawInputVars = Array.isArray(obj.inputVars) ? obj.inputVars : []

  const inputVars: InputVarDef[] = rawInputVars
    .map((item): InputVarDef | null => {
      const v = (item ?? {}) as Record<string, unknown>
      const name = String(v.name ?? '').trim()
      if (!name) return null
      const type = ['string', 'number', 'boolean', 'json'].includes(String(v.type))
        ? (String(v.type) as InputVarDef['type'])
        : 'string'
      return {
        name,
        type,
        required: Boolean(v.required),
        desc: v.desc ? String(v.desc) : undefined,
      }
    })
    .filter((v): v is InputVarDef => v !== null)

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
        // 默认渲染：折线 + 箭头（契约不存 type，回显统一补齐）
        type: 'smoothstep',
        markerEnd: 'arrowclosed',
        // branch → sourceHandle：vue-flow 依 sourceHandle 定位出发点；
        // CONDITION 有 true/false 两个 source handle，缺省时渲染会兜底连到第一个（true），
        // 导致「否」连线重开后错显在「是」上（bug: 条件分支回显丢失）
        sourceHandle: branch,
        data: branch ? { branch } : undefined,
      }
    })
    .filter((e) => e.source && e.target)

  synthesizeBatchLoops(nodes, edges)

  return { nodes, edges, inputVars }
}

// ==================== 序列化：画布 → DSL 字符串 ====================

/** START/END 无 resultVar / errorAction（契约：业务执行节点有；CONDITION 例外仅运行结果布尔） */
function hasExecutionMeta(type: LogicNodeType): boolean {
  return (
    type === 'HTTP' ||
    type === 'BEAN' ||
    type === 'SCRIPT' ||
    type === 'BATCH' ||
    type === 'SUBFLOW' ||
    type === 'DATA_UPDATE'
  )
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

/** 画布边 → 契约边（只留 id/source/target/branch；循环边不进契约） */
function toDslEdge(edge: FlowEdge): DslEdge | null {
  if (!edge?.source || !edge?.target) return null
  if (isLoopEdge(edge)) return null
  const out: DslEdge = { source: edge.source, target: edge.target }
  if (edge.id) out.id = edge.id
  // branch 以 sourceHandle 为准（连线/重连时与 handle 同步），data.branch 作后备
  const fromHandle = edge.sourceHandle
  const branch =
    fromHandle === 'true' || fromHandle === 'false'
      ? fromHandle
      : edge.data?.branch === 'true' || edge.data?.branch === 'false'
        ? edge.data.branch
        : undefined
  if (branch) out.branch = branch
  return out
}

/** 画布节点 → 循环体节点（剥离 vue-flow 内部字段；非循环体类型返回 null）。
 *  x/y 总是写入，由调用方按「默认排布位」判定后剥离，避免旧 DSL 被误标脏 */
function toDslBodyNode(node: FlowNode): BatchBodyNode | null {
  const data = node?.data
  if (!data) return null
  const type = toBatchBodyType(data.nodeType)
  if (!type) return null
  const out: BatchBodyNode = {
    id: node.id,
    type,
    name: String(data.name ?? '') || defaultNodeName(data.nodeType),
    x: Math.round(node.position?.x ?? 0),
    y: Math.round(node.position?.y ?? 0),
  }
  if (data.config && typeof data.config === 'object') out.config = data.config
  if (data.resultVar) out.resultVar = data.resultVar
  out.errorAction = data.errorAction === 'IGNORE_CONTINUE' ? 'IGNORE_CONTINUE' : 'FAIL_FLOW'
  return out
}

/**
 * 从 loop 边集合提取某 BATCH 的循环体链：loop_start 出发沿链行走至无后继
 * （或成环/步数耗尽）。body 只收合法循环体类型节点；链上节点 id 由调用方
 * 从顶层画布剔除（孤段节点保留顶层，由发布校验兜底报「节点无出边」）。
 * 链上遇 BATCH（嵌套子批处理）即入 body 并终止本链行走 ——
 * 子批处理的循环体链由 serializeDsl 顶层遍历单独提取，避免被父链吞并。
 */
function extractBatchBody(
  batchId: string,
  loopEdges: FlowEdge[],
  nodeById: Map<string, FlowNode>
): { body: BatchBodyNode[]; chainNodeIds: Set<string> } {
  const body: BatchBodyNode[] = []
  const chainNodeIds = new Set<string>()
  const startEdge = loopEdges.find(
    (e) => e.source === batchId && e.sourceHandle === LOOP_HANDLE_START
  )
  if (!startEdge) return { body, chainNodeIds }
  const visited = new Set<string>([batchId])
  let currentId = startEdge.target
  let guard = 0
  while (currentId && !visited.has(currentId) && guard++ < 100) {
    visited.add(currentId)
    const node = nodeById.get(currentId)
    if (!node) break
    const bodyNode = toDslBodyNode(node)
    if (bodyNode) {
      body.push(bodyNode)
      chainNodeIds.add(currentId)
      // 嵌套子批处理：入 body 后停止沿父链行走（子的循环体链独立提取）
      if (bodyNode.type === 'BATCH') break
    }
    const nextEdge = loopEdges.find((e) => e.source === currentId)
    if (!nextEdge) break
    currentId = nextEdge.target
  }

  // 位置持久化（仅拖离默认位才写入）：与 synthesizeBatchLoops 的默认公式互逆——
  // 仍在默认位的节点剔除 x/y，旧 DSL / 未移动场景往返稳定（isDslEqual 脏检测不误报）
  const batch = nodeById.get(batchId)
  if (batch && body.length) {
    const count = body.length
    body.forEach((bn, i) => {
      const defX = Math.round(batch.position.x + (i - (count - 1) / 2) * 180)
      const defY = Math.round(batch.position.y + 130)
      if (bn.x === defX && bn.y === defY) {
        delete bn.x
        delete bn.y
      }
    })
  }

  return { body, chainNodeIds }
}

/** 序列化画布为 DSL JSON 字符串（空画布 → 空节点/空边结构；inputVars 非空时带上） */
export function serializeDsl(
  nodes: FlowNode[],
  edges: FlowEdge[],
  inputVars?: InputVarDef[]
): string {
  const safeNodes = nodes || []
  const safeEdges = edges || []
  const loopEdges = safeEdges.filter(isLoopEdge)
  const nodeById = new Map(safeNodes.map((n) => [n.id, n]))

  // BATCH 循环体提取：链上节点剔出顶层、编入 config.body（替换的是序列化副本，不改画布）
  const stripNodeIds = new Set<string>()
  const batchBodies = new Map<string, BatchBodyNode[]>()
  for (const node of safeNodes) {
    if (node.data?.nodeType !== 'BATCH') continue
    const { body, chainNodeIds } = extractBatchBody(node.id, loopEdges, nodeById)
    if (body.length) {
      batchBodies.set(node.id, body)
      chainNodeIds.forEach((id) => stripNodeIds.add(id))
    }
  }

  const dsl: LogicFlowDsl = {
    nodes: safeNodes
      .filter((n) => !stripNodeIds.has(n.id))
      .map(toDslNode)
      .filter((n): n is DslNode => n !== null),
    edges: safeEdges.map(toDslEdge).filter((e): e is DslEdge => e !== null),
  }

  // 循环体写回对应 BATCH config（浅拷贝替换，legacy actionType 升级后移除）。
  // 嵌套批处理：子 BATCH 被剔出顶层（不在 dsl.nodes），需从父 body 中递归下钻写回，
  // 否则子批处理的循环体链会因「无顶层节点可写」而丢失。
  if (batchBodies.size) {
    const applyBody = (node: DslNode): void => {
      if (node.type !== 'BATCH') return
      const body = batchBodies.get(node.id)
      if (!body) return
      const cfg = { ...((node.config ?? {}) as Record<string, unknown>) }
      cfg.body = body
      delete cfg.actionType
      delete cfg.actionConfig
      node.config = cfg as unknown as NodeConfig
      for (const step of body) {
        if (step.type === 'BATCH') applyBody(step as unknown as DslNode)
      }
    }
    for (const node of dsl.nodes) applyBody(node)
  }

  const declared = (inputVars || []).filter((v) => v.name && v.name.trim())
  if (declared.length) dsl.inputVars = declared
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

// ==================== 输入变量扫描（运行测试建议用） ====================

/**
 * 扫描画布图，提取「被引用但未在本流产出」的输入变量候选名。
 * - 深度遍历所有节点 config 字符串值中的 {{var}} 占位符；
 * - 结构化引用：BEAN params[].source、HTTP queryParams/bodyParams[].source、
 *   SUBFLOW varsMapping[].source、CONDITION variable、BATCH collection；
 * - 剔除本流产出：各节点 resultVar + BATCH itemVar/indexVar。
 */
export function collectReferencedVars(graph: FlowGraph): string[] {
  const referenced = new Set<string>()
  const produced = new Set<string>()

  const scanPlaceholders = (value: unknown): void => {
    if (typeof value === 'string') {
      for (const m of value.matchAll(/\{\{\s*([a-zA-Z_][\w]*)\s*\}\}/g)) {
        referenced.add(m[1])
      }
    } else if (Array.isArray(value)) {
      value.forEach(scanPlaceholders)
    } else if (value && typeof value === 'object') {
      Object.values(value as Record<string, unknown>).forEach(scanPlaceholders)
    }
  }

  for (const node of graph.nodes) {
    const cfg = node.data.config as Record<string, unknown> | undefined
    if (cfg) scanPlaceholders(cfg)
    const type = node.data.nodeType
    if (node.data.resultVar) produced.add(node.data.resultVar)
    if (type === 'BEAN' && Array.isArray(cfg?.params)) {
      for (const p of cfg.params as { source?: string }[]) {
        if (p?.source) referenced.add(p.source)
      }
    }
    if (type === 'HTTP') {
      for (const key of ['queryParams', 'bodyParams'] as const) {
        if (Array.isArray(cfg?.[key])) {
          for (const p of cfg[key] as { source?: string }[]) {
            if (p?.source) referenced.add(p.source)
          }
        }
      }
    }
    if (type === 'CONDITION' && typeof cfg?.variable === 'string' && cfg.variable) {
      referenced.add(cfg.variable.replace(/^\{\{\s*|\s*\}\}$/g, ''))
    }
    if (type === 'BATCH') {
      const collection = String(cfg?.collection ?? '')
      const m = collection.match(/^\{\{\s*([a-zA-Z_][\w]*)\s*\}\}$/)
      if (m) referenced.add(m[1])
      const itemVar = String(cfg?.itemVar ?? 'item')
      const indexVar = String(cfg?.indexVar ?? 'index')
      if (itemVar) produced.add(itemVar)
      if (indexVar) produced.add(indexVar)
      // 循环体链：body 节点 resultVar 计入产出，结构化 source 引用计入引用
      const body = Array.isArray(cfg?.body) ? (cfg?.body as BatchBodyNode[]) : []
      for (const bn of body) {
        if (!bn) continue
        if (bn.resultVar) produced.add(bn.resultVar)
        const bc = bn.config as Record<string, unknown> | undefined
        if (!bc) continue
        if (bn.type === 'BEAN' && Array.isArray(bc.params)) {
          for (const p of bc.params as { source?: string }[]) {
            if (p?.source) referenced.add(p.source)
          }
        }
        if (bn.type === 'HTTP') {
          for (const key of ['queryParams', 'bodyParams'] as const) {
            if (Array.isArray(bc[key])) {
              for (const p of bc[key] as { source?: string }[]) {
                if (p?.source) referenced.add(p.source)
              }
            }
          }
        }
        if (bn.type === 'SUBFLOW' && Array.isArray(bc.varsMapping)) {
          for (const p of bc.varsMapping as { source?: string }[]) {
            if (p?.source) referenced.add(p.source)
          }
        }
      }
    }
    if (type === 'SUBFLOW' && Array.isArray(cfg?.varsMapping)) {
      for (const p of cfg.varsMapping as { source?: string }[]) {
        if (p?.source) referenced.add(p.source)
      }
    }
  }

  return [...referenced].filter((name) => !produced.has(name)).sort()
}
