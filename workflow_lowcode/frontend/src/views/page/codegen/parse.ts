/**
 * schema → IR：组件判定、契约落点、登记表与具名常量的唯一入口。
 *
 * 这里可以读 schema 与 contract.ts；emit 侧不得再回头读 schema。所有产物决策（哪些键出、
 * 哪些丢弃、绑定到哪个数据源、带回/注入是否接线）都在本阶段落成 IrPage 上的数据。
 */

import {
  DATA_SOURCE_CONTRACT,
  IDENTITY_KEYS,
  OPTION_CONTRACT,
  STRUCT_DEFAULTS,
  TABLE_COLUMN_CONTRACT,
  TABLE_RULE_CONTRACT,
  TYPE_CONTRACTS,
  fixedOutletsOf,
  isFieldType,
  listOf,
  refableOf,
  type PropEmit,
  type TypeContract,
} from './contract'
import {
  analyzeNodeChains,
  BUTTON_TRIGGER,
  chainPageFacts,
  claimHandler,
  compileBusAction,
  type ChainPage,
} from './chains'
import {
  camel,
  camelField,
  isPlainObject,
  leafName,
  pascal,
  type Behavior,
  type IrChain,
  type IrDataSource,
  type IrInjection,
  type IrKind,
  type IrNode,
  type IrNested,
  type IrNestedColumn,
  type IrOption,
  type IrPage,
  type IrProp,
  type IrSwitchCase,
  type IrTable,
  type IrTableCell,
  type IrWriteback,
  type NodeArtifact,
  type Unsupported,
  type Warning,
} from './ir'

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

/** 字段写回（contract.writes）：组件 select/clear 的产物侧显式化，handler 名在收口阶段分配 */
interface PendingWriteback {
  nodeId: string
  rulePath: string
  type: string
  field: string
  /** props.<writes.idKey>：选中记录 id 写入的表单字段 */
  idTarget?: string
  /** props.<writes.mapKey>：key=被查表的源字段，value=表单目标字段 */
  map?: Record<string, string>
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
  writes: Map<string, PendingWriteback>
  /** 注入接线（FormulaField 等 contract.injects）：节点 id → 组件声明过的注入 prop */
  injections: Map<string, IrInjection>
  /** 动作链判定的页面事实（载体寻址、链与列链改判）：在节点规划之前建好，两边口径一致 */
  chain: ChainPage
}

/**
 * planNode 的递归环境。
 *  prefix：字段值的前缀 —— 页面级是 form，行容器里是行别名（itemsRow.qty），子表单里是
 *          form.<容器字段>（invoice_info 的值形态是对象）。回读靠它把控件对回 schema 节点。
 *  inContainer：子树是否在 formContainer 内 —— 只有那里才有 form 后端可接（带回/注入/嵌套容器）。
 *  nestedOwner：最近的嵌套容器类型。它的字段值挂在行对象/子对象上，写回与注入都没有 form.<字段> 可指。
 */
interface Env {
  prefix: string
  inContainer: boolean
  nestedOwner: string | null
}

const ROOT_ENV: Env = { prefix: 'form', inContainer: false, nestedOwner: null }

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

/** 展示方式 → 容器标签（尺寸属性名由目标端按 containerMode 决定） */
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

/**
 * 属性落点：简单值留字面量，带引号的字符串与对象/数组配置具名化成常量。
 * 与旧 propSnippet 的判定完全一致 —— 常量命名与去重顺序是 golden 字节的一部分。
 */
