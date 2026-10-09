/**
 * 画布变量收集（变量选择列表就近显示 · 数据源）。
 *
 * 某节点「当前可用变量」= 按引擎语义的超集：
 * - input   入参：DSL 顶层 inputVars 声明（全局可用）
 * - loop    循环变量：上游 BATCH 节点的 itemVar/indexVar（仅循环体链内可用，
 *           通过 data.loop === true 的循环边传播；循环外不可见，与引擎作用域一致）
 * - upstream 上游产出：祖先节点 results 声明的输出变量（全执行型节点：WHOLE 整包 /
 *           KEY 拆包，按声明名写入）；未声明 results 的执行型节点按引擎隐式约定
 *           自动产出「整体输出」条目（变量名 = 节点 id，下游可点路径取子字段）
 * - form    表单数据：formData 点路径取流程表单字段（仅 {{ }} 占位符场景展示，
 *           VariablePicker 在 bare 模式下过滤该组）
 *
 * CONDITION 双分支均为祖先：真/假支路 results 产出都会列出（超集，不影响正确性）。
 */
import type { FieldNode, InputVarDef, ResultVarDef } from './dsl'

export interface FlowVarItem {
  name: string
  group: 'input' | 'loop' | 'upstream' | 'form'
  /** 展示用类型标注（string/number/json…；下拉只显示变量名 + 类型） */
  detail?: string
  /** 字段树：子字段条目（form 组 / 结构化 input·upstream 组；点击插完整路径） */
  children?: FlowVarItem[]
  /** form 组根条目：点击仅插前缀（formData. / {{formData.），字段由子条目供选 */
  prefixOnly?: boolean
  /** 子字段展示名（相对路径，如 data.items），缺省回退 shortName() 剥前缀 */
  short?: string
}

/** 绑定表单字段组（设计期表单字段发现，后端 FormFieldSchemaService 同构最小结构；null 与缺省等价） */
export interface FormFieldGroupLike {
  formKey?: string
  formName?: string | null
  formType?: string
  /** 来源：columnConfig | schema | sampled | empty */
  source?: string
  triggerTypes?: string[] | null
  fields?: FormFieldLike[] | null
}

