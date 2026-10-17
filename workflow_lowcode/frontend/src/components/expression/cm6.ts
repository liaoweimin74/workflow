/**
 * 表达式/脚本编辑器扩展工厂（CodeMirror 6 精简集成，全项目共用）。
 *
 * 形态（syntax × lang 组合）：
 * - mustache：{{var}} 占位符模板（逻辑流值表达式）——占位符整体高亮 + 占位符内变量补全
 * - uel：${var} UEL 表达式（BPMN 审批人/服务任务/网关条件）——同 mustache 语义
 * - lang=groovy：Groovy 脚本/条件（JS 语法近似高亮），标识符处即输即补
 * - lang=sql：SQL 脚本（轻量关键字高亮）+ {{var}} 模板占位符 + 关键字/变量补全
 *
 * 体积口径：state/view/language/autocomplete/commands + lang-javascript ≈ 480KB min / 160KB gzip，
 * 仅进逻辑流设计器与 BPMN 设计器两个懒加载 chunk，不影响主包。
 */
import {
  autocompletion,
  closeCompletion,
  completionKeymap,
  startCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { defaultHighlightStyle, HighlightStyle, StreamLanguage, syntaxHighlighting } from '@codemirror/language'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightSpecialChars,
  keymap,
  type KeyBinding,
  placeholder as cmPlaceholder,
  tooltips,
} from '@codemirror/view'
import { tags as t } from '@lezer/highlight'
import type { FlowVarItem } from '@/views/logicflow/utils/flowVars'

export type ExpressionSyntax = 'mustache' | 'uel'
export type ExpressionLang = 'none' | 'groovy' | 'sql'
export type ExpressionMode = 'placeholder' | 'bare'

/** 分组缺省展示名（groupLabel 可覆盖，空串隐藏） */
const GROUP_LABEL: Record<FlowVarItem['group'], string> = {
  input: '入参',
  loop: '循环',
  upstream: '上游产出',
  form: '表单',
}

/** 变量条目 → 补全选项（树拍平：根 + 全路径子字段，label 即插入文本） */
export function flattenVarOptions(items: FlowVarItem[]): Completion[] {
  const out: Completion[] = []
  const seen = new Set<string>()
  const walk = (item: FlowVarItem) => {
    if (item?.name && !seen.has(item.name)) {
      seen.add(item.name)
      const gl = item.groupLabel !== undefined ? item.groupLabel : GROUP_LABEL[item.group]
      const detail = gl && item.detail ? `${gl} · ${item.detail}` : gl || item.detail || ''
      out.push({
        label: item.name,
        detail,
        type: item.children?.length ? 'namespace' : 'variable',
        boost: 5,
      })
    }
    for (const c of item.children || []) walk(c)
  }
  for (const it of items || []) walk(it)
  return out
}

export interface ExpressionSourceConfig {
  items: FlowVarItem[]
  mode: ExpressionMode
  syntax: ExpressionSyntax
}

/** 片段补全条目：label 为展示/匹配文本，apply 为插入文本或自定义插入函数（可定位光标） */
export interface SnippetOption {
  label: string
  detail?: string
  type?: string
  apply: Completion['apply']
}

/**
 * 通用片段/函数补全源（label ≠ 插入文本的场景，如公式编辑器：
 * 键入 pri → 选 price → 插 ${price}；键入 SU → 选 SUM → 插 SUM() 且光标落括号内）。
 * match 定义触发前缀；与变量补全源共存（互不干扰，各自命中各自区间）。
 */
export function makeSnippetCompletionSource(options: SnippetOption[], match: RegExp = /[\w$]*$/): CompletionSource {
  if (!options.length) return () => null
  const opts: Completion[] = options.map((o) => ({
    label: o.label,
    detail: o.detail,
    type: o.type,
    apply: o.apply,
    boost: 1,
  }))
  return (ctx: CompletionContext): CompletionResult | null => {
    const w = ctx.matchBefore(match)
    if (!w || (w.from === w.to && !ctx.explicit)) return null
    return { from: w.from, options: opts, validFor: /^[\w$]*$/ }
  }
}

const PATH_WORD = /^[\w.[\]]*$/

/** # 呼出字段条目：key 为物理列名（插入引用用），label/type 为展示标注（中文名/列类型） */
export interface HashFieldOption {
  key: string
  label?: string
  type?: string
}

