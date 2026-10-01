/**
 * 仪表盘组件共享工具（Task 120）：结构化筛选合并 + setFilter 条件归一。
 *
 * setFilter 动作总线契约（升级版）：
 *   - `setFilter({ field: value })` —— 等值（Task 119 兼容）
 *   - `setFilter({ field: { op: 'range', value: [a, b] } })` —— 显式运算符（日期筛选器等）
 *   - `setFilter({ field: null })` —— 清除该字段条件
 */

export interface DashCondition {
  column: string
  op: string
  value: unknown
}

export function parseDashFilter(json: string | null | undefined): Record<string, unknown> | null {
  if (json === null || json === undefined || json.trim() === '') return null
  try {
    const parsed = JSON.parse(json)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 基础 filter（props）+ 组件级追加条件 → 结构化 filter JSON 文本。 */
export function mergeDashFilter(
  baseFilter: Record<string, unknown> | null,
  extraConditions: DashCondition[],
  propsFilter: string | null | undefined,
): string | null {
  if (extraConditions.length === 0) return propsFilter || null
  const base: Record<string, unknown> =
    baseFilter !== null && Array.isArray((baseFilter as { conditions?: unknown }).conditions)
      ? { ...baseFilter }
      : { logic: 'AND', conditions: [...(((baseFilter as { conditions?: unknown[] })?.conditions as unknown[]) || [])] }
  const conditions = [...((base.conditions as unknown[]) || []), ...extraConditions]
  return JSON.stringify({ ...base, conditions })
}

/** 将 setFilter 入参归一为条件数组并合并进 extraConditions（原地更新）。 */
export function upsertDashConditions(
  extraConditions: DashCondition[],
  cond: Record<string, unknown>,
): void {
  for (const [column, raw] of Object.entries(cond)) {
    // 清除语义：value 为 null/undefined 时移除该字段条件
    if (raw === null || raw === undefined) {
      const idx = extraConditions.findIndex((item) => item.column === column)
      if (idx >= 0) extraConditions.splice(idx, 1)
      continue
    }
    // 显式运算符形态：{ op, value }（value 数组 = range/in）
    const isStructured =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'op' in (raw as Record<string, unknown>)
    const item: DashCondition = isStructured
      ? { column, op: String((raw as { op: unknown }).op || 'eq'), value: (raw as { value: unknown }).value }
      : { column, op: 'eq', value: raw }
    const existing = extraConditions.find((c) => c.column === column)
    if (existing) Object.assign(existing, item)
    else extraConditions.push(item)
  }
}

/** 复合维度 key（后端 "a|b"）拆分。 */
export function splitCompositeKey(key: string): string[] {
  return key.split('|')
}
