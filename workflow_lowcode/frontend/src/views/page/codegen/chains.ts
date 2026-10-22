/**
 * 动作链判定（schema → IrChain）：触发器出口、参数生成期解析、脚本白名单。
 *
 * 本模块只读 schema 与契约表，不产模板文本：链能不能在产物里执行在这里判完，
 * emit 侧只按 IrChain 出语句。判不了的一律进 unsupported —— 产物里宁可不接线，
 * 也不出「看着像执行了、实际没人调」的假 handler。
 *
 * 口径来源（运行期事实，不是设想）：
 *  - 按钮链：PageDataTable.handleActionClick —— 链里真配了动作才消费点击（空链落回兜底），
 *    且忽略 ev.trigger，用按钮 key 推 chainTrigger（edit→row-edit / view→row-view）。
 *  - 列链：PageDataTable.handleCellClick —— 列级 onCellClick 短路整表 cell-click 组件链。
 *  - 组件链：triggerViewEvents(trigger,'table',ctx) —— ev.target 非空且不是本组件就跳过。
 *  - op 语义与参数键：PageDataTable.dispatchButtonAction 的 switch + pageActionCatalog.CHAIN_ACTIONS。
 */

import { ACTION_OPS, ACTION_OPS_REJECTED, listOf, refableOf } from './contract'
import {
  pascal,
  type Behavior,
  type ChainNeed,
  type IrChain,
  type IrChainArg,
  type IrChainStep,
  type IrEventOutlet,
  type IrTemplatePart,
  type Unsupported,
} from './ir'

/** 按钮 key → 总线触发器与容器打开语义（对齐 PageDataTable 的 LINKAGE_TRIGGERS） */
export const BUTTON_TRIGGER: Record<string, { trigger: string; readonly: boolean; mode: 'create' | 'edit' | 'view' }> = {
  edit: { trigger: 'row-edit', readonly: false, mode: 'edit' },
  view: { trigger: 'row-view', readonly: true, mode: 'view' },
  create: { trigger: 'row-create', readonly: false, mode: 'create' },
}

/** triggerViewEvents 的默认目标名（PageDataTable 传 'table'） */
const SELF_TARGET: Record<string, string> = { 'page-table': 'table', 'page-list-cards': 'cards' }

/** 脚本可用上下文（design D4）：rowIndex 在白名单里但产物的出口都给不到，用到就拒 */
const SCRIPT_CONTEXT = ['form', 'row', 'rowIndex', 'page', 'message', 'http']

/** 与运行期沙箱同一份内置名单（src/utils/scriptSandbox.ts:12 SANDBOX_GLOBALS），别凭记忆删项 */
const SANDBOX_GLOBALS = [
  'console', 'Math', 'Date', 'JSON', 'Object', 'Array', 'String', 'Number', 'Boolean', 'Promise', 'Map', 'Set',
  'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'Infinity', 'NaN',
]

const RESERVED = [
  'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do', 'else',
  'export', 'extends', 'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of',
  'return', 'static', 'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'true', 'false', 'null', 'undefined', 'arguments',
]

/** 页面级链判定要的事实：全部从 schema + 契约表算，节点规划前后同一口径 */
export interface ChainPage {
  pageKey: string
  /** 产物主 SFC 文件名：implementedBy 的指认对象，由 parse 在建 ctx 后回填 */
  file?: string
  /** 容器登记表与产物真出码的那一个（emit 只渲染第一个 formContainer） */
  containers: Array<{ rulePath: string; field: string; ds: string }>
  container: { rulePath: string; field: string; ds: string } | null
  /** 列表载体：总线与组件链的寻址表 */
  lists: Array<{ id: string; rulePath: string; field: string; ds: string; type: string; ref: string | null }>
  unsupported: Unsupported[]
  chains: IrChain[]
  /** 真出码的列链地址（绝对路径）：applyLeaves 据此把 onCellClick 从丢弃改判成透传 */
  compiledCells: Set<string>
  /**
   * 已展开成 handler 代码的链配置（绝对路径）：applyLeaves 把它从整块 prop 常量里剥掉，
   * 并登记成丢弃 —— 产物里既不留解析不出来的 $row 模板，运行时也没有第二份执行者。
   */
  compiledChainConfig: Set<string>
  /** 按钮链结论（`${rulePath}#${key}` → 是否真出 case）：planBehaviors 据此决定还不还兜底 */
  buttonChains: Map<string, boolean>
  /** 链的行为登记草稿（id 由 parse 收口统一编号） */
  behaviorDrafts: Array<Omit<Behavior, 'id'>>
  scriptNames: Set<string>
  /** 产物 handler 名占用表：一页多个列表组件时同名 handler 会把两条链并进同一个函数 */
  usedHandlers: Set<string>
}

