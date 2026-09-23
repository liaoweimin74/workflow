/**
 * 契约形状比对。
 *
 * 规则（对**契约**刻意严格，对**数据量**刻意宽容）：
 *  - 字段集合必须完全一致：多字段（extra）或少字段（missing）都算失败；
 *  - 类型必须一致：null / undefined / number / string 严格区分；
 *  - 标量值严格相等；
 *  - 数组：元素形状递归比较；**长度不一致记为 `length`**，
 *    由调用方决定按告警还是失败处理 —— 两个后端的数据库内容量本就会不同
 *    （例如 Java 跑一遍录了 2 条草稿，Node 跑一遍只有 1 条），
 *    这不是契约破损，但 `pageNumber`/`pageSize` 这类分页元数据仍然严格比对。
 *
 * 宁可误报不可漏报 —— 契约冻结下，前端对字段缺失与类型变化的容忍度为零。
 */

export interface Diff {
  path: string
  kind: 'missing' | 'extra' | 'type' | 'value' | 'length'
  expected: unknown
  actual: unknown
}

function typeOf(v: unknown): string {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (Array.isArray(v)) return 'array'
  return typeof v
}

export function compareShape(expected: unknown, actual: unknown, path = '$'): Diff[] {
  const tExp = typeOf(expected)
  const tAct = typeOf(actual)

  if (tExp !== tAct) {
    return [{ path, kind: 'type', expected, actual }]
  }

  if (tExp === 'array') {
    const a = expected as unknown[]
    const b = actual as unknown[]
    const diffs: Diff[] = []
    if (a.length !== b.length) {
      // 长度差异单独成一类：调用方通常按告警处理
      diffs.push({ path, kind: 'length', expected: a.length, actual: b.length })
    }
    // 无论长度是否一致，都比对「两边都有」的那些元素，以便暴露元素形状问题。
    // 一边为空时没有可比对的元素，此时只报 length —— 不假装做了形状校验。
    const common = Math.min(a.length, b.length)
    for (let i = 0; i < common; i++) {
      diffs.push(...compareShape(a[i], b[i], `${path}[${i}]`))
    }
    return diffs
  }

  if (tExp === 'object') {
    const a = expected as Record<string, unknown>
    const b = actual as Record<string, unknown>
    const diffs: Diff[] = []
    for (const key of Object.keys(a)) {
      if (!(key in b)) {
        diffs.push({ path: `${path}.${key}`, kind: 'missing', expected: a[key], actual: undefined })
        continue
      }
      diffs.push(...compareShape(a[key], b[key], `${path}.${key}`))
    }
    for (const key of Object.keys(b)) {
      if (!(key in a)) {
        diffs.push({ path: `${path}.${key}`, kind: 'extra', expected: undefined, actual: b[key] })
      }
    }
    return diffs
  }

  if (expected !== actual) {
    return [{ path, kind: 'value', expected, actual }]
  }
  return []
}

export function formatDiffs(diffs: Diff[]): string {
  return diffs
    .map((d) => {
      switch (d.kind) {
        case 'missing':
          return `  ${d.path}: 缺少字段（Java 有 ${JSON.stringify(d.expected)}）`
        case 'extra':
          return `  ${d.path}: 多出字段（Node 有 ${JSON.stringify(d.actual)}）`
        case 'type':
          return `  ${d.path}: 类型不符（Java ${typeOf(d.expected)} vs Node ${typeOf(d.actual)}）`
        case 'value':
          return `  ${d.path}: 值不符（Java ${JSON.stringify(d.expected)} vs Node ${JSON.stringify(d.actual)}）`
        case 'length':
          return `  ${d.path}: 数组长度不同（Java ${JSON.stringify(d.expected)} vs Node ${JSON.stringify(d.actual)}）`
      }
    })
    .join('\n')
}

/**
 * 只比对**结构**（键集合与类型），忽略标量取值。
 *
 * 用途：两个后端各自造数据的**列表端点**。契约场景会在每条后端各建一遍数据，
 * 因此 `content` 里的具体 id、名称、时间必然不同 —— 逐值比对注定失败且毫无意义。
 * 真正属于契约的是「每个元素有哪些字段、是什么类型」。
 *
 * 注意它与 `compareShape` 的区别：后者对标量**要求值相等**，本函数只要求类型一致。
 * **不要**拿它替代整体比对 —— 只在明确列为「仅形状」的路径上使用。
 */
export function compareShapeOnly(expected: unknown, actual: unknown, path = '$'): Diff[] {
  const tExp = typeOf(expected)
  const tAct = typeOf(actual)

  if (tExp !== tAct) {
    return [{ path, kind: 'type', expected, actual }]
  }

  if (tExp === 'array') {
    const a = expected as unknown[]
    const b = actual as unknown[]
    // 元素形状用两边各自的第一个元素来校验；长度差异由调用方按告警处理
    if (a.length === 0 || b.length === 0) return []
    return compareShapeOnly(a[0], b[0], `${path}[0]`)
  }

  if (tExp === 'object') {
    const a = expected as Record<string, unknown>
    const b = actual as Record<string, unknown>
    const diffs: Diff[] = []
    for (const key of Object.keys(a)) {
      if (!(key in b)) {
        diffs.push({ path: `${path}.${key}`, kind: 'missing', expected: a[key], actual: undefined })
        continue
      }
      diffs.push(...compareShapeOnly(a[key], b[key], `${path}.${key}`))
    }
    for (const key of Object.keys(b)) {
      if (!(key in a)) {
        diffs.push({ path: `${path}.${key}`, kind: 'extra', expected: undefined, actual: b[key] })
      }
    }
    return diffs
  }

  // 标量：同类型即通过（不比值）
  return []
}

