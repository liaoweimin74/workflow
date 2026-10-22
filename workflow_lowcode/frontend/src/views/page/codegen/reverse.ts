/**
 * 回导校验器：产物（SFC 模板证据 + script 常量 + 锚点注释）→ schema，与源 schema 逐键对比。
 *
 * 出码正确性的验收手段，不是生产链路的一部分：产物只保证"能跑"，
 * 回导零空洞才证明"跑得和原页面一样"。四份登记表决定差异是否已解释：
 *   1. 丢弃登记  node.warnings[].path（kind ∈ dropKinds）+ node.dropped（身份键，按作用域前缀匹配）
 *   2. 重命名/派生登记 node.renames[]（schema 路径 ← 产物证据：tag@attr / anchor: / props. / derived:）
 *   3. 归属登记  node.wireOnly[]（产物有、schema 无的接线键）
 *   4. 默认值登记 manifest.contract.defaults（结构键省略时按默认补回）
 *
 * 任一登记缺失 → 该差异进 holes（契约空洞），出码判定失败。
 */

import { parse as parseSfc } from '@vue/compiler-sfc'
import { parse as parseAst } from '@babel/parser'
import type { GeneratedManifest, NodeArtifact } from './ir'

export interface Hole {
  path: string
  kind: '丢失' | '值不一致' | '多造' | '长度不符'
  expected?: unknown
  actual?: unknown
}

export interface RenameCheck {
  path: string
  to: string
  ok: boolean
  artifact?: unknown
  schema?: unknown
}

export interface ReverseResult {
  rebuilt: Record<string, any>
  holes: Hole[]
  renameChecks: RenameCheck[]
  explained: { drop: number; defaults: number; rename: number; identity: number }
  anchors: string[]
  consts: string[]
  wireStripped: string[]
}

type Ctx = Record<string, any>

const join = (base: string, sub: string) => (!sub ? base : /^\[/.test(sub) ? `${base}${sub}` : `${base}.${sub}`)
const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

function segs(path: string): string[] {
  return path
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .filter(Boolean)
}

function getPath(obj: any, path: string): any {
  let cur = obj
  for (const s of segs(path)) {
    if (cur == null) return undefined
    cur = cur[s]
  }
  return cur
}

function setPath(obj: any, path: string, v: unknown): void {
  const seg = segs(path)
  let cur = obj
  for (let i = 0; i < seg.length - 1; i++) {
    const k = seg[i]
    if (cur[k] == null) cur[k] = /^\d+$/.test(seg[i + 1]) ? [] : {}
    cur = cur[k]
  }
  cur[seg[seg.length - 1]] = v
}

function delPath(obj: any, path: string): boolean {
  const seg = segs(path)
  let cur = obj
  for (let i = 0; i < seg.length - 1; i++) {
    cur = cur?.[seg[i]]
    if (cur == null) return false
  }
  const leaf = seg[seg.length - 1]
  const had = leaf in (cur || {})
  delete cur?.[leaf]
  return had
}

interface Binding {
  expr: string
  static: boolean
  event?: boolean
}

/** 元素上的 lc:node 静态属性值（出码写的节点地址）；没有则 undefined */
function nodeIdOf(el: Ctx): string | undefined {
  for (const p of el.props || []) {
    if (p.type === 6 && String(p.name) === 'lc:node') return String(p.value?.content ?? '')
  }
  return undefined
}

/** 静态属性值（type 6）；带绑定的属性不在这里读 */
function staticAttr(el: Ctx | undefined, name: string): string | undefined {
  for (const p of el?.props || []) {
    if (p.type === 6 && String(p.name) === name) return String(p.value?.content ?? '')
  }
  return undefined
}

const elChildren = (el: Ctx | undefined): Ctx[] => (el?.children || []).filter((c: Ctx) => c.type === 1)

/** 内联样式串 → 对象：emit 按 `键: 值; 键: 值` 输出，回读按同一口径还原（kebab → camel） */
function cssObject(text: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const decl of (text || '').split(';')) {
    const i = decl.indexOf(':')
    if (i <= 0) continue
    const k = decl.slice(0, i).trim()
    const v = decl.slice(i + 1).trim()
    if (k && v) out[camel(k)] = v
  }
  return out
}