export function chainPageFacts(
  schema: any,
  meta: { pageKey: string },
  sink: ChainPage['unsupported'],
): ChainPage {
  const rules: any[] = schema.rule || []
  const shaped = rules.map((n, i) => ({ n, id: `n${i + 1}`, rulePath: `rule[${i}]` }))
  const containers = shaped
    .filter((x) => x.n?.type === 'formContainer')
    .map((x) => ({ rulePath: x.rulePath, field: String(x.n.field ?? ''), ds: String(x.n.props?.dataSourceId ?? '') }))
  const lists = shaped
    .filter((x) => !!listOf(x.n?.type))
    .map((x) => ({
      id: x.id,
      rulePath: x.rulePath,
      field: String(x.n.field ?? ''),
      ds: String(x.n.props?.dataSourceId ?? ''),
      type: x.n.type as string,
      ref: refableOf(x.n.type) ? `${x.id}Ref` : null,
    }))
  return {
    pageKey: meta.pageKey,
    containers,
    container: containers[0] ?? null,
    lists,
    unsupported: sink,
    chains: [],
    compiledCells: new Set(),
    compiledChainConfig: new Set(),
    buttonChains: new Map(),
    behaviorDrafts: [],
    scriptNames: new Set(),
    usedHandlers: new Set(),
  }
}

/**
 * 占一个产物 handler 名：契约给的基名归按画布顺序第一个绑该出口的列表节点，
 * 后面的节点加节点号 —— 两个列表的链并进同一个函数就是一行点击跑两条链。
 */
export function claimHandler(page: ChainPage, base: string, id: string): string {
  const name = page.usedHandlers.has(base) ? `${base}${pascal(id)}` : base
  page.usedHandlers.add(name)
  return name
}

// ==================== 模板拆值 ====================

/**
 * `$row.x` / `$param.x`（链参数）与 `{row.x}` / `{node.x}`（总线步骤值）拆成取值片段。
 * 认不出的占位符进 bad：那一步不接线，而不是留一个产物里解析不出来的字符串。
 */
export function splitTemplate(raw: string, bus = false): { parts: IrTemplatePart[]; bad: string[] } {
  const parts: IrTemplatePart[] = []
  const bad: string[] = []
  const re = bus ? /\{[^{}]*\}/g : /\$[A-Za-z_][\w.]*/g
  const push = (text: string) => {
    if (text) parts.push({ kind: 'text', text })
  }
  let last = 0
  for (const m of raw.matchAll(re)) {
    push(raw.slice(last, m.index))
    last = (m.index ?? 0) + m[0].length
    const token = m[0]
    if (bus) {
      const seg = token.slice(1, -1).trim().split('.')
      if (seg.length === 2 && (seg[0] === 'row' || seg[0] === 'node') && /^\w+$/.test(seg[1])) {
        parts.push({ kind: 'row', field: seg[1] })
      } else bad.push(token)
    } else if (token.startsWith('$row.')) parts.push({ kind: 'row', field: token.slice(5) })
    else if (token.startsWith('$param.')) parts.push({ kind: 'param', key: token.slice(7) })
    else bad.push(token)
  }
  push(raw.slice(last))
  return { parts, bad }
}

