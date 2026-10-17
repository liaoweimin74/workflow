/**
 * 动作与事件的唯一清单（single source of truth）。
 *
 * 收敛自五处重复定义：
 *  - components/business/DataSourceConfigPanel.vue（页面/表单级「动作总线」配置 UI）
 *  - views/form/components/DsActionBus.ts（总线运行时类型）
 *  - views/page/components/EventsConfig.vue（组件级事件动作链配置 UI）
 *  - views/page/components/ActionsConfig.vue（操作按钮动作链配置 UI）
 *  - views/page/components/ColumnAdvancedConfig.vue（列点击动作链配置 UI）
 *
 * 两套体系按 level 区分，勿混用：
 *  - bus：页面/表单级 schema.actions，动作步骤用 `op` + 固定参数槽，模板变量 `{row.id}`，
 *    由 views/page/PageRendererPage.vue / views/form/components/FormRenderer.vue 执行。
 *  - chain：组件级（表格/卡片/按钮/列），动作项用 `type` + params 键值对，模板变量 `$row.id`，
 *    由 views/page/components/PageDataTable.vue / PageDataCards.vue 执行。
 *
 * 元数据里的 renderers / configurable 是事实记录，不是理想声明：
 * 改动作实现后须同步这里，配置面板据此过滤，避免出现选了不执行的死选项。
 */

// ==================== 体系 A：页面/表单级动作总线 ====================

/** 总线动作步骤的操作类型 */
export type BusOp =
  | 'set-filter'
  | 'refresh'
  | 'set-value'
  | 'reload-record'
  | 'save-record'
  | 'open-container'
  | 'load-record'
  | 'save-container'
  | 'close-container'

/** 总线触发器（页面级：树/表格/字段/记录变化） */
export type BusTrigger =
  | 'node-click'
  | 'row-click'
  | 'row-edit'
  | 'row-view'
  | 'row-create'
  | 'field-change'
  | 'record-change'

/** 总线步骤可携带的参数槽 */
export type BusStepField = 'target' | 'field' | 'value' | 'recordId'

/** 单个总线动作步骤 */
export interface ActionStep {
  op: BusOp
  /** 目标数据源标识 */
  target: string
  /** set-filter / set-value 的字段名 */
  field?: string
  /** set-filter / set-value 的值模板，reload-record 的记录 ID 模板 */
  value?: string
  /** load-record 的记录 ID 模板（如 {row.id}） */
  recordId?: string
  /**
   * open-container 的显示模式兜底。容器属性面板配置优先：
   * FormRenderer 仅在容器未配置模式时读取（FormRenderer.vue:709），PageRendererPage 完全不读取，
   * 总线面板亦不提供该输入。
   */
  displayMode?: 'dialog' | 'newTab' | 'inline'
}

/** 一条总线动作：触发器 + 来源过滤 + 步骤序列 */
export interface PageAction {
  trigger: BusTrigger
  /** 触发来源数据源（页面内标识；空 = 任意来源触发） */
  source?: string
  steps: ActionStep[]
}

/** 总线动作链条目（DsActionBus.register 入参形态：无 source 过滤） */
export interface ActionLink {
  trigger: string
  steps: ActionStep[]
}

/** 总线 op 的能力声明 */
export interface BusOpMeta {
  value: BusOp
  label: string
  /** 运行时实际读取的参数槽，配置面板据此渲染输入框 */
  fields: BusStepField[]
  /** 是否在总线面板下拉中出现；false = 运行时已支持但暂无配置入口 */
  configurable: boolean
}

/**
 * 总线动作清单。
 * 执行侧：PageRendererPage.executeStep（页面）、FormRenderer（表单）。
 */
export const BUS_OPS: BusOpMeta[] = [
  { value: 'set-filter', label: '设置过滤', fields: ['target', 'field', 'value'], configurable: true },
  { value: 'refresh', label: '刷新数据', fields: ['target'], configurable: true },
  { value: 'set-value', label: '设置字段值', fields: ['target', 'field', 'value'], configurable: false },
  { value: 'reload-record', label: '重载记录', fields: ['target', 'value'], configurable: true },
  { value: 'save-record', label: '保存记录', fields: ['target'], configurable: true },
  { value: 'open-container', label: '打开容器', fields: ['target'], configurable: true },
  { value: 'load-record', label: '加载记录', fields: ['target', 'recordId'], configurable: true },
  { value: 'save-container', label: '保存容器', fields: ['target'], configurable: true },
  { value: 'close-container', label: '关闭容器', fields: ['target'], configurable: true },
]

