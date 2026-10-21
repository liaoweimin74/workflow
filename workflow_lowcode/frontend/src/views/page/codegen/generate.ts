/**
 * 出码器 spike 1：PageSchema → 可运行 SFC 产物 + manifest 登记表。
 *
 * 登记表（丢弃 / 重命名派生 / 归属剥离 / 默认省略）不手写，全部由 contract.ts 的
 * 组件能力表算出来 —— 这是 spike 0 的核心结论：产物模板承载不了 schema 的全部语义，
 * 而手写登记表会在加组件时腐烂。
 *
 * 边界（超出即 unsupported，出码报告里是 error，不静默丢）：
 *  - 组件契约见 contract.ts：列表组件 page-table / page-list-cards、容器 formContainer、
 *    字段控件 input / textarea / inputNumber / datePicker / dataPicker / LookupPicker、
 *    展示组件族 dash-filter / dash-kpi / dash-chart / dash-notice / dash-todo
 *  - group / tableForm / subForm 等嵌套容器、fcTable 栅格与 page-chart 仍未登记，整节点算广度债
 *  - 动作流只认总线容器动作 + 按钮内建行为；配了动作链的按钮不出码
 *  - 事件脚本（type=script）不出码
 */

import {
  DATA_SOURCE_CONTRACT,
  IDENTITY_KEYS,
  OPTION_CONTRACT,
  STRUCT_DEFAULTS,
  TYPE_CONTRACTS,
  isFieldType,
  listOf,
  widgetOf,
  type PropEmit,
  type TypeContract,
} from './contract'

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
}

export interface Behavior {
  id: string
  origin: string
  trigger: string
  /** schema 没写就不兜空串：兜出来的空值回导即凭空多出一键 */
  source?: string
  steps: Array<Record<string, unknown>>
  resolvedTarget?: string
  implementedBy: { file: string; function: string; case?: string }
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

export interface GenerateResult {
  files: Record<string, string>
  manifest: GeneratedManifest
}

interface Leaf {
  /** schema 内相对路径，如 props.viewActions.buttons */
  path: string
  value: unknown
  entry: PropEmit | null
  /** 该叶子所在原子值的路径（props.columns[0].onCellClick 挂在 props.columns 下） */
  under?: string
}

/** 契约表的 props 键不带 props. 前缀，展平时补上（登记表里的 path 要能直接定位 schema） */
function prefixTable(base: string, table: Record<string, PropEmit>): Record<string, PropEmit> {
  return Object.fromEntries(Object.entries(table).map(([k, v]) => [`${base}.${k}`, v]))
}

/** 字段写回（contract.writes）：组件 select/clear 的产物侧显式化，handler 名在 assembleVue 分配 */
interface Writeback {
  nodeId: string
  rulePath: string
  type: string
  field: string
  /** props.<writes.idKey>：选中记录 id 写入的表单字段 */
  idTarget?: string
  /** props.<writes.mapKey>：key=被查表的源字段，value=表单目标字段 */
  map?: Record<string, string>
  select?: string
  clear?: string
}

/** 出码上下文：跨节点共享的常量表、告警收集与容器展示方式 */
interface Ctx {
  unsupported: Unsupported[]
  consts: Map<string, unknown>
  containerMode: string
  containerModeSource: string
  /** 主 SFC 产物名（由 pageKey 转大驼峰） */
  file: string
  /** 数据源被谁消费：schema.dataSources[i].id → 消费节点 rulePath，逐源登记的依据 */
  dsUse: Map<string, string[]>
  /** 产物常量 ds 只表示 dataSources[0]；绑其他源的组件必须走 dataSources 表取 refId */
  firstDsId: string
  /** 页面 key：现网由渲染器注入给数据组件的 props.pageKey，产物侧要自己传 */
  pageKey: string
  /** 带回声明（LookupPicker 等 contract.writes）：节点 id → 写回目标 */
  writes: Map<string, Writeback>
}

interface NodePlan {
  node: NodeArtifact
  tag: string
  propSnippets: string[]
  attrs: Record<string, Record<string, unknown>>
  anchorKv: Record<string, string>
  children: NodePlan[]
}



const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
const pascal = (s: string) => s.split('-').filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1)).join('')
const leafName = (rel: string) => rel.split('.').pop()!.replace(/\[\d+\]$/, '')
const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

function lit(v: unknown): string {
  if (typeof v === 'string') return `'${v.replace(/'/g, "\\'")}'`
  return JSON.stringify(v)
}

/** 数组下标 → [] 模式，用于在原子值内部再扫一遍深层登记（列点击链就靠它兜住） */
function patternize(path: string): string {
  return path.replace(/\[\d+\]/g, '[]')
}

/**
 * 按契约表把值拆成叶子：命中即整体落点（数组/对象不再下钻），
 * 未命中才下钻；下钻到叶子仍无契约 → entry=null（调用方记 unsupported）。
 */
function flatten(value: unknown, path: string, table: Record<string, PropEmit>, out: Leaf[] = [], under?: string): Leaf[] {
  const hit = table[path]
  if (hit) {
    out.push({ path, value, entry: hit, under })
    // 原子值内部再扫一遍带 [] 的深层登记：整块出码不等于块里的东西都有落点
    scanNested(value, path, table, out)
    return out
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => flatten(v, `${path}[${i}]`, table, out, under))
    return out
  }
  if (isPlainObject(value)) {
    for (const k of Object.keys(value)) flatten(value[k], path ? `${path}.${k}` : k, table, out, under)
    return out
  }
  out.push({ path, value, entry: null, under })
  return out
}

/** 原子值内部还要登记的深层键：viewDetail.formMode 这类精确路径 + columns[].onCellClick 这类下标模式 */
function deepKeys(base: string, table: Record<string, PropEmit>): string[] {
  return Object.keys(table).filter((k) => k.startsWith(`${base}.`) || (k.includes('[]') && k.startsWith(`${base}[`)))
}

function scanNested(value: unknown, base: string, table: Record<string, PropEmit>, out: Leaf[]): void {
  const deep = deepKeys(base, table)
  if (!deep.length) return
  const walk = (v: unknown, p: string) => {
    const pat = patternize(p)
    if (table[p] || (!p.endsWith('[]') && deep.includes(pat))) {
      out.push({ path: p, value: v, entry: table[p] || table[pat], under: base })
      return
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${p}[${i}]`))
    else if (isPlainObject(v)) for (const k of Object.keys(v)) walk(v[k], `${p}.${k}`)
  }
  if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${base}[${i}]`))
  else if (isPlainObject(value)) for (const k of Object.keys(value)) walk(value[k], `${base}.${k}`)
}

/** 展示方式 → 容器标签（尺寸属性名见 containerSizeAttrOf：drawer 吃 size，dialog 吃 width） */
function containerTag(mode: string): string {
  if (mode === 'drawer') return 'el-drawer'
  if (mode === 'inline') return 'div'
  return 'el-dialog'
}

/** 具名常量：对象/数组配置提到 script 顶层，回导侧才能静态解析出值 */
function addConst(ctx: Ctx, hint: string, value: unknown): string {
  const base = leafName(hint)
  let name = base
  let i = 2
  while (ctx.consts.has(name) && JSON.stringify(ctx.consts.get(name)) !== JSON.stringify(value)) name = `${base}${i++}`
  ctx.consts.set(name, value)
  return name
}