function toIrProp(ctx: Ctx, name: string, value: unknown, hint: string): IrProp {
  if (typeof value === 'string') {
    // 带引号的字符串（dash 组件级 filter 是 JSON 文本）不能裸写进属性：filter="{"a":1}" 在第一个
    // 双引号处就把属性截断了。HTML 属性不认反斜杠转义，只能具名化成常量再用 v-bind 引它。
    if (value.includes('"') || value.includes("'")) {
      return { name, hint, value: { kind: 'const', constName: addConst(ctx, hint, value) } }
    }
    return { name, hint, value: { kind: 'literal', value } }
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return { name, hint, value: { kind: 'literal', value } }
  }
  // 空数组必须走常量：`:x="[]"` 字面上好看，回导侧解析器会把它读成一个空字符串元素
  if (Array.isArray(value) && value.length && value.every((x) => typeof x === 'number')) {
    return { name, hint, value: { kind: 'literal', value } }
  }
  return { name, hint, value: { kind: 'const', constName: addConst(ctx, hint, value) } }
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

/** 组件类型 → IR 语义类别：模板端只按类别决定摆放方式 */
function kindOf(type: string, contract: TypeContract): IrKind {
  if (listOf(type)) return 'list'
  if (contract.displayModeDriven) return 'container'
  if (contract.nested || contract.table) return 'layout'
  if (contract.field || isFieldType(type)) return 'field'
  if (contract.widget) return 'display'
  if (contract.runtime) return 'data'
  return 'display'
}

// ==================== 入口 ====================

export function parseIr(
  schema: { rule: any[]; option: any; dataSources: any[]; actions: any[] },
  meta: { pageKey: string; pageName: string; exportedAt: string },
): IrPage {
  // 页面主体（列表组件）：容器展示方式与两处尺寸冲突都以它的 viewDetail 为准
  const listNode = (schema.rule || []).find((r) => listOf(r?.type))
  // 链判定要的载体事实（列表/容器寻址、handler 名占用）先建好：节点规划期间的丢弃改判
  // 与 planBehaviors 的兜底让位读的都是这一份，前后不会算出两套结论
  const unsupported: Unsupported[] = []
  const chain = chainPageFacts(schema, meta, unsupported)
  // 容器展示方式由列表组件的 viewDetail.formMode 决定，schema.displayMode 运行期不生效
  const ctx: Ctx = {
    unsupported,
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
    injections: new Map(),
    chain,
  }
  // 链的 implementedBy 要指认产物文件：文件名归 ctx，链侧不重算一遍命名规则
  chain.file = ctx.file
  const apiFile = `api/${meta.pageKey.replace(/_/g, '-')}.ts`

  const nodes = (schema.rule || []).map((node, i) => planNode(node, `rule[${i}]`, `n${i + 1}`, ctx, ROOT_ENV))
  if (ctx.containerMode === 'inline') {
    ctx.unsupported.push({
      path: 'rule[]',
      type: 'formContainer',
      key: 'viewDetail.formMode',
      message: 'inline 展示方式首版不出码（产物形态是覆盖层容器，行内嵌需要页面骨架配合），需人工补',
    })
  }
  const option = planOption(schema.option, ctx, `n${(schema.rule || []).length + 1}`)
  const { behaviors, switchCases } = planBehaviors(schema, nodes, ctx)
  // 链的行为登记（origin 是链在 schema 里的地址，不以 actions[ 开头，回导侧不会把它当总线动作重建）
  for (const draft of chain.behaviorDrafts) behaviors.push({ id: `b${behaviors.length + 1}`, ...draft })

  // 两处尺寸（列表组件 viewDetail.width / 容器 dialogWidth）都会出码，运行期以列表组件为准；
  // 不等时产物里有两份真相，登记成冲突告警让人来看，不出静默取其一
  const container = nodes.find((p) => p.artifact.type === 'formContainer')
  const vw = listNode?.props?.viewDetail?.width
  const dw = container && (schema.rule || []).find((r) => r.type === 'formContainer')?.props?.dialogWidth
  if (container && vw && dw && vw !== dw) {
    container.artifact.warnings.push({
      kind: 'value-conflict',
      path: 'props.dialogWidth',
      message: `容器尺寸 ${dw} 与列表组件 ${listNode!.type} 的 viewDetail.width ${vw} 不一致，运行期以列表组件为准（PageDataTable.vue:198、PageDataCards.vue:139），出码两处都保留`,
    })
  }

  const dataSources = planDataSources(schema, ctx, apiFile)
  const wiring = finalizeWiring(nodes, ctx)

  return {
    pageKey: meta.pageKey,
    pageName: meta.pageName,
    exportedAt: meta.exportedAt,
    schemaDigest: digest(schema),
    file: ctx.file,
    apiFile,
    containerMode: ctx.containerMode,
    containerModeSource: ctx.containerModeSource,
    nodes,
    option,
    dataSources,
    behaviors,
    switchCases,
    chains: chain.chains,
    consts: [...ctx.consts.entries()],
    unsupported: ctx.unsupported,
    writeDashFilter: wiring.writeDashFilter,
    writebacks: wiring.writebacks,
    injections: wiring.injections,
  }
}

/**
 * 收口接线：只有容器子树内的字段控件才接 @select/@clear 与注入 prop —— 页面级字段没有
 * form 可写，硬接线就是把债改成假绿灯。事件 wireOnly 也在这里登记，模板端不再改写 manifest。
 */
function finalizeWiring(
  nodes: IrNode[],
  ctx: Ctx,
): { writebacks: IrWriteback[]; injections: IrInjection[]; writeDashFilter: boolean } {
  const container = nodes.find((p) => p.artifact.type === 'formContainer')
  const inContainer = new Set<string>()
  const nodesById = new Map<string, IrNode>()
  if (container) {
    const collect = (p: IrNode) => {
      inContainer.add(p.artifact.id)
      nodesById.set(p.artifact.id, p)
      p.children.forEach(collect)
    }
    container.children.forEach(collect)
  }

  // 注入 prop：值绑到 script 顶层常量（元素上的 v-bind 表达式不是 schema 证据）
  const injections: IrInjection[] = []
  for (const inj of ctx.injections.values()) {
    if (!inContainer.has(inj.nodeId)) {
      ctx.unsupported.push({
        path: inj.rulePath,
        type: inj.type,
        key: inj.prop,
        message: `${inj.type} 需要 ${inj.prop} 后端（容器 form），但不在容器子树里，产物不接线`,
      })
      continue
    }
    const node = nodesById.get(inj.nodeId)!
    node.props.push({ name: inj.prop, hint: `inject:${inj.constName}`, value: { kind: 'const', constName: inj.constName } })
    node.artifact.wireOnly.push(inj.prop)
    node.injection = inj
    injections.push(inj)
  }

  // 带回 handler 命名：按 ctx.writes 的插入顺序（节点规划顺序）分配，重名加序号
  const writebacks: IrWriteback[] = []
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
    const rw: IrWriteback = {
      ...w,
      select: uniqueName(`on${pascal(w.field)}Select`),
      clear: uniqueName(`on${pascal(w.field)}Clear`),
    }
    writebacks.push(rw)
    const wbNode = nodesById.get(w.nodeId)!
    wbNode.writeback = rw
    // 产物把带回从组件内部的 formCreateInject 改成显式 @select/@clear：
    // 事件不在 schema 的 props 面，回读必须靠 wireOnly 剥离，不能报多造
    wbNode.artifact.wireOnly.push('on.select', 'on.clear')
  }

  const all: IrNode[] = []
  const walkAll = (list: IrNode[]) => {
    for (const p of list) {
      all.push(p)
      walkAll(p.children)
      for (const c of p.nested?.columns || []) walkAll(c.children)
    }
  }
  walkAll(nodes)
  const writeDashFilter = all.some((p) => p.filterSource) && all.some((p) => p.filterTarget)

  // 产物接线的事件键：schema 里没有这些键，回导必须靠 wireOnly 剥离。
  // 读节点的 outlets（契约里 when='chain' 的出口只在该节点真有链时才在这份上），
  // 直接读契约 events 会给无链的页面多登记一个没绑的挂点。
  for (const p of nodes) {
    if (listOf(p.artifact.type)) {
      p.artifact.wireOnly.push(...(p.outlets || []).map((e) => `on.${camel(e.on)}`))
    }
  }
  if (writeDashFilter) {
    for (const p of all) {
      if (p.filterSource) p.artifact.wireOnly.push('on.filterChange')
      if (p.filterTarget) p.artifact.wireOnly.push('on.ready')
    }
  }

  return { writebacks, injections, writeDashFilter }
}

