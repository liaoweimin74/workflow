/**
 * 页面模板 schema 重映射算法（设计稿：docs/designs/page-template-remap.md）。
 *
 * 纯函数模块，不依赖 Vue。模板实例化（项目内新建页面）与导入（跨项目重绑数据源）共用：
 * 调用方构造 DsBinding 表（旧 ds ID → 新 ID + 重绑后的 refId/searchFields），
 * 本模块负责改写 schema 中全部结构性引用（D0–D3 槽位）并输出校验报告。
 *
 * 改写判定一律为精确 ID 相等（值 === 旧 ds ID），不做子串替换；
 * 字段名级语义引用（$row.x、{row.x}、set-filter 参数名等）不参与改写。
 */

import { CHAIN_ACTIONS, CONTAINER_OPS } from '@/types/pageActionCatalog'

// ==================== 类型（对齐 PageDesigner.vue:377 保存形状） ====================

export interface PageDataSource {
  id: string
  refId: string
  searchFields?: string[]
  /** 骨架模板的槽位名（全量模板无此字段）；skeletonize 时由引用组件自动生成 */
  label?: string
  [key: string]: unknown
}

export interface PageSchema {
  rule: any[]
  option: any
  dataSources: PageDataSource[]
  actions: any[]
}

/** 重绑定：新 ID + 导入时重新解析的数据源绑定（实例化场景 refId/searchFields 原样传入） */
export interface DsBinding {
  id: string
  refId: string
  searchFields?: string[]
}

export type RemapIssueKind =
  /** 绑定表缺少该数据源条目 */
  | 'missing-binding'
  /** 引用值不在 schema 已知 ds ID 集（历史脏引用） */
  | 'dangling'
  /** 非委托动作的同名 target 参数值恰为旧 ds ID：不改写，请人工确认 */
  | 'target-like-id'
  /** 脚本动作引用 api. 上下文（pageKey/refId 为运行期值，重映射覆盖不到） */
  | 'script-ref'
  /** 动作类型不在 pageActionCatalog 契约内（契约外遗留数据） */
  | 'unknown-op'
  /** 实例化入参（rebinds 等）指向模板不存在的数据源条目 */
  | 'unknown-rebind'

export interface RemapReportItem {
  level: 'error' | 'warn'
  kind: RemapIssueKind
  /** 出错位置（JSON 路径风格，如 rule[0](page-table#t1).props.viewEvents[0]） */
  path: string
  value: string
  message: string
}

/** 只读引用扫描结果：一条 ds 引用槽位（删除组件级联清理、悬空检查共用） */
export interface DsRef {
  path: string
  value: string
  dangling: boolean
}

// ==================== 内部：rule 树遍历 ====================

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T
}

/** rule 节点定位标签：type#field，便于报告里人工定位 */
function nodeLabel(node: any): string {
  const type = node.type || 'node'
  return node.field ? `${type}#${node.field}` : type
}

/** 深度优先遍历 rule 树，回调收到节点 props + 路径 + 节点本身（node.type 判定组件类型用）。
 *  嵌套载体与 formRuleWalk.walkRules 对齐：children、props.rule（容器子字段）、props.columns[].rule（子表）。 */
export function walkRules(
  rules: any[],
  base: string,
  visit: (props: Record<string, any>, path: string, node: any) => void,
): void {
  for (const node of rules || []) {
    if (!node || typeof node !== 'object') continue
    const path = `${base}(${nodeLabel(node)})`
    if (node.props && typeof node.props === 'object') {
      visit(node.props, path, node)
      if (Array.isArray(node.props.rule)) {
        walkRules(node.props.rule, `${path}.props.rule`, visit)
      }
      if (Array.isArray(node.props.columns)) {
        node.props.columns.forEach((col: any, ci: number) => {
          if (Array.isArray(col?.rule)) {
            walkRules(col.rule, `${path}.props.columns[${ci}].rule`, visit)
          }
        })
      }
    }
    if (Array.isArray(node.children)) {
      walkRules(node.children, `${path}.children`, visit)
    }
  }
}

/** 链动作的三类承载点（设计稿 §2）：整组件事件 / 操作按钮 / 列点击 */
function collectActionLists(props: Record<string, any>, nodePath: string): Array<{ actions: any[]; path: string }> {
  const out: Array<{ actions: any[]; path: string }> = []
  if (Array.isArray(props.viewEvents)) {
    props.viewEvents.forEach((ev: any, i: number) => {
      if (Array.isArray(ev?.actions)) out.push({ actions: ev.actions, path: `${nodePath}.props.viewEvents[${i}]` })
    })
  }
  const va = props.viewActions
  if (va && typeof va === 'object') {
    // 持久化键 buttons（schemaTypes.ts:52 ViewActionButton）；链 UI 历史键 actions 兜底
    const btns = Array.isArray(va.buttons) ? va.buttons : Array.isArray(va.actions) ? va.actions : []
    btns.forEach((btn: any, i: number) => {
      const evs = Array.isArray(btn?.events) ? btn.events : []
      evs.forEach((bev: any, j: number) => {
        if (Array.isArray(bev?.actions)) {
          out.push({ actions: bev.actions, path: `${nodePath}.props.viewActions.buttons[${i}].events[${j}]` })
        }
      })
    })
  }
  if (Array.isArray(props.viewColumns)) {
    props.viewColumns.forEach((col: any, i: number) => {
      const cc = col?.onCellClick
      if (Array.isArray(cc?.actions)) {
        out.push({ actions: cc.actions, path: `${nodePath}.props.viewColumns[${i}].onCellClick` })
      }
    })
  }
  return out
}

// ==================== 内部：引用槽位遍历（改写 + 观察） ====================