/**
 * 构造「仅形状路径」匹配器。
 *
 * 规则两种写法：
 *   - 以 `$.` 开头 → 精确匹配该 JSONPath
 *   - 以 `.` 开头   → **后缀**匹配（用于列表元素里的字段，如 `.deployedXml`
 *                     要能命中 `$.data.content[1].deployedXml`）
 */
export function makeShapeOnlyMatcher(patterns: string[]): (path: string) => boolean {
  return (path) =>
    patterns.some((pattern) =>
      pattern.startsWith('$.') ? path === pattern : path.endsWith(pattern),
    )
}

/**
 * 按「仅形状路径」做比对：命中这些路径时用 compareShapeOnly，其余仍严格比对。
 *
 * 注意 `compareShapeOnly` 对**标量**只校验类型不校验取值，
 * 因此这个机制同时适用于两类放宽：
 *   - 两个后端各自造数据的列表元素
 *   - 取值依赖数据量或外部实现的标量（如 totalElements、deployedXml）
 */
export function compareWithShapeOnlyPaths(
  expected: unknown,
  actual: unknown,
  isShapeOnly: (path: string) => boolean,
  path = '$',
): Diff[] {
  if (isShapeOnly(path)) {
    return compareShapeOnly(expected, actual, path)
  }

  const tExp = typeOf(expected)
  const tAct = typeOf(actual)
  if (tExp !== tAct) return [{ path, kind: 'type', expected, actual }]

  if (tExp === 'array') {
    const a = expected as unknown[]
    const b = actual as unknown[]
    const diffs: Diff[] = []
    if (a.length !== b.length) {
      diffs.push({ path, kind: 'length', expected: a.length, actual: b.length })
    }
    const common = Math.min(a.length, b.length)
    for (let i = 0; i < common; i++) {
      diffs.push(...compareWithShapeOnlyPaths(a[i], b[i], isShapeOnly, `${path}[${i}]`))
    }
    return diffs
  }

  if (tExp === 'object') {
    const a = expected as Record<string, unknown>
    const b = actual as Record<string, unknown>
    const diffs: Diff[] = []
    for (const key of Object.keys(a)) {
      if (!(key in b)) {
        diffs.push({ path: `${path}.${key}`, kind: 'missing', expected: a[key], actual: undefined })
        continue
      }
      diffs.push(...compareWithShapeOnlyPaths(a[key], b[key], isShapeOnly, `${path}.${key}`))
    }
    for (const key of Object.keys(b)) {
      if (!(key in a)) {
        diffs.push({ path: `${path}.${key}`, kind: 'extra', expected: undefined, actual: b[key] })
      }
    }
    return diffs
  }

  if (expected !== actual) return [{ path, kind: 'value', expected, actual }]
  return []
}

/** 区分「契约破损」与「仅数据量不同」。只有 length 属后者。 */
export function splitBySeverity(diffs: Diff[]): { failures: Diff[]; notices: Diff[] } {
  return {
    failures: diffs.filter((d) => d.kind !== 'length'),
    notices: diffs.filter((d) => d.kind === 'length'),
  }
}

/**
 * 把指定路径下的数组**按 JSON 字符串排序**，用于「顺序不是契约」的字段。
 *
 * 为什么需要：Java 侧的 `permissions` / `roles` 是 `HashSet`，序列化顺序取决于
 * Java 的 String.hashCode 与 HashMap 桶布局；Node 用 Set（插入顺序）不可能复现。
 * 这类字段前端也当集合用，**顺序不构成契约**，因此按集合比对。
 *
 * ⚠️ 不要拿它来放过分页列表的 `content` —— 那个顺序是有意义的
 *    （分页 + orderBy），必须严格比对。
 *
 * 对录制结果与实际响应**两侧都应用**，保证比对是对称的。
 */
/**
 * 数组元素的**规范化排序键**：递归把对象键按字典序排列后再序列化。
 *
 * ⚠️ 为什么不能直接用 `JSON.stringify`：两侧的**键顺序不同** ——
 *    Java 侧 Jackson 开了 `SORT_PROPERTIES_ALPHABETICALLY`（黄金样本里的键都是字母序），
 *    而 Node 侧是代码里对象字面量的书写顺序。元素内容完全相同的两个数组，
 *    用 `JSON.stringify` 当排序键会得到**不同的排序结果**，
 *    表现为「明明声明了 unorderedArrays，却还是按位置报一堆不一致」。
 *    实测踩到过：`/api/v1/data-sources/enabled` 的 `$.data` 就是这么挂的。
 *
 * 排序键必须只依赖**内容**、不依赖书写顺序，否则「顺序不是契约」这个声明就是假的。
 */
function canonicalSortKey(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalSortKey).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalSortKey(v)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

export function sortArraysAtPaths(value: unknown, paths: string[], currentPath = '$'): unknown {
  if (Array.isArray(value)) {
    const mapped = value.map((v, i) => sortArraysAtPaths(v, paths, `${currentPath}[${i}]`))
    if (paths.includes(currentPath)) {
      return [...mapped].sort((a, b) => {
        const sa = canonicalSortKey(a)
        const sb = canonicalSortKey(b)
        return sa < sb ? -1 : sa > sb ? 1 : 0
      })
    }
    return mapped
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sortArraysAtPaths(v, paths, `${currentPath}.${k}`)
    }
    return out
  }
  return value
}
