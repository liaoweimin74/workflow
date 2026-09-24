import type { LookupFilterConfig } from '@/components/business/types'

/**
 * 运行期解析 filter 中的动态字段引用。
 *
 * 规则：
 * - condition.field 存在 → value 取 formData[field]
 *   - 字段值有效（非 null/undefined/空串）→ 写入 value
 *   - 字段值无效 → 该条件被剔除（避免无效等值查询污染结果）
 * - condition.field 不存在（静态条件）→ value 原样保留
 * - 返回全新对象，不修改入参；filter 为 undefined 时返回 undefined
 */
export function resolveFilterFieldReferences(
  filter: LookupFilterConfig | undefined,
  formData: Record<string, unknown>,
): LookupFilterConfig | undefined {
  if (!filter) return undefined

  const resolved = filter.conditions
    .map((c) => ({ ...c }))
    .filter((c) => {
      if (!c.field) return true
      const v = formData[c.field]
      if (v === null || v === undefined || v === '') return false
      c.value = v
      return true
    })

  return { logic: filter.logic ?? 'AND', conditions: resolved }
}