/** # 选中插入形态：placeholder = {{formData.字段}}（WHERE 值等）；bare = 裸列名 + 自动补 = 前缀（SET 值表达式） */
export type HashInsertMode = 'placeholder' | 'bare'

/**
 * 「# 呼出字段补全」源：值表达式中键入 # 列出所选目标表全部字段，选中插入可运行引用。
 * - placeholder（默认）：插 {{formData.字段}}（uel 为 ${formData.字段}），插入即可运行（引擎点路径解析）；
 *   占位符内（{{…# 至光标）从占位符内容起点整体替换（# 前残缺路径一并清掉），
 *   闭合标记自动补齐语义与变量补全一致（后方已有 }} 只补路径）
 * - bare（值表达式场景：UPDATE SET / INSERT 值 / DELETE·QUERY 条件值）：插裸列名（与 = 表达式列引用
 *   语法一致，不包 {{}}，也不插 "=" 前缀——编辑器显示层永不出现 =，存储层由 VarInput 统一补 "= "）；
 *   值为空 → 直接插列名；存量旧值（非空且无运算符/占位符的“单词”字面量，与表达式不兼容）→
 *   整体重写为列名（插入即可运行）；显示层以 = 开头（存量 == 转义字面量）上下文不弹
 * - filter:false + 源内自过滤（key/中文名大小写不敏感子串）：中文过滤不被 label 模糊匹配限制，
 *   同时避免 CM 渲染层以「#…」模式串误滤无 # 前缀的 label
 * - fields 支持 getter 闭包：字段元数据（information_schema/列中文名）异步就绪后无需重建编辑器扩展
 */
