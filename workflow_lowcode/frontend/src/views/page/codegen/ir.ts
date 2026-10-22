/**
 * 出码中间表示（IR）：schema → IR → template 的中间层。
 *
 * 本模块只声明目标无关的数据形状与纯字符串工具，不 import form-create / vue / element-plus，
 * 也不 import 契约表 —— 节点分类由 parse 阶段按契约写入，后续移动端目标可以只消费这些类型。
 */

export interface Warning {
  kind: string
  path: string
  message: string
  elidedValue?: unknown
}

export interface Rename {
  from: string
  to: string
  evidence?: string
  note?: string
}

export interface NodeHost {
  tag: string | null
  ref: string | null
  /** 字段控件的 v-model 路径，回导侧用它把模板元素和 schema 节点对上 */
  vmodel?: string
}

export interface NodeArtifact {
  id: string
  rulePath: string
  type: string
  field: string
  anchor: string
  file: string
  host: NodeHost
  /** 元素上的属性即 schema props 的证据（runtime 组件与字段控件）：回导侧按绑定重建 props */
  propsFrom?: 'bindings'
  displayMode?: string
  displayModeSource?: string
  dropped: string[]
  renames: Rename[]
  wireOnly: string[]
  warnings: Warning[]
  /** 整节点降级（没有可承载它的模板位置）：元素不出，键全部按丢弃登记，产物也不 import 它 */
  degraded?: boolean
}

export interface Behavior {
  id: string
  origin: string
  trigger: string
  /** schema 没写就不兜空串：兜出来的空值回导即凭空多出一键 */
  source?: string
  steps: Array<Record<string, unknown>>
  resolvedTarget?: string
  /** 只有产物真生成了对应分支才指认；没有按钮承载时缺省，避免“登记了”被读成“执行了” */
  implementedBy?: { file: string; function: string; case?: string }
  warnings: Warning[]
}

export interface Unsupported {
  path: string
  type: string
  key: string
  message: string
}

export interface GeneratedManifest {
  kind: 'page-codegen-manifest'
  manifestVersion: number
  generator: string
  source: { pageKey: string; pageName: string; schemaDigest: string; digestRule: string; exportedAt: string }
  runtime: { package: string; sdkVersion: string; components: string[]; note: string }
  contract: {
    comment: string
    registers: Record<string, string>
    dropKinds: string[]
    defaults: Record<string, unknown>
  }
  nodes: NodeArtifact[]
  /**
   * 逐源登记，与 schema.dataSources 同序同数。
   * bindings = 消费该源的节点；warnings = 数据源级丢弃（path 是页面级绝对路径，不像节点那样相对）。
   */
  dataSources: Array<{
    path: string
    id: string
    refId: string
    apiModule: string
    bindings: string[]
    warnings: Warning[]
  }>
  behaviors: Behavior[]
  unsupported: Unsupported[]
  identity: { policy: string }
}

/** 空洞归因桶（口径见 report.ts）：A 广度债 / B 页面骨架债 / C 保真度 bug（Gate 要求恒 0） */
export type HoleBucket = 'A' | 'B' | 'C'

/** 采集到的组件节点：blocked 非空 = 出码器走不到这里，值为最外层阻断点归因 */
export interface ReportNode {
  type: string
  /** schema 路径，与 manifest.nodes[].rulePath 同一坐标系：rule[0] / rule[0].props.rule[2] */
  path: string
  propsKeys: string[]
  blocked: string | null
}

/** 回读空洞 + 归因（字段与 reverse.ts 的 Hole 结构化重述：IR 模块不许 import 回读器） */
export interface ReportHole {
  path: string
  kind: string
  bucket: HoleBucket
  /** 空洞落在哪个组件子树上（最深的那个节点类型）；B 桶没有归属 */
  owner: string
  expected?: unknown
  actual?: unknown
}

export interface ReportRenameFailure {
  path: string
  to: string
  bucket: HoleBucket
  artifact?: unknown
  schema?: unknown
}

/**
 * 出码报告（design D6）：随每次 generatePage 返回，由语料体检测试与脚本消费，不建 UI、不进产物。
 * 四块内容对应 spec 的四条要求；数字全部来自本次生成的 manifest 与当场回读，报告自己不判定。
 */
export interface GenerateReport {
  reportVersion: 1
  pageKey: string
  codegenRate: {
    totalNodes: number
    registeredNodes: number
    emittableNodes: number
    /** 无组件节点的页面记 1（没有债可出），避免 0/0 */
    rate: number
  }
  buckets: { A: number; B: number; C: number }
  holes: ReportHole[]
  renameFailures: ReportRenameFailure[]
  unsupported: Unsupported[]
  /** 四张登记表计数：warnings 跨节点级 / 行为级 / 数据源级 */
  registryCounts: { dropped: number; warnings: number; renames: number; wireOnly: number }
  nodes: ReportNode[]
}

export interface GenerateResult {
  files: Record<string, string>
  manifest: GeneratedManifest
  report: GenerateReport
}

