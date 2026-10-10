/**
 * 引用扫描器（ADR-001 路线 Phase A1）。
 *
 * 按引擎逐字段取值语义（LogicFlowEngine / HttpLogicExecutor / ConditionEvaluator /
 * VariableResolver 反推）提取每个节点引用的变量，对照「该节点可达的声明集合」报告问题：
 *
 * - unknown-ref   错误：引用了该节点作用域内不存在的变量（上游未声明 / 超出循环作用域 / 拼错）
 * - dotted-ref    错误：在不支持点路径的字段使用了 a.b 引用——引擎占位符解析（VariableResolver）
 *                 仅支持顶级变量名（\w+），点路径仅 DATA_UPDATE 取值（resolvePath）支持；
 *                 裸名字段为 vars.get(字面量)，点路径同样取不到值，运行期静默为空
 * - type-mismatch 提醒：集合/数值场景引用了声明类型不符的变量（引擎宽容，仅提醒）
 * - dup-decl      提醒：同名输出在多处声明（引擎后写覆盖先写，log.warn 放行）
 * - orphan-decl   提醒：输出声明未被任何节点引用（按需物化后将被跳过，仅提醒）
 *
 * 作用域语义与 flowVars.collectAvailableVars 同源：入参全局可用；祖先节点（沿入边反向
 * 可达）的 results 声明可用；循环变量（itemVar/indexVar）仅经 loop 边在循环体链内可用；
 * 错误输出扁平键（errorMessage 等）仅当祖先配置 IGNORE_CONTINUE 且属生产者类型时可用
 * （条件性放行，避免无该祖先时漏报/误报）。引擎注入上下文（表单触发场景 formData 等）
 * 静态无法判定，统一视为可用以避免误报。
 *
 * 已知盲区：SCRIPT source 为 Groovy 代码，绑定集静态不可知，不扫描。
 */
import type { InputVarDef } from './dsl'
import type { VarEdgeLike, VarNodeLike } from './flowVars'

export type RefIssueKind =
  | 'unknown-ref'
  | 'dotted-ref'
  | 'type-mismatch'
  | 'dup-decl'
  | 'orphan-decl'

export type RefIssueSeverity = 'error' | 'warning'

export interface RefIssue {
  nodeId: string
  nodeName: string
  nodeType: string
  kind: RefIssueKind
  severity: RefIssueSeverity
  /** 字段定位（人类可读）：URL / Query 参数 #2 / 输出声明 等 */
  field: string
  /** 涉事变量名（点路径为首段根名） */
  ref?: string
  message: string
}

/**
 * 引擎在表单触发场景注入的上下文名（FormLogicBindingService.injectTriggerVars 语义）：
 * formData / formDataExisting 为 Map（点路径根），其余为标量。静态无法判定本流是否
 * 表单触发，统一视为可用以避免误报。
 */
const ENGINE_INJECTED = new Set([
  'formData',
  'formDataExisting',
  'formKey',
  'formType',
  'dataId',
  'opType',
  'operator',
  'comment',
  'processInstanceId',
  'taskId',
  '__trigger',
])

/** 占位符：引擎 VariableResolver 仅 \w+；DATA_UPDATE resolvePath 支持 var.sub.sub（扫描器统一抓全，按字段判定合法性） */
const PLACEHOLDER = /\{\{\s*(\w+(?:\.\w+)*)\s*}}/g

/** 合法裸名：与 results 声明域一致（\w+，VariableResolver 占位符同域） */
const IDENT = /^\w+$/

const BATCH_TYPE = 'BATCH'
const DEFAULT_ITEM_VAR = 'item'
const DEFAULT_INDEX_VAR = 'index'

/**
 * IGNORE_CONTINUE 时向上下文写入错误输出扁平键的生产者节点类型（ADR-001 第 6 项 /
 * Phase C 引擎契约：节点失败且忽略继续时写入，START/END 除外，CONDITION 亦可）。
 */
export const ERROR_PRODUCER_TYPES = new Set([
  'HTTP',
  'BEAN',
  'SCRIPT',
  'BATCH',
  'SUBFLOW',
  'DATA_UPDATE',
  'CONDITION',
])