// ==================== 单节点 ====================

function planNode(node: any, rulePath: string, id: string, ctx: Ctx, env: Env = ROOT_ENV): IrNode {
  const contract: TypeContract | undefined = TYPE_CONTRACTS[node.type]
  if (!contract) {
    ctx.unsupported.push({ path: rulePath, type: node.type, key: '', message: `组件类型 ${node.type} 无出码契约，整节点未出码` })
    return {
      artifact: {
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
      kind: 'display',
      tag: null,
      marker: false,
      props: [],
      attrs: {},
      children: [],
    }
  }

  const mode = contract.displayModeDriven ? ctx.containerMode : undefined
  const tag = mode ? containerTag(mode) : contract.tag
  // 组件没 defineExpose（list.expose=none）就别写 ref：产物里挂个取不到方法的 ref 是假接线。
  // 展示组件（dash-* / page-*）确实暴露了 refresh/setFilter，但产物侧还没有取用方
  // （现网靠 ready 上报进 dashInstances/componentRefs 由渲染器寻址，产物没有那张登记表），
  // 挂 ref 只会多一个没人调的变量；要接就先消对应的 requires 语义债。
  const refable = refableOf(node.type)
  const plan: IrNode = {
    artifact: {
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
    kind: kindOf(node.type, contract),
    tag,
    // 元素必须自带节点地址的类型：展示组件（同类型多实例并排）与嵌套容器（一类容器可能有多个）。
    // 只按标签找第一个元素的话，回读会把第一份的属性套到所有份上还能零差异。
    marker: !!(contract.widget || contract.nested || contract.table),
    props: [],
    attrs: {},
    children: [],
  }

  // dash-filter 广播能力（运行期渲染器持有实例表，产物自己持一份）：
  // 关掉 autoBroadcast 的筛选器不接 filter-change，否则开关形同虚设
  if (contract.dashFilter === 'source' && node.props?.autoBroadcast !== false) plan.filterSource = true
  if (contract.dashFilter === 'target') plan.filterTarget = true
  // 产物侧固定接线：值写进模板，键名进归属登记（schema 里没有这个键，回导不许报多造）
  for (const [k, v] of Object.entries(contract.constAttrs || {})) {
    plan.props.push(toIrProp(ctx, k, v, `const:${k}`))
    plan.artifact.wireOnly.push(k)
  }
  // 页面 key：现网由渲染器注入（PageRendererPage.vue:553），产物不传就是漏组件必填 prop，
  // 且 Excel 导入导出会拿空 pageKey 拼 URL
  if (contract.needsPageKey) {
    plan.props.push(toIrProp(ctx, 'pageKey', ctx.pageKey, 'const:pageKey'))
    plan.artifact.wireOnly.push('pageKey')
  }
  // 语义债登记：契约能把键出码，组件跑起来还差一段接线，按节点记账
  for (const req of contract.requires || []) {
    ctx.unsupported.push({ path: `${rulePath}.props.${req.key}`, type: node.type, key: req.key, message: req.note })
  }
  // 嵌套容器内的字段控件：值挂在行对象（itemsRow.qty）或子表单对象（form.invoice_info.tax_no）上，
  // 带回与注入 adapter 都只会读写 form.<字段> —— 硬接就是假绿灯，首版统一记语义债不接线。
  const nestedScoped = !!env.nestedOwner && (isFieldType(node.type) || !!contract.field)
  // 注入接线（contract.injects）：字段控件才需要 form 后端，容器归属在收口阶段定
  if (contract.injects && contract.field) {
    if (nestedScoped) {
      ctx.unsupported.push({
        path: `${rulePath}.props`,
        type: node.type,
        key: contract.injects.prop,
        message: `${node.type} 在嵌套容器（${env.nestedOwner}）里，字段值挂在${env.nestedOwner === 'subForm' ? '子表单对象' : '行对象'}上而不是 form.${plan.artifact.field}，产物没有对应后端，不接 ${contract.injects.prop}`,
      })
    } else {
      ctx.injections.set(id, {
        nodeId: id,
        rulePath,
        type: node.type,
        prop: contract.injects.prop,
        constName: contract.injects.constName,
      })
    }
  }
  // 带回声明（LookupPicker 的 idField/returnFields）：此处只记账，容器归属与 handler
  // 命名在收口阶段定 —— 字段控件可能不在容器里，那种没有 form 可写，不能假接线。
  if (contract.writes) {
    const idRaw = contract.writes.idKey ? node.props?.[contract.writes.idKey] : undefined
    const mapRaw = contract.writes.mapKey ? node.props?.[contract.writes.mapKey] : undefined
    const declared = !!idRaw || (isPlainObject(mapRaw) && Object.keys(mapRaw).length)
    if (declared && nestedScoped) {
      ctx.unsupported.push({
        path: `${rulePath}.props`,
        type: node.type,
        key: 'writes',
        message: `${node.type} 在嵌套容器（${env.nestedOwner}）里配了带回，字段值挂在${env.nestedOwner === 'subForm' ? '子表单对象' : '行对象'}上而不是 form.<字段>，handler 无处写，产物不接线`,
      })
    } else if (declared) {
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
  const leaves = [
    ...flatten(self, '', contract.self || {}),
    ...flatten(node.props ?? {}, 'props', prefixTable('props', contract.props)),
  ]
  // 行/列配置常量先建：config 键要并进同一份，且 addConst 的去重比对得看到完整对象
  const cfg = leaves.filter((l) => l.entry?.emit === 'config')
  if (cfg.length) {
    const obj: Record<string, unknown> = {}
    for (const l of cfg) obj[leafName(l.path)] = l.value
    plan.config = { name: addConst(ctx, `${camelField(plan.artifact.field)}Config`, obj), obj }
  }
  // 列表节点的三类链判定要早于落点应用：列链能不能真在产物里执行，决定 onCellClick
  // 是「丢弃登记 + 从 columns 常量里剥掉」还是「随 columns 透传 + 出 handler 分支」。
  // 出口（含 when='chain' 的按需出口）也在这一步定名，模板端与 wireOnly 登记共用这一份。
  if (contract.list) {
    plan.outlets = fixedOutletsOf(node.type).map((e) => ({
      on: e.on,
      handler: claimHandler(ctx.chain, e.handler, id),
    }))
    analyzeNodeChains(node, rulePath, id, plan.artifact.host.ref, plan.outlets, ctx.chain)
  }
  applyLeaves(plan, leaves, rulePath, ctx)

  // 子规则递归的唯一开关：契约把载体登记成 children 才摊成真模板。
  // 登记成 prop 的（page-data-container 的 childRules）是交给组件自己解释的数据，
  // 再递归一遍就会出现两份真相 —— 子节点既进 plan 要出码，原件又整块透传，回读必然报多造。
  if (contract.table) planTable(plan, node, rulePath, id, ctx, env)
  else if (contract.nested) planNested(plan, node, contract, rulePath, id, ctx, env)
  else if (contract.props?.rule?.emit === 'children' && Array.isArray(node.props?.rule)) {
    const childEnv: Env = { ...env, inContainer: env.inContainer || node.type === 'formContainer' }
    node.props.rule.forEach((child: any, ci: number) => {
      plan.children.push(planNode(child, `${rulePath}.props.rule[${ci}]`, `${id}.f${ci + 1}`, ctx, childEnv))
    })
  }

  // 页面级（容器外）的嵌套容器：产物在页面主体那层没有 form 模型，行增删无处落，整节点降级。
  // 逐键登记丢弃 + 一行 lc:todo，债记在 unsupported，回读仍零空洞（不是把差异吞掉）。
  if (contract.nested && !env.inContainer) {
    degradePlan(plan, ctx, '页面级嵌套容器首版不出码：产物页面主体没有 form 模型，行增删与取值无处落')
    ctx.unsupported.push({
      path: rulePath,
      type: node.type,
      key: 'nested',
      message: `${node.type} 在容器外（页面级），没有 form 后端，整节点降级为挂点注释`,
    })
  }

  // 字段控件的 v-model 路径：回导侧靠它把 el-input 对回 schema 节点。
  // 前缀随作用域变（form / 行别名 / 子表单对象），行别名按容器字段命名 —— 同页多个行容器
  // 的同名字段（两张表都有 remark）才不会互相套到同一行上。
  if (plan.artifact.field && contract.field) plan.artifact.host.vmodel = `${env.prefix}.${plan.artifact.field}`

  // 锚点注释是回读侧唯一能拿到「模板上别处没有」的信息（dataSourceId、fcTable 的 slot 地址），
  // 除 type/field 外的登记键全部带上；ds 放在最前，既有产物字节不变
  const extras = Object.entries(plan.anchorKv || {}).filter(([k]) => k !== 'type' && k !== 'field')
  const ordered = [...extras.filter(([k]) => k === 'ds'), ...extras.filter(([k]) => k !== 'ds')]
  plan.artifact.anchor =
    `lc:node=${id} type=${node.type} field=${plan.artifact.field}` + ordered.map(([k, v]) => ` ${k}=${v}`).join('')
  return plan
}

/**
 * 嵌套容器（group / tableForm / subForm）的子树规划。
 * 两类载体分开走：props.rule（group/subForm 直接子规则）与 props.columns[].rule（tableForm 按列挂），
 * 列对象本身不是 rule 节点，但它的元数据有真载体（label 落 el-table-column），所以给它合成一条登记条目。
 */
function planNested(plan: IrNode, node: any, contract: TypeContract, rulePath: string, id: string, ctx: Ctx, env: Env): void {
  const shape = contract.nested!.shape
  const field = plan.artifact.field
  const nested: IrNested = {
    carrier: contract.nested!.carrier,
    shape,
    valuePath: `${env.prefix}.${field}`,
    // 行别名按容器字段命名：同页两个行容器都有 remark 时，deliveryPlanRow.remark 与 itemsRow.remark
    // 才是两个可对回元素的地址（v-model 是回导侧唯一的字段控件寻址手段）
    rowVar: shape === 'array' ? `${camelField(field)}Row` : '',
    rowKeys: [],
    columns: [],
  }
  plan.nested = nested
  const childEnv: Env = { ...env, prefix: shape === 'array' ? nested.rowVar : nested.valuePath, nestedOwner: node.type }
  const colOf = (child: IrNode) => {
    if (shape === 'array' && child.artifact.field) nested.rowKeys.push(child.artifact.field)
  }

  if (nested.carrier === 'props.rule') {
    asArray(node.props?.rule).forEach((child: any, ci: number) => {
      const cp = planNode(child, `${rulePath}.props.rule[${ci}]`, `${id}.f${ci + 1}`, ctx, childEnv)
      plan.children.push(cp)
      colOf(cp)
    })
    return
  }

  asArray(node.props?.columns).forEach((col: any, ci: number) => {
    const colId = `${id}.c${ci}`
    const colPath = `${rulePath}.props.columns[${ci}]`
    const colNode: NodeArtifact = {
      id: colId,
      rulePath: colPath,
      type: 'tableForm-column',
      field: '',
      anchor: `lc:node=${colId}`,
      file: ctx.file,
      // 列元素的地址写在元素上（同类型多实例并排），回读按 lc:node 各回各的列
      host: { tag: 'el-table-column', ref: null },
      dropped: [],
      renames: [],
      wireOnly: [],
      warnings: [],
    }
    const column: IrNestedColumn = {
      index: ci,
      node: colNode,
      label: String(col?.label ?? ''),
      hidden: !!col?.hidden,
      children: [],
    }
    nested.columns.push(column)
    for (const k of Object.keys(col || {})) {
      if (k === 'rule') continue
      const e = TABLE_COLUMN_CONTRACT[k]
      if (!e) {
        ctx.unsupported.push({
          path: `${colPath}.${k}`,
          type: 'tableForm-column',
          key: k,
          message: '列配置键无落点登记 —— 必须补 TABLE_COLUMN_CONTRACT 或人工确认',
        })
        continue
      }
      if (e.emit === 'attr') {
        colNode.renames.push({ from: k, to: `${(e as { on: string }).on}@${(e as { as: string }).as}` })
        continue
      }
      if (e.emit === 'children') continue
      if (e.emit !== 'drop') {
        ctx.unsupported.push({
          path: `${colPath}.${k}`,
          type: 'tableForm-column',
          key: k,
          message: `列配置键登记了不支持的落点 ${e.emit}`,
        })
        continue
      }
      colNode.warnings.push({ kind: e.kind, path: k, message: e.note })
    }
    // 隐藏列首版不出码：产物没有「隐藏的列」这种形态，列整块不渲染，label 跟着按丢弃登记
    if (column.hidden) {
      for (const r of colNode.renames) {
        colNode.warnings.push({ kind: 'not-in-artifact', path: r.from, message: '隐藏列首版不出码，列标题随之无落点' })
      }
      colNode.renames = []
    }
    asArray(col?.rule).forEach((child: any, ri: number) => {
      const cp = planNode(child, `${colPath}.rule[${ri}]`, `${colId}.f${ri + 1}`, ctx, childEnv)
      column.children.push(cp)
      colOf(cp)
      if (column.hidden) degradePlan(cp, ctx, '隐藏列首版不出码')
    })
  })
}

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : [])

const positiveInt = (v: unknown): number => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : 0
}

/**
 * fcTable 的几何规划：按 Table.vue loadRule 的 lattice 算法算可见格与合并覆盖，
 * 子节点按 slot 分进格（被覆盖的 slot 归 home 格，与 lattice.slot 的渲染顺序一致）。
 * 运行期对越界/重叠的 layout 项会就地 splice 掉，产物按同一套裁剪规则出静态 td。
 */
function planTable(plan: IrNode, node: any, rulePath: string, id: string, ctx: Ctx, env: Env): void {
  const raw = node.props?.rule
  if (!isPlainObject(raw)) {
    ctx.unsupported.push({
      path: `${rulePath}.props.rule`,
      type: node.type,
      key: 'rule',
      message: 'fcTable 的几何载体缺失或不是对象，按 1×1 空表出码',
    })
  }
  const rule: Record<string, unknown> = isPlainObject(raw) ? raw : {}
  // 几何键逐键登记：表外的键不许随对象静默带走
  for (const k of Object.keys(rule)) {
    const e = TABLE_RULE_CONTRACT[k]
    if (!e) {
      ctx.unsupported.push({
        path: `${rulePath}.props.rule.${k}`,
        type: node.type,
        key: k,
        message: 'fcTable 几何键无落点登记 —— 必须补 TABLE_RULE_CONTRACT 或人工确认',
      })
      continue
    }
    if (e.emit === 'derived') {
      plan.artifact.renames.push({ from: `props.rule.${k}`, to: `derived:${e.by}` })
    } else if (e.emit === 'drop') {
      plan.artifact.warnings.push({ kind: e.kind, path: `props.rule.${k}`, message: e.note })
    } else {
      ctx.unsupported.push({
        path: `${rulePath}.props.rule.${k}`,
        type: node.type,
        key: k,
        message: `fcTable 几何键登记了不支持的落点 ${e.emit}`,
      })
    }
  }

  const rows = positiveInt(rule.row) || 1
  const cols = positiveInt(rule.col) || 1
  const lattice: Array<Array<{ rowspan: number; colspan: number; covered: string[]; show: boolean }>> = []
  for (let r = 0; r < rows; r++) {
    const line: Array<{ rowspan: number; colspan: number; covered: string[]; show: boolean }> = []
    for (let c = 0; c < cols; c++) line.push({ rowspan: 1, colspan: 1, covered: [], show: true })
    lattice.push(line)
  }

  const layout: IrTable['layout'] = []
  asArray(rule.layout).forEach((v, i) => {
    const top = Number(v?.top)
    const left = Number(v?.left)
    const wantRow = Number(v?.row)
    const wantCol = Number(v?.col)
    const invalid = (message: string) =>
      ctx.unsupported.push({ path: `${rulePath}.props.rule.layout[${i}]`, type: node.type, key: 'layout', message })
    if (!Number.isInteger(top) || !Number.isInteger(left) || top < 0 || left < 0 || top >= rows || left >= cols) {
      invalid(`合并项 (${v?.top},${v?.left}) 越界 ${rows}×${cols}，运行期 loadRule 会把它删掉，产物不还原`)
      return
    }
    if ((!wantRow || wantRow <= 0) && (!wantCol || wantCol <= 0)) {
      invalid('合并项 row/col 都不为正，运行期 loadRule 会把它删掉，产物不还原')
      return
    }
    const home = lattice[top][left]
    if (!home.show) {
      invalid(`合并项 home 格 (${top},${left}) 已被前一项覆盖，运行期 loadRule 会把它删掉，产物不还原`)
      return
    }
    const rowspan = wantRow > 0 ? Math.min(wantRow, rows - top) : 1
    const colspan = wantCol > 0 ? Math.min(wantCol, cols - left) : 1
    home.rowspan = rowspan
    home.colspan = colspan
    for (let dr = 0; dr < rowspan; dr++) {
      for (let dc = 0; dc < colspan; dc++) {
        if (!dr && !dc) continue
        lattice[top + dr][left + dc].show = false
        home.covered.push(`${top + dr}:${left + dc}`)
      }
    }
    layout.push({ top, left, row: rowspan, col: colspan })
  })

  const styleMap = isPlainObject(rule.style) ? rule.style : {}
  const classMap = isPlainObject(rule.class) ? rule.class : {}
  const cells: IrTableCell[] = []
  const cellBySlot = new Map<string, IrTableCell>()
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const l = lattice[r][c]
      if (!l.show) continue
      const slot = `${r}:${c}`
      const cell: IrTableCell = {
        row: r,
        col: c,
        rowspan: l.rowspan,
        colspan: l.colspan,
        slot,
        coveredSlots: l.covered,
        children: [],
        style: isPlainObject(styleMap[slot]) ? (styleMap[slot] as Record<string, unknown>) : undefined,
        className:
          classMap[slot] === undefined || classMap[slot] === null || classMap[slot] === '' ? undefined : String(classMap[slot]),
      }
      cells.push(cell)
      cellBySlot.set(slot, cell)
      for (const covered of l.covered) cellBySlot.set(covered, cell)
    }
  }
  // 合并覆盖格上的 style/class 运行期不读（td 只取 home 地址），登记成丢弃而不是静默带走
  for (const [mapName, map] of [
    ['style', styleMap],
    ['class', classMap],
  ] as const) {
    for (const k of Object.keys(map)) {
      if (cellBySlot.get(k)?.slot === k) continue
      plan.artifact.warnings.push({
        kind: 'no-consumer',
        path: `props.rule.${mapName}.${k}`,
        message: `格 ${k} 不是可见 home 格，运行期 td 不取这份 ${mapName}，出码丢弃`,
      })
    }
  }
  plan.table = { rows, cols, cells, layout, style: styleMap, className: classMap }

  asArray(node.children).forEach((child, ci) => {
    const cp = planNode(child, `${rulePath}.children[${ci}]`, `${id}.f${ci + 1}`, ctx, env)
    plan.children.push(cp)
    const slot = typeof child?.slot === 'string' ? child.slot : ''
    const cell = cellBySlot.get(slot)
    if (!cell) {
      degradePlan(cp, ctx, `子节点 slot=${slot || '(空)'} 不在表格 ${rows}×${cols} 的格坐标里，运行期不会渲染`)
      ctx.unsupported.push({
        path: `${rulePath}.children[${ci}]`,
        type: child?.type ?? '',
        key: 'slot',
        message: `子节点 slot=${slot || '(空)'} 找不到对应格（${rows}×${cols}），产物不渲染`,
      })
      return
    }
    // 静态表格不是表单：字段控件没有 v-model 路径可绑，首版整字段降级（不留死控件）
    if (isFieldType(child?.type) || TYPE_CONTRACTS[child?.type]?.field) {
      degradePlan(cp, ctx, 'fcTable 里的字段控件没有 form 绑定路径（静态表格不是表单），首版不出码')
      ctx.unsupported.push({
        path: `${rulePath}.children[${ci}]`,
        type: child?.type ?? '',
        key: 'field',
        message: 'fcTable 内字段控件需要 form 后端，首版整字段降级',
      })
      return
    }
    cell.children.push(cp)
  })
}