export function makeHashFieldCompletionSource(
  fields: HashFieldOption[] | (() => HashFieldOption[]),
  syntax: ExpressionSyntax = 'mustache',
  insert: HashInsertMode = 'placeholder'
): CompletionSource {
  const list = (): HashFieldOption[] => (Array.isArray(fields) ? fields : fields())
  return (ctx: CompletionContext): CompletionResult | null => {
    const all = list()
    if (!all.length) return null
    const hash = ctx.matchBefore(/#[\w\u4e00-\u9fa5]*$/)
    if (!hash) return null
    if (insert === 'bare') {
      const doc = ctx.state.doc.toString()
      const trimmed = doc.trim()
      // 显示层以 = 开头（存量 == 转义字面量 / 手输 =）：字面量上下文，# 呼出无意义
      if (trimmed.startsWith('=')) return null
      // 存量旧值（非空“单词”：无空白/占位符/运算符/括号，如 0、待审核、旧列名）与表达式不兼容，
      // 选中字段时整体重写为列名；正常表达式（含运算符/占位符）则在 # 处追加
      const rewriteAll = trimmed.length > 0 && !/[\s{{(=+\-*/%',]/.test(trimmed)
      // 源内自过滤（key/中文名大小写不敏感子串）：# 后续输入即滤（与 placeholder 分支同款）
      const q = ctx.state.sliceDoc(hash.from + 1, ctx.pos).trim().toLowerCase()
      const hit = q
        ? all.filter((f) => f.key.toLowerCase().includes(q) || (f.label ?? '').toLowerCase().includes(q))
        : all
      if (!hit.length) return null
      const buildOption = (f: HashFieldOption): Completion => {
        const suffix = `(${f.key})`
        const cn =
          f.label && f.label !== f.key && f.label.endsWith(suffix)
            ? f.label.slice(0, f.label.length - suffix.length)
            : ''
        return {
          label: f.key,
          detail: [cn, f.type].filter(Boolean).join(' · ') || undefined,
          type: 'property',
          apply: f.key,
        }
      }
      const options = hit.map(buildOption)
      return { from: rewriteAll ? 0 : hash.from, to: rewriteAll ? doc.length : ctx.pos, options, filter: false }
    }
    const open = ctx.matchBefore(syntax === 'uel' ? /\$\{[^}]*$/ : /\{\{[^{}]*$/)
    const inOpen = Boolean(open)
    const CLOSE = syntax === 'uel' ? '}' : '}}'
    const from = inOpen ? open!.from + 2 : hash.from
    // 过滤串取 # 之后的输入（占位符内 # 前残缺内容将被整体替换，不参与过滤）；空串列全部
    const q = ctx.state.sliceDoc(hash.from + 1, ctx.pos).trim().toLowerCase()
    const hit = q
      ? all.filter((f) => f.key.toLowerCase().includes(q) || (f.label ?? '').toLowerCase().includes(q))
      : all
    if (!hit.length) return null
    const after = ctx.state.sliceDoc(ctx.pos)
    const closedAhead = syntax === 'uel' ? /^\s*}/.test(after) : /^\s*}}/.test(after)
    const options: Completion[] = hit.map((f) => {
      const path = `formData.${f.key}`
      const suffix = `(${f.key})`
      const cn = f.label && f.label !== f.key && f.label.endsWith(suffix) ? f.label.slice(0, f.label.length - suffix.length) : ''
      const apply = inOpen ? (closedAhead ? path : path + CLOSE) : syntax === 'uel' ? `\${${path}}` : `{{${path}}}`
      return {
        label: f.key,
        detail: [cn, f.type].filter(Boolean).join(' · ') || undefined,
        type: 'property',
        apply,
      }
    })
    return { from, options, filter: false }
  }
}

/** 占位符包裹插入（占位符外 Ctrl+Space 场景） */
function wrapToken(syntax: ExpressionSyntax, path: string): string {
  return syntax === 'uel' ? `\${${path}}` : `{{${path}}}`
}

/** 占位符起始标记 */
const OPEN: Record<ExpressionSyntax, string> = { mustache: '{{', uel: '${' }

/** 变量补全源：
 * - mustache/uel：仅占位符内自动弹出（输入 {{ / ${ 即列全部变量），占位符外 Ctrl+Space 插完整占位符；
 *   光标后方无闭合标记时自动补 }}（插入即可用，与变量选择器同语义）
 * - bare：标识符处即输即补（变量名字段/Groovy 脚本）
 */
export function makeVarCompletionSource(cfg: ExpressionSourceConfig): CompletionSource {
  const options = flattenVarOptions(cfg.items)
  if (!options.length) return () => null
  const CLOSE = cfg.syntax === 'uel' ? '}' : '}}'
  return (ctx: CompletionContext): CompletionResult | null => {
    // 1) 占位符内（{{… / ${… 至光标）
    const brace = ctx.matchBefore(/\{\{[^{}]*$|\$\{[^}]*$/)
    if (brace) {
      const from = brace.from + 2
      // 光标后方已有闭合标记（编辑既有占位符）→ 只插路径；否则自动闭合
      const after = ctx.state.sliceDoc(ctx.pos)
      const closedAhead = cfg.syntax === 'uel' ? /^\s*}/.test(after) : /^\s*}}/.test(after)
      const finalOptions = closedAhead ? options : options.map((o) => ({ ...o, apply: o.label + CLOSE }))
      return { from, options: finalOptions, validFor: PATH_WORD }
    }
    // 2) bare 模式：光标前标识符路径片段（空匹配仅显式触发时给全列表）
    if (cfg.mode === 'bare') {
      const w = ctx.matchBefore(/[\w.[\]]*$/)
      if (w && (w.from < w.to || ctx.explicit)) {
        return { from: w.from, options, validFor: PATH_WORD }
      }
      return null
    }
    // 3) 占位符外：仅显式 Ctrl+Space，插完整占位符
    if (ctx.explicit) {
      return {
        from: ctx.pos,
        options: options.map((o) => ({ ...o, apply: wrapToken(cfg.syntax, o.label) })),
        validFor: PATH_WORD,
      }
    }
    return null
  }
}

/** SQL 关键字表（补全 + 高亮共用） */
export const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'AND', 'OR',
  'NOT', 'NULL', 'IS', 'IN', 'LIKE', 'BETWEEN', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'ON',
  'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG',
  'MIN', 'MAX', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'ASC', 'DESC', 'EXISTS', 'UNION', 'ALL',
  'CREATE', 'TABLE', 'INDEX', 'DROP', 'ALTER', 'COMMIT', 'ROLLBACK', 'WITH', 'RETURNING',
]

/** SQL 关键字补全（不在 {{ 占位符内时生效） */
export function makeKeywordCompletionSource(keywords: string[]): CompletionSource {
  const options: Completion[] = keywords.map((k) => ({ label: k, type: 'keyword' }))
  return (ctx: CompletionContext): CompletionResult | null => {
    if (ctx.matchBefore(/\{\{[^{}]*$/)) return null
    const w = ctx.matchBefore(/[\w$]*$/)
    if (!w || (w.from === w.to && !ctx.explicit)) return null
    return { from: w.from, options, validFor: /^[\w$]*$/ }
  }
}

// ===== SQL 表名/字段名补全（SQL_SCRIPT：全库 schema 元数据，上下文感知） =====

/** SQL schema 元数据供给（同步缓存 getter；列缓存未就绪返回 []，由 onMiss 触发异步预取） */
export interface SqlSchemaMeta {
  getTables: () => string[]
  getColumns: (table: string) => { key: string; label?: string; type?: string }[]
  /** 列缓存 miss 时回调（如 ensureColumns 异步拉取，下次补全就绪） */
  onMiss?: (table: string) => void
}

const SQL_TABLE_CTX = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE'])
const SQL_COLUMN_CTX = new Set([
  'SELECT', 'DISTINCT', 'WHERE', 'AND', 'OR', 'ON', 'SET', 'HAVING', 'BY',
  'ORDER', 'GROUP', 'LIKE', 'IS', 'IN', 'BETWEEN', 'WHEN', 'THEN', 'ELSE',
  'NOT', 'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
])
/** 表名之后的别名候选跳过集（语句词/连接修饰词不做别名） */
const SQL_NON_ALIAS = new Set([
  ...SQL_TABLE_CTX, ...SQL_COLUMN_CTX, 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS',
  'INSERT', 'DELETE', 'VALUES', 'CASE', 'END', 'UNION', 'ALL', 'EXISTS', 'LIMIT',
  'OFFSET', 'AS', 'NULL', 'ASC', 'DESC', 'CREATE', 'TABLE', 'DROP', 'ALTER',
])

/** 词法提取：跳过 -- 注释 / /*…*​/ 注释 / 字符串 / {{占位符}}，只留 SQL 标识符 */
function sqlWords(text: string): { text: string; upper: string }[] {
  const out: { text: string; upper: string }[] = []
  let i = 0
  while (i < text.length) {
    const rest = text.slice(i)
    const m = /^(?:--[^\n]*(?:\n|$)|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*'?(?:|$)|\{\{[^{}]*(?:\}\}|$))/.exec(rest)
    if (m) {
      i += m[0].length
      continue
    }
    const w = /^[A-Za-z_][\w$]*/.exec(rest)
    if (w) {
      out.push({ text: w[0], upper: w[0].toUpperCase() })
      i += w[0].length
      continue
    }
    i += 1
  }
  return out
}

/** 光标前语句的 SQL 上下文：待补类型（表名/列名）+ 语句内已引用表（别名归一化后物理表名） */
function analyzeSqlContext(words: { text: string; upper: string }[]): {
  kind: 'table' | 'columns'
  tables: string[]
  alias: Map<string, string>
} {
  const tables: string[] = []
  const alias = new Map<string, string>()
  let kind: 'table' | 'columns' = 'columns'
  let expectTable = false
  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    if (SQL_TABLE_CTX.has(w.upper)) {
      kind = 'table'
      expectTable = true
      continue
    }
    if (SQL_COLUMN_CTX.has(w.upper)) {
      kind = 'columns'
      expectTable = false
      continue
    }
    if (expectTable) {
      // FROM/JOIN/UPDATE/INTO 后第一个词 = 表名；紧随的非保留词 = 别名
      tables.push(w.text)
      alias.set(w.text.toLowerCase(), w.text)
      expectTable = false
      let j = i + 1
      if (words[j]?.upper === 'AS') j++
      const nx = words[j]
      if (nx && !SQL_NON_ALIAS.has(nx.upper)) {
        alias.set(nx.text.toLowerCase(), w.text)
        i = j
      }
      continue
    }
  }
  return { kind, tables, alias }
}

/** 光标后方 FROM/JOIN 引用的表（SELECT 列表早于 FROM 的场景，列候选向后取） */
function sqlTablesAfter(text: string): string[] {
  const words = sqlWords(text)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    if (SQL_TABLE_CTX.has(words[i].upper)) {
      const nx = words[i + 1]
      if (nx && !SQL_NON_ALIAS.has(nx.upper) && !SQL_COLUMN_CTX.has(nx.upper)) {
        out.push(nx.text)
        i++
      }
    }
  }
  return out
}

/**
 * SQL 表名/字段名补全源（SQL_SCRIPT 节点）：
 * - FROM/JOIN/UPDATE/INSERT INTO 后 → 全库表名补全；
 * - 列位置（SELECT 列表/INSERT 列清单/WHERE/ON/SET/HAVING 等）→ 语句内 FROM/JOIN/UPDATE
 *   引用表（含别名解析与光标后方 FROM 表）的列名并集，detail 标注类型·来源表；
 * - 别名限定（alias. / 表名.）→ 精确补该表列名；
 * - {{ 占位符内不生效（交给变量补全源）；列缓存 miss 经 onMiss 预取，下次补全就绪；
 * - 需经 prioritySources 注入（优先于 SQL 关键字源，否则被后者恒真匹配屏蔽）。
 */
export function makeSqlSchemaCompletionSource(meta: SqlSchemaMeta): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    if (ctx.matchBefore(/\{\{[^{}]*$/)) return null

    // 1) 别名/表名限定：phys.col（点号后已输列前缀可空——光标前 word 为空匹配，
    //    必须先于主入口 word 空判定，否则 alias. 场景永远走不到）
    const qual = ctx.matchBefore(/[A-Za-z_][\w$]*\.[\w$]*$/)
    if (qual) {
      const before = ctx.state.sliceDoc(0, qual.from)
      const stmtStart = before.lastIndexOf(';') + 1
      const pos = analyzeSqlContext(sqlWords(before.slice(stmtStart)))
      const dot = qual.text.indexOf('.')
      const phys = pos.alias.get(qual.text.slice(0, dot).toLowerCase())
      if (!phys) return null
      const cols = meta.getColumns(phys)
      if (!cols.length) {
        meta.onMiss?.(phys)
        return null
      }
      return {
        from: qual.from + dot + 1,
        options: cols.map((c) => ({
          label: c.key,
          detail: [c.label && c.label !== c.key ? c.label : '', c.type ?? ''].filter(Boolean).join(' · ') || undefined,
          type: 'property',
        })),
        validFor: /^[\w$]*$/,
      }
    }

    const w = ctx.matchBefore(/[\w$]*$/)
    if (!w || (w.from === w.to && !ctx.explicit)) return null
    const before = ctx.state.sliceDoc(0, w.from)
    const stmtStart = before.lastIndexOf(';') + 1
    const pos = analyzeSqlContext(sqlWords(before.slice(stmtStart)))

    // 2) 表名位置：FROM/JOIN/UPDATE/INTO 后正在输入的词
    if (pos.kind === 'table') {
      const tables = meta.getTables()
      if (!tables.length) return null
      return {
        from: w.from,
        options: tables.map((t) => ({ label: t, detail: '表', type: 'table' })),
        validFor: /^[\w$]*$/,
      }
    }

    // 3) 列位置：语句内已引用表（光标前 + 光标后 FROM 表）列并集
    const allTables = [...new Set([...pos.tables, ...sqlTablesAfter(ctx.state.sliceDoc(w.to))])]
    if (!allTables.length) return null
    const byKey = new Map<string, { label: string; detail: Set<string> }>()
    for (const t of allTables) {
      const cols = meta.getColumns(t)
      if (!cols.length) {
        meta.onMiss?.(t)
        continue
      }
      for (const c of cols) {
        const d = [c.label && c.label !== c.key ? c.label : '', c.type ?? ''].filter(Boolean).join(' · ')
        const hit = byKey.get(c.key)
        if (hit) {
          if (d) hit.detail.add(d)
        } else {
          byKey.set(c.key, { label: c.key, detail: new Set(d ? [d] : []) })
        }
      }
    }
    if (!byKey.size) {
      // 全部表列缓存未就绪（已触发 onMiss 预取）：本次不弹，下次补全即有数据
      return null
    }
    return {
      from: w.from,
      options: [...byKey.values()].map((v) => ({
        label: v.label,
        detail: [...v.detail].join(' / ') || (allTables.length === 1 ? allTables[0] : undefined),
        type: 'property',
      })),
      validFor: /^[\w$]*$/,
    }
  }
}

// ===== Groovy 脚本 Bean/方法补全（SCRIPT 节点：beans 门面，白名单清单驱动） =====

/** 后端 Bean 清单条目（对应 GET /api/v1/backend-logic/beans 的 BackendBeanInfo） */
export interface GroovyBeanMetaItem {
  beanName: string
  methodName: string
  /** 签名展示（如 "syncOrder(String, Integer)"） */
  displayName?: string
  parameterCount?: number
}

/**
 * Groovy Bean 补全源（SCRIPT 节点）：脚本内 {@code beans.<beanName>.<method>(args)}
 * 调用注册表白名单 Bean（与 BEAN 节点同一白名单，运行时经 ScriptBeanFacade →
 * BackendBeanRegistry 校验）。
 * - `beans.` 后 → Bean 名（插 `名.` 续方法提示）；
 * - `beans.<bean>.` 后 → 该 Bean 方法名（插 `方法(`，光标落括号内）；
 * - `bea…` 词前缀 → beans 门面入口；
 * - 清单加载失败（getBeans 返回 null）不弹，降级手输。
 * - 需经 prioritySources 注入。
 */
export function makeGroovyBeanCompletionSource(
  getBeans: () => GroovyBeanMetaItem[] | null | undefined
): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const list = getBeans()
    if (!list || !list.length) return null
    // 1) beans.<bean>.<partial → 该 Bean 方法（白名单顺序）
    const m2 = ctx.matchBefore(/beans\.[A-Za-z_][\w$]*\.[\w$]*$/)
    if (m2) {
      const parts = m2.text.split('.')
      const bean = (parts[1] ?? '').toLowerCase()
      const partial = parts[2] ?? ''
      const methods = list.filter((b) => b.beanName.toLowerCase() === bean)
      if (!methods.length) return null
      const seen = new Set<string>()
      const options: Completion[] = []
      for (const b of methods) {
        if (seen.has(b.methodName)) continue
        seen.add(b.methodName)
        const sig = b.displayName && b.displayName.startsWith(b.methodName)
          ? b.displayName.slice(b.methodName.length)
          : (b.displayName || '')
        options.push({
          label: b.methodName,
          detail: sig || undefined,
          type: 'method',
          apply: `${b.methodName}(`,
        })
      }
      return { from: m2.to - partial.length, options, validFor: /^[\w$]*$/ }
    }
    // 2) beans.<partial → Bean 名（去重 + 方法数标注，插 `名.` 续提示）
    const m1 = ctx.matchBefore(/beans\.[\w$]*$/)
    if (m1) {
      const partial = m1.text.slice('beans.'.length)
      const count = new Map<string, number>()
      for (const b of list) count.set(b.beanName, (count.get(b.beanName) ?? 0) + 1)
      const options: Completion[] = [...count.entries()].map(([name, n]) => ({
        label: name,
        detail: `${n} 个方法`,
        type: 'variable',
        apply: `${name}.`,
      }))
      return { from: m1.to - partial.length, options, validFor: /^[\w$]*$/ }
    }
    // 3) beans 门面词入口
    const w = ctx.matchBefore(/[A-Za-z_][\w$]*$/)
    if (w && /^bea/i.test(w.text)) {
      return {
        from: w.from,
        options: [{
          label: 'beans',
          detail: '后端 Bean 门面：beans.名.方法()',
          type: 'keyword',
          apply: 'beans.',
        }],
        validFor: /^[\w$]*$/,
      }
    }
    return null
  }
}

// ===== 高亮 =====

/** 表达式主题色（占位符紫、SQL 关键字蓝等；其余 tag 落回 defaultHighlightStyle） */
export const exprHighlightStyle = HighlightStyle.define([
  { tag: t.meta, color: '#8250df', fontWeight: '600' },
  { tag: t.keyword, color: '#0550ae', fontWeight: '600' },
  { tag: t.operatorKeyword, color: '#0550ae' },
  { tag: t.lineComment, color: '#6e7781', fontStyle: 'italic' },
  { tag: t.string, color: '#0a7d32' },
  { tag: t.number, color: '#b35900' },
])

const MONO_FONT = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace"

/** {{var}} / ${var} 模板占位符分词（整段一个 meta token） */
function templateLang(syntax: ExpressionSyntax) {
  const open = OPEN[syntax]
  const close = syntax === 'uel' ? '}' : '}}'
  return StreamLanguage.define({
    name: syntax === 'uel' ? 'uel-template' : 'mustache-template',
    tokenTable: { templateVar: t.meta },
    token(stream) {
      if (stream.match(open)) {
        while (!stream.eol() && !stream.match(close)) stream.next()
        stream.match(close)
        return 'templateVar'
      }
      stream.next()
      return null
    },
  })
}

/** SQL + {{var}} 模板混合分词（SQL_SCRIPT 脚本：SQL 关键字高亮 + 占位符插值高亮） */
const sqlTemplateLang = StreamLanguage.define({
  name: 'sql-template',
  tokenTable: {
    templateVar: t.meta,
    keyword: t.keyword,
    string: t.string,
    number: t.number,
    lineComment: t.lineComment,
    operator: t.operatorKeyword,
  },
  token(stream) {
    if (stream.match('{{')) {
      while (!stream.eol() && !stream.match('}}')) stream.next()
      stream.match('}}')
      return 'templateVar'
    }
    if (stream.match(/^--[^\n]*/)) return 'lineComment'
    if (stream.match(/^'(?:[^']|'')*'/)) return 'string'
    if (stream.match(/^[0-9]+(\.[0-9]+)?/)) return 'number'
    if (stream.match(/^[A-Za-z_][\w$]*/)) {
      return SQL_KEYWORDS.includes(stream.current().toUpperCase()) ? 'keyword' : null
    }
    if (stream.match(/^[<>!=+\-*/%(),.;|]/)) return 'operator'
    stream.next()
    return null
  },
})

export interface ExpressionExtensionConfig {
  mode: ExpressionMode
  syntax: ExpressionSyntax
  lang: ExpressionLang
  items: FlowVarItem[]
  placeholder?: string
  disabled?: boolean
  multiline?: boolean
  /** 单行形态（Enter 不换行、粘贴去换行） */
  singleLine?: boolean
  small?: boolean
  rows?: number
  maxRows?: number
  /** 右侧留白（选择器/清空锚位） */
  reserveRight?: number
  /** 追加补全源（公式函数等自定义场景，与变量补全源共存；排在 SQL 关键字源之后） */
  extraSources?: CompletionSource[]
  /** 优先补全源（SQL 表列/Bean 方法等结构化提示；排在 SQL 关键字源之前——
   *  关键字源在任意词位置恒返回结果，不前置会被屏蔽） */
  prioritySources?: CompletionSource[]
}

/** 行高与容器主题（尺寸随 props 重建，经 Compartment 热替换） */
export function buildTheme(cfg: ExpressionExtensionConfig): Extension {
  const pad = cfg.reserveRight ?? 0
  const contentPadRight = pad ? `${pad}px` : '8px'
  const sizeBlock: Record<string, string> = cfg.multiline
    ? {
        minHeight: `${(cfg.rows ?? 3) * 1.5}em`,
        maxHeight: `${(cfg.maxRows ?? 26) * 1.5}em`,
      }
    : { minHeight: cfg.small ? '24px' : '32px' }
  const contentBlock: Record<string, string> = cfg.multiline
    ? { lineHeight: '1.5', padding: '4px 0 4px 8px' }
    : { lineHeight: cfg.small ? '22px' : '30px', padding: '0 0 0 8px' }
  return EditorView.theme(
    {
      '&': {
        fontSize: '13px',
        border: '1px solid var(--el-border-color)',
        borderRadius: '4px',
        backgroundColor: 'var(--el-fill-color-blank)',
        color: 'var(--el-text-color-regular)',
        transition: 'border-color 0.15s',
        width: '100%',
        overflow: 'hidden',
        ...sizeBlock,
      },
      '&:hover': { borderColor: 'var(--el-border-color-hover)' },
      '&.cm-focused': { outline: 'none', borderColor: 'var(--el-color-primary)' },
      '.cm-scroller': { overflow: 'auto', scrollbarWidth: 'thin' },
      '.cm-content': {
        fontFamily: MONO_FONT,
        paddingRight: contentPadRight,
        caretColor: 'var(--el-color-primary)',
        ...contentBlock,
      },
      '.cm-line': { padding: '0' },
      '.cm-placeholder': { color: 'var(--el-text-color-placeholder)', fontFamily: MONO_FONT },
      '.cm-selectionBackground': {
        backgroundColor: 'color-mix(in srgb, var(--el-color-primary) 14%, transparent) !important',
      },
      '.cm-cursor': { borderLeftColor: 'var(--el-color-primary)' },
      // 补全浮层（挂 body，避免面板 overflow 裁剪）；z-index 需压过 el-dialog 遮罩（~2000+）
      '.cm-tooltip.cm-tooltip-autocomplete': {
        zIndex: 3000,
        border: '1px solid var(--el-border-color-light)',
        backgroundColor: 'var(--el-bg-color-overlay)',
        borderRadius: '8px',
        boxShadow: '0 6px 18px rgba(31, 36, 55, 0.16)',
        overflow: 'hidden',
        fontFamily: MONO_FONT,
        fontSize: '12px',
      },
      '.cm-tooltip-autocomplete > ul': {
        maxHeight: '15em',
        fontFamily: 'inherit',
        margin: '0',
        padding: '0',
      },
      '.cm-tooltip-autocomplete > ul > li': {
        padding: '5px 10px',
        color: 'var(--el-text-color-primary)',
        display: 'flex',
        alignItems: 'baseline',
        gap: '8px',
      },
      '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
        backgroundColor: 'color-mix(in srgb, var(--el-color-primary) 12%, transparent)',
        color: 'var(--el-color-primary)',
      },
      '.cm-completionDetail': {
        color: 'var(--el-text-color-secondary)',
        fontStyle: 'normal',
        fontSize: '11px',
        marginLeft: 'auto',
        paddingLeft: '10px',
      },
      '.cm-completionLabel': { wordBreak: 'break-all' },
    },
    { dark: false }
  )
}

