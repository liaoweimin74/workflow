/**
 * JSON 实例 → 变量结构树推断（设计期结构发现，与 formFields 树同构）。
 *
 * 用途：输入参数 / 节点输出参数声明为 json 类型时，用户粘贴一个 JSON 实例，
 * 系统据此生成字段结构树（FieldNode[]，结构与 FormFieldSchemaService 的
 * form-fields 树同形），供变量选择器展开做字段级点选。
 *
 * 推断规则：
 * - object → 递归子字段（单层最多 MAX_KEYS 个键，防 DSL 膨胀）
 * - array  → 元素类型收敛：元素全为 object 时合并前 SAMPLE 个对象元素的键
 *            （并集、首次出现序）形成数组元素结构，类型标 array<object>；
 *            标量数组 → array<string|number|boolean> 叶子
 * - 标量   → string / number / boolean / null
 * - 深度上限 MAX_DEPTH，总节点上限 MAX_TOTAL（超出截断并在 stats 标注 truncated）
 */
export interface FieldNode {
  path: string
  label?: string | null
  type?: string | null
  children?: FieldNode[] | null
}

export interface InferStats {
  top: number
  total: number
  depth: number
  truncated: boolean
}

export interface InferResult {
  ok: boolean
  error?: string
  fields?: FieldNode[]
  stats?: InferStats
}

export const JSON_INFER_MAX_DEPTH = 6
export const JSON_INFER_MAX_KEYS = 30
export const JSON_INFER_MAX_TOTAL = 300
const ARRAY_SAMPLE = 3

/** 统计树指标（顶层字段数 / 总节点数 / 最大深度） */
export function statFields(fields: FieldNode[]): InferStats {
  let total = 0
  let depth = 0
  const walk = (list: FieldNode[], d: number): void => {
    for (const f of list) {
      total += 1
      if (d > depth) depth = d
      if (f.children?.length) walk(f.children, d + 1)
    }
  }
  walk(fields, 1)
  return { top: fields.length, total, depth, truncated: false }
}

/** 数组元素类型合并：标量取公共类型，object 键取并集 */
function inferArrayElementType(arr: unknown[]): { type: string; children: FieldNode[] | null } {
  const objects = arr.filter((v) => v !== null && typeof v === 'object' && !Array.isArray(v))
  if (objects.length && objects.length === arr.filter((v) => v !== null && typeof v === 'object').length) {
    // 全为对象（含嵌套数组暂不合并）：键并集、首次出现序，采样前 SAMPLE 个
    const merged: FieldNode[] = []
    const seen = new Set<string>()
    for (const obj of objects.slice(0, ARRAY_SAMPLE)) {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (seen.has(k)) continue
        seen.add(k)
        merged.push({ path: k, type: scalarType(v) })
      }
    }
    return { type: 'array<object>', children: merged.length ? merged : null }
  }
  const scalarKinds = new Set(arr.filter((v) => v !== null && typeof v !== 'object').map((v) => scalarType(v)))
  if (scalarKinds.size === 1) return { type: `array<${[...scalarKinds][0]}>`, children: null }
  return { type: 'array', children: null }
}

function scalarType(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (Array.isArray(v)) return 'array'
  if (typeof v === 'object') return 'object'
  return typeof v // 'string' | 'number' | 'boolean'
}

/** 单层展开：object 键枚举（上限 MAX_KEYS）；返回是否发生截断 */
function expandValue(value: unknown, depth: number, budget: { left: number }): { fields: FieldNode[]; truncated: boolean } {
  let truncated = false
  if (depth >= JSON_INFER_MAX_DEPTH) {
    truncated = true
    return { fields: [], truncated }
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > JSON_INFER_MAX_KEYS) truncated = true
    const fields: FieldNode[] = []
    for (const [k, v] of entries.slice(0, JSON_INFER_MAX_KEYS)) {
      if (budget.left <= 0) {
        truncated = true
        break
      }
      budget.left -= 1
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        const sub = expandValue(v, depth + 1, budget)
        truncated = truncated || sub.truncated
        fields.push({ path: k, type: 'object', children: sub.fields.length ? sub.fields : null })
      } else if (Array.isArray(v)) {
        if (v.length) {
          const el = inferArrayElementType(v)
          if (el.children) {
            const sub = expandValue(Object.fromEntries(el.children.map((c) => [c.path, sampledElementValue(v, c.path)])), depth + 1, budget)
            fields.push({ path: k, type: el.type, children: sub.fields.length ? sub.fields : null })
          } else {
            fields.push({ path: k, type: el.type })
          }
        } else {
          fields.push({ path: k, type: 'array' })
        }
      } else {
        fields.push({ path: k, type: scalarType(v) })
      }
    }
    return { fields, truncated }
  }
  return { fields: [], truncated }
}

/** 从数组中取首个含指定键的对象元素值（供嵌套展开） */
function sampledElementValue(arr: unknown[], key: string): unknown {
  for (const v of arr) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && key in (v as Record<string, unknown>)) {
      return (v as Record<string, unknown>)[key]
    }
  }
  return null
}

/**
 * 从 JSON 实例文本推断字段结构树。
 * 根为 object → 返回其字段列表；根为 array → 返回元素结构（包装为 items）；根为标量 → 单字段 value。
 */
export function inferStructureFromJsonText(text: string): InferResult {
  const raw = (text ?? '').trim()
  if (!raw) return { ok: false, error: 'JSON 实例为空' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    return { ok: false, error: `JSON 解析失败：${err instanceof Error ? err.message : String(err)}` }
  }

  const budget = { left: JSON_INFER_MAX_TOTAL }
  let fields: FieldNode[]
  if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
    const r = expandValue(parsed, 1, budget)
    fields = r.fields
    const stats = statFields(fields)
    stats.truncated = r.truncated
    return { ok: true, fields, stats }
  }
  if (Array.isArray(parsed)) {
    if (!parsed.length) return { ok: false, error: '数组实例为空，无法推断元素结构' }
    const el = inferArrayElementType(parsed)
    if (el.children) {
      const sub = expandValue(Object.fromEntries(el.children.map((c) => [c.path, sampledElementValue(parsed, c.path)])), 1, budget)
      fields = [{ path: 'items', type: el.type, children: sub.fields.length ? sub.fields : null }]
    } else {
      fields = [{ path: 'items', type: el.type }]
    }
    const stats = statFields(fields)
    stats.truncated = budget.left <= 0
    return { ok: true, fields, stats }
  }
  // 根为标量
  fields = [{ path: 'value', type: scalarType(parsed) }]
  return { ok: true, fields, stats: statFields(fields) }
}