/** prop 片段：简单值内联，对象/数组配置提到顶层常量 */
function propSnippet(ctx: Ctx, name: string, value: unknown, hint: string): string {
  if (typeof value === 'string') {
    // 带引号的字符串（dash 组件级 filter 是 JSON 文本）不能裸写进属性：filter="{"a":1}" 在第一个
    // 双引号处就把属性截断了。HTML 属性不认反斜杠转义，只能具名化成常量再用 v-bind 引它。
    if (value.includes('"') || value.includes("'")) return `:${kebab(name)}="${addConst(ctx, hint, value)}"`
    return `${kebab(name)}="${value}"`
  }
  if (typeof value === 'boolean' || typeof value === 'number') return `:${kebab(name)}="${lit(value)}"`
  // 空数组必须走常量：`:x="[]"` 字面上好看，回导侧解析器会把它读成一个空字符串元素
  if (Array.isArray(value) && value.length && value.every((x) => typeof x === 'number')) return `:${kebab(name)}="${lit(value)}"`
  return `:${kebab(name)}="${addConst(ctx, hint, value)}"`
}

/** 整块出码的值里，被登记丢弃的深层键要先剥掉（列点击链：链跟着 columns 一起出去了就是谎） */
function stripPaths(value: unknown, paths: string[]): unknown {
  if (!paths.length) return value
  const clone = JSON.parse(JSON.stringify(value)) as unknown
  for (const p of paths) delPath(clone, p)
  return clone
}

function delPath(obj: any, path: string): void {
  const seg = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur = obj
  for (let i = 0; i < seg.length - 1; i++) {
    cur = cur?.[seg[i]]
    if (cur == null) return
  }
  delete cur?.[seg[seg.length - 1]]
}

// ==================== 入口 ====================

export function generatePage(
  schema: { rule: any[]; option: any; dataSources: any[]; actions: any[] },
  meta: { pageKey: string; pageName: string; exportedAt: string },
): GenerateResult {
  // 页面主体（列表组件）：容器展示方式与两处尺寸冲突都以它的 viewDetail 为准
  const listNode = (schema.rule || []).find((r) => listOf(r?.type))
  // 容器展示方式由列表组件的 viewDetail.formMode 决定，schema.displayMode 运行期不生效
  const ctx: Ctx = {
    unsupported: [],
    consts: new Map(),
    containerMode: listNode?.props?.viewDetail?.formMode || 'popup',
    containerModeSource: 'rule[].props.viewDetail.formMode',
    file: `${meta.pageKey
      .split(/[-_]+/)
      .filter(Boolean)
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join('')}.vue`,
    dsUse: new Map(),
    firstDsId: String(schema.dataSources?.[0]?.id ?? ''),
    pageKey: meta.pageKey,
    writes: new Map(),
  }
  const ds = schema.dataSources?.[0] ?? { id: '', refId: '' }
  const apiFile = `api/${meta.pageKey.replace(/_/g, '-')}.ts`

  const plans = (schema.rule || []).map((node, i) => planNode(node, `rule[${i}]`, `n${i + 1}`, ctx))
  if (ctx.containerMode === 'inline') {
    ctx.unsupported.push({
      path: 'rule[]',
      type: 'formContainer',
      key: 'viewDetail.formMode',
      message: 'inline 展示方式首版不出码（产物形态是覆盖层容器，行内嵌需要页面骨架配合），需人工补',
    })
  }
  const optionPlan = planOption(schema.option, ctx, `n${(schema.rule || []).length + 1}`)
  const { behaviors, switchCases } = planBehaviors(schema, plans, ctx)

  // 两处尺寸（列表组件 viewDetail.width / 容器 dialogWidth）都会出码，运行期以列表组件为准；
  // 不等时产物里有两份真相，登记成冲突告警让人来看，不出静默取其一
  const containerPlan = plans.find((p) => p.node.type === 'formContainer')
  const vw = listNode?.props?.viewDetail?.width
  const dw = containerPlan && (schema.rule || []).find((r) => r.type === 'formContainer')?.props?.dialogWidth
  if (containerPlan && vw && dw && vw !== dw) {
    containerPlan.node.warnings.push({
      kind: 'value-conflict',
      path: 'props.dialogWidth',
      message: `容器尺寸 ${dw} 与列表组件 ${listNode!.type} 的 viewDetail.width ${vw} 不一致，运行期以列表组件为准（PageDataTable.vue:198、PageDataCards.vue:139），出码两处都保留`,
    })
  }

  const dsEntries = planDataSources(schema, ctx, apiFile)
  const vue = assembleVue({ schema, plans, optionPlan, behaviors, switchCases, ctx, ds, dsEntries, meta })
  const manifest: GeneratedManifest = {
    kind: 'page-codegen-manifest',
    manifestVersion: 2,
    generator: 'lc-codegen@0.1.0-spike1',
    source: {
      pageKey: meta.pageKey,
      pageName: meta.pageName,
      schemaDigest: digest(schema),
      digestRule: '键名升序规范化序列化后取 FNV-1a 32 位（首版占位，正式版换 sha256 前 16 位）',
      exportedAt: meta.exportedAt,
    },
    runtime: {
      package: '@lc/runtime',
      sdkVersion: '1',
      components: runtimeTagsOf(plans),
      note: '表单容器不出 runtime 组件，出成容器标签 + EP 原生表单模板',
    },
    contract: {
      comment: '回导（产物 → schema）只靠登记表才能零歧义；本表由 codegen/contract.ts 的能力表自动产出，不手写',
      registers: {
        dropped: '身份键清单：出码丢弃、setRule 回导时补回（按作用域前缀匹配叶名）',
        'warnings[].path': '丢弃登记表：path 相对 node.rulePath 且必须机器可读；kind ∈ dropKinds 的条目在回导对比时豁免',
        renames: '重命名/派生登记表：from(schema 路径) ← to(产物侧证据)，回导先校验两侧值一致再剥离产物键',
        wireOnly: '归属登记表：产物里有、schema 里没有的接线键，回导剥离不报多造',
        defaults: '默认值登记表：结构键取默认值时产物省略不写，回导按此补；非默认值必须显式出码',
        'dataSources[].warnings': '数据源级丢弃登记：path 为页面级绝对路径（dataSources[i].<键>），bindings 记消费节点',
      },
      dropKinds: [
        'ignored-by-runtime',
        'no-consumer',
        'overridden-at-runtime',
        'not-in-artifact',
        'runtime-derived',
        'default-elided',
        'step-param-dropped',
      ],
      defaults: STRUCT_DEFAULTS,
    },
    nodes: [...flattenPlans(plans), optionPlan.node],
    dataSources: dsEntries,
    behaviors,
    unsupported: ctx.unsupported,
    identity: {
      policy:
        '出码丢弃 _fc_id/name/_fc_drag_tag；回导时由 FcDesigner.setRule 经 vendor loadRule/makeRule 补全（ruleIdentityStability.test.ts 保证缺失才补、已有值不改写）',
    },
  }

  return { files: { [ctx.file]: vue, [apiFile]: assembleApi(ds, meta) }, manifest }
}