/** 错误输出扁平键（最近一次被忽略的失败：重复失败覆盖、成功不清除，END 快照含之） */
export const ERROR_OUTPUT_KEYS = ['errorMessage', 'errorNodeId', 'errorNodeName'] as const

/** 有输出声明的执行型节点（START/END/CONDITION 不产变量，results 不序列化） */
const EXECUTION_TYPES = new Set(['HTTP', 'BEAN', 'SCRIPT', 'BATCH', 'SUBFLOW', 'DATA_UPDATE'])

interface ScopeInfo {
  /** 该节点作用域内可用的根变量名 */
  names: Set<string>
  /** 作用域内可见循环变量的 BATCH id（嵌套循环场景区分 item 来自哪个 batch） */
  loopBatches: Set<string>
}

/**
 * 扫描全图引用问题。
 * nodes/edges 为画布数据（循环体节点在画布顶层，经 data.loop=true 的循环边连接），
 * inputVars 为顶层入参声明。
 */
export function scanFlowReferences(
  nodes: VarNodeLike[],
  edges: VarEdgeLike[],
  inputVars: InputVarDef[]
): RefIssue[] {
  const safeNodes = nodes || []
  const safeEdges = edges || []
  const issues: RefIssue[] = []

  // ===== 声明集合与类型表 =====
  const inputNames = new Set<string>()
  const typeByName = new Map<string, string>() // 声明类型（入参 + 输出），仅类型提醒用
  for (const v of inputVars || []) {
    if (!v?.name?.trim()) continue
    inputNames.add(v.name.trim())
    typeByName.set(v.name.trim(), v.type)
  }
  // 全部输出声明：name -> 持有者标签列表（dup-decl 用）
  const declHolders = new Map<string, string[]>()
  for (const n of safeNodes) {
    const data = n?.data
    if (!data || !EXECUTION_TYPES.has(data.nodeType)) continue
    for (const r of (data.results ?? []) as { name?: string; type?: string }[]) {
      const name = String(r?.name ?? '').trim()
      if (!name) continue
      const holders = declHolders.get(name) ?? []
      holders.push(`节点「${data.name || n.id}」`)
      declHolders.set(name, holders)
      if (!typeByName.has(name)) typeByName.set(name, r?.type || 'json')
    }
  }

  // ===== 逐节点作用域（沿入边反向 BFS，与 collectAvailableVars 同源） =====
  const scopes = new Map<string, ScopeInfo>()
  for (const n of safeNodes) {
    if (!n?.id) continue
    scopes.set(n.id, buildScope(n.id, safeNodes, safeEdges, inputNames))
  }

  // ===== 逐节点提取引用并检查 =====
  const referencedRoots = new Set<string>()
  for (const n of safeNodes) {
    const data = n?.data
    if (!data) continue
    const scope = scopes.get(n.id)
    const names = scope?.names ?? new Set([...inputNames, ...ENGINE_INJECTED])
    const check = makeChecker(n.id, data.name || n.id, data.nodeType, names, typeByName, issues, referencedRoots)

    const cfg = (data.config ?? {}) as Record<string, unknown>
    switch (data.nodeType) {
      case 'HTTP': {
        check.placeholders(str(cfg.url), 'URL', { dottedAllowed: false })
        for (const [k, v] of Object.entries((cfg.headers ?? {}) as Record<string, string>)) {
          check.placeholders(str(v), `请求头 ${k}`, { dottedAllowed: false })
        }
        for (const [key, label] of [
          ['queryParams', 'Query 参数'],
          ['bodyParams', 'Body 参数'],
        ] as const) {
          const pairs = (cfg[key] ?? []) as { source?: string }[]
          pairs.forEach((p, i) => check.bare(str(p?.source), `${label} #${i + 1}`))
        }
        break
      }
      case 'BEAN': {
        const pairs = (cfg.params ?? []) as { source?: string }[]
        pairs.forEach((p, i) => check.bare(str(p?.source), `方法参数 #${i + 1}`))
        break
      }
      case 'SCRIPT':
        // Groovy 绑定集静态不可知：盲区，不扫
        break
      case 'CONDITION': {
        const op = str(cfg.operator).toUpperCase()
        check.bare(str(cfg.variable).replace(/^\{\{\s*|\s*\}\}$/g, ''), '判断变量')
        if (op !== 'EMPTY' && op !== 'NOT_EMPTY') {
          check.placeholders(str(cfg.value), '比较值', { dottedAllowed: false })
        }
        break
      }
      case 'BATCH': {
        const collection = str(cfg.collection).trim()
        const exact = collection.match(/^\{\{\s*(\w+)\s*}}$/)
        if (exact) {
          check.bare(exact[1], '集合 collection', { expectType: 'json', typeLabel: '循环集合' })
        } else if (collection.includes('{{')) {
          check.placeholders(collection, '集合 collection', { dottedAllowed: false, expectType: 'json', typeLabel: '循环集合' })
        }
        // legacy 单动作（画布已升级为 body 链，历史 DSL 兜底扫一遍）
        const legacy = cfg.actionConfig as Record<string, unknown> | undefined
        if (cfg.actionType && legacy) check.deepPlaceholders(legacy, 'legacy 动作配置')
        break
      }
      case 'SUBFLOW': {
        const pairs = (cfg.varsMapping ?? []) as { source?: string }[]
        pairs.forEach((p, i) => check.bare(str(p?.source), `变量映射 #${i + 1}`))
        break
      }
      case 'DATA_UPDATE': {
        // DATA_UPDATE 取值走 resolvePath：点路径受支持，仅查根名可达性
        const setOps = (cfg.setOps ?? []) as { column?: string; mode?: string; value?: string }[]
        setOps.forEach((op, i) => {
          const mode = str(op?.mode).toUpperCase() || 'SET'
          const label = `写入列 ${str(op?.column) || `#${i + 1}`}（${mode}）`
          check.dataUpdateValue(str(op?.value), label, mode)
        })
        const where = (cfg.where ?? []) as { column?: string; op?: string; value?: string }[]
        where.forEach((cond, i) => {
          const op = str(cond?.op).toUpperCase()
          if (op === 'IS_NULL' || op === 'NOT_NULL') return
          check.dataUpdateValue(str(cond?.value), `条件列 ${str(cond?.column) || `#${i + 1}`}`, 'SET')
        })
        break
      }
      default:
        break
    }
  }

  // ===== dup-decl：同名输出多处声明（含与入参撞名） =====
  for (const [name, holders] of declHolders) {
    const total = holders.length + (inputNames.has(name) ? 1 : 0)
    if (total > 1) {
      const at = [...holders, ...(inputNames.has(name) ? ['入参声明'] : [])].join('、')
      issues.push({
        nodeId: '',
        nodeName: '',
        nodeType: '',
        kind: 'dup-decl',
        severity: 'warning',
        field: '输出声明',
        ref: name,
        message: `变量名 "${name}" 在多处重复声明（${at}），运行期后写覆盖先写`,
      })
    }
  }

  // ===== orphan-decl：输出声明未被任何节点引用 =====
  for (const [name, holders] of declHolders) {
    if (referencedRoots.has(name)) continue
    issues.push({
      nodeId: '',
      nodeName: '',
      nodeType: '',
      kind: 'orphan-decl',
      severity: 'warning',
      field: '输出声明',
      ref: name,
      message: `${holders[0]} 的输出 "${name}" 未被任何节点引用（按需物化后将跳过；如脚本内使用或仅作透传可忽略）`,
    })
  }

  return issues
}

// ==================== 作用域构建 ====================

/** 沿入边反向 BFS：祖先 results 声明 + 入参 + 循环变量（仅 loop 边传递）+ 引擎注入 */
function buildScope(
  nodeId: string,
  nodes: VarNodeLike[],
  edges: VarEdgeLike[],
  inputNames: Set<string>
): ScopeInfo {
  const names = new Set<string>([...inputNames, ...ENGINE_INJECTED])
  const loopBatches = new Set<string>()
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  const visited = new Set<string>([nodeId])
  type QueueItem = { id: string; loops: Set<string> }
  const queue: QueueItem[] = [{ id: nodeId, loops: new Set() }]
  while (queue.length) {
    const cur = queue.shift()!
    for (const edge of edges || []) {
      if (!edge?.target || !edge?.source || edge.target !== cur.id) continue
      const parentId = edge.source
      if (visited.has(parentId)) continue
      visited.add(parentId)
      const loops = new Set(cur.loops)
      if (edge.data?.loop === true && nodeById.get(parentId)?.data?.nodeType === BATCH_TYPE) {
        loops.add(parentId)
      }
      // 祖先声明入可用集（loop 边使循环 BATCH 本身也是祖先：其 results 对循环体可见，
      // 与 collectAvailableVars 的超集语义一致——软校验宁可少报不误报）
      for (const r of (nodeById.get(parentId)?.data?.results ?? []) as { name?: string }[]) {
        const name = String(r?.name ?? '').trim()
        if (name) names.add(name)
      }
      // 错误输出（Phase C）：父节点配置忽略继续且属生产者类型时，错误扁平键对其下游
      // 可见。条件性可用，不进 ENGINE_INJECTED——无忽略继续祖先时引用 errorMessage
      // 仍按 unknown-ref 上报，与后端发布硬拦对齐
      const parentData = nodeById.get(parentId)?.data
      if (parentData?.errorAction === 'IGNORE_CONTINUE' && ERROR_PRODUCER_TYPES.has(parentData.nodeType)) {
        for (const key of ERROR_OUTPUT_KEYS) names.add(key)
      }
      // 循环变量：仅本 BATCH 的 itemVar/indexVar（经 loop 边直接连入循环体链）
      if (loops.has(parentId)) {
        const cfg = (nodeById.get(parentId)?.data?.config ?? {}) as { itemVar?: string; indexVar?: string }
        names.add(cfg.itemVar?.trim() || DEFAULT_ITEM_VAR)
        names.add(cfg.indexVar?.trim() || DEFAULT_INDEX_VAR)
      }
      queue.push({ id: parentId, loops })
    }
  }
  return { names, loopBatches }
}

// ==================== 逐节点检查器 ====================

interface CheckOpts {
  /** 该字段是否支持点路径（仅 DATA_UPDATE 取值 true） */
  dottedAllowed?: boolean
  /** 期望的声明类型（类型提醒用） */
  expectType?: string
  /** 类型提醒里的场景名（如「循环集合」） */
  typeLabel?: string
}

function makeChecker(
  nodeId: string,
  nodeName: string,
  nodeType: string,
  available: Set<string>,
  typeByName: Map<string, string>,
  issues: RefIssue[],
  referencedRoots: Set<string>
) {
  const nodeLabel = `${nodeType === 'BATCH' ? '批处理' : nodeType}「${nodeName}」`

  const typeHint = (root: string, opts: CheckOpts): void => {
    if (!opts.expectType) return
    const t = typeByName.get(root)
    if (!t || t === opts.expectType) return
    issues.push({
      nodeId,
      nodeName,
      nodeType,
      kind: 'type-mismatch',
      severity: 'warning',
      field: opts.typeLabel ?? '',
      ref: root,
      message: `${nodeLabel} ${opts.typeLabel ?? ''}引用的变量 "${root}" 声明类型为 ${t}，期望 ${opts.expectType}`.trim(),
    })
  }

  /** 占位符引用（{{var}} / 混合模板） */
  const placeholders = (text: string, field: string, opts: CheckOpts): void => {
    if (!text) return
    for (const m of text.matchAll(PLACEHOLDER)) {
      const path = m[1]
      const root = path.split('.')[0]
      const dotted = path.includes('.')
      referencedRoots.add(root)
      if (dotted && !opts.dottedAllowed) {
        issues.push({
          nodeId,
          nodeName,
          nodeType,
          kind: 'dotted-ref',
          severity: 'error',
          field,
          ref: path,
          message: `${nodeLabel} ${field} 的 "{{${path}}}" 使用了点路径：该字段仅支持顶级变量名（点路径仅数据更新取值支持），运行期将解析为空`,
        })
        continue
      }
      if (!available.has(root)) {
        issues.push({
          nodeId,
          nodeName,
          nodeType,
          kind: 'unknown-ref',
          severity: 'error',
          field,
          ref: root,
          message: `${nodeLabel} ${field} 引用了未定义变量 "${root}"（上游未声明、超出作用域或拼写有误）`,
        })
        continue
      }
      typeHint(root, opts)
    }
  }

  /** 裸名引用（vars.get(字面量) 语义：HTTP/BEAN 参数 source、CONDITION 变量、SUBFLOW 映射 source、BATCH collection 精确形态） */
  const bare = (raw: string, field: string, opts: CheckOpts = {}): void => {
    const name = raw.trim()
    if (!name) return
    const dotted = /^\w+(\.\w+)+$/.test(name)
    referencedRoots.add(name.split('.')[0])
    if (dotted) {
      // 裸名字段为 vars.get(字面量)：点路径取不到值（formData 也不行）
      issues.push({
        nodeId,
        nodeName,
        nodeType,
        kind: 'dotted-ref',
        severity: 'error',
        field,
        ref: name,
        message: `${nodeLabel} ${field} 使用了点路径 "${name}"：该字段仅支持顶级变量名（点路径取值为空）`,
      })
      return
    }
    if (!IDENT.test(name)) {
      issues.push({
        nodeId,
        nodeName,
        nodeType,
        kind: 'unknown-ref',
        severity: 'error',
        field,
        ref: name,
        message: `${nodeLabel} ${field} 的 "${name}" 不是合法变量名（仅字母/数字/下划线）`,
      })
      return
    }
    if (!available.has(name)) {
      issues.push({
        nodeId,
        nodeName,
        nodeType,
        kind: 'unknown-ref',
        severity: 'error',
        field,
        ref: name,
        message: `${nodeLabel} ${field} 引用了未定义变量 "${name}"（上游未声明、超出作用域或拼写有误）`,
      })
      return
    }
    typeHint(name, opts)
  }

  /** DATA_UPDATE 取值：点路径受支持（resolvePath），仅查根名可达 + ADD/SUB 数值提醒 */
  const dataUpdateValue = (raw: string, field: string, mode: string): void => {
    const text = raw.trim()
    if (!text) return
    if (!text.includes('{{')) return // 字面量：非数字的硬错误由后端发布校验兜底
    for (const m of text.matchAll(PLACEHOLDER)) {
      const path = m[1]
      const root = path.split('.')[0]
      referencedRoots.add(root)
      if (!available.has(root)) {
        issues.push({
          nodeId,
          nodeName,
          nodeType,
          kind: 'unknown-ref',
          severity: 'error',
          field,
          ref: root,
          message: `${nodeLabel} ${field} 引用了未定义变量 "${root}"（上游未声明、超出作用域或拼写有误）`,
        })
        continue
      }
      if (mode === 'ADD' || mode === 'SUB') {
        const t = typeByName.get(root)
        if (t && t !== 'number') {
          issues.push({
            nodeId,
            nodeName,
            nodeType,
            kind: 'type-mismatch',
            severity: 'warning',
            field,
            ref: root,
            message: `${nodeLabel} ${field}（${mode}）引用的变量 "${root}" 声明类型为 ${t}，须为数值`,
          })
        }
      }
    }
  }

  /** 通用深遍历（legacy actionConfig 兜底）：所有字符串值里的占位符 */
  const deepPlaceholders = (value: unknown, field: string): void => {
    if (typeof value === 'string') {
      placeholders(value, field, { dottedAllowed: false })
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => deepPlaceholders(v, `${field}[${i + 1}]`))
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        deepPlaceholders(v, `${field}.${k}`)
      }
    }
  }

  return { placeholders, bare, dataUpdateValue, deepPlaceholders }
}

function str(v: unknown): string {
  return v == null ? '' : String(v)
}