/** 语言层（语法分词/高亮） */
export function buildLang(cfg: ExpressionExtensionConfig): Extension {
  if (cfg.lang === 'groovy') return javascript()
  if (cfg.lang === 'sql') return sqlTemplateLang
  return templateLang(cfg.syntax)
}

/** Compartment 位（组件按 props 变更热替换对应扩展） */
export function assembleCompartments() {
  return {
    lang: new Compartment(),
    autoComplete: new Compartment(),
    placeholder: new Compartment(),
    readOnly: new Compartment(),
    theme: new Compartment(),
  }
}

export type ExpressionCompartments = ReturnType<typeof assembleCompartments>

const PREVENT_ENTER: KeyBinding = { key: 'Enter', run: () => true }

export function buildStaticExtensions(cfg: ExpressionExtensionConfig): Extension[] {
  const exts: Extension[] = [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    syntaxHighlighting(exprHighlightStyle),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    tooltips({ parent: document.body }),
    keymap.of([
      ...completionKeymap,
      ...(cfg.singleLine ? [PREVENT_ENTER] : []),
      ...defaultKeymap,
      ...historyKeymap,
    ]),
  ]
  if (cfg.multiline) exts.push(keymap.of([indentWithTab]))
  return exts
}

/** 补全源有序组装（createState 初值与 props watcher 共用，防 reconfigure 漏源）：
 *  变量 → prioritySources（表列/Bean 等）→ SQL 关键字 → extraSources */
