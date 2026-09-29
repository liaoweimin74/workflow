/**
 * 选项类字段（radio/select/checkbox 等）单元格显示映射：value → label。
 *
 * ⚠️ 为什么需要：radio/select 组件在表单里显示的是选项 label（如「是/否」），
 *    但数据库存的是选项 value（如 'yes'/'no'）。列表/表格直接渲染原始值时，
 *    用户看到的就是 `yes/no` 而不是 `是/否`。这里从表单 schema rule 的选项
 *    定义构建 value→label 映射，供列渲染统一换算。
 *
 * 以纯数据（rule + value）驱动，可测试；不依赖组件状态。
 */

/**
 * 从表单 schema rule 提取扁平 value→label 映射。
 *
 * 兼容三类选项载体（与查询栏 formOptionLabelItems 同源规则）：
 *   - `rule.options`（radio/select/checkbox 直接选项）
 *   - `rule.props.options`（select/cascader 属性选项）
 *   - `rule.props.data`（tree/elTreeSelect 树形选项）
 * 树形/级联递归 children；无选项定义返回空 Map。
 */
export function extractOptionMap(rule: Record<string, any> | null | undefined): Map<string, string> {
  const map = new Map<string, string>()
  const list: any[] = rule?.options ?? rule?.props?.options ?? rule?.props?.data ?? []
  const collect = (items: any[]): void => {
    for (const item of items) {
      if (item == null) continue
      if (item.value !== undefined && item.label !== undefined) {
        map.set(String(item.value), String(item.label))
      }
      if (Array.isArray(item.children)) collect(item.children)
    }
  }
  collect(list)
  return map
}

/**
 * 单元格值 → 选项 label 显示文本。
 *
 * - 单值：命中映射 → label；未命中 → 原值字符串（兼容旧数据/自定义 value）；
 * - 数组 / JSON 数组文本（如 checkbox 多选 `["yes","no"]`）→ 逐项映射后逗号拼接；
 * - null/undefined/空白 → 空字符串（占位符由调用方统一处理）。
 */
export function mapOptionLabel(map: Map<string, string>, value: unknown): string {
  if (value === null || value === undefined) return ''
  let val: unknown = value
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return ''
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) val = parsed
      } catch {
        // 非 JSON 文本，按原字符串处理
      }
    }
  }
  if (Array.isArray(val)) {
    return val.map((item) => map.get(String(item)) ?? String(item ?? '')).join(', ')
  }
  return map.get(String(val)) ?? String(val)
}