/** 总线触发器清单 */
export const BUS_TRIGGERS: Array<{ value: BusTrigger; label: string }> = [
  { value: 'node-click', label: '树节点点击' },
  { value: 'row-click', label: '表格行点击' },
  { value: 'row-edit', label: '行编辑' },
  { value: 'row-view', label: '行查看' },
  { value: 'row-create', label: '行新增' },
  { value: 'field-change', label: '字段变化' },
  { value: 'record-change', label: '记录变化' },
]

export function busOpOptions(): Array<{ value: BusOp; label: string }> {
  return BUS_OPS.filter((o) => o.configurable).map(({ value, label }) => ({ value, label }))
}

/** 按 op 取参数槽；未登记的 op 回退到仅 target */
export function busStepFields(op: BusOp): BusStepField[] {
  return BUS_OPS.find((o) => o.value === op)?.fields ?? ['target']
}

export function busTriggerOptions(): Array<{ value: BusTrigger; label: string }> {
  return BUS_TRIGGERS.map(({ value, label }) => ({ value, label }))
}

/**
 * 各触发器 eventData 的模板根（值里的 `{row.id}` 由 PageRendererPage.resolveStepValue
 * 对 eventData 做点路径取值，根名写错就静默取空）。清单需与渲染侧 emit 的形状一致。
 */
export const BUS_EVENT_ROOTS: Record<string, string[]> = {
  'node-click': ['node', 'row', 'record', 'source'],
  'row-click': ['node', 'row', 'source'],
  'row-edit': ['node', 'row', 'source'],
  'row-view': ['node', 'row', 'source'],
  'row-create': ['node', 'row', 'source'],
  'record-change': ['node', 'row', 'record', 'source'],
  'field-change': ['field', 'value', 'record'],
}

/** 记录对象根：可按行字段展开成 {row.xxx}；其余根是标量，直接给根名 */
const ROW_LIKE_ROOTS = new Set(['row', 'node', 'record'])

/** 总线步骤值输入框的 `{...}` 模板候选，按触发器可用根展开行字段 */
export function busTemplateVars(trigger: string, rowFields: string[] = []): string[] {
  const roots = BUS_EVENT_ROOTS[trigger] ?? ['row', 'node', 'source']
  // 记录 id 补齐：数据源 metadata 只给业务列，行数据自带的 id 不在其中，而 {row.id} 恰是最常用模板
  const fields = rowFields.length ? [...rowFields] : ['id']
  if (!fields.includes('id')) fields.push('id')
  return roots.flatMap((root) =>
    ROW_LIKE_ROOTS.has(root) ? fields.map((f) => `{${root}.${f}}`) : [`{${root}}`],
  )
}

// ==================== 体系 B：组件级事件动作链 ====================

/** 组件级动作类型 */
export type ChainActionType =
  | 'set-filter'
  | 'refresh'
  | 'open-detail'
  | 'open-link'
  | 'message'
  | 'open-create'
  | 'edit'
  | 'delete'
  | 'export'
  | 'set-page'
  | 'set-sort'
  | 'clear-selection'
  | 'script'
  | 'new-record'
  | 'open-container'
  | 'close-container'
  | 'load-record'
  | 'save-container'

/** 组件级触发器 */
export type ChainTrigger =
  | 'row-click'
  | 'row-edit'
  | 'row-view'
  | 'row-create'
  | 'search'
  | 'refresh'
  | 'create-success'
  | 'cell-click'
  | 'selection-change'
  | 'current-change'
  | 'dialog-open'
  | 'dialog-close'
  | 'load-success'
  | 'save-success'
  | 'delete-success'

/** 组件级动作的配置入口 */
export type ChainConsumer = 'button' | 'event' | 'cell'

/** 已实现该动作的渲染器 */
export type ChainRenderer = 'table' | 'cards'

