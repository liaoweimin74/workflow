/**
 * 数据容器作用域插值（语义 A：容器取到记录集，子树不复制）。
 *
 * 变量根只有两个，都来自容器自己取到的数据：
 *   {rows[0].amount}  按序号取记录
 *   {rows.length}     条数
 *   {row.amount}      当前记录（等价 rows[0]，单条形态下就是那条）
 *
 * 与动作链模板的关系：`{row.id}` 在动作参数里由 PageRendererPage.resolveStepValue 在**执行时**
 * 按触发数据解析；这里只处理组件的展示文案，且只认 rows/row 两个根——动作参数原样透传，
 * 不能被容器提前吃掉（同一份 schema 两套时机，抢了就会出现「点击时值已被固化」）。
 *
 * 两条失败路径语义不同：
 *   - 根不认识（{node.id}、{row} 写漏字段）：原样保留。这是配错了，悄悄变空白会被误读成
 *     「数据没到」，留原文一眼能看出引用写错。
 *   - 根认识但取不到值（路径不存在、序号越界、数据未回、取到的是对象）：出空串。
 *     这是运行期的正常状态，不该把花括号印在页面上。
 */

/** 允许插值的字段：只有展示型文案，数据源 ID / 字段名 / 布局值一律不碰 */
export const SCOPE_TEMPLATE_PROPS: ReadonlySet<string> = new Set([
  'title',
  'label',
  'text',
  'content',
  'info',
  'placeholder',
  'prefix',
  'suffix',
])

export interface ContainerScope {
  rows: Record<string, unknown>[]
}

export function buildContainerScope(rows: unknown[] | null | undefined): ContainerScope {
  return { rows: Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [] }
}

/** {rows[0].dept.name} 这种形状；根名必须是标识符，后面是点段或下标 */
const TEMPLATE_RE = /\{([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+|\[\d+\])*)\}/g
const SEGMENT_RE = /[A-Za-z_][A-Za-z0-9_]*|\[\d+\]/g

/** 取值结果分三态：命中、已知根但没值、根不认识 */
type Read = { kind: 'value'; value: unknown } | { kind: 'empty' } | { kind: 'unknown' }

function readPath(expr: string, scope: ContainerScope): Read {
  const segments = expr.match(SEGMENT_RE) ?? []
  const root = segments[0]
  if (root !== 'rows' && root !== 'row') return { kind: 'unknown' }
  // {rows} / {row} 这种只有根：没有可显示的单一标量，按写错处理（原样保留）
  if (segments.length < 2) return { kind: 'unknown' }

  let current: unknown = root === 'rows' ? scope.rows : scope.rows[0]
  // 单条记录的根本身是「取第 0 条」，列表为空时属于数据缺失，不是写错
  if (current === undefined) return { kind: 'empty' }

  for (let i = 1; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.startsWith('[')) {
      const index = Number(seg.slice(1, -1))
      if (!Array.isArray(current)) return { kind: 'empty' }
      current = current[index]
      continue
    }
    if (current === null || typeof current !== 'object') return { kind: 'empty' }
    current = (current as Record<string, unknown>)[seg]
  }

  if (current === null || current === undefined) return { kind: 'empty' }
  if (typeof current === 'object') return { kind: 'empty' }
  return { kind: 'value', value: current }
}

export function resolveScopeTemplate(text: string, scope: ContainerScope): string {
  if (!text || !text.includes('{')) return text
  return text.replace(TEMPLATE_RE, (raw: string, expr: string) => {
    const read = readPath(expr, scope)
    if (read.kind === 'unknown') return raw
    if (read.kind === 'empty') return ''
    return String(read.value)
  })
}

function resolveStringMap(source: Record<string, unknown>, scope: ContainerScope): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    out[key] =
      SCOPE_TEMPLATE_PROPS.has(key) && typeof value === 'string'
        ? resolveScopeTemplate(value, scope)
        : value
  }
  return out
}

/**
 * 把作用域应用到容器子规则：返回全新节点与全新 props 对象，入参不动。
 * 入参是页面主树的共享规则对象，就地改写会让原始 schema 被运行期数据污染。
 */
export function applyScopeToRules(rules: unknown[] | null | undefined, scope: ContainerScope): any[] {
  if (!Array.isArray(rules)) return []
  return rules.map((node) => {
    // 文字/标题这类原生节点的文案直接放在 children 的字符串里
    if (typeof node === 'string') return resolveScopeTemplate(node, scope)
    if (!node || typeof node !== 'object') return node
    const rule = node as Record<string, unknown>
    const next: Record<string, unknown> = { ...rule }
    for (const key of SCOPE_TEMPLATE_PROPS) {
      if (typeof next[key] === 'string') next[key] = resolveScopeTemplate(next[key] as string, scope)
    }
    if (next.props && typeof next.props === 'object') {
      next.props = resolveStringMap(next.props as Record<string, unknown>, scope)
    }
    if (Array.isArray(next.children)) {
      next.children = applyScopeToRules(next.children as unknown[], scope)
    }
    return next
  })
}