/**
 * 整节点降级：元素不出，但每个 schema 键都要有解释 —— 否则回读把「没出码」报成编译器不忠实
 * （C 桶），真实缺陷和广度债就分不开了。做法：非锚点登记全转丢弃登记，锚点（type/field）保留，
 * 由 lc:todo 注释继续提供寻址；本节点的具名常量不再被模板读，跟着删掉免得产物里多个死变量。
 */
function degradePlan(p: IrNode, ctx: Ctx, reason: string): void {
  p.degraded = true
  p.degradeReason = reason
  p.artifact.degraded = true
  // 没有元素就没有绑定可读：tag 置空让回读侧别再按标签抓到一个无关元素
  p.artifact.host = { ...p.artifact.host, tag: null }
  const kept = new Set(p.artifact.renames.filter((r) => r.to.startsWith('anchor:')).map((r) => r.from))
  for (const path of [...(p.leafPaths || []), ...p.artifact.renames.map((r) => r.from)]) {
    if (kept.has(path) || p.artifact.warnings.some((w) => w.path === path)) continue
    p.artifact.warnings.push({ kind: 'not-in-artifact', path, message: reason })
  }
  p.artifact.renames = p.artifact.renames.filter((r) => kept.has(r.from))
  p.props = []
  p.marker = false
  if (p.config) ctx.consts.delete(p.config.name)
  p.children.forEach((c) => degradePlan(c, ctx, reason))
  for (const c of p.nested?.columns || []) {
    c.node.warnings = [...c.node.warnings, ...c.node.renames.map((r) => ({ kind: 'not-in-artifact', path: r.from, message: reason }))]
    c.node.renames = []
    c.children.forEach((cp) => degradePlan(cp, ctx, reason))
  }
}