/** 动作链参数项（键值对，值支持 $row./$param. 模板） */
export interface EventActionParam {
  key: string
  value: string
}

/** 动作链单个动作 */
export interface EventAction {
  type: ChainActionType | string
  params: EventActionParam[]
}

/** 组件级事件：触发器 + 挂接目标 + 动作序列 */
export interface PageEventConfig {
  trigger: ChainTrigger | string
  /** 事件挂接组件 id，如 table / search / 按钮 key */
  target: string
  actions: EventAction[]
}

/** 操作按钮的自定义事件链（ActionsConfig 只维护 events[0]，trigger 固定 click） */
export interface ButtonEventConfig {
  trigger: 'click'
  actions: EventAction[]
}

/** 列点击动作链（ColumnViewConfig.onCellClick） */
export interface CellClickConfig {
  actions: EventAction[]
}

/** 参数值的输入形态：free=单行文本（$row./$param. 模板）；script=多行代码编辑器；target=容器数据源标识（候选来自设计器上下文，仍可手填） */
export type ChainParamKind = 'free' | 'script' | 'target'

/** 组件级动作的能力声明 */
export interface ChainActionMeta {
  value: ChainActionType
  label: string
  /** 在哪些配置入口出现 */
  consumers: ChainConsumer[]
  /** 哪些渲染器实现了它；空数组 = 尚未接线，选中只产生控制台告警 */
  renderers: ChainRenderer[]
  /** 容器类动作：渲染器不自行实现，转交宿主总线的 runStep 执行（PageRendererPage / FormRenderer） */
  delegated?: boolean
  /** 约定参数 key（resolveParams 结果按这些 key 取值） */
  paramKeys?: string[]
  /** 参数名本身就是业务变量（如 set-filter 的参数名即过滤字段）→ 面板允许增删参数行 */
  dynamicParams?: boolean
  /** 参数值输入形态（键为 paramKeys 中的参数名）；缺省 free */
  paramKinds?: Record<string, ChainParamKind>
  /** 枚举参数的固定候选（键为 paramKeys 中的参数名）；缺省自由输入 */
  paramOptions?: Record<string, string[]>
  /** 参数值说明与模板支持 */
  paramHint?: string
}

/**
 * 组件级动作清单。
 * 执行侧：PageDataTable.dispatchButtonAction、PageDataCards.dispatchButtonAction。
 */
export const CHAIN_ACTIONS: ChainActionMeta[] = [
  {
    value: 'set-filter',
    label: '设置筛选',
    consumers: ['button', 'event', 'cell'],
    renderers: ['table', 'cards'],
    dynamicParams: true,
    paramHint: '参数名即过滤字段，值支持 $row.字段',
  },
  { value: 'refresh', label: '刷新数据', consumers: ['button', 'event', 'cell'], renderers: ['table', 'cards'] },
  { value: 'open-detail', label: '打开详情', consumers: ['button', 'event', 'cell'], renderers: ['table', 'cards'] },
  { value: 'open-link', label: '打开链接', consumers: ['button', 'cell'], renderers: ['table', 'cards'], paramKeys: ['url'] },
  {
    value: 'message',
    label: '消息提示',
    consumers: ['button', 'cell'],
    renderers: ['table', 'cards'],
    paramKeys: ['text', 'type'],
    paramOptions: { type: ['info', 'success', 'warning', 'error'] },
    paramHint: 'type 取 info/success/warning/error',
  },
  { value: 'open-create', label: '打开新建', consumers: ['cell'], renderers: ['table', 'cards'] },
  { value: 'edit', label: '编辑', consumers: ['cell'], renderers: ['table', 'cards'] },
  { value: 'delete', label: '删除', consumers: ['cell'], renderers: ['table', 'cards'] },
  { value: 'export', label: '导出数据', consumers: ['cell'], renderers: ['table', 'cards'] },
  {
    value: 'script',
    label: '脚本',
    consumers: ['button', 'event', 'cell'],
    renderers: ['table', 'cards'],
    paramKeys: ['source'],
    paramKinds: { source: 'script' },
    paramHint: 'source 为 JS 脚本（沙箱执行，上下文 row/ds/actions/params），需 VITE_PAGE_SCRIPT_ENABLED=true 才执行',
  },
  { value: 'set-page', label: '设置分页', consumers: ['event', 'cell'], renderers: ['table'], paramKeys: ['page'] },
  {
    value: 'set-sort',
    label: '设置排序',
    consumers: ['event', 'cell'],
    renderers: ['table'],
    paramKeys: ['field', 'order'],
    paramOptions: { order: ['ascending', 'descending'] },
    paramHint: 'order 取 ascending/descending',
  },
  { value: 'clear-selection', label: '清空选择', consumers: ['event', 'cell'], renderers: ['table'] },
  { value: 'new-record', label: '新增记录', consumers: ['event'], renderers: [] },
  {
    value: 'open-container',
    label: '打开容器',
    consumers: ['button', 'event'],
    renderers: ['table', 'cards'],
    delegated: true,
    paramKeys: ['target'],
    paramKinds: { target: 'target' },
    paramHint: 'target 为容器数据源标识，留空则用本组件自身数据源',
  },
  {
    value: 'close-container',
    label: '关闭容器',
    consumers: ['button', 'event'],
    renderers: ['table', 'cards'],
    delegated: true,
    paramKeys: ['target'],
    paramKinds: { target: 'target' },
  },
  {
    value: 'load-record',
    label: '加载记录',
    consumers: ['button', 'event'],
    renderers: ['table', 'cards'],
    delegated: true,
    paramKeys: ['target', 'recordId'],
    paramKinds: { target: 'target' },
    paramHint: 'recordId 支持 $row.字段，留空取当前行 id',
  },
  {
    value: 'save-container',
    label: '保存容器',
    consumers: ['button', 'event'],
    renderers: ['table', 'cards'],
    delegated: true,
    paramKeys: ['target'],
    paramKinds: { target: 'target' },
  },
]

