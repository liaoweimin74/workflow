import type { LookupFilterConfig } from '@/components/business/types'

/**
 * 合并数据源级 filter 与组件级 filter。
 *
 * 规则：
 * - 两层均无有效条件 → undefined
 * - 仅一层有 → 原样返回该层（浅拷贝，避免调用方误改共享配置）
 * - 两层均有 → logic 固定为 AND，conditions 顺序拼接（数据源级在前）
 */
export function mergeFilters(
  dsFilter?: LookupFilterConfig,
  componentFilter?: LookupFilterConfig,
): LookupFilterConfig | undefined {
  const dsConditions = dsFilter?.conditions?.filter((c) => c.column) ?? []
  const compConditions = componentFilter?.conditions?.filter((c) => c.column) ?? []

  if (dsConditions.length === 0 && compConditions.length === 0) return undefined
  if (compConditions.length === 0) {
    return { logic: dsFilter?.logic ?? 'AND', conditions: [...dsConditions] }
  }
  if (dsConditions.length === 0) {
    return { logic: componentFilter!.logic ?? 'AND', conditions: [...compConditions] }
  }

  return {
    logic: 'AND',
    conditions: [
      ...dsConditions.map((c) => ({ ...c })),
      ...compConditions.map((c) => ({ ...c })),
    ],
  }
}