function applyLeaves(plan: IrNode, leaves: Leaf[], rulePath: string, ctx: Ctx): void {
  // 深层丢弃要先攒齐：整块出码的值里得把它们剥掉
  const nestedDrops = new Map<string, string[]>()
  for (const l of leaves) {
    if (l.under && l.entry?.emit === 'drop' && !ctx.chain.compiledCells.has(`${rulePath}.${l.path}`)) {
      const list = nestedDrops.get(l.under) || []
      list.push(l.path.slice(l.under.length))
      nestedDrops.set(l.under, list)
    }
  }
  plan.leafPaths = [...(plan.leafPaths || []), ...leaves.filter((l) => l.entry).map((l) => l.path)]
  for (const leaf of leaves) applyLeaf(plan, leaf, rulePath, ctx, nestedDrops)
}

function applyLeaf(plan: IrNode, leaf: Leaf, rulePath: string, ctx: Ctx, nestedDrops: Map<string, string[]>): void {
  const entry = leaf.entry
  const rel = leaf.path
  const node = plan.artifact
  // 契约声明的缺省值 = 语义缺席：载体与登记都不留痕迹，回导按 STRUCT_DEFAULTS 补默认值
  // （$required: false 若留 rename，web 产物里没有可核对的 required，回导校验会假红）
  if (entry?.emit === 'attr' && entry.skipDefault !== undefined && JSON.stringify(entry.skipDefault) === JSON.stringify(leaf.value)) return
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
      // 列点击链已在产物里真出码：这一键跟着 columns 常量出去，不再当丢弃登记
      if (ctx.chain.compiledCells.has(`${rulePath}.${rel}`)) return
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
        plan.props.push(toIrProp(ctx, leafName(rel), leaf.value, rel))
        node.renames.push({ from: rel, to: `props.${leafName(rel)}`, note: '非默认值显式出码' })
      }
      return
    case 'anchor':
      plan.anchorKv = { ...(plan.anchorKv || {}), [entry.key]: String(leaf.value ?? '') }
      node.renames.push({ from: rel, to: `anchor:${node.id}@${entry.key}`, note: '模板上别处没有这个信息' })
      useDs(ctx, leaf.value, rulePath)
      return
    case 'derived':
      node.renames.push({ from: rel, to: `derived:${entry.by}`, evidence: entry.evidence })
      if (entry.by === 'dsRefId') {
        // 逐节点取自己的源：ds 常量只代表 dataSources[0]，仪表盘上第二个 KPI 绑别的源时
        // 沿用 ds.refId 就是拿错 refId 取数（查错表），必须走产物里的 dataSources 表
        plan.props.push({
          name: 'ds-ref-id',
          hint: rel,
          value: { kind: 'dsRef', sourceId: String(leaf.value ?? '') },
        })
        useDs(ctx, leaf.value, rulePath)
      }
      // 选择器的取数身份：产物不挂渲染器，activeDsBindings 恒空，组件只能吃现成的 refId
      // （DataPicker.vue:265 的 binding?.refId || globalDataSourceId 那条回退）。
      // 一律查表、不分首个源：同页两个 picker 各绑各的表，走 ds.refId 就是拿错源。
      if (entry.by === 'globalDataSourceId') {
        plan.props.push({
          name: 'global-data-source-id',
          hint: rel,
          value: { kind: 'globalDataSourceId', sourceId: String(leaf.value ?? '') },
        })
        useDs(ctx, leaf.value, rulePath)
      }
      return
    case 'attr': {
      const attrName = entry.by === 'containerSizeAttr' ? containerSizeAttrOf(ctx) : entry.as!
      const target = entry.on ?? plan.tag!
      plan.attrs[target] = plan.attrs[target] || {}
      plan.attrs[target][attrName] = leaf.value
      node.renames.push({ from: rel, to: `${target}@${attrName}` })
      return
    }
    case 'children':
      return // 子规则由 planNode 递归处理
    case 'table':
      return // 几何由 planTable 单独处理（row/col/layout 换算成 td 跨度）
    case 'config': {
      // 行/列配置：产物模板与 handler 读的是 script 顶层那份常量，回读核对的也必须是它。
      // 写成 prop 就是错位 emit —— 嵌套容器的载体是 div / el-table，没有 min、sortBtn 这些 prop，
      // 值只会落到根 DOM 当悬空属性；锚点注释里的值都是字符串，数字与布尔核不出真相。
      node.renames.push({ from: rel, to: `const:${plan.config!.name}.${leafName(rel)}` })
      return
    }
    default: {
      const propName = entry.as ?? leafName(rel)
      const prefix = `${rulePath}.`
      // 链配置里已展开成 handler 的那几支从常量剥掉（$row 模板出码期就解析完了），
      // 并逐支登记丢弃：abs 是页面级绝对路径，登记用相对本节点的路径
      const compiled = [...ctx.chain.compiledChainConfig].filter((abs) => abs.startsWith(`${prefix}${rel}.`))
      const value = stripPaths(leaf.value, [...(nestedDrops.get(rel) || []), ...compiled.map((abs) => abs.slice(prefix.length + rel.length))])
      compiled.forEach((abs) =>
        node.warnings.push({
          kind: 'chain-compiled',
          path: abs.slice(prefix.length),
          message: '链配置已展开成 handler 里的执行代码，常量里不再留这份配置（externalActions 接管下组件也不会再跑它）',
        }),
      )
      plan.props.push(toIrProp(ctx, propName, value, rel))
      if (entry.as) node.renames.push({ from: rel, to: `props.${propName}` })
      if (propName === 'dataSourceId') useDs(ctx, leaf.value, rulePath)
    }
  }
}