function flattenPlans(plans: NodePlan[]): NodeArtifact[] {
  const out: NodeArtifact[] = []
  const walk = (p: NodePlan) => {
    out.push(p.node)
    p.children.forEach(walk)
  }
  plans.forEach(walk)
  return out
}

/**
 * 产物依赖的 runtime 组件：必须含容器里的嵌套字段控件（dataPicker / LookupPicker /
 * FormulaField），过去只看顶层 plans 把它们漏掉了 —— 出成裸标签、清单也说不出要打包谁。
 */
function runtimeTagsOf(plans: NodePlan[]): string[] {
  return [...new Set(flattenPlans(plans).filter((n) => TYPE_CONTRACTS[n.type]?.runtime).map((n) => String(n.host.tag)))]
}

// ==================== 单节点 ====================

function planNode(node: any, rulePath: string, id: string, ctx: Ctx): NodePlan {
  const contract: TypeContract | undefined = TYPE_CONTRACTS[node.type]
  if (!contract) {
    ctx.unsupported.push({ path: rulePath, type: node.type, key: '', message: `组件类型 ${node.type} 无出码契约，整节点未出码` })
    return {
      node: {
        id,
        rulePath,
        type: node.type,
        field: String(node.field ?? ''),
        anchor: '',
        file: ctx.file,
        host: { tag: null, ref: null },
        dropped: [...IDENTITY_KEYS],
        renames: [],
        wireOnly: [],
        warnings: [],
      },
      tag: '',
      propSnippets: [],
      attrs: {},
      anchorKv: {},
      children: [],
    }
  }

  const mode = contract.displayModeDriven ? ctx.containerMode : undefined
  const tag = mode ? containerTag(mode) : contract.tag
  // 组件没 defineExpose（list.expose=none）就别写 ref：产物里挂个取不到方法的 ref 是假接线。
  // 展示组件（dash-* / page-*）确实暴露了 refresh/setFilter，但产物侧还没有取用方
  // （现网靠 ready 上报进 dashInstances/componentRefs 由渲染器寻址，产物没有那张登记表），
  // 挂 ref 只会多一个没人调的变量；要接就先消对应的 requires 语义债。
  const refable = !!contract.runtime && !contract.widget && contract.list?.expose !== 'none'
  const plan: NodePlan = {
    node: {
      id,
      rulePath,
      type: node.type,
      field: String(node.field ?? ''),
      anchor: '',
      file: ctx.file,
      host: { tag, ref: refable ? `${id}Ref` : null },
      propsFrom: contract.runtime || contract.field ? 'bindings' : undefined,
      displayMode: mode,
      displayModeSource: mode ? ctx.containerModeSource : undefined,
      dropped: [...IDENTITY_KEYS],
      renames: [],
      wireOnly: [],
      warnings: [],
    },
    tag,
    // 展示组件的元素必须自带节点地址：同类型多实例（两个 dash-notice 并排）只按标签找元素的话，
    // 找到的永远是第一个，回读把第一张卡的属性套到所有卡上还能零差异。
    propSnippets: contract.widget ? [`lc:node="${id}"`] : [],
    attrs: {},
    anchorKv: {},
    children: [],
  }

  // 产物侧固定接线：值写进模板，键名进归属登记（schema 里没有这个键，回导不许报多造）
  for (const [k, v] of Object.entries(contract.constAttrs || {})) {
    plan.propSnippets.push(propSnippet(ctx, k, v, `const:${k}`))
    plan.node.wireOnly.push(k)
  }
  // 页面 key：现网由渲染器注入（PageRendererPage.vue:553），产物不传就是漏组件必填 prop，
  // 且 Excel 导入导出会拿空 pageKey 拼 URL
  if (contract.needsPageKey) {
    plan.propSnippets.push(propSnippet(ctx, 'pageKey', ctx.pageKey, 'const:pageKey'))
    plan.node.wireOnly.push('pageKey')
  }
  // 语义债登记：契约能把键出码，组件跑起来还差一段接线，按节点记账
  for (const req of contract.requires || []) {
    ctx.unsupported.push({ path: `${rulePath}.props.${req.key}`, type: node.type, key: req.key, message: req.note })
  }
  // 带回声明（LookupPicker 的 idField/returnFields）：此处只记账，容器归属与 handler
  // 命名在 assembleVue 定 —— 字段控件可能不在容器里，那种没有 form 可写，不能假接线。
  if (contract.writes) {
    const idRaw = contract.writes.idKey ? node.props?.[contract.writes.idKey] : undefined
    const mapRaw = contract.writes.mapKey ? node.props?.[contract.writes.mapKey] : undefined
    if (idRaw || (isPlainObject(mapRaw) && Object.keys(mapRaw).length)) {
      ctx.writes.set(id, {
        nodeId: id,
        rulePath,
        type: node.type,
        field: String(node.field ?? ''),
        idTarget: typeof idRaw === 'string' && idRaw ? idRaw : undefined,
        map: isPlainObject(mapRaw)
          ? (Object.fromEntries(Object.entries(mapRaw).filter(([, v]) => typeof v === 'string')) as Record<string, string>)
          : undefined,
      })
    }
  }

  const self = Object.fromEntries(
    Object.entries(node).filter(([k]) => k !== 'props' && k !== 'children' && !IDENTITY_KEYS.includes(k)),
  )
  applyLeaves(plan, flatten(self, '', contract.self || {}), rulePath, ctx)
  applyLeaves(plan, flatten(node.props ?? {}, 'props', prefixTable('props', contract.props)), rulePath, ctx)

  // 子规则递归的唯一开关：契约把 props.rule 登记成 children 才摊成真模板。
  // 登记成 prop 的（page-data-container 的 childRules）是交给组件自己解释的数据，
  // 再递归一遍就会出现两份真相 —— 子节点既进 plan 要出码，原件又整块透传，回读必然报多造。
  if (contract.props?.rule?.emit === 'children' && Array.isArray(node.props?.rule)) {
    node.props.rule.forEach((child: any, ci: number) => {
      plan.children.push(planNode(child, `${rulePath}.props.rule[${ci}]`, `${id}.f${ci + 1}`, ctx))
    })
  }
  // 字段控件的 v-model 路径：回导侧靠它把 el-input 对回 schema 节点
  if (plan.node.field && contract.field) plan.node.host.vmodel = `form.${plan.node.field}`

  const dsKv = plan.anchorKv.ds
  plan.node.anchor = `lc:node=${id} type=${node.type} field=${plan.node.field}` + (dsKv ? ` ds=${dsKv}` : '')
  return plan
}

function applyLeaves(plan: NodePlan, leaves: Leaf[], rulePath: string, ctx: Ctx): void {
  // 深层丢弃要先攒齐：整块出码的值里得把它们剥掉
  const nestedDrops = new Map<string, string[]>()
  for (const l of leaves) {
    if (l.under && l.entry?.emit === 'drop') {
      const list = nestedDrops.get(l.under) || []
      list.push(l.path.slice(l.under.length))
      nestedDrops.set(l.under, list)
    }
  }
  for (const leaf of leaves) applyLeaf(plan, leaf, rulePath, ctx, nestedDrops)
}

