/**
 * 画布变量收集（变量选择列表就近显示 · 数据源）。
 *
 * 某节点「当前可用变量」= 按引擎语义的超集：
 * - input   入参：DSL 顶层 inputVars 声明（全局可用）
 * - loop    循环变量：上游 BATCH 节点的 itemVar/indexVar（仅循环体链内可用，
 *           通过 data.loop === true 的循环边传播；循环外不可见，与引擎作用域一致）
 * - upstream 上游产出：祖先节点（沿入边反向可达）results 声明的输出变量
 *           （全执行型节点：WHOLE 整包 / KEY 拆包，按声明名写入）
 * - form    表单数据：formData 点路径取流程表单字段（仅 {{ }} 占位符场景展示，
 *           VariablePicker 在 bare 模式下过滤该组）
 *
 * CONDITION 双分支均为祖先：真/假支路 results 产出都会列出（超集，不影响正确性）。
 */
import type { InputVarDef, ResultVarDef } from './dsl'

export interface FlowVarItem {
  name: string
  group: 'input' | 'loop' | 'upstream' | 'form'
  /** 展示用说明：类型/来源节点等 */
  detail?: string
}

/** 最小结构（vue-flow store 节点 / FlowNode 均可结构化赋值） */
export interface VarNodeLike {
  id: string
  data: {
    nodeType: string
    name?: string
    /** 输出声明（执行型节点，产出变量进 upstream 组） */
    results?: ResultVarDef[]
    /** 具体形态随 nodeType 不同，使用处再收窄 */
    config?: unknown
  }
}

export interface VarEdgeLike {
  source: string
  target: string
  data?: { loop?: boolean } | null
}

const BATCH_TYPE = 'BATCH'

/** 循环变量名缺省值（与 dsl.ts defaultConfig / 引擎约定一致） */
const DEFAULT_ITEM_VAR = 'item'
const DEFAULT_INDEX_VAR = 'index'

/** 选中项 → 插入文本：占位符场景插 {{name}}，裸名场景插 name；formData 点路径只补前缀 */
export function varInsertText(v: FlowVarItem, mode: 'placeholder' | 'bare'): string {
  if (v.group === 'form') return mode === 'bare' ? 'formData.' : '{{formData.'
  return mode === 'bare' ? v.name : `{{${v.name}}}`
}

/**
 * 收集 nodeId 节点可用的上下文变量。
 * 入参顺序即分组优先级：同名变量 input > loop > upstream > form 先到先得。
 */
export function collectAvailableVars(
  nodeId: string | null | undefined,
  nodes: VarNodeLike[],
  edges: VarEdgeLike[],
  inputVars: InputVarDef[]
): FlowVarItem[] {
  const result: FlowVarItem[] = []
  const seen = new Set<string>()
  const push = (item: FlowVarItem) => {
    const key = item.name
    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(item)
  }

  // 1) 入参（跳过未命名行）
  for (const v of inputVars || []) {
    if (!v?.name?.trim()) continue
    const bits: string[] = [v.type]
    if (v.required) bits.push('必填')
    if (v.desc) bits.push(v.desc)
    push({ name: v.name.trim(), group: 'input', detail: bits.filter(Boolean).join(' · ') })
  }

  if (!nodeId) return result

  const byId = new Map(nodes.map((n) => [n.id, n]))

  // 2) 沿入边反向 BFS：祖先集合 + 每个节点可见的 BATCH 循环作用域
  //    loopScope 仅经 loop 边向下传递（batch --loop--> 体节点），普通边继承父级
  const visited = new Set<string>([nodeId])
  type QueueItem = { id: string; loopBatches: Set<string> }
  const queue: QueueItem[] = [{ id: nodeId, loopBatches: new Set() }]
  const loopBatchesById = new Map<string, Set<string>>()
  const ancestors: string[] = []

  while (queue.length) {
    const cur = queue.shift()!
    for (const edge of edges || []) {
      if (!edge?.target || !edge?.source || edge.target !== cur.id) continue
      const parentId = edge.source
      if (visited.has(parentId)) continue
      visited.add(parentId)
      ancestors.push(parentId)

      const loopBatches = new Set(cur.loopBatches)
      if (edge.data?.loop === true && byId.get(parentId)?.data?.nodeType === BATCH_TYPE) {
        loopBatches.add(parentId)
      }
      loopBatchesById.set(parentId, loopBatches)
      queue.push({ id: parentId, loopBatches })
    }
  }

  // 3) 祖先节点：循环变量 + 上游产出（BFS 层序即近邻优先）
  for (const id of ancestors) {
    const n = byId.get(id)
    if (!n) continue
    const data = n.data || ({} as VarNodeLike['data'])

    if (data.nodeType === BATCH_TYPE && loopBatchesById.get(id)?.has(id)) {
      const cfg = (data.config || {}) as { itemVar?: string; indexVar?: string }
      const itemVar = cfg.itemVar?.trim() || DEFAULT_ITEM_VAR
      const indexVar = cfg.indexVar?.trim() || DEFAULT_INDEX_VAR
      push({ name: itemVar, group: 'loop', detail: `迭代项 · 来自「${data.name || id}」` })
      push({ name: indexVar, group: 'loop', detail: `迭代序号 · 来自「${data.name || id}」` })
    }

    if (data.nodeType === 'SCRIPT') {
      // SCRIPT 输出：results 声明即产出（引擎按声明写回上下文）
      if (Array.isArray(data.results)) {
        for (const r of data.results as ResultVarDef[]) {
          if (!r?.name?.trim()) continue
          const bits: string[] = [r.type]
          if (r.mode === 'WHOLE') bits.push('整体值')
          if (r.desc) bits.push(r.desc)
          push({
            name: r.name.trim(),
            group: 'upstream',
            detail: `输出参数 · 来自「${data.name || id}」${bits.length ? `（${bits.join(' · ')}）` : ''}`,
          })
        }
      }
      continue
    }

    // 其余执行型节点输出：results 声明即产出
    if (Array.isArray(data.results)) {
      for (const r of data.results as ResultVarDef[]) {
        if (!r?.name?.trim()) continue
        const bits: string[] = [r.type]
        if (r.mode === 'WHOLE') bits.push('整体值')
        if (r.desc) bits.push(r.desc)
        push({
          name: r.name.trim(),
          group: 'upstream',
          detail: `输出参数 · 来自「${data.name || id}」（${data.nodeType}）`,
        })
      }
    }
  }

  // 4) 表单数据（占位符场景专用，bare 模式由 VariablePicker 过滤）
  push({
    name: 'formData',
    group: 'form',
    detail: '流程表单数据 · 点路径取字段，如 formData.amount',
  })

  return result
}
