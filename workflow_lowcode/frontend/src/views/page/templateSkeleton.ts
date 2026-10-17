/**
 * 骨架模板化：全量页面 schema → 骨架模板 schema（纯函数，不依赖 Vue、不修改入参）。
 *
 * 设计语义（与用户确认的方案一致）：
 * - 保留「槽位 + 联动拓扑」：dataSources 条目（id 保留、refId/searchFields 清空、label 自动生成）、
 *   组件 props.dataSourceId、总线 trigger/source/steps 的 op/target、链动作的 trigger 与 params[target]。
 * - 清空「数据语义」：字段级配置（列、字段映射、筛选字段、field/value 参数、$row 模板、脚本）。
 *   实例化绑槽位后，字段配置在设计器里重配。
 * - 契约外动作（pageActionCatalog 之外的遗留类型）原样保留，不做判定。
 *
 * 组件清空规则按 type 列表驱动；未知组件类型不动 props（只走通用链/总线规则），避免误删。
 */

import { CHAIN_ACTIONS } from '@/types/pageActionCatalog'
import { walkRules, collectDsRefs, type PageSchema } from './templateSchema'

// ==================== 链动作参数白名单 ====================

/**
 * 各链动作骨架化后保留的参数 key（target = 槽位引用，一律保留）。
 * 未列出的契约内动作只保留 target；set-filter 参数名即业务字段 → 全清。
 */
const CHAIN_KEEP_KEYS: Record<string, string[]> = {
  'open-container': ['target'],
  'close-container': ['target'],
  'save-container': ['target'],
  'load-record': ['target'],
  message: ['text', 'type'],
  'set-page': ['page'],
  'set-sort': ['order'],
}

function skeletonizeChainAction(act: any): void {
  const meta = CHAIN_ACTIONS.find((a) => a.value === act.type)
  if (!meta) return // 契约外遗留动作原样保留
  const keep = new Set(CHAIN_KEEP_KEYS[act.type] ?? ['target'])
  if (meta.dynamicParams) {
    // 参数名即业务字段（set-filter）：整包都是数据语义
    act.params = []
    return
  }
  act.params = (act.params || []).filter((p: any) => p && keep.has(p.key))
}

// ==================== 总线步骤清空 ====================

function skeletonizeBusStep(step: any): void {
  if (!step || typeof step !== 'object') return
  switch (step.op) {
    case 'set-filter':
    case 'set-value':
      delete step.field
      delete step.value
      break
    case 'reload-record':
      delete step.value
      break
    case 'load-record':
      delete step.recordId
      break
  }
}

// ==================== 组件 props 清空表 ====================

type PropsCleaner = (props: Record<string, any>) => void

const PROP_CLEANERS: Record<string, PropsCleaner> = {
  'page-table': (p) => {
    p.columns = []
    p.sortableFields = []
    p.searchFields = []
    p.viewColumns = [] // ViewDesigner 时代的列载体（含 onCellClick 链），一并清
    if (p.viewActions && typeof p.viewActions === 'object') {
      for (const b of p.viewActions.buttons || []) {
        if (b && typeof b === 'object') b.visible = ''
      }
    }
  },
  'page-list-cards': (p) => {
    p.columns = []
    p.groupBy = ''
    delete p.styleRule // 卡片样式脚本可能引用 $row 字段
  },
  'page-tree': (p) => {
    p['node-key'] = 'id'
    p.props = { label: 'name', children: 'children' }
  },
  'page-detail': (p) => {
    p.columns = []
  },
  'page-tree-table': (p) => {
    p.columns = []
    p.idKey = 'id'
    p.parentKey = 'parentId'
  },
  'page-chart': (p) => {
    p.config = null // 维度/指标配置
  },
  dataPicker: (p) => {
    p.columns = []
    p.displayField = ''
    p.searchColumns = []
  },
  LookupPicker: (p) => {
    p.columns = []
    p.displayField = ''
    p.returnFields = {}
    p.idField = ''
  },
  'dash-kpi': (p) => {
    p.metric = null
    p.trendField = ''
  },
  'dash-chart': (p) => {
    p.metric = null
    p.group = ''
  },
  'dash-filter': (p) => {
    p.field = ''
  },
  'dash-goal': (p) => {
    p.metric = null
    p.field = ''
  },
  'dash-leaderboard': (p) => {
    p.metric = null
    p.group = ''
  },
  'dash-alert': (p) => {
    p.field = ''
  },
  // 表单容器：子字段组件绑定 ds 列，骨架只留容器壳
  formContainer: (p) => {
    p.rule = []
  },
}