function applyLeaf(plan: NodePlan, leaf: Leaf, rulePath: string, ctx: Ctx, nestedDrops: Map<string, string[]>): void {
  const entry = leaf.entry
  const rel = leaf.path
  const node = plan.node
  if (!entry) {
    // 结构键等于默认值时由全局默认值登记表解释（manifest.contract.defaults），非默认值必须显式登记
    if (rel in STRUCT_DEFAULTS && JSON.stringify(STRUCT_DEFAULTS[rel]) === JSON.stringify(leaf.value)) return
    ctx.unsupported.push({
      path: `${rulePath}.${rel}`,
      type: node.type,
      key: leafName(rel),
      message: '契约表无此键，出码丢弃属未登记行为 —— 必须补 contract.ts 或人工确认',
    })
    return
  }
  switch (entry.emit) {
    case 'drop':
      node.warnings.push({ kind: entry.kind, path: rel, message: entry.note })
      return
    case 'default':
      if (JSON.stringify(leaf.value) === JSON.stringify(entry.value)) {
        node.warnings.push({
          kind: 'default-elided',
          path: rel,
          message: entry.note ?? '等于默认值，产物省略',
          elidedValue: entry.value,
        })
      } else {
        // 非默认值必须显式出码，否则等于静默丢配置
        plan.propSnippets.push(propSnippet(ctx, leafName(rel), leaf.value, rel))
        node.renames.push({ from: rel, to: `props.${leafName(rel)}`, note: '非默认值显式出码' })
      }
      return
    case 'anchor':
      plan.anchorKv[entry.key] = String(leaf.value ?? '')
      node.renames.push({ from: rel, to: `anchor:${node.id}@${entry.key}`, note: '模板上别处没有这个信息' })
      useDs(ctx, leaf.value, rulePath)
      return
    case 'derived':
      node.renames.push({ from: rel, to: `derived:${entry.by}`, evidence: entry.evidence })
      if (entry.by === 'dsRefId') {
        // 逐节点取自己的源：ds 常量只代表 dataSources[0]，仪表盘上第二个 KPI 绑别的源时
        // 沿用 ds.refId 就是拿错 refId 取数（查错表），必须走产物里的 dataSources 表
        const id = String(leaf.value ?? '')
        plan.propSnippets.push(
          id && id !== ctx.firstDsId ? `:ds-ref-id="dataSources['${id}']"` : ':ds-ref-id="ds.refId"',
        )
        useDs(ctx, leaf.value, rulePath)
      }
      // 选择器的取数身份：产物不挂渲染器，activeDsBindings 恒空，组件只能吃现成的 refId
      // （DataPicker.vue:265 的 binding?.refId || globalDataSourceId 那条回退）。
      // 一律查表、不分首个源：同页两个 picker 各绑各的表，走 ds.refId 就是拿错源。
      if (entry.by === 'globalDataSourceId') {
        plan.propSnippets.push(`:global-data-source-id="dataSources['${String(leaf.value ?? '')}']"`)
        useDs(ctx, leaf.value, rulePath)
      }
      return
    case 'attr': {
      const attrName = entry.by === 'containerSizeAttr' ? containerSizeAttrOf(ctx) : entry.as!
      const target = entry.on ?? plan.tag
      plan.attrs[target] = plan.attrs[target] || {}
      plan.attrs[target][attrName] = leaf.value
      node.renames.push({ from: rel, to: `${target}@${attrName}` })
      return
    }
    case 'children':
      return // 子规则由 planNode 递归处理
    default: {
      const propName = entry.as ?? leafName(rel)
      const value = stripPaths(leaf.value, nestedDrops.get(rel) || [])
      plan.propSnippets.push(propSnippet(ctx, propName, value, rel))
      if (entry.as) node.renames.push({ from: rel, to: `props.${propName}` })
      if (propName === 'dataSourceId') useDs(ctx, leaf.value, rulePath)
    }
  }
}

const containerSizeAttrOf = (ctx: Ctx) => (ctx.containerMode === 'drawer' ? 'size' : 'width')

/**
 * 该类型的标题有没有 el-form-item 载体（契约里 self.title 登记成 attr on el-form-item）。
 * 有才包一层 form-item —— 现网 form-create 给每个顶层节点都套，但 dash 系列与容器类刻意置空
 * title 就是为了不套（PageRendererPage.vue 的 transformComponent），补登记时得按类型自己表态。
 */
function labelCarrierOf(type: string): boolean {
  const entry = TYPE_CONTRACTS[type]?.self?.title
  return !!entry && entry.emit === 'attr' && entry.on === 'el-form-item'
}

/** 记一笔"这个数据源被这个节点消费了"：逐源登记的依据，值取自 schema 不取自产物片段 */
function useDs(ctx: Ctx, value: unknown, rulePath: string): void {
  const id = String(value ?? '')
  if (!id) return
  ctx.dsUse.set(id, [...(ctx.dsUse.get(id) || []), rulePath])
}

/**
 * 数据源逐源登记：schema 声明几个就记几个，落点由 DATA_SOURCE_CONTRACT 决定。
 * bindings 记消费节点；无消费者的源照样进产物常量表（id/refId 是 schema 声明的一部分，
 * 丢了就还原不回来），但设计上不参与取数，报告里由体检的 B 桶暴露。
 */
function planDataSources(schema: any, ctx: Ctx, apiFile: string): GeneratedManifest['dataSources'] {
  return (schema.dataSources || []).map((src: any, i: number) => {
    const path = `dataSources[${i}]`
    const entry: GeneratedManifest['dataSources'][number] = {
      path,
      id: String(src.id ?? ''),
      refId: String(src.refId ?? ''),
      apiModule: i === 0 ? apiFile.replace(/\.ts$/, '') : '',
      bindings: ctx.dsUse.get(String(src.id ?? '')) || [],
      warnings: [],
    }
    for (const k of Object.keys(src)) {
      const e = DATA_SOURCE_CONTRACT[k]
      if (!e) {
        ctx.unsupported.push({
          path: `${path}.${k}`,
          type: 'dataSource',
          key: k,
          message: `数据源键 ${k} 无落点登记 —— 必须补 DATA_SOURCE_CONTRACT 或人工确认`,
        })
        continue
      }
      if (e.emit === 'drop') entry.warnings.push({ kind: e.kind, path: `${path}.${k}`, message: e.note })
    }
    return entry
  })
}

// ==================== option ====================

function planOption(option: any, ctx: Ctx, id: string): NodePlan {
  const node: NodeArtifact = {
    id,
    rulePath: 'option',
    type: 'option',
    field: '',
    anchor: '',
    file: ctx.file,
    // 页面根 form 不出 ref：产物里没有页面级字段，没有要 validate 的表单实例；
    // formRef 这个名字归容器内层表单（renderContainer 里硬编码）。
    host: { tag: 'el-form', ref: null },
    dropped: [],
    renames: [],
    wireOnly: [],
    warnings: [],
  }
  const plan: NodePlan = { node, tag: 'el-form', propSnippets: [], attrs: { 'el-form': {} }, anchorKv: {}, children: [] }
  for (const leaf of flatten(option ?? {}, '', OPTION_CONTRACT)) {
    const entry = leaf.entry
    if (!entry) {
      ctx.unsupported.push({ path: `option.${leaf.path}`, type: 'option', key: leaf.path, message: 'option 键无落点，未登记' })
      continue
    }
    if (entry.emit === 'drop') {
      node.warnings.push({ kind: entry.kind, path: leaf.path, message: entry.note })
      continue
    }
    if (entry.emit === 'attr') {
      plan.attrs['el-form'][entry.as!] = leaf.value
      node.renames.push({ from: leaf.path, to: `el-form@${entry.as}` })
      continue
    }
    ctx.unsupported.push({ path: `option.${leaf.path}`, type: 'option', key: leaf.path, message: 'option 落点类型未实现' })
  }
  return plan
}