/** params [{key,value}] → 取值表：同名后者覆盖前者，与组件 resolveParams 的写法一致 */
const namedParams = (params: any[]): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const p of params || []) if (p && typeof p.key === 'string') out[p.key] = String(p.value ?? '')
  return out
}

// ==================== 脚本白名单 ====================

/**
 * 生成期标识符扫描：注释与字符串先抹掉，再挑出不带 `.` 前缀的自由标识符。
 * 判定故意保守 —— 认不准的一律当越界（链记 unsupported，人来接管），
 * 比让产物带着一跑就 ReferenceError 的正文出门安全。
 */
export function scanScript(body: string): { bad: string[]; uses: string[] } {
  const stripped = body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g, ' ')
  const declared = new Set<string>()
  const add = (s: string) => {
    const name = s.trim().split(/[\s=:]/)[0]
    if (/^[A-Za-z_$][\w$]*$/.test(name)) declared.add(name)
  }
  for (const m of stripped.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(m[1])
  for (const m of stripped.matchAll(/function\s*[\w$]*\s*\(([^()]*)\)/g)) m[1].split(',').forEach(add)
  for (const m of stripped.matchAll(/\(([^()]*)\)\s*=>/g)) m[1].split(',').forEach(add)
  const bad: string[] = []
  const uses: string[] = []
  for (const m of stripped.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)(\s*:)?/g)) {
    const [, before, name, colon] = m
    if (before === '.' || colon) continue
    if (RESERVED.includes(name) || SANDBOX_GLOBALS.includes(name) || declared.has(name)) continue
    if (SCRIPT_CONTEXT.includes(name)) {
      if (!uses.includes(name)) uses.push(name)
      continue
    }
    if (!bad.includes(name)) bad.push(name)
  }
  return { bad, uses }
}

// ==================== 逐步判定 ====================

/** 一条链的编译环境：出口能给什么、产物里有什么，都在这里表态 */
interface Env {
  page: ChainPage
  /** 链的 schema 地址（步骤再拼序号） */
  path: string
  /** 调实例方法的列表 ref；null = 该载体没有句柄 */
  ref: string | null
  hasRow: boolean
  /** 总线步骤用 {row.x}，链参数用 $row.x */
  bus?: boolean
  type: string
  nodeId: string
  rulePath: string
  outlet: string
  /** 命名脚本函数与 manifest 定位用的载体键 */
  key: string
  trigger: string
  kind: IrChain['kind']
  readonly?: boolean
  mode?: 'create' | 'edit' | 'view'
}

const reject = (env: Env, key: string, message: string) =>
  env.page.unsupported.push({ path: env.path, type: env.type, key, message })

function scriptFnName(page: ChainPage, key: string): string {
  const base = `script${pascal(key.replace(/[^\w-]+/g, '-')) || 'Chain'}`
  let name = base
  let i = 2
  while (page.scriptNames.has(name)) name = `${base}${i++}`
  page.scriptNames.add(name)
  return name
}