interface TableGeom {
  rows: number
  cols: number
  layout: Array<{ top: number; left: number; row: number; col: number }>
  style: Record<string, Record<string, string>>
  className: Record<string, string>
  border: boolean
  mini: boolean
  formStyle: boolean
  borderColor?: string
  borderWidth?: string
}

/**
 * 静态表格 → 几何。td 的列坐标由「行内游标 + 已占用格」算出（rowspan 会占住后续行），
 * colspan/rowspan > 1 的可见格即 layout。产物只保留几何、没有原始 layout 项序，
 * 回读按行优先给规范序 —— 同一几何换了 layout 顺序会被报成差异，这是有意的严格。
 */
function tableGeomOf(table: Ctx | undefined): TableGeom {
  const trs = elChildren(table).filter((c) => c.tag === 'tr')
  const taken = new Set<string>()
  const cells: Array<{ row: number; col: number; rowspan: number; colspan: number; el: Ctx }> = []
  trs.forEach((tr, r) => {
    let c = 0
    for (const td of elChildren(tr).filter((x) => x.tag === 'td')) {
      while (taken.has(`${r}:${c}`)) c++
      const rowspan = Math.max(1, Number(staticAttr(td, 'rowspan') ?? 1) || 1)
      const colspan = Math.max(1, Number(staticAttr(td, 'colspan') ?? 1) || 1)
      for (let dr = 0; dr < rowspan; dr++) {
        for (let dc = 0; dc < colspan; dc++) taken.add(`${r + dr}:${c + dc}`)
      }
      cells.push({ row: r, col: c, rowspan, colspan, el: td })
      c += colspan
    }
  })
  const style: Record<string, Record<string, string>> = {}
  const className: Record<string, string> = {}
  for (const cell of cells) {
    const slot = `${cell.row}:${cell.col}`
    const s = cssObject(staticAttr(cell.el, 'style'))
    if (Object.keys(s).length) style[slot] = s
    const cls = staticAttr(cell.el, 'class')
    if (cls) className[slot] = cls
  }
  const tableStyle = cssObject(staticAttr(table, 'style'))
  const classes = (staticAttr(table, 'class') || '').split(/\s+/).filter(Boolean)
  return {
    rows: trs.length,
    cols: cells.reduce((m, c) => Math.max(m, c.col + c.colspan), 0),
    layout: cells
      .filter((c) => c.rowspan > 1 || c.colspan > 1)
      .map((c) => ({ top: c.row, left: c.col, row: c.rowspan, col: c.colspan })),
    style,
    className,
    border: !classes.includes('lc-fc-table--no-border'),
    mini: classes.includes('lc-fc-table--mini'),
    formStyle: classes.includes('lc-fc-table--form'),
    borderColor: tableStyle.borderColor,
    borderWidth: tableStyle.borderWidth,
  }
}

interface Template {
  anchors: Record<string, Record<string, string>>
  anchorHits: string[]
  els: Ctx[]
  parent: WeakMap<Ctx, Ctx>
  consts: Record<string, unknown>
  bindings: (el: Ctx | undefined) => Record<string, Binding>
  findEl: (tag: string) => Ctx | undefined
  nearest: (from: Ctx | undefined, tag: string) => Ctx | undefined
}

