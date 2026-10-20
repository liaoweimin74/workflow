/**
 * 出码器 spike 1：PageSchema → 可运行 SFC 产物 + manifest 登记表。
 *
 * 登记表（丢弃 / 重命名派生 / 归属剥离 / 默认省略）不手写，全部由 contract.ts 的
 * 组件能力表算出来 —— 这是 spike 0 的核心结论：产物模板承载不了 schema 的全部语义，
 * 而手写登记表会在加组件时腐烂。
 *
 * 首版边界（超出即 unsupported，出码报告里是 error，不静默丢）：
 *  - 组件只认 page-table / formContainer / input
 *  - 动作流只认总线容器动作 + 按钮内建行为；配了动作链的按钮不出码
 *  - 事件脚本（type=script）不出码
 */

import {
  FIELD_TAGS,
  IDENTITY_KEYS,
  OPTION_CONTRACT,
  STRUCT_DEFAULTS,
  TYPE_CONTRACTS,
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
  source: string
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
  dataSources: Array<{ id: string; refId: string; apiModule: string; dropped: string[] }>
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

/** 出码上下文：跨节点共享的常量表、告警收集与容器展示方式 */
interface Ctx {
  unsupported: Unsupported[]
  consts: Map<string, unknown>
  containerMode: string
  containerModeSource: string
  /** 主 SFC 产物名（由 pageKey 转大驼峰） */
  file: string
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

/** prop 片段：简单值内联，对象/数组走顶层常量 */
function propSnippet(ctx: Ctx, name: string, value: unknown, hint: string): string {
  if (typeof value === 'string') return `${kebab(name)}="${value}"`
  if (typeof value === 'boolean' || typeof value === 'number') return `:${kebab(name)}="${lit(value)}"`
  if (Array.isArray(value) && value.every((x) => typeof x === 'number')) return `:${kebab(name)}="${lit(value)}"`
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
  const table = (schema.rule || []).find((r) => r.type === 'page-table')
  // 容器展示方式由数据表格的 viewDetail.formMode 决定，schema.displayMode 运行期不生效
  const ctx: Ctx = {
    unsupported: [],
    consts: new Map(),
    containerMode: table?.props?.viewDetail?.formMode || 'popup',
    containerModeSource: 'rule[].props.viewDetail.formMode',
    file: `${meta.pageKey
      .split(/[-_]+/)
      .filter(Boolean)
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join('')}.vue`,
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

  // 两处尺寸（表格 viewDetail.width / 容器 dialogWidth）都会出码，运行期以数据表格为准；
  // 不等时产物里有两份真相，登记成冲突告警让人来看，不出静默取其一
  const containerPlan = plans.find((p) => p.node.type === 'formContainer')
  const vw = table?.props?.viewDetail?.width
  const dw = containerPlan && (schema.rule || []).find((r) => r.type === 'formContainer')?.props?.dialogWidth
  if (containerPlan && vw && dw && vw !== dw) {
    containerPlan.node.warnings.push({
      kind: 'value-conflict',
      path: 'props.dialogWidth',
      message: `容器尺寸 ${dw} 与数据表格 viewDetail.width ${vw} 不一致，运行期以数据表格为准（PageDataTable.vue:198），出码两处都保留`,
    })
  }

  const vue = assembleVue({ schema, plans, optionPlan, behaviors, switchCases, ctx, ds, meta })
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
      components: ['page-table'],
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
    dataSources: [
      {
        id: String(ds.id ?? ''),
        refId: String(ds.refId ?? ''),
        apiModule: apiFile.replace(/\.ts$/, ''),
        dropped: ['name'],
      },
    ],
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
  const plan: NodePlan = {
    node: {
      id,
      rulePath,
      type: node.type,
      field: String(node.field ?? ''),
      anchor: '',
      file: ctx.file,
      host: { tag, ref: contract.runtime ? `${id}Ref` : null },
      displayMode: mode,
      displayModeSource: mode ? ctx.containerModeSource : undefined,
      dropped: [...IDENTITY_KEYS],
      renames: [],
      wireOnly: [],
      warnings: [],
    },
    tag,
    propSnippets: [],
    attrs: {},
    anchorKv: {},
    children: [],
  }
  if (contract.runtime) plan.node.host.ref = `${id}Ref`

  const self = Object.fromEntries(
    Object.entries(node).filter(([k]) => k !== 'props' && k !== 'children' && !IDENTITY_KEYS.includes(k)),
  )
  applyLeaves(plan, flatten(self, '', contract.self || {}), rulePath, ctx)
  applyLeaves(plan, flatten(node.props ?? {}, 'props', prefixTable('props', contract.props)), rulePath, ctx)

  if (Array.isArray(node.props?.rule)) {
    node.props.rule.forEach((child: any, ci: number) => {
      plan.children.push(planNode(child, `${rulePath}.props.rule[${ci}]`, `${id}.f${ci + 1}`, ctx))
    })
  }
  // 字段控件的 v-model 路径：回导侧靠它把 el-input 对回 schema 节点
  if (plan.node.field && FIELD_TAGS[node.type]) plan.node.host.vmodel = `form.${plan.node.field}`

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
      return
    case 'derived':
      node.renames.push({ from: rel, to: `derived:${entry.by}`, evidence: entry.evidence })
      if (entry.by === 'dsRefId') plan.propSnippets.push(':ds-ref-id="ds.refId"')
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
    }
  }
}

const containerSizeAttrOf = (ctx: Ctx) => (ctx.containerMode === 'drawer' ? 'size' : 'width')

// ==================== option ====================

function planOption(option: any, ctx: Ctx, id: string): NodePlan {
  const node: NodeArtifact = {
    id,
    rulePath: 'option',
    type: 'option',
    field: '',
    anchor: '',
    file: ctx.file,
    host: { tag: 'el-form', ref: 'formRef' },
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

function planBehaviors(
  schema: any,
  plans: NodePlan[],
  ctx: Ctx,
): { behaviors: Behavior[]; switchCases: string[] } {
  const behaviors: Behavior[] = []
  const switchCases: string[] = []
  const table = plans.find((p) => p.node.type === 'page-table')
  const container = plans.find((p) => p.node.type === 'formContainer')
  const tableRef = table?.node.host.ref || 'tableRef'
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
      source: action.source ?? '',
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

  const buttons: any[] = schema.rule?.find((r: any) => r.type === 'page-table')?.props?.viewActions?.buttons || []
  for (const btn of buttons) {
    if (Array.isArray(btn?.events) && btn.events.length) {
      ctx.unsupported.push({
        path: `rule[].props.viewActions.buttons(${btn.key}).events`,
        type: 'page-table',
        key: String(btn.key),
        message: '按钮配了动作链（chain），spike 1 只出内建行为与总线动作，该按钮不接线',
      })
      continue
    }
    const map = BUTTON_TRIGGER[btn.key]
    if (!map) {
      if (btn.key === 'delete') {
        switchCases.push(
          `    case 'delete':\n      if (row?.id != null) void deleteData(String(row.id)).then(() => ${tableRef}?.refresh())\n      return`,
        )
      } else {
        ctx.unsupported.push({
          path: `rule[].props.viewActions.buttons(${btn.key})`,
          type: 'page-table',
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
        source: String(schema.dataSources?.[0]?.id ?? ''),
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
  meta: { pageKey: string; pageName: string; exportedAt: string }
}): string {
  const { plans, optionPlan, switchCases, ctx, ds, meta } = args
  const table = plans.find((p) => p.node.type === 'page-table')
  const container = plans.find((p) => p.node.type === 'formContainer')
  const refName = table?.node.host.ref || 'tableRef'
  const fields: string[] = []
  if (container) {
    const walk = (p: NodePlan) => {
      if (FIELD_TAGS[p.node.type] && p.node.field) fields.push(p.node.field)
      p.children.forEach(walk)
    }
    container.children.forEach(walk)
  }

  const L: string[] = []
  L.push('<!-- 由 lc-codegen 从页面 schema 出码，勿手改登记表以外的部分；人工接管写在 handler 里 -->')
  L.push('<template>')
  L.push('  <div class="lc-page lc-page--stretch">')
  if (table) {
    const events = table.propSnippets.length ? `${table.propSnippets.join(' ')} ` : ''
    L.push(`    <!-- ${table.node.anchor} -->`)
    L.push(
      `    <${table.tag} ref="${table.node.host.ref}" ${events}@row-click="onRowClick" @button-click="onButtonClick" @selection-change="onSelectionChange" />`,
    )
    table.node.wireOnly.push('on.rowClick', 'on.buttonClick', 'on.selectionChange')
  }
  if (container) L.push(renderContainer(container, optionPlan, ctx))
  L.push('  </div>')
  L.push('</template>')
  L.push('')
  L.push('<script setup lang="ts">')
  L.push("import { reactive, ref } from 'vue'")
  L.push("import PageTable from '@lc/runtime/page-table'")
  L.push(`import { getData, createData, updateData, deleteData } from './api/${meta.pageKey.replace(/_/g, '-')}'`)
  L.push('')
  L.push('// ==================== 数据源（schema.dataSources[]）====================')
  L.push(`const ds = { id: '${ds.id}', refId: '${ds.refId}' }`)
  L.push('')
  if (table) {
    L.push(`// ==================== 节点 ${table.node.id}：page-table（schema.${table.node.rulePath}.props）====================`)
    L.push(`const ${refName} = ref<InstanceType<typeof PageTable> | null>(null)`)
  }
  for (const [name, value] of ctx.consts) L.push('', `const ${name} = ${jsonToTs(value)}`)
  L.push('')
  if (container) {
    L.push(`// ==================== 节点 ${container.node.id}：formContainer（schema.${container.node.rulePath}）====================`)
    L.push('const containerVisible = ref(false)')
    L.push('const containerReadonly = ref(false)')
    L.push("const containerMode = ref<'create' | 'edit' | 'view'>('create')")
    L.push("const containerRecordId = ref('')")
    L.push('const formRef = ref()')
    L.push(`const form = reactive<Record<string, unknown>>({ ${fields.map((f) => `${f}: ''`).join(', ')} })`)
    L.push('')
    L.push(`/** lc:node=${container.node.id} → 打开容器并取记录（原总线 load-record / open-container 的合并语义） */`)
    L.push("async function openContainer(recordId: string, readonly: boolean, mode: 'create' | 'edit' | 'view') {")
    L.push('  containerMode.value = mode')
    L.push('  containerReadonly.value = readonly')
    L.push('  containerRecordId.value = recordId')
    L.push(`  ${fields.length ? `form.${fields[0]} = ''` : 'void form'}`)
    L.push('  containerVisible.value = true')
    L.push('  if (recordId) {')
    L.push('    const res = await getData(recordId)')
    L.push('    Object.assign(form, res.data ?? {})')
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
    L.push('    await updateData(containerRecordId.value, { ...form })')
    L.push('  }')
    L.push('  closeContainer()')
    L.push(`  ${refName}.value?.refresh()`)
    L.push('}')
    L.push('')
  }
  const explicit = args.behaviors.filter((x) => x.origin.startsWith('actions['))
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
  L.push('function onRowClick(_row: Record<string, unknown>) {')
  L.push('  // schema.actions 无 row-click 触发的动作链 → 空实现，保留挂点供人工接管')
  L.push('}')
  L.push('')
  L.push('function onSelectionChange(_rows: Record<string, unknown>[]) {')
  L.push('  // 无关联动作')
  L.push('}')
  L.push('</script>')
  L.push('')
  L.push('<style scoped>')
  L.push('.lc-page--stretch {')
  L.push('  height: 100%;')
  L.push('  display: flex;')
  L.push('  flex-direction: column;')
  L.push('}')
  L.push('.lc-container-body {')
  L.push('  overflow-y: auto;')
  L.push('  height: 600px;')
  L.push('}')
  L.push('</style>')
  L.push('')
  return L.join('\n')
}

function renderContainer(plan: NodePlan, optionPlan: NodePlan, ctx: Ctx): string {
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
  const formLine = [
    'ref="formRef"',
    ':model="form"',
    ...Object.entries(optionPlan.attrs['el-form'] || {}).map(([k, v]) =>
      typeof v === 'boolean' || typeof v === 'number' ? `:${kebab(k)}="${lit(v)}"` : `${kebab(k)}="${v}"`,
    ),
    // labelWidth 运行期测量覆盖（小程序不可用），出码改用 CSS 变量
    'label-width="var(--lc-label-width)"',
  ]
  const items = plan.children.map((c) => {
    const f = c.node.field
    const label = c.attrs['el-form-item']?.label ?? f
    const control = c.propSnippets.length ? ` ${c.propSnippets.join(' ')}` : ''
    return [
      `          <!-- ${c.node.anchor} -->`,
      `          <el-form-item label="${label}">`,
      `            <${c.tag} v-model="form.${f}"${control} />`,
      '          </el-form-item>',
    ].join('\n')
  })
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