/** 需宿主总线 runStep 执行的容器动作（渲染器不自行实现容器渲染） */
export const CONTAINER_OPS: ReadonlySet<BusOp> = new Set(
  CHAIN_ACTIONS.filter((a) => a.delegated).map((a) => a.value as BusOp),
)

/** 组件级触发器清单 */
export const CHAIN_TRIGGERS: Array<{ value: ChainTrigger; label: string }> = [
  { value: 'row-click', label: '行点击' },
  { value: 'row-edit', label: '行编辑' },
  { value: 'row-view', label: '行查看' },
  { value: 'row-create', label: '行新增' },
  { value: 'search', label: '搜索' },
  { value: 'refresh', label: '刷新' },
  { value: 'create-success', label: '新增成功' },
  { value: 'cell-click', label: '单元格点击' },
  { value: 'selection-change', label: '行选择变化' },
  { value: 'current-change', label: '当前行变化' },
  { value: 'dialog-open', label: '弹窗打开' },
  { value: 'dialog-close', label: '弹窗关闭' },
  { value: 'load-success', label: '加载记录成功' },
  { value: 'save-success', label: '保存成功' },
  { value: 'delete-success', label: '删除成功' },
]

/** 表格专属触发器（卡片模式过滤；卡片首版未实现 selection/cell 能力） */
export const CHAIN_TABLE_ONLY_TRIGGERS: ReadonlySet<string> = new Set([
  'cell-click',
  'selection-change',
  'current-change',
])

/** 按配置入口取可选动作，未接线的动作不暴露 */
export function chainActionOptions(consumer: ChainConsumer): Array<{ value: ChainActionType; label: string }> {
  return CHAIN_ACTIONS
    .filter((a) => a.consumers.includes(consumer) && a.renderers.length > 0)
    .map(({ value, label }) => ({ value, label }))
}

/** 参数值输入形态（面板据此决定单行文本还是代码编辑器）；未标注一律 free */
export function chainParamKind(actionType: string, paramKey: string): ChainParamKind {
  return CHAIN_ACTIONS.find((a) => a.value === actionType)?.paramKinds?.[paramKey] ?? 'free'
}

/** 参数名候选（面板据此渲染下拉；未声明 paramKeys 的动作无候选，参数名仍由用户自由填写） */
export function chainParamKeyOptions(actionType: string): string[] {
  return CHAIN_ACTIONS.find((a) => a.value === actionType)?.paramKeys ?? []
}