// ==================== 动作流 ====================

const BUTTON_TRIGGER: Record<string, { trigger: string; readonly: boolean; mode: 'create' | 'edit' | 'view' }> = {
  edit: { trigger: 'row-edit', readonly: false, mode: 'edit' },
  view: { trigger: 'row-view', readonly: true, mode: 'view' },
  create: { trigger: 'row-create', readonly: false, mode: 'create' },
}

const HANDLED_TRIGGERS = ['row-edit', 'row-view', 'row-create']

const NO_REFRESH_TODO = 'lc:todo 列表组件未 defineExpose，取数刷新需人工接（page-list-cards 现状）'

/** 语句位的刷新调用：没暴露 refresh 就别出假接线，留一行注释给人看 */
export const refreshCall = (refName: string | null | undefined): string =>
  refName ? `${refName}.value?.refresh()` : `// ${NO_REFRESH_TODO}`

/** 回调位（删除后刷新）：注释不是表达式，箭头后只剩注释会把产物打成非法 TS，得包成空块 */
export const refreshThen = (refName: string | null | undefined): string =>
  refName ? `${refName}.value?.refresh()` : `{ /* ${NO_REFRESH_TODO} */ }`

function planBehaviors(
  schema: any,
  plans: NodePlan[],
  ctx: Ctx,
): { behaviors: Behavior[]; switchCases: string[] } {
  const behaviors: Behavior[] = []
  const switchCases: string[] = []
  const listPlans = plans.filter((p) => listOf(p.node.type))
  const list = listPlans[0]
  const container = plans.find((p) => p.node.type === 'formContainer')
  const refreshTarget = list?.node.host.ref
  const resolvedTarget = container?.node.id || ''
  const seenTriggers = new Set<string>()

  ;(schema.actions || []).forEach((action: any, i: number) => {
    const droppedParams: Warning[] = []
    const steps = (action.steps || []).map((s: any, j: number) => {
      for (const k of Object.keys(s)) {
        if (k === 'op' || k === 'target') continue
        droppedParams.push({
          kind: 'step-param-dropped',
          path: `actions[${i}].steps[${j}].${k}`,
          message: `总线步骤参数 ${k} 在产物里无落点（PageRendererPage 不读 step.displayMode 等），出码丢弃`,
        })
      }
      return { op: s.op, target: s.target }
    })
    seenTriggers.add(action.trigger)
    behaviors.push({
      id: `b${behaviors.length + 1}`,
      origin: `actions[${i}]`,
      trigger: action.trigger,
      source: action.source,
      steps,
      resolvedTarget,
      implementedBy: { file: ctx.file, function: 'onButtonClick', case: triggerCase(action.trigger) },
      warnings: droppedParams,
    })
    if (!HANDLED_TRIGGERS.includes(action.trigger)) {
      ctx.unsupported.push({
        path: `actions[${i}]`,
        type: 'bus',
        key: String(action.trigger),
        message: `触发器 ${action.trigger} 在组件 emit 里不存在（见 spike 触发器→emit 缺口清单），产物无法接管，需先做事件面改造`,
      })
    }
  })

  for (const lp of listPlans) {
    const idx = Number(lp.node.rulePath.match(/\[(\d+)\]$/)?.[1])
    // 只有把按钮点击 emit 出来的列表组件才能在产物里接管按钮（卡片走总线，见契约 requires）
    if (!(listOf(lp.node.type)?.events || []).some((e) => e.on === 'button-click')) continue
    const buttons: any[] = schema.rule?.[idx]?.props?.viewActions?.buttons || []
    for (const btn of buttons) {
      // 链里真配了动作才算动作链（对齐组件 handleActionClick 的 some(actions.length>0)）：
      // 面板保存过但没配动作的空链不代表自定义语义，把它当链吞掉就等于内建按钮不接线
      const hasChain = (btn?.events || []).some((ev: any) => (ev?.actions || []).length > 0)
      if (hasChain) {
        ctx.unsupported.push({
          path: `${lp.node.rulePath}.props.viewActions.buttons(${btn.key}).events`,
          type: lp.node.type,
          key: String(btn.key),
          message: '按钮配了动作链（chain），spike 1 只出内建行为与总线动作，该按钮不接线',
        })
        continue
      }
      const map = BUTTON_TRIGGER[btn.key]
      if (!map) {
        if (btn.key === 'delete') {
          switchCases.push(
            `    case 'delete':\n      if (row?.id != null) void deleteData(String(row.id)).then(() => ${refreshThen(refreshTarget)})\n      return`,
          )
        } else {
          ctx.unsupported.push({
            path: `${lp.node.rulePath}.props.viewActions.buttons(${btn.key})`,
            type: lp.node.type,
            key: String(btn.key),
            message: `按钮 ${btn.key} 无对应出码语义（既非内建 key 也无动作链），产物里该按钮不接线`,
          })
        }
        continue
      }
      switchCases.push(
        `    case '${btn.key}':\n      void openContainer(String(row?.id ?? ''), ${map.readonly}, '${map.mode}')\n      return`,
      )
      if (!seenTriggers.has(map.trigger)) {
        behaviors.push({
          id: `b${behaviors.length + 1}`,
          origin: 'implicit:buttons',
          trigger: map.trigger,
          source: String(schema.rule?.[idx]?.props?.dataSourceId ?? schema.dataSources?.[0]?.id ?? ''),
          steps: [],
          resolvedTarget,
          implementedBy: { file: ctx.file, function: 'onButtonClick', case: String(btn.key) },
          warnings: [
            {
              kind: 'fallback-behavior',
              path: `actions(${map.trigger})`,
              message: `schema.actions 无 ${map.trigger} 动作，运行时走同数据源容器兜底（PageDataTable.vue:939-941）。出码把兜底显式化成代码，属新增行为而非原配置`,
            },
          ],
        })
      }
    }
  }

  return { behaviors, switchCases }
}

const triggerCase = (trigger: string) =>
  trigger === 'row-edit' ? 'edit' : trigger === 'row-view' ? 'view' : trigger === 'row-create' ? 'create' : trigger

// ==================== SFC 组装 ====================