// ==================== 槽位 label 自动生成 ====================

/** 从引用扫描结果提取组件标签（路径形如 rule(page-tree#tree1).props.dataSourceId）；
 *  总线 source/steps.target 的路径无组件括号，跳过（槽位通常也被组件引用，总线只作兜底提示）。
 *  优先级：用户指定 > 数据源条目 name > 组件标签 > ds id。 */
function slotLabels(schema: PageSchema, overrides?: Record<string, string>): Record<string, string> {
  const byDs = new Map<string, Set<string>>()
  for (const ref of collectDsRefs(schema)) {
    const m = ref.path.match(/\(([^()#]+)#([^)]+)\)/)
    if (!m) continue
    if (!byDs.has(ref.value)) byDs.set(ref.value, new Set())
    byDs.get(ref.value)!.add(`${m[1]}#${m[2]}`)
  }
  const out: Record<string, string> = {}
  for (const ds of schema.dataSources) {
    if (overrides?.[ds.id]) {
      out[ds.id] = overrides[ds.id]
      continue
    }
    const dsName = typeof ds.name === 'string' ? ds.name.trim() : ''
    if (dsName) {
      out[ds.id] = dsName
      continue
    }
    const tags = byDs.get(ds.id)
    out[ds.id] = tags && tags.size ? [...tags].slice(0, 3).join(' + ') + (tags.size > 3 ? ` 等${tags.size}处` : '') : ds.id
  }
  return out
}

// ==================== 导出 ====================

/**
 * 骨架化（纯函数）：dataSources 槽位化（label 默认取数据源 name，可由 slotLabels 覆盖），
 * 组件数据语义清空，联动拓扑（总线 op/target、链 target、dataSourceId）保留。
 * slotLabels：调用方（另存为模板对话框）收集的用户自定义锚点名，键为旧 ds id。
 */
export function skeletonizePageSchema(schema: PageSchema, slotLabelOverrides?: Record<string, string>): PageSchema {
  const next: PageSchema = JSON.parse(JSON.stringify(schema))

  const labels = slotLabels(schema, slotLabelOverrides)
  for (const ds of next.dataSources) {
    ds.refId = ''
    ds.searchFields = []
    ds.label = labels[ds.id] || ds.id
  }

  walkRules(next.rule, 'rule', (props, _path, node) => {
    const clean = PROP_CLEANERS[node.type]
    if (clean) clean(props)
    const lists: any[][] = []
    if (Array.isArray(props.viewEvents)) {
      for (const ev of props.viewEvents) if (Array.isArray(ev?.actions)) lists.push(ev.actions)
    }
    const va = props.viewActions
    if (va && typeof va === 'object') {
      const btns = Array.isArray(va.buttons) ? va.buttons : Array.isArray(va.actions) ? va.actions : []
      for (const btn of btns) {
        for (const bev of btn?.events || []) if (Array.isArray(bev?.actions)) lists.push(bev.actions)
      }
    }
    if (Array.isArray(props.viewColumns)) {
      for (const col of props.viewColumns) if (Array.isArray(col?.onCellClick?.actions)) lists.push(col.onCellClick.actions)
    }
    for (const actions of lists) for (const act of actions) skeletonizeChainAction(act)
  })

  // 总线步骤清空
  for (const action of next.actions || []) {
    for (const step of action?.steps || []) skeletonizeBusStep(step)
  }

  return next
}