function scriptStep(a: any, path: string, env: Env): IrChainStep | null {
  const body = String(namedParams(a.params).source ?? '')
  if (!body.trim()) {
    reject(env, 'script', '脚本动作缺少 source 参数，产物里没有可执行的正文，不接线')
    return null
  }
  if (/\$\w|\{\w/.test(body)) {
    reject(
      env,
      'script',
      '脚本正文里有 $row. / {row. 占位符：运行期是先做字符串替换再 new Function 执行，产物没有那层模板替换，改成直接引用 row.字段后人工接管',
    )
    return null
  }
  const { bad, uses } = scanScript(body)
  if (bad.length) {
    reject(
      env,
      'script',
      `脚本里有白名单外的标识符（${bad.join('、')}）：产物上下文只提供 form/row/page/message/http 与 JS 内置对象，整条链不接线`,
    )
    return null
  }
  if (uses.includes('rowIndex')) {
    reject(env, 'script', '脚本用到 rowIndex，但产物的事件出口（button-click / cell-click / row-click）都给不到行号，整条链不接线')
    return null
  }
  if (uses.includes('form') && !env.page.container) {
    reject(env, 'script', '脚本写 form，但页面没有 formContainer，产物里没有 form 模型，整条链不接线')
    return null
  }
  if (uses.includes('row') && !env.hasRow) {
    reject(env, 'script', '脚本用 row，但该事件出口没有行上下文（selection-change / sort-change 只给行集合），整条链不接线')
    return null
  }
  const needs: ChainNeed[] = []
  if (uses.includes('message')) needs.push('message')
  if (uses.includes('page')) needs.push('page')
  if (uses.includes('http')) needs.push('http')
  // 正文没引用 row 时形参加下划线：产物侧 noUnusedParameters 会判未使用
  return {
    op: 'script',
    args: [],
    path,
    needs,
    script: { fn: scriptFnName(env.page, env.key), body, params: uses.includes('row') ? 'row: any' : '_row?: any' },
  }
}

/**
 * 一个动作 → 一条可执行步骤；判不了就记 unsupported 并返回 null。
 * 参数按 op 归一化（含运行期的默认值兜法），emit 侧不再回头看 schema。
 */
function buildStep(op: string, named: Record<string, string>, path: string, env: Env): IrChainStep | null {
  const meta = ACTION_OPS[op]
  if (!meta) {
    reject(env, op, ACTION_OPS_REJECTED[op] ?? `动作类型 ${op} 不在出码能力表（codegen/contract.ts）里，产物不接线`)
    return null
  }
  if (meta.gates.includes('list-ref') && !env.ref) {
    reject(env, op, `${op} 要调列表组件实例方法，但该载体在产物里没有实例句柄（契约 list.expose=none，组件没 defineExpose），不接线`)
    return null
  }
  if (meta.gates.includes('container')) {
    if (!env.page.container) {
      reject(env, op, `动作 ${op} 要接页面的 formContainer，但页面没有容器，产物没有 openContainer/confirmSave 可调，不接线`)
      return null
    }
    const target = String(named.target ?? '').trim()
    const c = env.page.container
    if (target && target !== c.field && target !== c.ds) {
      const more =
        env.page.containers.length > 1
          ? `页面另有 ${env.page.containers.length} 个容器，产物只出第一个（${c.rulePath}）`
          : `产物出码的容器地址是 ${c.field || c.ds}`
      reject(env, op, `${op} 的 target=${target} 指不到产物里的那个容器（${more}），产物没有运行期寻址表，不接线`)
      return null
    }
  }

  const args: IrChainArg[] = []
  const needs = new Set<ChainNeed>(meta.needs)
  const put = (name: string, raw: string | undefined): boolean => {
    if (raw === undefined) {
      args.push({ name, parts: [] })
      return true
    }
    const { parts, bad } = splitTemplate(raw, !!env.bus)
    if (bad.length) {
      reject(env, op, `参数 ${name} 里的占位符 ${bad.join('、')} 产物解析不出来（只支持 $row.字段 / $param.参数 与 {row.字段} / {node.字段}），该步骤不接线`)
      return false
    }
    if (!env.hasRow && parts.some((p) => p.kind === 'row')) {
      reject(env, op, `参数 ${name} 取 $row，但该事件出口没有行上下文，该步骤不接线`)
      return false
    }
    if (parts.some((p) => p.kind === 'param')) needs.add('route')
    args.push({ name, parts })
    return true
  }

  switch (op) {
    case 'set-filter':
      // 链：运行期 setFilter(resolved)，参数整份就是过滤条件；总线：setFilter({ [step.field]: value })，见 compileBusAction
      for (const k of Object.keys(named)) if (k !== 'target' && !put(k, named[k])) return null
      break
    case 'message':
      if (!put('message', named.text ?? named.message ?? '提示')) return null
      if (!put('type', named.type || 'info')) return null
      break
    case 'open-link':
      if (!named.url) {
        reject(env, op, '打开链接缺少 url 参数，产物不出空跳转')
        return null
      }
      if (!put('url', named.url)) return null
      break
    case 'set-page':
      if (!put('page', named.page ?? '')) return null
      break
    case 'set-sort':
      if (!put('field', named.field ?? named.prop ?? '')) return null
      if (!put('order', named.order || 'ascending')) return null
      break
    case 'open-container':
    case 'load-record':
      if (!put('target', named.target)) return null
      if (!put('recordId', named.recordId)) return null
      break
    default:
      for (const k of Object.keys(named)) if (k !== 'target' && k !== 'recordId' && !put(k, named[k])) return null
  }
  return { op, args, path, needs: [...needs] }
}

/** 一条链的多个动作编译：全判不了返回 null（不出半条假动线，也不还兜底行为） */
function compileChain(actions: any[], env: Env): IrChain | null {
  const steps: IrChainStep[] = []
  actions.forEach((a, i) => {
    const path = `${env.path}[${i}]`
    if (!a || typeof a.type !== 'string') {
      env.page.unsupported.push({ path, type: env.type, key: '', message: '动作项没有 type，产物无法判定，整项丢弃' })
      return
    }
    const step = a.type === 'script' ? scriptStep(a, path, env) : buildStep(a.type, namedParams(a.params), path, env)
    if (step) steps.push(step)
  })
  if (!steps.length) return null
  return {
    id: `c${env.page.chains.length + 1}`,
    kind: env.kind,
    nodeId: env.nodeId,
    rulePath: env.rulePath,
    key: env.key,
    trigger: env.trigger,
    outlet: env.outlet,
    ref: env.ref,
    hasRow: env.hasRow,
    steps,
    readonly: env.readonly,
    mode: env.mode,
  }
}

const chainBehavior = (page: ChainPage, chain: IrChain, origin: string): void => {
  page.chains.push(chain)
  page.behaviorDrafts.push({
    origin,
    trigger: chain.trigger,
    steps: chain.steps.map((s) => ({ op: s.op })),
    // 按钮链与列链在 handler 里按 key 分派（switch case），组件链/总线没有分派键
    implementedBy:
      chain.kind === 'button' || chain.kind === 'cell'
        ? { file: page.file ?? '', function: chain.outlet, case: chain.key }
        : { file: page.file ?? '', function: chain.outlet },
    warnings: [],
  })
}

// ==================== 载体级分析 ====================

export interface NodeChainAnalysis {
  outlets: IrEventOutlet[]
  compiledCells: Set<string>
}

/**
 * 单个列表节点的三类链判定：按钮链、列链、组件链。
 * outlets 按需追加（when='chain' 的出口只有真配了链才绑），模板端与 wireOnly 登记都读这一份。
 */
export function analyzeNodeChains(
  node: any,
  rulePath: string,
  id: string,
  ref: string | null,
  outlets: IrEventOutlet[],
  page: ChainPage,
): NodeChainAnalysis {
  const type = node.type
  const list = listOf(type)
  const carriers = list?.chainCarriers || []
  /** 出口名：已绑的直接复用；when='chain' 的出口先探名不占号，真编出链才 bind */
  const outletName = (on: string): string | null => {
    const ev = (list?.events || []).find((e) => e.on === on)
    if (!ev) return null
    const bound = outlets.find((o) => o.on === on)
    if (bound) return bound.handler
    return page.usedHandlers.has(ev.handler) ? `${ev.handler}${pascal(id)}` : ev.handler
  }
  const bind = (on: string, handler: string) => {
    if (outlets.some((o) => o.on === on)) return
    outlets.push({ on, handler })
    page.usedHandlers.add(handler)
  }
  /** 公共底色 + 这条链自己的定位：path/key/trigger/outlet/kind 必给，不给默认值（免得看着像漏判） */
  const envOf = (
    over: Pick<Env, 'path' | 'key' | 'trigger' | 'outlet' | 'kind'> & Partial<Env>,
  ): Env => ({
    page,
    ref,
    hasRow: true,
    type,
    nodeId: id,
    rulePath,
    ...over,
  })

  // ---- 按钮链：组件忽略 ev.trigger，各 events 的 actions 按顺序摊平 ----
  ;(node.props?.viewActions?.buttons || []).forEach((btn: any, bi: number) => {
    const actions: any[] = (btn?.events || []).flatMap((ev: any) => ev?.actions || [])
    if (!actions.length) return
    const key = String(btn?.key ?? '')
    const path = `${rulePath}.props.viewActions.buttons(${key}).events`
    const outlet = outletName('button-click')
    if (!outlet) {
      page.unsupported.push({ path, type, key, message: `${type} 没有 button-click 出口，按钮链在产物里没人调` })
      return
    }
    const map = BUTTON_TRIGGER[key]
    const env = envOf({
      path,
      key,
      outlet,
      kind: 'button',
      trigger: map?.trigger || 'click',
      readonly: map?.readonly,
      mode: map?.mode,
    })
    const chain = compileChain(actions, env)
    page.buttonChains.set(`${rulePath}#${key}`, !!chain)
    if (!chain) return // 逐步原因已在 compileChain 里登记，这里不再叠一条汇总
    bind('button-click', outlet)
    // 配置已经展开成 case 体：常量里那份 events 再留着就是第二份「看起来会执行」的东西
    page.compiledChainConfig.add(`${rulePath}.props.viewActions.buttons[${bi}].events`)
    chainBehavior(page, chain, path)
  })

  // ---- 列链：只有 page-table 分发 columns[].onCellClick ----
  ;(node.props?.columns || []).forEach((col: any, ci: number) => {
    const actions: any[] = col?.onCellClick?.actions || []
    if (!actions.length) return
    const colKey = String(col?.key ?? col?.prop ?? ci)
    const path = `${rulePath}.props.columns[${ci}].onCellClick.actions`
    if (!carriers.includes('cell')) {
      page.unsupported.push({
        path,
        type,
        key: colKey,
        message: `${type} 不消费列级 onCellClick（只有 page-table 的 handleCellClick 会分发），链随配置透传但产物不接线`,
      })
      return
    }
    const outlet = outletName('cell-click')
    if (!outlet) {
      page.unsupported.push({ path, type, key: colKey, message: `${type} 没有 cell-click 出口，列链不接线` })
      return
    }
    const env = envOf({ path, key: colKey, outlet, kind: 'cell', trigger: 'cell-click' })
    const chain = compileChain(actions, env)
    if (!chain) return // 逐步原因已登记
    bind('cell-click', outlet)
    chainBehavior(page, chain, `${rulePath}.props.columns[${ci}].onCellClick`)
    page.compiledCells.add(`${rulePath}.props.columns[${ci}].onCellClick`)
  })

  // ---- 组件链 props.viewEvents ----
  ;(node.props?.viewEvents || []).forEach((ev: any, ei: number) => {
    const actions: any[] = ev?.actions || []
    if (!actions.length) return
    const path = `${rulePath}.props.viewEvents[${ei}].actions`
    const trigger = String(ev?.trigger ?? '')
    if (!carriers.includes('view')) {
      page.unsupported.push({
        path,
        type,
        key: trigger,
        message: `${type} 不消费 props.viewEvents（组件里没有 triggerViewEvents 分发器），组件链在产物里不接线`,
      })
      return
    }
    const target = String(ev?.target ?? '')
    const self =
      target === '' ||
      target === (SELF_TARGET[type] || 'table') ||
      target === String(node.field ?? '') ||
      target === String(node.props?.dataSourceId ?? '')
    if (!self) {
      page.unsupported.push({
        path,
        type,
        key: trigger,
        message: `组件链的 target=${target} 解不到本组件（产物按寻址表只认 field / dataSourceId / 组件默认目标），不接线`,
      })
      return
    }
    const outlet = outletName(trigger)
    if (!outlet) {
      page.unsupported.push({
        path,
        type,
        key: trigger,
        message: `触发器 ${trigger} 在 ${type} 的 emit 出口里不存在（见 design D4 的触发器→emit 白名单），产物无法接管`,
      })
      return
    }
    const hasRow = trigger === 'row-click' || trigger === 'cell-click'
    const env = envOf({ path, key: trigger, outlet, kind: 'view', trigger, hasRow })
    const chain = compileChain(actions, env)
    if (!chain) return // 逐步原因已登记
    bind(trigger, outlet)
    chainBehavior(page, chain, `${rulePath}.props.viewEvents[${ei}]`)
  })

  return { outlets, compiledCells: page.compiledCells }
}

// ==================== 总线动作 ====================

/** 总线步骤的取值面：与链参数对齐成 {key: value}，值仍是 {row.x} 模板 */
const busNamed = (step: any): Record<string, string> => {
  const out: Record<string, string> = {}
  for (const k of ['target', 'field', 'value', 'recordId']) {
    if (step?.[k] !== undefined && step?.[k] !== null) out[k] = String(step[k])
  }
  return out
}

/**
 * 总线动作编译：目前只有 row-click 有 emit 出口（row-edit/view/create 走按钮 case，
 * node-click / field-change / record-change 组件根本不 emit）。
 * 归属：解到哪个列表就编进那个列表的 onRowClick；跨列表寻址首版不接线（产物的 handler 按单列表生成）。
 */
export function compileBusAction(
  action: any,
  index: number,
  page: ChainPage,
  carrier: { id: string; rulePath: string; ref: string | null; outlets: IrEventOutlet[]; type: string },
): IrChain | null {
  const outlet = carrier.outlets.find((o) => o.on === 'row-click')?.handler
  if (!outlet) return null
  const origin = `actions[${index}]`
  const steps: IrChainStep[] = []
  ;(action.steps || []).forEach((s: any, j: number) => {
    const op = String(s?.op ?? '')
    const path = `${origin}.steps[${j}]`
    // list-ref 类 op 的 target 是「哪个组件的实例」：解到别的列表就不是这个 handler 能调的
    const target = String(s?.target ?? '')
    const hit = target ? page.lists.find((l) => l.field === target || l.ds === target) : page.lists[0]
    const env: Env = {
      page,
      ref: (hit?.id ?? carrier.id) === carrier.id ? carrier.ref : null,
      hasRow: true,
      bus: true,
      type: carrier.type,
      nodeId: carrier.id,
      rulePath: carrier.rulePath,
      outlet,
      path,
      key: String(action.source ?? op),
      trigger: String(action.trigger),
      kind: 'bus',
    }
    if (ACTION_OPS[op]?.gates.includes('list-ref')) {
      if (!hit) {
        page.unsupported.push({
          path: origin,
          type: carrier.type,
          key: op,
          message: `${op} 的 target=${target} 在页面寻址表里解不到列表组件（运行期走 componentRefs，产物按 field/dataSourceId 生成期定死），不接线`,
        })
        return
      }
      if (hit.id !== carrier.id) {
        page.unsupported.push({
          path: origin,
          type: carrier.type,
          key: op,
          message: `${op} 的 target 指向 ${hit.rulePath}，与触发该动作的列表不是同一个组件；产物的事件 handler 按单列表生成，跨列表寻址首版不接线`,
        })
        return
      }
    }
    if (op === 'set-filter') {
      // 总线是 setFilter({ [step.field]: value })：字段名是字面量，值才做模板
      const raw = s?.value
      const step2 = buildStep(op, raw === undefined || raw === null ? {} : { value: String(raw) }, path, env)
      if (step2) {
        step2.args = [{ name: String(s?.field ?? ''), parts: step2.args[0]?.parts || [] }]
        steps.push(step2)
      }
      return
    }
    const step2 = buildStep(op, busNamed(s), path, env)
    if (step2) steps.push(step2)
  })
  if (!steps.length) return null
  const chain: IrChain = {
    id: `c${page.chains.length + 1}`,
    kind: 'bus',
    nodeId: carrier.id,
    rulePath: carrier.rulePath,
    key: String(action.source ?? ''),
    trigger: String(action.trigger),
    outlet,
    ref: carrier.ref,
    hasRow: true,
    steps,
  }
  // 总线动作在 planBehaviors 里已有那份 behavior（implementedBy 由它按编译结果回填），这里只登记链
  page.chains.push(chain)
  return chain
}