interface SlotContext {
  /** 旧 ds ID 集合（非委托 target 同名检查用） */
  idValues: Set<string>
  /**
   * 可重映射槽位（原位改写）：props.dataSourceId、总线 source/steps[].target、
   * 委托动作 params[key=target].value。resolve 返回新值；只读扫描时原样返回。
   */
  onRefSlot: (holder: Record<string, any>, key: string, path: string) => void
  onObservation: (issue: RemapReportItem) => void
}

function forEachSlot(schema: PageSchema, ctx: SlotContext): void {
  walkRules(schema.rule, 'rule', (props, path) => {
    if (typeof props.dataSourceId === 'string' && props.dataSourceId) {
      ctx.onRefSlot(props, 'dataSourceId', `${path}.props.dataSourceId`)
    }
    for (const { actions, path: container } of collectActionLists(props, path)) {
      for (let ai = 0; ai < actions.length; ai++) {
        const act = actions[ai]
        const actPath = `${container}.actions[${ai}]`
        if (!act || typeof act.type !== 'string') continue
        if (!CHAIN_ACTIONS.some((a) => a.value === act.type)) {
          ctx.onObservation({
            level: 'warn',
            kind: 'unknown-op',
            path: actPath,
            value: act.type,
            message: `动作类型 ${act.type} 不在 pageActionCatalog 契约内，已原样保留`,
          })
          continue
        }
        const delegated = CONTAINER_OPS.has(act.type as any)
        for (const p of act.params || []) {
          if (!p || typeof p.key !== 'string') continue
          if (p.key === 'target' && typeof p.value === 'string' && p.value) {
            if (delegated) {
              ctx.onRefSlot(p, 'value', `${actPath}.params[key=target]`)
            } else if (ctx.idValues.has(p.value)) {
              ctx.onObservation({
                level: 'warn',
                kind: 'target-like-id',
                path: actPath,
                value: p.value,
                message: `非委托动作 ${act.type} 的 target 参数值恰为数据源 ID，未改写（疑为业务字段同名，请人工确认）`,
              })
            }
          }
          if (act.type === 'script' && p.key === 'source' && typeof p.value === 'string' && p.value.includes('api.')) {
            ctx.onObservation({
              level: 'warn',
              kind: 'script-ref',
              path: actPath,
              value: 'api.',
              message: '脚本引用运行期 api 上下文（pageKey/refId），跨项目导入后需人工复核',
            })
          }
        }
      }
    }
  })
  ;(schema.actions || []).forEach((action: any, i: number) => {
    if (action && typeof action.source === 'string' && action.source) {
      ctx.onRefSlot(action, 'source', `actions[${i}].source`)
    }
    ;(action?.steps || []).forEach((step: any, j: number) => {
      if (step && typeof step.target === 'string' && step.target) {
        ctx.onRefSlot(step, 'target', `actions[${i}].steps[${j}].target`)
      }
    })
  })
}

// ==================== 导出：只读引用扫描 ====================

/**
 * 收集 schema 中全部可重映射 ds 引用槽位（D1–D3）。
 * 用途：删除组件前反查引用、模板保存前悬空检查；不做任何修改。
 */
export function collectDsRefs(schema: PageSchema): DsRef[] {
  const known = new Set(schema.dataSources.map((d) => d.id))
  const refs: DsRef[] = []
  forEachSlot(schema, {
    idValues: known,
    onRefSlot: (holder, key, path) => {
      const value = String(holder[key])
      refs.push({ path, value, dangling: !known.has(value) })
    },
    onObservation: () => {},
  })
  return refs
}

// ==================== 导出：重映射 ====================

/**
 * 按绑定表重映射 schema（纯函数，不修改入参）。
 * bindings 以旧 ds ID 为键；缺条目 → 槽位原样保留并报告 missing-binding（error）。
 * 引用值不在模板 ds 集合 → 置空并报告 dangling（error）。
 */
export function remapPageSchema(
  schema: PageSchema,
  bindings: Record<string, DsBinding>,
): { schema: PageSchema; report: RemapReportItem[] } {
  const next = clone(schema)
  const report: RemapReportItem[] = []
  const known = new Set(next.dataSources.map((d) => d.id))

  const pushOnce = (issue: RemapReportItem) => {
    if (report.some((r) => r.kind === issue.kind && r.path === issue.path && r.value === issue.value)) return
    report.push(issue)
  }

  forEachSlot(next, {
    idValues: known,
    onRefSlot: (holder, key, path) => {
      const value = String(holder[key])
      if (!known.has(value)) {
        report.push({
          level: 'error',
          kind: 'dangling',
          path,
          value,
          message: `引用 ${value} 不在模板数据源集合中，已置空`,
        })
        holder[key] = ''
        return
      }
      const binding = bindings[value]
      if (!binding) {
        pushOnce({
          level: 'error',
          kind: 'missing-binding',
          path,
          value,
          message: `数据源 ${value} 缺少重绑定，相关引用已原样保留`,
        })
        return
      }
      holder[key] = binding.id
    },
    onObservation: pushOnce,
  })

  // D0：dataSources 按绑定重建
  next.dataSources = next.dataSources.map((ds) => {
    const binding = bindings[ds.id]
    if (!binding) {
      pushOnce({
        level: 'error',
        kind: 'missing-binding',
        path: `dataSources(${ds.id})`,
        value: ds.id,
        message: `数据源 ${ds.id} 缺少重绑定，条目原样保留`,
      })
      return ds
    }
    return { ...ds, id: binding.id, refId: binding.refId, searchFields: binding.searchFields ?? [] }
  })

  return { schema: next, report }
}