function parseArtifact(source: string): Template {
  const { descriptor, errors } = parseSfc(source, { filename: 'TestPage.vue' })
  if (errors.length) throw new Error(`SFC 解析失败：${errors.map((e: any) => e.message).join('; ')}`)
  const desc = descriptor as any

  const anchorComments: string[] = []
  const els: Ctx[] = []
  const parent = new WeakMap<Ctx, Ctx>()
  // 只有未优化的 template.ast 保留注释锚点，compileTemplate() 的 AST 会丢
  const walk = (n: Ctx, p?: Ctx) => {
    if (n.type === 3) {
      const t = String(n.content).trim()
      if (t.startsWith('lc:')) anchorComments.push(t.replace(/\s*\n[\s\S]*/, ''))
    }
    if (n.type === 1) {
      els.push(n)
      if (p) parent.set(n, p)
    }
    for (const c of n.children || []) walk(c, n.type === 1 ? n : p)
  }
  walk(desc.template.ast)

  const anchors: Record<string, Record<string, string>> = {}
  for (const a of anchorComments) {
    const kv: Record<string, string> = {}
    for (const part of a.split(/\s+/)) {
      const i = part.indexOf('=')
      if (i > 0) kv[part.slice(0, i).replace(/^lc:/, '')] = part.slice(i + 1)
    }
    if (kv.node) anchors[kv.node] = kv
  }

  const bindings = (el: Ctx | undefined): Record<string, Binding> => {
    const map: Record<string, Binding> = {}
    if (!el) return map
    for (const p of el.props || []) {
      if (p.type === 6) {
        if (String(p.name).startsWith('lc:')) continue
        map[camel(p.name)] = { expr: p.value?.content ?? '', static: true }
      } else if (p.type === 7) {
        // v-model 在 AST 里没有 arg（指令名即 model），不补这一笔就匹配不到字段自己的元素，
        // 回导会退回文档里第一个 el-form-item —— 容器多字段时 label 全部错位
        const arg = p.arg?.content ?? p.arg?.name ?? (p.name === 'model' ? 'model' : undefined)
        if (!arg || String(arg).startsWith('lc:')) continue
        if (p.name === 'bind' && p.modifiers?.isDynamic) continue
        map[camel(arg)] = { expr: String(p.exp?.content ?? '').trim(), static: false, event: p.name === 'on' }
      }
    }
    return map
  }

  return {
    anchors,
    anchorHits: anchorComments,
    els,
    parent,
    consts: topLevelConsts(desc.scriptSetup?.content || ''),
    bindings,
    findEl: (tag) => els.find((e) => e.tag === tag),
    nearest: (from, tag) => {
      let cur = from
      while (cur) {
        if (cur.tag === tag) return cur
        cur = parent.get(cur)
      }
      return undefined
    },
  }
}

/** script 顶层字面量常量：出码把对象/数组配置具名化，回导侧就静态可解析 */
function topLevelConsts(code: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const ast = parseAst(code, { sourceType: 'module', plugins: ['typescript'] })
  const lit = (n: any): unknown => {
    if (!n) return undefined
    if (n.type === 'ArrayExpression') return n.elements.map(lit)
    if (n.type === 'ObjectExpression') {
      const o: Record<string, unknown> = {}
      for (const p of n.properties) if (p.type === 'ObjectProperty') o[p.key.name ?? p.key.value] = lit(p.value)
      return o
    }
    if (n.type === 'StringLiteral' || n.type === 'BooleanLiteral' || n.type === 'NumericLiteral') return n.value
    if (n.type === 'NullLiteral') return null
    throw new Error('non-literal')
  }
  for (const st of ast.program.body) {
    if (st.type !== 'VariableDeclaration') continue
    for (const d of st.declarations) {
      if (d.id.type !== 'Identifier') continue
      try {
        out[d.id.name] = lit(d.init)
      } catch {
        /* 非字面量初始化：不参与回导 */
      }
    }
  }
  return out
}

