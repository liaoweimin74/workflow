/**
 * 缺省卡片槽位映射：VIEW 显示列 → 移动端卡片槽位（designs §5.1 布局层）。
 *
 * 端覆盖层（channelProfiles，列→槽位/显隐/排序）未配置时走本算法；配置后以其为准。
 * 纯函数无状态，渲染器与设计器预览共用。
 */

export interface CardSlotColumn {
  key: string
  label: string
  /** 与 ColumnViewConfig 对齐的三个筛选位：隐藏列、非数据列不参与缺省槽位 */
  hidden?: boolean
  custom?: boolean
  contentType?: 'expression' | 'template'
  contentValue?: string
}

export interface CardSlotPlan {
  title: CardSlotColumn | null
  subtitle: CardSlotColumn | null
  /** 键值区（第 3~5 位） */
  kv: CardSlotColumn[]
  /** 溢出列（第 6 位起）：缺省不展示，端覆盖层可显式纳入 */
  more: CardSlotColumn[]
}

const KV_SLOTS = 3

/** 可进槽位列：WEB 可见（hidden 未取消勾选）且是原生数据列（expression/template/custom 取不到行值） */
function usableColumns(columns: readonly CardSlotColumn[]): CardSlotColumn[] {
  return columns.filter(
    (column) =>
      !column.hidden &&
      !column.custom &&
      column.contentType !== 'expression' &&
      column.contentType !== 'template',
  )
}

export function deriveCardSlots(columns: readonly CardSlotColumn[]): CardSlotPlan {
  const usable = usableColumns(columns)
  return {
    title: usable[0] ?? null,
    subtitle: usable[1] ?? null,
    kv: usable.slice(2, 2 + KV_SLOTS),
    more: usable.slice(2 + KV_SLOTS),
  }
}
