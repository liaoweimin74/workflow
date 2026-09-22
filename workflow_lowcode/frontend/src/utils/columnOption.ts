/**
 * 数据源字段下拉选项的统一展示格式（需求：筛选列名统一为中文名(英文名)）。
 *
 * 适用范围（三处筛选列名下拉保持一致）：
 *  - UniDataSourceBinding（组件级数据筛选，标杆）
 *  - DataSourceConfigPanel（数据源绑定 tab 的数据源级筛选 + 动作总线 set-filter 过滤字段）
 *  - 其他引用数据源 metadata 的筛选/列配置入口
 *
 * 规则：有中文名且不同于字段名 → `中文名(字段名)`；否则仅显示字段名。
 */
export function columnOptionLabel(col: { key: string; label?: string | null }): string {
  const key = (col?.key ?? '').toString()
  const label = (col?.label ?? '').toString().trim()
  if (key === '') return ''
  return label && label !== key ? `${label}(${key})` : key
}