/** 绑定表达式 → 值（常量名、字面量、常量成员、简单数组） */
function resolveExpr(expr: string, consts: Record<string, unknown>): unknown {
  const e = String(expr).trim()
  if (e in consts) return consts[e]
  if (/^-?\d+(\.\d+)?$/.test(e)) return Number(e)
  if (e === 'true') return true
  if (e === 'false') return false
  if (/^['"]/.test(e)) {
    const inner = e.slice(1, -1)
    if (inner.startsWith('{') || inner.startsWith('[')) {
      try {
        return JSON.parse(inner)
      } catch {
        return inner
      }
    }
    return inner
  }
  if (e === '[]') return []
  const arr = e.match(/^\[(.*)\]$/)
  if (arr) return arr[1].split(',').map((x) => resolveExpr(x, consts))
  const member = e.match(/^(\w+)\.(\w+)$/)
  if (member && member[1] in consts) return (consts[member[1]] as any)?.[member[2]]
  // 常量表的下标取用（:ds-ref-id="dataSources['ds_x']"）：非首个数据源的组件按源 id 查 refId
  const index = e.match(/^(\w+)\[\s*'([^']+)'\s*\]$/)
  if (index && index[1] in consts) return (consts[index[1]] as any)?.[index[2]]
  return { __unresolved__: e }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

export function reverseToSchema(
  schema: Record<string, any>,
  source: string,
  manifest: GeneratedManifest,
): ReverseResult {
  const t = parseArtifact(source)
  const dropKinds = new Set<string>(manifest.contract.dropKinds ?? (manifest.contract.registers as any)?.dropKinds ?? [])
  const defaults = manifest.contract.defaults ?? {}
  const rebuilt: Record<string, any> = { rule: [], option: {}, dataSources: [], actions: [] }

  const elFor = (node: NodeArtifact): Ctx | undefined => {
    if (!node.host?.tag) return undefined
    const cands = t.els.filter((e) => e.tag === node.host.tag)
    // 元素上的 lc:node 是出码写的节点地址（展示组件同类型多实例靠它各回各的元素）：
    // 没带地址的产物（列表组件、容器、字段控件）仍走原来的「按标签取第一个 / v-model 匹配」
    const addressed = cands.find((e) => nodeIdOf(e) === node.id)
    if (addressed) return addressed
    if (!node.host.vmodel) return cands[0]
    return cands.find((e) => t.bindings(e).model?.expr === node.host.vmodel)
  }

  const textOf = (n: any): string => (n.type === 2 ? n.content : (n.children || []).map(textOf).join(''))
  const footerButtons = (): string[] => {
    const tpl = t.els.find((e) => e.tag === 'template' && (e.props || []).some((p: any) => (p.arg?.content ?? p.arg?.name) === 'footer'))
    const out: string[] = []
    const collect = (n: any) => {
      if (n.tag === 'el-button') out.push(textOf(n).trim())
      for (const c of n.children || []) collect(c)
    }
    for (const c of tpl?.children || []) collect(c)
    return out
  }

  const derived: Record<string, (node: NodeArtifact) => unknown> = {
    // 逐节点回读自己的证据：仪表盘上一排组件各绑一个源，只看第一个节点就会把同源第一张卡的
    // refId 套给所有卡（回读出来的 dataSourceId 全体相等，差异被 renamedFrom 吞掉看不见）
    dsRefId: (node) => {
      const refId = getPath(rebuilt, `${node.rulePath}.props.dsRefId`)
      return manifest.dataSources.find((d) => d.refId === refId)?.id
    },
    // 选择器吃的是字面 refId（产物侧把绑定 id 换算过去了），回读要反查回 schema 里的绑定 id
    globalDataSourceId: (node) => {
      const refId = getPath(rebuilt, `${node.rulePath}.props.globalDataSourceId`)
      return manifest.dataSources.find((d) => d.refId === refId)?.id
    },
    containerDisplayMode: () => (t.findEl('el-drawer') ? 'drawer' : t.findEl('el-dialog') ? 'popup' : 'inline'),
    // 「容器里有没有表单」只能看弹层里的那棵 form：页面根 el-form 现在恒存在，
    // 用 findEl('el-form') 会把它当成容器表单，viewDetail.type 就恒回读成 'form'
    containerHasForm: () => {
      const inner = t.els.find(
        (e) => e.tag === 'el-form' && !!(t.nearest(e, 'el-dialog') || t.nearest(e, 'el-drawer')),
      )
      return inner ? 'form' : undefined
    },
    footerConfirmButton: () => footerButtons().some((x) => /确定|保存/.test(x)),
    footerCancelButton: () => footerButtons().some((x) => /取消/.test(x)),
    // fcTable 的五个几何键都只能从 td 坐标反推（产物里没有 rule 对象）
    tableRows: (node) => tableGeomOf(elFor(node)).rows,
    tableCols: (node) => tableGeomOf(elFor(node)).cols,
    tableLayout: (node) => tableGeomOf(elFor(node)).layout,
    tableStyle: (node) => tableGeomOf(elFor(node)).style,
    tableClass: (node) => tableGeomOf(elFor(node)).className,
    tableBorder: (node) => tableGeomOf(elFor(node)).border,
    tableMini: (node) => tableGeomOf(elFor(node)).mini,
    tableFormStyle: (node) => tableGeomOf(elFor(node)).formStyle,
    tableBorderColor: (node) => tableGeomOf(elFor(node)).borderColor ?? '',
    tableBorderWidth: (node) => tableGeomOf(elFor(node)).borderWidth ?? '',
  }

  function resolveEvidence(to: string, node: NodeArtifact): unknown {
    if (to.startsWith('derived:')) return derived[to.slice(8)]?.(node)
    // 行/列配置常量：产物模板与 handler 真在读的那份值（嵌套容器不带这些 prop，不能落锚点注释）
    if (to.startsWith('const:')) return getPath(t.consts, to.slice(6))
    if (to.startsWith('anchor:')) {
      const [id, key] = to.slice(7).split('@')
      return t.anchors[id]?.[key]
    }
    if (to.startsWith('props.')) return getPath(rebuilt, join(node.rulePath, to))
    const [tag, attr] = to.split('@')
    const el = t.nearest(elFor(node), tag) || t.findEl(tag)
    if (!el) return undefined
    const b = t.bindings(el)
    const key = camel(attr ?? '')
    if (!(key in b)) return undefined
    return b[key].static ? b[key].expr : resolveExpr(b[key].expr, t.consts)
  }

  const renamedFrom = new Set<string>()
  const renameChecks: RenameCheck[] = []
  const wireStripped = new Set<string>()
  const explained = { drop: 0, defaults: 0, rename: 0, identity: 0 }

  for (const node of manifest.nodes) {
    const rp = node.rulePath
    const rel = (p: string) => join(rp, p)
    // 1) 组件节点：模板上的属性/事件绑定即原始证据（容器与 el-form 的证据靠登记表搬运）
    if ((node.host?.ref || node.propsFrom === 'bindings') && node.host.tag !== 'el-form') {
      const b = t.bindings(elFor(node))
      const props: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(b)) {
        // ref 是产物接线；model 是 v-model，schema 侧的值落在 form 上，都不是 props
        if (k === 'ref' || k === 'model') continue
        props[k] = v.event ? { __handler__: v.expr } : v.static ? v.expr : resolveExpr(v.expr, t.consts)
      }
      // 元素上什么都没绑（schema 也没 props）就别造一个空对象出来，那是多造
      if (Object.keys(props).length) setPath(rebuilt, rel('props'), props)
    }
    if (Array.isArray(getPath(schema, rel('props.rule'))) && getPath(rebuilt, rel('props.rule')) === undefined) {
      setPath(rebuilt, rel('props.rule'), [])
    }
    // 2) 身份：锚点注释给 type/field
    const kv = t.anchors[node.id] || {}
    if (kv.type) setPath(rebuilt, rel('type'), kv.type)
    if (kv.field) setPath(rebuilt, rel('field'), kv.field)
    // 3) 重命名/派生登记：产物证据 → schema 路径（先算值校验，再剥证据键）
    const moves: string[] = []
    for (const r of node.renames || []) {
      const fromAbs = rel(r.from)
      const v = resolveEvidence(r.to, node)
      const schemaV = getPath(schema, fromAbs)
      renameChecks.push({ path: fromAbs, to: r.to, ok: JSON.stringify(v) === JSON.stringify(schemaV), artifact: v, schema: schemaV })
      setPath(rebuilt, fromAbs, v)
      renamedFrom.add(fromAbs)
      // 同名登记（props.showSearch → props.showSearch）的证据就是它自己：剥掉等于把刚读回来的值删了
      if (r.to.startsWith('props.') && r.to !== r.from) moves.push(rel(r.to))
      if (r.evidence) moves.push(rel(r.evidence))
    }
    for (const m of moves) delPath(rebuilt, m)
    // 4) 归属登记：wire-only 接线键剥离（产物有、schema 无）
    for (const w of node.wireOnly || []) {
      if (delPath(rebuilt, rel(`props.${w.replace(/^on\./, '')}`))) wireStripped.add(rel(`props.${w.replace(/^on\./, '')}`))
    }
    // 5) 带 elidedValue 的丢弃登记：回导按声明的默认值补回
    for (const wn of node.warnings || []) {
      if (dropKinds.has(wn.kind) && 'elidedValue' in wn) setPath(rebuilt, rel(wn.path), wn.elidedValue)
    }
  }

  // 数据源：整块读产物常量表 dataSources（字面量键序即 schema 数组序）。
  // 证据在脚本里而不是登记表里 —— 手改表里的 refId，回读必须报差异。
  const table = (t.consts.dataSources as Record<string, unknown> | undefined) || {}
  rebuilt.dataSources = Object.entries(table).map(([id, refId]) => ({ id, refId }))

  // 总线动作：只还原 origin 声明的显式动作，implicit 兜底行为不回写 schema
  // schema 无 source 的动作不兜空串补回，否则回导凭空多出一键
  rebuilt.actions = (manifest.behaviors || [])
    .filter((x) => x.origin.startsWith('actions['))
    .map((x) => {
      const a: Record<string, unknown> = { trigger: x.trigger, steps: x.steps }
      if (x.source !== undefined) a.source = x.source
      return a
    })

  const notEmitted = new Set<string>()
  for (const node of manifest.nodes) {
    for (const wn of node.warnings || []) if (dropKinds.has(wn.kind)) notEmitted.add(join(node.rulePath, wn.path))
  }
  for (const b of manifest.behaviors || []) {
    for (const wn of b.warnings || []) if (dropKinds.has(wn.kind)) notEmitted.add(wn.path)
  }
  // 数据源级丢弃：登记的就是页面级绝对路径，不再只认 dataSources[0] 的固定键名
  for (const d of manifest.dataSources || []) {
    for (const wn of d.warnings || []) if (dropKinds.has(wn.kind)) notEmitted.add(wn.path)
  }
  const identityScopes = manifest.nodes.map((n) => ({ prefix: n.rulePath, leaves: new Set(n.dropped || []) }))

  const holes: Hole[] = []

  const explainable = (path: string, exp: unknown): boolean => {
    if (notEmitted.has(path)) {
      explained.drop++
      return true
    }
    const leaf = path.split('.').pop()!
    for (const s of identityScopes) {
      if (path.startsWith(s.prefix) && s.leaves.has(leaf)) {
        explained.identity++
        return true
      }
    }
    // 默认值省略只在"schema 值确实等于登记的默认值"时成立，非默认值必须显式出码
    if (leaf in defaults && JSON.stringify(defaults[leaf]) === JSON.stringify(exp)) {
      explained.defaults++
      return true
    }
    return false
  }

  function diff(path: string, exp: unknown, got: unknown): void {
    if (renamedFrom.has(path)) explained.rename++
    if (explainable(path, exp)) return
    if (isObj(exp)) {
      // got 整体缺失也要下钻：丢弃登记记的是叶子路径（option.submitBtn.show），父级整块丢失不该直接报丢失
      const g = isObj(got) ? got : {}
      for (const k of Object.keys(exp)) diff(join(path, k), (exp as any)[k], (g as any)[k])
      for (const k of Object.keys(g)) {
        if (k in exp) continue
        const p = join(path, k)
        if (notEmitted.has(p)) {
          explained.drop++
          continue
        }
        holes.push({ path: p, kind: '多造', actual: (g as any)[k] })
      }
      return
    }
    if (Array.isArray(exp) || Array.isArray(got)) {
      const ea = exp as any[] | undefined
      const ga = got as any[] | undefined
      if (ea?.length !== ga?.length) {
        holes.push({ path, kind: '长度不符', expected: exp, actual: got })
        return
      }
      ea?.forEach((v, i) => diff(join(path, `[${i}]`), v, ga?.[i]))
      return
    }
    if (JSON.stringify(exp) !== JSON.stringify(got)) {
      holes.push({ path, kind: got === undefined ? '丢失' : '值不一致', expected: exp, actual: got })
    }
  }

  for (let i = 0; i < (schema.rule || []).length; i++) diff(`rule[${i}]`, schema.rule[i], rebuilt.rule[i])
  diff('option', schema.option, rebuilt.option)
  diff('dataSources[0]', schema.dataSources?.[0], rebuilt.dataSources[0])
  diff('actions', schema.actions, rebuilt.actions)

  return {
    rebuilt,
    holes,
    renameChecks,
    explained,
    anchors: t.anchorHits,
    consts: Object.keys(t.consts),
    wireStripped: [...wireStripped],
  }
}
