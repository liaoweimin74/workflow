/**
 * 子表单在列表中的展示辅助。
 *
 * 子表数据（embedded 模式）在主表记录的 `data[<子表字段>]` 中为 JSON 数组字符串
 * （如 '[{"sub_lookup":"王五",...},...]'）。列表页解析后渲染子表行，供弹窗展示。
 */

/** 解析子表行数据：兼容 JSON 数组字符串 / 已解析数组 / 空值 / 非法值（返回空数组） */
export function parseSubRows(value: unknown): any[] {
  if (value === null || value === undefined || value === '') return []
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}