/** 枚举参数的固定候选；未标注一律空数组（面板回落自由输入） */
export function chainParamOptions(actionType: string, paramKey: string): string[] {
  return CHAIN_ACTIONS.find((a) => a.value === actionType)?.paramOptions?.[paramKey] ?? []
}

/** 参数行视图项：custom 表示契约外的遗留键（面板给只读参数名 + 可删） */
export interface ChainParamView {
  key: string
  value: string
  custom: boolean
}

/**
 * 面板参数区的数据源：固定契约动作按 paramKeys 顺序成行（缺失补空占位），
 * 契约外已填值的遗留键（历史脏数据）附在后面并标 custom 供用户清理；
 * 动态参数动作（set-filter，参数名即业务字段）原样返回，空值垃圾键丢弃。
 */
export function chainParamView(actionType: string, params: EventActionParam[] = []): ChainParamView[] {
  const meta = CHAIN_ACTIONS.find((a) => a.value === actionType)
  if (meta?.dynamicParams) return params.map((p) => ({ ...p, custom: false }))
  // 契约明确不接收参数的动作（刷新数据/打开详情/清空选择…）：执行侧根本不读参数，
  // 把历史残留渲染成可填行只会误导，故整块参数区不出；未登记类型仍照旧显示，避免静默藏数据。
  if (meta && !(meta.paramKeys?.length ?? 0)) return []
  const known = new Set(meta?.paramKeys ?? [])
  return syncActionParams(actionType, params).map((p) => ({
    ...p,
    custom: !!p.key && !known.has(p.key),
  }))
}

/** 参数行能否增删改参数名：仅参数名本身是业务变量的动作（其余动作参数由契约固定） */
export function chainParamsEditable(actionType: string): boolean {
  return !!CHAIN_ACTIONS.find((a) => a.value === actionType)?.dynamicParams
}

/**
 * 切换动作类型时补齐约定参数：同名参数保留已填值。
 * 约定外的参数只在已填值时保留（空值是上一个动作自动生成的行，留着就是垃圾参数）；
 * 未声明 paramKeys 的动作（如 set-filter 的参数名就是过滤字段）原样返回，避免抹掉用户数据。
 */
export function syncActionParams(actionType: string, existing: EventActionParam[] = []): EventActionParam[] {
  const keys = chainParamKeyOptions(actionType)
  if (keys.length === 0) return existing
  const known = new Set(keys)
  return [
    ...keys.map((key) => ({ key, value: existing.find((p) => p.key === key)?.value ?? '' })),
    ...existing.filter((p) => p.key && !known.has(p.key) && p.value),
  ]
}

/**
 * 换动作类型时的参数重置（仅面板 patchAction 用；参数行每次写入仍走 syncActionParams，
 * 那条路径要保留历史脏数据供用户清理，两者语义不同）。
 * - 新动作有契约参数：只按新契约成行，契约外旧键丢弃（上一个动作的键在新语义下无意义）
 * - 动态参数动作（set-filter）：整包参数会被当作过滤字段，旧键留着即错筛，换入即清空
 * - 无参数动作：参数不参与执行，原样保留，便于用户切回原动作时不丢已填字段
 */
export function retargetActionParams(actionType: string, existing: EventActionParam[] = []): EventActionParam[] {
  const keys = chainParamKeyOptions(actionType)
  if (keys.length > 0) {
    return keys.map((key) => ({ key, value: existing.find((p) => p.key === key)?.value ?? '' }))
  }
  if (chainParamsEditable(actionType)) return []
  return existing
}

/** 按展示模式取触发器候选（card 过滤表格专属） */
export function chainTriggerOptions(mode: 'table' | 'card' = 'table'): Array<{ value: ChainTrigger; label: string }> {
  return mode === 'card'
    ? CHAIN_TRIGGERS.filter((t) => !CHAIN_TABLE_ONLY_TRIGGERS.has(t.value))
    : [...CHAIN_TRIGGERS]
}

/** 触发器中文标签（旧数据在候选外时的兜底展示） */
export function chainTriggerLabel(value: string): string {
  return CHAIN_TRIGGERS.find((t) => t.value === value)?.label ?? value
}