export interface FormFieldLike {
  path: string
  label?: string | null
  type?: string | null
  children?: FormFieldLike[] | null
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

/** 表单字段 → form 组变量条目（name = 根前缀 + 相对路径，递归 children；只展示类型） */
function fieldToVarItem(prefix: string, f: FormFieldLike): FlowVarItem {
  return {
    name: prefix + f.path,
    group: 'form',
    detail: f.type || undefined,
    children: f.children?.length ? f.children.map((c) => fieldToVarItem(prefix, c)) : undefined,
  }
}

/** 结构树节点 → 变量子条目（name = 根名.相对路径，递归；short 供选择器展示相对路径） */
function structureToVarItems(root: string, fields: FieldNode[]): FlowVarItem[] {
  return fields.map((f) => ({
    name: `${root}.${f.path}`,
    group: 'upstream' as const,
    short: f.path,
    detail: f.type || undefined,
    children: f.children?.length ? structureToVarItems(`${root}.${f.path}`, f.children) : undefined,
  }))
}

/** 绑定表单字段组 → FieldNode 结构树（入参 formData 一键导入用；多表单合并，同路径先到先得） */
export function formFieldGroupsToFieldNodes(groups?: FormFieldGroupLike[] | null): FieldNode[] {
  const seen = new Set<string>()
  const out: FieldNode[] = []
  for (const g of groups || []) {
    for (const f of g?.fields || []) {
      if (!f?.path || seen.has(f.path)) continue
      seen.add(f.path)
      out.push(formFieldToFieldNode(f))
    }
  }
  return out
}

function formFieldToFieldNode(f: FormFieldLike): FieldNode {
  return {
    path: f.path,
    label: f.label ?? null,
    type: f.type ?? null,
    children: f.children?.length ? f.children.map(formFieldToFieldNode) : null,
  }
}

/** 构建 form 组变量：formData（字段树）+ formDataExisting（更新/删除触发点时同构旧行） */
function buildFormVars(groups?: FormFieldGroupLike[]): FlowVarItem[] {
  const list = (groups || []).filter((g) => g && Array.isArray(g.fields) && g.fields.length)
  if (!list.length) {
    return [
      {
        name: 'formData',
        group: 'form',
      },
    ]
  }

  // 多表单字段合并（同路径先到先得，类型取首个命中来源）
  const seen = new Set<string>()
  const children: FlowVarItem[] = []
  for (const g of list) {
    for (const f of g.fields!) {
      const item = fieldToVarItem('formData.', f)
      if (!seen.has(item.name)) {
        seen.add(item.name)
        children.push(item)
      }
    }
  }

  const out: FlowVarItem[] = [
    {
      name: 'formData',
      group: 'form',
      prefixOnly: true,
      children,
    },
  ]

  // 更新/删除前旧行（同构）：仅当绑定含 UPDATE/DELETE 触发点
  const hasMutation = list.some((g) =>
    (g.triggerTypes || []).some((t) => t.includes('UPDATE') || t.includes('DELETE'))
  )
  if (hasMutation) {
    out.push({
      name: 'formDataExisting',
      group: 'form',
      prefixOnly: true,
      children: children.map((c) => ({
        ...c,
        name: c.name.replace(/^formData\./, 'formDataExisting.'),
      })),
    })
  }
  return out
}

/**
 * 执行型节点类型（与引擎一致：会产出返回值并写回上下文）。
 * 未声明 results 时，引擎按隐式约定把整体返回值写入以节点 id 命名的变量
 * （约定优于配置：下游零配置即可引用，点路径取子字段，如 {{http_x7k2.data.id}}）。
 */
export const EXEC_NODE_TYPES = new Set<string>([
  'HTTP',
  'BEAN',
  'SCRIPT',
  'CONDITION',
  'BATCH',
  'SUBFLOW',
  'DATA_UPDATE',
  'SQL_SCRIPT',
])

/** 循环变量名缺省值（与 dsl.ts defaultConfig / 引擎约定一致） */
const DEFAULT_ITEM_VAR = 'item'
const DEFAULT_INDEX_VAR = 'index'

/** 选中项 → 插入文本：占位符场景插 {{name}}，裸名场景插 name；
 *  formData 根条目只补前缀，字段子条目（name 已是完整路径）直接包装 */
export function varInsertText(v: FlowVarItem, mode: 'placeholder' | 'bare'): string {
  if (v.group === 'form') {
    if (v.prefixOnly) return mode === 'bare' ? 'formData.' : '{{formData.'
    return mode === 'bare' ? v.name : `{{${v.name}}}`
  }
  return mode === 'bare' ? v.name : `{{${v.name}}}`
}

/**
 * 收集 nodeId 节点可用的上下文变量。
 * 入参顺序即分组优先级：同名变量 input > loop > upstream > form 先到先得。
 *
 * @param formFieldGroups 设计期表单字段发现结果（可选）：有结构时 form 组展开为
 *        formData 根条目（可展开子字段树，点选插完整路径）+ formDataExisting（绑定含
 *        更新/删除触发点时，同字段树）；无结构时回退单条 formData 提示（存量行为）
 */
export function collectAvailableVars(
  nodeId: string | null | undefined,
  nodes: VarNodeLike[],
  edges: VarEdgeLike[],
  inputVars: InputVarDef[],
  formFieldGroups?: FormFieldGroupLike[]
): FlowVarItem[] {
  const result: FlowVarItem[] = []
  const seen = new Set<string>()
  const push = (item: FlowVarItem) => {
    const key = item.name
    if (!key || seen.has(key)) return
    seen.add(key)
    result.push(item)
  }

  // 1) 入参（跳过未命名行；json 类型带结构树时展开子字段，点选插 name.field 完整路径）。
  //    下拉只展示变量名 + 类型（不展示说明，保持列表简洁）
  for (const v of inputVars || []) {
    if (!v?.name?.trim()) continue
    const structure = Array.isArray(v.structure) ? v.structure : []
    push({
      name: v.name.trim(),
      group: 'input',
      detail: v.type || undefined,
      children: structure.length ? structureToVarItems(v.name.trim(), structure) : undefined,
    })
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
      push({ name: itemVar, group: 'loop' })
      push({ name: indexVar, group: 'loop' })
    }

    if (data.nodeType === 'SCRIPT') {
      // SCRIPT 输出：results 声明即产出；未声明 → 引擎隐式整体输出（变量名=节点 id）
      if (Array.isArray(data.results) && data.results.length > 0) {
        for (const r of data.results as ResultVarDef[]) {
          if (!r?.name?.trim()) continue
          const structure = Array.isArray(r.structure) ? r.structure : []
          push({
            name: r.name.trim(),
            group: 'upstream',
            detail: r.type || undefined,
            children: structure.length ? structureToVarItems(r.name.trim(), structure) : undefined,
          })
        }
      } else {
        push({ name: id, group: 'upstream' })
      }
      continue
    }

    // 其余执行型节点输出：results 声明即产出；未声明 → 引擎隐式整体输出（变量名=节点 id）
    if (Array.isArray(data.results) && data.results.length > 0) {
      for (const r of data.results as ResultVarDef[]) {
        if (!r?.name?.trim()) continue
        const structure = Array.isArray(r.structure) ? r.structure : []
        push({
          name: r.name.trim(),
          group: 'upstream',
          detail: r.type || undefined,
          children: structure.length ? structureToVarItems(r.name.trim(), structure) : undefined,
        })
      }
    } else if (EXEC_NODE_TYPES.has(data.nodeType)) {
      push({ name: id, group: 'upstream' })
    }
  }

  // 4) 表单数据：绑定表单字段树展开（有结构时根条目带子字段，点选插完整路径）
  buildFormVars(formFieldGroups).forEach(push)

  return result
}