/** 节点的目标端语义类别：模板生成只按类别决定怎么摆，不再回头读 schema/契约 */
export type IrKind = 'list' | 'container' | 'field' | 'display' | 'layout' | 'data' | 'option'

/**
 * 一个目标属性。字面量由各目标自行序列化；数据源引用保留 id，由目标决定怎么取表；
 * 具名常量在 parse 阶段已登记，emit 只负责引用，保证常量命名与去重顺序稳定。
 */
export type IrPropValue =
  | { kind: 'literal'; value: unknown }
  | { kind: 'const'; constName: string }
  | { kind: 'dsRef'; sourceId: string }
  | { kind: 'globalDataSourceId'; sourceId: string }

export interface IrProp {
  name: string
  value: IrPropValue
  /** schema 相对路径：具名常量的证据与回读核对都靠它 */
  hint: string
}

export interface IrConfig {
  name: string
  obj: Record<string, unknown>
}

export interface IrNestedColumn {
  index: number
  node: NodeArtifact
  label: string
  hidden: boolean
  children: IrNode[]
}

/** 嵌套容器的目标无关形态：值挂在哪个地址、行别名与列登记 */
export interface IrNested {
  carrier: 'props.rule' | 'props.columns[].rule'
  shape: 'array' | 'object'
  valuePath: string
  rowVar: string
  rowKeys: string[]
  columns: IrNestedColumn[]
}

/** 回写语义：选择器带回的字段目标与 handler 名（handler 体由目标生成） */
export interface IrWriteback {
  nodeId: string
  rulePath: string
  type: string
  field: string
  idTarget?: string
  map?: Record<string, string>
  select: string
  clear: string
}

/** 注入语义：组件声明过的后端 prop 与 parse 阶段登记的常量名 */
export interface IrInjection {
  nodeId: string
  rulePath: string
  type: string
  prop: string
  constName: string
}

export interface IrNode {
  artifact: NodeArtifact
  kind: IrKind
  tag: string | null
  /** 元素上带 lc:node 地址（展示组件/嵌套容器；字段控件靠 v-model 寻址） */
  marker: boolean
  props: IrProp[]
  attrs: Record<string, Record<string, unknown>>
  /** 锚点里携带的 schema 值（如 ds=数据源 id）：注释是回读侧对回节点的证据 */
  anchorKv?: Record<string, string>
  config?: IrConfig
  children: IrNode[]
  nested?: IrNested
  /** fcTable 的几何：可见格（home）带跨度与被覆盖的 slot 地址，子节点已按 slot 分进 cells */
  table?: IrTable
  /**
   * 整节点降级（页面级嵌套容器没有 form 后端、隐藏列首版不出码）：不渲染元素，
   * 改为逐键登记丢弃 + 一行 lc:todo 挂点。登记齐了回读仍零空洞，债记在 unsupported 上。
   */
  degraded?: boolean
  degradeReason?: string
  /** 本节点所有有落点的 schema 相对路径（applyLeaves 记录）：降级时整份转成丢弃登记 */
  leafPaths?: string[]
  /** dash-filter 广播的源：筛选器且 autoBroadcast 未关（契约 dashFilter='source'） */
  filterSource?: boolean
  /** dash-filter 广播的目标：挂载后上报实例、暴露 setFilter（契约 dashFilter='target'） */
  filterTarget?: boolean
  writeback?: IrWriteback
  injection?: IrInjection
  /**
   * 列表节点实际绑定的产物事件（契约 list.events 里 when='chain' 的出口只在该节点真有链时进这里）：
   * emit 端只按这份列表绑事件，回读端也按它登记 wireOnly，两边不会各算一遍。
   */
  outlets?: IrEventOutlet[]
}

/** 产物事件出口：组件 emit 名 → 产物 handler 名 */
export interface IrEventOutlet {
  on: string
  handler: string
}

/**
 * 动作链参数值：字面片段 + $row.字段 / $param.参数 取值。
 * parse 阶段拆好，emit 阶段展开成表达式 —— 产物里不留字符串模板，运行期不再解析。
 */
export type IrTemplatePart =
  | { kind: 'text'; text: string }
  | { kind: 'row'; field: string }
  | { kind: 'param'; key: string }

export interface IrChainArg {
  name: string
  parts: IrTemplatePart[]
}

/**
 * 链步骤要在产物里落地的材料（parse 判定，emit 据此补 import/常量/helper）。
 * 产物没有的材料一律走 unsupported，不在这里兜底 —— needs 出现即代表这步真会执行。
 */
export type ChainNeed = 'message' | 'router' | 'route' | 'export' | 'page' | 'http'

export interface IrChainStep {
  /** chain 动作类型（pageActionCatalog 的 CHAIN_ACTIONS.value）或总线 op */
  op: string
  args: IrChainArg[]
  /** schema 相对路径：登记与回读定位 */
  path: string
  /** 产物侧要备的材料（import / 常量 / helper） */
  needs?: ChainNeed[]
  /** op=script：白名单扫描通过的脚本体、产物里的函数名与形参（只用 row 时才带行参） */
  script?: { fn: string; body: string; params: string }
}