/** 容器尺寸属性名：drawer 吃 size，dialog 吃 width */
const containerSizeAttrOf = (ctx: Ctx) => (ctx.containerMode === 'drawer' ? 'size' : 'width')

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
function planDataSources(schema: any, ctx: Ctx, apiFile: string): IrDataSource[] {
  return (schema.dataSources || []).map((src: any, i: number) => {
    const path = `dataSources[${i}]`
    const entry: IrDataSource = {
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

function planOption(option: any, ctx: Ctx, id: string): IrOption {
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
  const attrs: Record<string, Record<string, unknown>> = { 'el-form': {} }
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
      attrs['el-form'][entry.as!] = leaf.value
      node.renames.push({ from: leaf.path, to: `el-form@${entry.as}` })
      continue
    }
    ctx.unsupported.push({ path: `option.${leaf.path}`, type: 'option', key: leaf.path, message: 'option 落点类型未实现' })
  }
  return { node, attrs }
}

// ==================== 动作流 ====================

const HANDLED_TRIGGERS = ['row-edit', 'row-view', 'row-create']

/** 有 emit 出口的总线触发器：这类动作先试着编成链，编出来才算实现 */
const BUS_CHAIN_TRIGGERS = ['row-click']

function planBehaviors(
  schema: any,
  plans: IrNode[],
  ctx: Ctx,
): { behaviors: Behavior[]; switchCases: IrSwitchCase[] } {
  const behaviors: Behavior[] = []
  const switchCases: IrSwitchCase[] = []
  const wiredCases = new Set<string>()
  const wiredBus = new Set<string>()
  const listPlans = plans.filter((p) => listOf(p.artifact.type))
  const container = plans.find((p) => p.artifact.type === 'formContainer')
  const resolvedTarget = container?.artifact.id || ''
  const seenTriggers = new Set<string>()
  /** 列表节点的出口 → handler 名：implementedBy 指认到产物里真存在的那个函数 */
  const handlerOf = (p: IrNode, on: string) => p.outlets?.find((o) => o.on === on)?.handler

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
    const behavior: Behavior = {
      id: `b${behaviors.length + 1}`,
      origin: `actions[${i}]`,
      trigger: action.trigger,
      source: action.source,
      steps,
      resolvedTarget,
      implementedBy: { file: ctx.file, function: 'onButtonClick', case: triggerCase(action.trigger) },
      warnings: droppedParams,
    }
    behaviors.push(behavior)

    // row-click 有出口（组件 handleRowClick 先派总线再跑链）：按每个绑了该出口的列表编译，
    // 编出来就落进那个列表的 onRowClick；编不出步骤的落下面的记账，不冒充已实现
    if (BUS_CHAIN_TRIGGERS.includes(action.trigger)) {
      const carriers = listPlans.filter((p) => (p.outlets || []).some((o) => o.on === action.trigger))
      const compiled = carriers
        .map((c) =>
          compileBusAction(action, i, ctx.chain, {
            id: c.artifact.id,
            rulePath: c.artifact.rulePath,
            ref: c.artifact.host.ref,
            outlets: c.outlets || [],
            type: c.artifact.type,
          }),
        )
        .find((ch): ch is IrChain => !!ch)
      if (compiled) {
        behavior.implementedBy = { file: ctx.file, function: compiled.outlet }
        wiredBus.add(behavior.origin)
      }
      return
    }

    if (!HANDLED_TRIGGERS.includes(action.trigger)) {
      ctx.unsupported.push({
        path: `actions[${i}]`,
        type: 'bus',
        key: String(action.trigger),
        message: `触发器 ${action.trigger} 在组件 emit 里不存在（见 design D4 的触发器→emit 白名单），产物无法接管，需先做事件面改造`,
      })
    }
  })

  for (const lp of listPlans) {
    const idx = Number(lp.artifact.rulePath.match(/\[(\d+)\]$/)?.[1])
    // 只有把按钮点击 emit 出来的列表组件才能在产物里接管按钮（卡片走总线，见契约 requires）
    const buttonHandler = handlerOf(lp, 'button-click')
    if (!buttonHandler) continue
    const buttons: any[] = schema.rule?.[idx]?.props?.viewActions?.buttons || []
    for (const btn of buttons) {
      // 链的结论在节点规划时就判好了：真出码的链占掉这个 case（组件里链消费点击，
      // 兜底与总线都不会再跑）；全被拒的链同样不还原兜底 —— 那才是运行期的行为
      const chained = ctx.chain.buttonChains.get(`${lp.artifact.rulePath}#${btn.key}`)
      if (chained) {
        switchCases.push({ kind: 'chain', key: String(btn.key), nodeId: lp.artifact.id })
        continue
      }
      if (chained === false) continue
      const map = BUTTON_TRIGGER[btn.key]
      if (!map) {
        if (btn.key === 'delete') {
          switchCases.push({ kind: 'delete', key: 'delete', nodeId: lp.artifact.id })
          wiredCases.add(btn.key)
        } else {
          ctx.unsupported.push({
            path: `${lp.artifact.rulePath}.props.viewActions.buttons(${btn.key})`,
            type: lp.artifact.type,
            key: String(btn.key),
            message: `按钮 ${btn.key} 无对应出码语义（既非内建 key 也无动作链），产物里该按钮不接线`,
          })
        }
        continue
      }
      switchCases.push({ kind: 'open', key: btn.key, readonly: map.readonly, mode: map.mode, nodeId: lp.artifact.id })
      wiredCases.add(btn.key)
      if (!seenTriggers.has(map.trigger)) {
        behaviors.push({
          id: `b${behaviors.length + 1}`,
          origin: 'implicit:buttons',
          trigger: map.trigger,
          source: String(schema.rule?.[idx]?.props?.dataSourceId ?? schema.dataSources?.[0]?.id ?? ''),
          steps: [],
          resolvedTarget,
          implementedBy: { file: ctx.file, function: buttonHandler, case: String(btn.key) },
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

  // 总线动作的“实现声明”必须和产物对齐：没有按钮承载（或承载按钮配了动作链被占掉）、
  // 也没编进 row-click handler 时，产物里没有对应分支，implementedBy 若仍指认，
  // 回读方会误以为动作已接线。
  for (const b of behaviors) {
    if (!b.origin.startsWith('actions[')) continue
    if (wiredBus.has(b.origin)) continue
    if (b.implementedBy && wiredCases.has(b.implementedBy.case ?? '')) continue
    b.implementedBy = undefined
    if (!HANDLED_TRIGGERS.includes(b.trigger)) continue
    b.warnings.push({
      kind: 'not-wired',
      path: `actions(${b.trigger})`,
      message: '该触发器没有可承载的按钮分支（无按钮或按钮配了动作链），产物未生成执行代码，需人工接管',
    })
    ctx.unsupported.push({
      path: b.origin,
      type: 'bus',
      key: b.trigger,
      message: '页面没有承载该触发器的按钮分支，总线动作在产物里不执行',
    })
  }

  return { behaviors, switchCases }
}

const triggerCase = (trigger: string) =>
  trigger === 'row-edit' ? 'edit' : trigger === 'row-view' ? 'view' : trigger === 'row-create' ? 'create' : trigger

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