function assembleVue(args: {
  schema: any
  plans: NodePlan[]
  optionPlan: NodePlan
  behaviors: Behavior[]
  switchCases: string[]
  ctx: Ctx
  ds: any
  dsEntries: GeneratedManifest['dataSources']
  meta: { pageKey: string; pageName: string; exportedAt: string }
}): string {
  const { plans, optionPlan, switchCases, ctx, ds, dsEntries, meta } = args
  const listPlans = plans.filter((p) => listOf(p.node.type))
  const container = plans.find((p) => p.node.type === 'formContainer')
  const refName = listPlans[0]?.node.host.ref
  const fields: string[] = []
  if (container) {
    const walk = (p: NodePlan) => {
      if (isFieldType(p.node.type) && p.node.field) fields.push(p.node.field)
      p.children.forEach(walk)
    }
    container.children.forEach(walk)
  }

  // 带回接线（contract.writes）：只有容器子树内的字段控件才接 @select/@clear ——
  // 页面级字段没有 form 可写，硬接线就是把债改成假绿灯。
  const inContainer = new Set<string>()
  if (container) {
    const collect = (p: NodePlan) => {
      inContainer.add(p.node.id)
      p.children.forEach(collect)
    }
    container.children.forEach(collect)
  }
  const writebacks: Writeback[] = []
  const usedNames = new Set<string>()
  const uniqueName = (base: string) => {
    let name = base
    let i = 2
    while (usedNames.has(name)) name = `${base}${i++}`
    usedNames.add(name)
    return name
  }
  for (const w of ctx.writes.values()) {
    if (!inContainer.has(w.nodeId)) {
      ctx.unsupported.push({
        path: w.rulePath,
        type: w.type,
        key: 'writes',
        message: `${w.type} 配了带回（idField/returnFields）但不在容器子树里，产物没有 form 可写，不接线`,
      })
      continue
    }
    w.select = uniqueName(`on${pascal(w.field)}Select`)
    w.clear = uniqueName(`on${pascal(w.field)}Clear`)
    writebacks.push(w)
  }
  // 写回目标并进 form 声明：容器只回填声明过的字段（对齐 DsBindingEngine.ts:79-82），
  // idField 目标没有可见 input 时（卡片语料页的 customer_id）不声明就是编辑态回填不回、保存丢 id。
  // 业务数据整包落 data_json（FormData.dataJson），多声明一个键无列冲突。
  for (const t of writebacks.flatMap((w) => [w.idTarget, ...Object.values(w.map ?? {})])) {
    if (typeof t === 'string' && t && !fields.includes(t)) fields.push(t)
  }

  const L: string[] = []
  L.push('<!-- 由 lc-codegen 从页面 schema 出码，勿手改登记表以外的部分；人工接管写在 handler 里 -->')
  L.push('<template>')
  // stretch 只给列表页：那条高度链是「表单撑满、列表占余下空间」，仪表盘页按自然流出高度，
  // 组件的显示高度另有 props.height 档位（并排留白与固定高都在组件根上，见 dash-shared.ts）
  const hasList = listPlans.length > 0
  L.push(`  <div class="lc-page${hasList ? ' lc-page--stretch' : ''}">`)
  // 页面主体一棵 el-form：option.form.* 的落点，也是列表节点标题的载体（现网这层是 form-create 给的）。
  // 纯列表页照样包 —— 没有字段也有 label-position/size/labelWidth 要挂，去掉这层就等于把页面级配置丢掉。
  const formAttrs = Object.entries(optionPlan.attrs['el-form'] || {}).map(([k, v]) =>
    typeof v === 'boolean' || typeof v === 'number' ? `:${kebab(k)}="${lit(v)}"` : `${k}="${v}"`,
  )
  L.push(`    <el-form class="lc-page-form"${formAttrs.length ? ` ${formAttrs.join(' ')}` : ''}>`)
  // 按画布顺序出节点：dash 组件连续的一段并进同一个 el-row（筛选器排在它影响的卡片之前就是靠顺序）
  const pendingWidgets: NodePlan[] = []
  const flushWidgets = () => {
    if (!pendingWidgets.length) return
    L.push(...renderWidgetRow(pendingWidgets, '      '))
    pendingWidgets.length = 0
  }
  for (const p of plans) {
    if (widgetOf(p.node.type)) {
      pendingWidgets.push(p)
      continue
    }
    flushWidgets()
    if (p.node.type === 'formContainer') continue // 覆盖层容器出在 </el-form> 之后
    if (listOf(p.node.type)) {
      const list = listOf(p.node.type) || { events: [] }
      const head = p.node.host.ref ? ` ref="${p.node.host.ref}"` : ''
      const props = p.propSnippets.length ? ` ${p.propSnippets.join(' ')}` : ''
      const events = list.events.map((e) => `@${e.on}="${e.handler}"`)
      const label = p.attrs['el-form-item']?.label
      const wrap = labelCarrierOf(p.node.type)
      L.push(`      <!-- ${p.node.anchor} -->`)
      if (wrap) L.push(`      <el-form-item${label === undefined ? '' : ` label="${label}"`}>`)
      L.push(`${wrap ? '        ' : '      '}<${p.tag}${head}${props} ${events.join(' ')} />`)
      if (wrap) L.push('      </el-form-item>')
      p.node.wireOnly.push(...list.events.map((e) => `on.${camel(e.on)}`))
      continue
    }
    // 未登记类型：留一行挂点注释（与容器子节点同一口径），别让整节点静默消失
    if (!TYPE_CONTRACTS[p.node.type]) {
      L.push(`      <!-- lc:todo node=${p.node.id} type=${p.node.type} field=${p.node.field} 组件类型无出码契约，整节点未出码 -->`)
    }
  }
  flushWidgets()
  L.push('    </el-form>')
  if (container) L.push(renderContainer(container, ctx))
  L.push('  </div>')
  L.push('</template>')
  L.push('')
  L.push('<script setup lang="ts">')
  L.push("import { reactive, ref } from 'vue'")
  // runtime 标签一律要 import：过去只导列表组件，容器里的字段控件（dataPicker /
  // LookupPicker / FormulaField）出成了裸标签，产物看着对、实际跑不起来
  for (const tag of runtimeTagsOf(plans)) L.push(`import ${pascal(tag)} from '@lc/runtime/${tag}'`)
  // 带回的行值读取复用组件同一套 BizDataVO 兼容取值：裸 row[key] 会把内层业务字段读成 undefined
  if (writebacks.some((w) => Object.keys(w.map ?? {}).length)) {
    L.push("import { readCellValue } from '@lc/runtime/lookupFetch'")
  }
  L.push(`import { getData, createData, updateData, deleteData } from './api/${meta.pageKey.replace(/_/g, '-')}'`)
  L.push('')
  L.push('// ==================== 数据源（schema.dataSources[]）====================')
  L.push(`const ds = { id: '${ds.id}', refId: '${ds.refId}' }`)
  if (dsEntries.length) {
    L.push('// 逐源登记表：页面声明的几个源都在册（含未绑到组件的），人工补接线时按 id 取 refId')
    L.push('const dataSources = {')
    dsEntries.forEach((d) => L.push(`  '${d.id}': '${d.refId}',`))
    L.push('}')
  }
  L.push('')
  for (const lp of listPlans) {
    if (!lp.node.host.ref) continue
    L.push(`// ==================== 节点 ${lp.node.id}：${lp.node.type}（schema.${lp.node.rulePath}.props）====================`)
    L.push(`const ${lp.node.host.ref} = ref<InstanceType<typeof ${pascal(lp.tag)}> | null>(null)`)
  }
  for (const [name, value] of ctx.consts) L.push('', `const ${name} = ${jsonToTs(value)}`)
  L.push('')
  if (container) {
    L.push(`// ==================== 节点 ${container.node.id}：formContainer（schema.${container.node.rulePath}）====================`)
    L.push('const containerVisible = ref(false)')
    L.push('const containerReadonly = ref(false)')
    L.push("const containerMode = ref<'create' | 'edit' | 'view'>('create')")
    L.push("const containerRecordId = ref('')")
    L.push('const containerVersion = ref<number | undefined>(undefined)')
    L.push('const formRef = ref()')
    L.push(`const form = reactive<Record<string, unknown>>({ ${fields.map((f) => `${f}: ''`).join(', ')} })`)
    L.push('')
    L.push(`/** lc:node=${container.node.id} → 打开容器并取记录（原总线 load-record / open-container 的合并语义） */`)
    L.push("async function openContainer(recordId: string, readonly: boolean, mode: 'create' | 'edit' | 'view') {")
    L.push('  containerMode.value = mode')
    L.push('  containerReadonly.value = readonly')
    L.push('  containerRecordId.value = recordId')
    L.push('  containerVersion.value = undefined')
    // 整表重置：只清首个字段的话，看完整条记录再点「新建」，其余字段还是上一条的值
    L.push("  Object.keys(form).forEach((k) => { form[k] = '' })")
    L.push('  containerVisible.value = true')
    L.push('  if (recordId) {')
    L.push('    const res = await getData(recordId)')
    L.push('    // BizDataVO = { id, version, data: {业务字段} }：字段在 vo.data 里，摊错层就是一张空表单')
    L.push("    const vo = (res.data ?? {}) as { version?: number; data?: Record<string, unknown> }")
    L.push('    const record = vo.data ?? {}')
    L.push('    // 只回填容器声明过的字段（对齐 DsBindingEngine.ts:79-82）：整条记录灌进 form，保存时')
    L.push('    // { ...form } 会把根本没在编辑的业务字段一起写回去；id/version 留在字段模型之外')
    L.push('    Object.keys(form).forEach((k) => { if (k in record) form[k] = record[k] })')
    L.push("    containerVersion.value = typeof vo.version === 'number' ? vo.version : undefined")
    L.push('  }')
    L.push('}')
    L.push('')
    L.push('function closeContainer() {')
    L.push('  containerVisible.value = false')
    L.push('}')
    L.push('')
    L.push('async function confirmSave() {')
    L.push("  if (containerMode.value === 'create') {")
    L.push('    await createData({ ...form })')
    L.push('  } else {')
    L.push('    await updateData(containerRecordId.value, { ...form }, containerVersion.value)')
    L.push('  }')
    L.push('  closeContainer()')
    L.push(`  ${refreshCall(refName)}`)
    L.push('}')
    L.push('')
    if (writebacks.length) {
      L.push('// ==================== 字段写回（选择器带回的显式化）====================')
      L.push('// 组件宿主里走 formCreateInject.api.setValue，产物没有 form-create 实例，改接 select/clear 显式赋值；')
      L.push('// returnFields 方向：key=被查表的源字段、value=表单目标字段（LookupPicker.vue:295-299）')
      const q = (s: string) => s.replace(/'/g, "\\'")
      for (const w of writebacks) {
        const targets = [w.idTarget, ...Object.values(w.map ?? {})].filter((t): t is string => !!t)
        L.push(`/** lc:node=${w.nodeId} field=${w.field} 带回 → ${targets.join(' / ')} */`)
        L.push(`function ${w.select}(row: Record<string, unknown>) {`)
        if (w.idTarget) L.push(`  form['${q(w.idTarget)}'] = row.id ?? null`)
        for (const [src, target] of Object.entries(w.map ?? {})) {
          L.push(`  form['${q(target)}'] = readCellValue(row, '${q(src)}') ?? null`)
        }
        L.push('}')
        L.push(`function ${w.clear}() {`)
        for (const t of targets) L.push(`  form['${q(t)}'] = null`)
        L.push('}')
        L.push('')
      }
    }
  }
  const explicit = args.behaviors.filter((x) => x.origin.startsWith('actions['))
  // handler 只出产物真绑得到的：组件没那个 emit（卡片的 selection-change）还留空函数，
  // 就是 vue-tsc 里的 TS6133 孤儿 —— 看着有挂点，实际没人调
  const boundHandlers = new Set(
    listPlans.flatMap((lp) => (listOf(lp.node.type)?.events || []).map((e) => e.handler)),
  )
  if (boundHandlers.has('onButtonClick')) {
    L.push('// ==================== lc:behavior ← schema.actions ====================')
    L.push(`// 原形态：${JSON.stringify(explicit.map((x) => ({ trigger: x.trigger, source: x.source, steps: x.steps })))}`)
    L.push('// target 填数据源标识 → 出码时解引用成具体容器（同源画布靠前的容器），运行期不再查表')
    L.push('function onButtonClick(payload: { key: string; row: Record<string, unknown> | null }) {')
    L.push('  const row = payload.row')
    L.push('  switch (payload.key) {')
    switchCases.forEach((c) => L.push(c))
    L.push('  }')
    L.push('}')
    L.push('')
  }
  if (boundHandlers.has('onRowClick')) {
    L.push('function onRowClick(_row: Record<string, unknown>) {')
    L.push('  // schema.actions 无 row-click 触发的动作链 → 空实现，保留挂点供人工接管')
    L.push('}')
    L.push('')
  }
  if (boundHandlers.has('onSelectionChange')) {
    L.push('function onSelectionChange(_rows: Record<string, unknown>[]) {')
    L.push('  // 无关联动作')
    L.push('}')
  }
  L.push('</script>')
  L.push('')
  L.push('<style scoped>')
  L.push('.lc-page--stretch {')
  L.push('  height: 100%;')
  L.push('  display: flex;')
  L.push('  flex-direction: column;')
  L.push('}')
  // 撑满链路要多接一层：现网是 .el-form > .el-row > .el-col > .el-form-item > __content
  //（PageRendererPage.vue:746-757），产物没有 form-create 的栅格，高度从根 form 直接传到列表组件。
  L.push('.lc-page--stretch .lc-page-form {')
  L.push('  height: 100%;')
  L.push('  min-height: 0;')
  L.push('}')
  L.push('.lc-page--stretch .lc-page-form :deep(.el-form-item),')
  L.push('.lc-page--stretch .lc-page-form :deep(.el-form-item__content) {')
  L.push('  height: 100%;')
  L.push('  min-height: 0;')
  L.push('  min-width: 0;')
  L.push('}')
  L.push('.lc-container-body {')
  L.push('  overflow-y: auto;')
  L.push('  height: 600px;')
  L.push('}')
  L.push('</style>')
  L.push('')
  return L.join('\n')
}

/**
 * 展示组件段：连续的几个节点并进一段栅格。
 * el-row > el-col.fc-form-col > el-form-item > 组件 —— 现网这四层都是 form-create 给的，
 * 撑满档靠 dash-fill-height.css 沿 el-col.fc-form-col > el-form-item > __content 传高，
 * 少任意一层，props.height='100%' 就退化成内容高。
 */
function renderWidgetRow(widgets: NodePlan[], indent: string): string[] {
  const L: string[] = [`${indent}<el-row>`]
  for (const p of widgets) {
    const span = p.attrs['el-col']?.span ?? 24
    const props = p.propSnippets.length ? ` ${p.propSnippets.join(' ')}` : ''
    L.push(`${indent}  <el-col class="fc-form-col" :span="${lit(span)}">`)
    L.push(`${indent}    <!-- ${p.node.anchor} -->`)
    // 标题载体按类型表态：dash 族的节点 title 被渲染器置空（空壳 form-item 只为撑满档传高），
    // page-* 展示组件的 title 照旧由 form-create 当 label 渲染，两者都靠 self.title 登记决定
    const label = p.attrs['el-form-item']?.label
    L.push(`${indent}    <el-form-item${label === undefined ? '' : ` label="${label}"`}>`)
    L.push(`${indent}      <${p.tag}${props} />`)
    L.push(`${indent}    </el-form-item>`)
    L.push(`${indent}  </el-col>`)
  }
  L.push(`${indent}</el-row>`)
  return L
}

function renderContainer(plan: NodePlan, ctx: Ctx): string {
  const attrs = plan.attrs[plan.tag] || {}
  const sizeAttr = containerSizeAttrOf(ctx)
  // title 先写：容器锚点里读不到它，人 review 时第一眼要看的就是标题
  const order = ['title', sizeAttr, ...Object.keys(attrs).filter((k) => k !== 'title' && k !== sizeAttr)]
  const open: string[] = ['v-model="containerVisible"']
  const attrSnippets = order.filter((k) => k in attrs).map((k) => {
    const v = attrs[k]
    return typeof v === 'string' && (k === 'title' || k === sizeAttr) ? `${k}="${v}"` : `:${k}="${lit(v)}"`
  })
  open.push(...attrSnippets)
  // 容器内层 form 只带自己的接线：现网 containerOption（PageRendererPage.vue:700-706）是现造的，
  // 不吃页面 option.form.*，labelWidth 用运行期测量值 —— 产物不测 DOM，留 CSS 变量占位。
  const formLine = ['ref="formRef"', ':model="form"', 'label-width="var(--lc-label-width)"']
  const items: string[] = []
  const nestedWidgets: NodePlan[] = []
  const flushNested = () => {
    if (!nestedWidgets.length) return
    items.push(...renderWidgetRow(nestedWidgets, '          '))
    nestedWidgets.length = 0
  }
  for (const c of plan.children) {
    // 容器里的展示组件同样走栅格：内层表单也是 form-create 渲染的，层级与页面主体一致
    if (widgetOf(c.node.type)) {
      nestedWidgets.push(c)
      continue
    }
    flushNested()
    if (!c.tag) {
      // 未登记的字段类型没有标签可出。绝不能用空 tag 占位：`< v-model="…" />` 既过不了
      // Vue 编译，又会把回导侧的 el-form-item 祖先关系搅乱（语料体检里 8 条 label 错位的根因）。
      // 只留一行 lc:todo 注释，节点本体作为广度债进 holes，由补契约来消。
      // 注释里带 node=<id>：回导侧据此把该子节点补回数组占位，否则整个 rule 数组只报一次
      // 「长度不符」，到底是哪几个字段没出码就看不见了（广度债会被容器掩盖）。
      items.push(
        `          <!-- lc:todo node=${c.node.id} type=${c.node.type} field=${c.node.field} 组件类型无出码契约，整字段未出码 -->`,
      )
      continue
    }
    const f = c.node.field
    const label = c.attrs['el-form-item']?.label ?? f
    const control = c.propSnippets.length ? ` ${c.propSnippets.join(' ')}` : ''
    // 带回接线：事件不在契约 props 面（产物有、schema 无），进 wireOnly 让回导剥离不报多造
    const wb = ctx.writes.get(c.node.id)
    const wbEvents = wb?.select ? ` @select="${wb.select}" @clear="${wb.clear}"` : ''
    if (wb?.select) c.node.wireOnly.push('on.select', 'on.clear')
    items.push(
      [
        `          <!-- ${c.node.anchor} -->`,
        `          <el-form-item label="${label}">`,
        `            <${c.tag} v-model="form.${f}"${control}${wbEvents} />`,
        '          </el-form-item>',
      ].join('\n'),
    )
  }
  flushNested()
  return [
    `    <!-- ${plan.node.anchor} -->`,
    `    <${plan.tag} ${open.join(' ')}>`,
    '      <div class="lc-container-body">',
    `        <el-form ${formLine.join(' ')}>`,
    ...items,
    '        </el-form>',
    '      </div>',
    '      <template #footer>',
    '        <el-button v-if="containerReadonly" type="primary" @click="closeContainer">关闭</el-button>',
    '        <template v-if="!containerReadonly">',
    '          <el-button @click="closeContainer">取消</el-button>',
    '          <el-button type="primary" @click="confirmSave">确定</el-button>',
    '        </template>',
    '      </template>',
    `    </${plan.tag}>`,
  ].join('\n')
}

/** 常量序列化：合法标识符键名去引号、无引号的字符串值用单引号，贴近人写的风格便于 review */
function jsonToTs(v: unknown): string {
  return JSON.stringify(v, null, 2)
    .replace(/^(\s*)"([A-Za-z_$][\w$]*)": /gm, '$1$2: ')
    .replace(/: "([^"'\\]*)"/g, ": '$1'")
}

function assembleApi(ds: any, meta: { pageKey: string }): string {
  const refId = String(ds?.refId ?? '')
  return [
    `// lc:module=api page=${meta.pageKey} source=schema.dataSources[0]（${ds?.id ?? ''} → refId ${refId}）`,
    '// 出码把「数据源标识」解析成固定 refId，运行期不再查页面 dataSources 表（原链路：resolveRefId，PageDataTable.vue:800-806）',
    "import http from '@lc/runtime/http'",
    '',
    `const REF_ID = '${refId}'`,
    '',
    'export interface QueryParams {',
    '  page?: number',
    '  size?: number',
    '  keyword?: string',
    '  keywordColumn?: string',
    '  sort?: string',
    '  order?: string',
    '  /** 结构化筛选 JSON 字符串，受 searchFields 白名单约束 */',
    '  filter?: string',
    '  params?: string',
    '}',
    '',
    `export const queryData = (params: QueryParams) => http.get(\`/v1/data-sources/\${REF_ID}/data\`, { params })`,
    `export const getData = (id: string) => http.get(\`/v1/data-sources/\${REF_ID}/data/\${id}\`)`,
    `export const createData = (data: Record<string, unknown>) => http.post(\`/v1/data-sources/\${REF_ID}/data\`, data)`,
    `export const updateData = (id: string, data: Record<string, unknown>, version?: number) =>`,
    `  http.put(\`/v1/data-sources/\${REF_ID}/data/\${id}\`, data, { params: { version } })`,
    `export const deleteData = (id: string) => http.delete(\`/v1/data-sources/\${REF_ID}/data/\${id}\`)`,
    '',
  ].join('\n')
}

/** 键名升序规范化后 FNV-1a：出码报告的溯源指纹 */
function digest(schema: unknown): string {
  const norm = (v: any): any => {
    if (Array.isArray(v)) return v.map(norm)
    if (isPlainObject(v)) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, norm(v[k])]))
    return v
  }
  const s = JSON.stringify(norm(schema))
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0
  return `fnv1a:${h.toString(16).padStart(8, '0')}`
}