export function assembleCompletionSources(cfg: ExpressionExtensionConfig): CompletionSource[] {
  const acSources: CompletionSource[] = [makeVarCompletionSource(cfg), ...(cfg.prioritySources ?? [])]
  if (cfg.lang === 'sql') acSources.push(makeKeywordCompletionSource(SQL_KEYWORDS))
  if (cfg.extraSources?.length) acSources.push(...cfg.extraSources)
  return acSources
}

/** 组合动态 Compartment 初值（onMounted 与 props watcher 共用） */
export function buildDynamicExtensions(compartments: ExpressionCompartments, cfg: ExpressionExtensionConfig): Extension[] {
  return [
    compartments.lang.of(buildLang(cfg)),
    compartments.autoComplete.of(
      autocompletion({ override: assembleCompletionSources(cfg), icons: false, closeOnBlur: true })
    ),
    compartments.placeholder.of(cmPlaceholder(cfg.placeholder || '')),
    compartments.readOnly.of(
      cfg.disabled ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []
    ),
    compartments.theme.of([buildTheme(cfg), ...(cfg.multiline ? [EditorView.lineWrapping] : [])]),
  ]
}

/** 快捷关闭/打开补全（外部按钮等场景） */
export { closeCompletion, startCompletion }

// bare-insert mode for DATA_UPDATE SET expr (hash pick inserts bare column with auto = prefix)
// hmr bump 1791789092