/** 一条判定可在产物里执行的动线：编译进哪个 handler 由 outlet 决定 */
export interface IrChain {
  id: string
  /** button=按钮链，cell=列链，view=组件链（props.viewEvents），bus=页面动作总线 */
  kind: 'button' | 'cell' | 'view' | 'bus'
  /** 载体列表节点 */
  nodeId: string
  rulePath: string
  /** 按钮 key / 列 prop / 组件链的 ev.target / 总线动作的 source */
  key: string
  trigger: string
  /** 编译进的产物 handler（onButtonClick / onCellClick / onRowClick / ...） */
  outlet: string
  /** 载体列表实例名：调实例方法的步骤都打这个 ref（拿不到 ref 的步骤在 parse 已被拒） */
  ref: string | null
  /** 出口给不给得到行对象（selection-change / sort-change 没有行） */
  hasRow: boolean
  steps: IrChainStep[]
  /** 容器动作的打开语义（row-view → 只读）：产物没有运行期总线，模式在生成期定死 */
  readonly?: boolean
  mode?: 'create' | 'edit' | 'view'
}

/** fcTable 的一个可见单元格（被合并覆盖的格不在 cells 里，地址进 home 的 coveredSlots） */
export interface IrTableCell {
  /** 左上角坐标（0 基） */
  row: number
  col: number
  rowspan: number
  colspan: number
  /** home 地址 "行:列" */
  slot: string
  /** 被本格合并覆盖的地址（不含 home），顺序与 Table.vue 的 lattice.slot 一致 */
  coveredSlots: string[]
  children: IrNode[]
  /** rule.style[slot] */
  style?: Record<string, unknown>
  /** rule.class[slot]（组件按字符串渲染到 td 的 class） */
  className?: string
}

/** fcTable 的几何载体：模板端只按坐标画，回读端从 td 坐标反推 */
export interface IrTable {
  rows: number
  cols: number
  cells: IrTableCell[]
  layout: Array<{ top: number; left: number; row: number; col: number }>
  /** props.rule.style 原值（逐格取用；只含 home 地址） */
  style: Record<string, unknown>
  /** props.rule.class 原值（逐格取用；只含 home 地址） */
  className: Record<string, unknown>
}

export interface IrOption {
  node: NodeArtifact
  attrs: Record<string, Record<string, unknown>>
}

export interface IrDataSource {
  path: string
  id: string
  refId: string
  apiModule: string
  bindings: string[]
  warnings: Warning[]
}

/** 动作总线的产物分支（语义化）：模板端按目标语言生成 case */
export type IrSwitchCase =
  | { kind: 'open'; key: string; readonly: boolean; mode: 'create' | 'edit' | 'view'; nodeId?: string }
  | { kind: 'delete'; key: string; nodeId?: string }
  /** 按钮配了动作链：case 体来自 ir.chains（链消费点击，兜底行为不再出现），按 nodeId+key 取 */
  | { kind: 'chain'; key: string; nodeId: string }

export interface IrPage {
  pageKey: string
  pageName: string
  exportedAt: string
  schemaDigest: string
  file: string
  apiFile: string
  containerMode: string
  containerModeSource: string
  nodes: IrNode[]
  option: IrOption
  dataSources: IrDataSource[]
  behaviors: Behavior[]
  switchCases: IrSwitchCase[]
  /** 动作链（按钮/列/组件/总线）：parse 判可行性，emit 按 outlet 编译进 handler */
  chains: IrChain[]
  /** 具名常量：按生成顺序保存，模板端直接按序序列化 */
  consts: Array<[string, unknown]>
  unsupported: Unsupported[]
  writeDashFilter: boolean
  writebacks: IrWriteback[]
  injections: IrInjection[]
}

/** 清单顺序：节点 → 子节点 → 嵌套列的登记与列内子节点（回读按此顺序核对） */
export function flattenIrNodes(nodes: IrNode[]): NodeArtifact[] {
  const out: NodeArtifact[] = []
  const walk = (p: IrNode) => {
    out.push(p.artifact)
    p.children.forEach(walk)
    for (const c of p.nested?.columns || []) {
      out.push(c.node)
      c.children.forEach(walk)
    }
  }
  nodes.forEach(walk)
  return out
}

// ==================== 纯字符串工具（与目标语言无关的命名规则）====================

export const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
export const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
/** 字段名 → 标识符片段：业务字段大量是蛇形（delivery_plan），常量与 handler 名要转驼峰 */
export const camelField = (s: string) => s.replace(/[-_]+([a-zA-Z0-9])/g, (_, c: string) => c.toUpperCase())
export const pascal = (s: string) =>
  s
    .split('-')
    .filter(Boolean)
    .map((x) => x[0].toUpperCase() + x.slice(1))
    .join('')
export const leafName = (rel: string) => rel.split('.').pop()!.replace(/\[\d+\]$/, '')
export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
