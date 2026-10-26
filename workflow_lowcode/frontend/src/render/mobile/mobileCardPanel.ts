/**
 * 设计器「移动」配置面板数据层（§5.1 布局层只做三件事：列→槽位、字段显隐、排序）。
 *
 * 面板行模型（可编辑） ↔ channelProfiles.card 覆盖双向转换 + 渠道键写入助手。
 * 「所见即所得」：无覆盖时初始行=deriveCardSlots 缺省解析结果，确认后固化当前生效映射（幂等）。
 * 行序=标题 → 副标题 → 键值区（按覆盖顺序）→ 未分配可见列 → 隐藏列；
 * custom/contentType 列永不进面板（非原生数据列，槽位取不到行值）。
 */
import { deriveCardSlots, type CardSlotColumn } from './cardSlots'
import type { CardSlotsOverride } from './channelProfiles'

export type PanelSlot = 'title' | 'subtitle' | 'kv' | 'none'

export interface PanelRow {
  key: string
  label: string
  slot: PanelSlot
  hidden: boolean
}

/** 面板可编辑列全集=原生数据列（剔除 custom/contentType 非数据列） */
function editableUniverse(columns: readonly CardSlotColumn[]): CardSlotColumn[] {
  return columns.filter((c) => !c.custom && c.contentType !== 'expression' && c.contentType !== 'template')
}

/** 覆盖/缺省 → 面板行初值（所见即所得：无覆盖走 deriveCardSlots） */
export function toPanelRows(
  columns: readonly CardSlotColumn[],
  override: CardSlotsOverride | undefined,
): PanelRow[] {
  const base = deriveCardSlots([...columns])
  const plan = override ? { title: slotOf(override, 'title', base, columns), subtitle: slotOf(override, 'subtitle', base, columns), kv: override.kv ? pickCols(override.kv, columns) : base.kv } : base
  const hiddenKeys = new Set(override?.hiddenColumns ?? [])
  const isHidden = (c: CardSlotColumn) => !!c.hidden || hiddenKeys.has(c.key)

  const assigned = new Map<string, PanelSlot>()
  if (plan.title && !isHidden(plan.title)) assigned.set(plan.title.key, 'title')
  if (plan.subtitle && !isHidden(plan.subtitle)) assigned.set(plan.subtitle.key, 'subtitle')
  for (const col of plan.kv) if (!isHidden(col) && !assigned.has(col.key)) assigned.set(col.key, 'kv')

  const universe = editableUniverse(columns)
  const ordered: PanelRow[] = []
  const push = (col: CardSlotColumn) =>
    ordered.push({ key: col.key, label: col.label, slot: assigned.get(col.key) ?? 'none', hidden: isHidden(col) })

  // 标题 → 副标题 → 键值区（按覆盖顺序）
  if (plan.title && !isHidden(plan.title)) push(plan.title)
  if (plan.subtitle && !isHidden(plan.subtitle)) push(plan.subtitle)
  for (const col of plan.kv) if (!isHidden(col) && assigned.get(col.key) === 'kv') push(col)
  // 未分配可见列（保持列序）
  for (const col of universe) if (!isHidden(col) && !assigned.has(col.key)) push(col)
  // 隐藏列
  for (const col of universe) if (isHidden(col)) push(col)
  return ordered
}

/** 面板行 → card 覆盖（隐藏行不贡献槽位；重复槽位取首个，防脏配置） */
export function fromPanelRows(rows: readonly PanelRow[]): CardSlotsOverride {
  const visible = rows.filter((r) => !r.hidden)
  const title = visible.find((r) => r.slot === 'title')?.key
  const subtitle = visible.find((r) => r.slot === 'subtitle')?.key
  const kv = visible.filter((r) => r.slot === 'kv').map((r) => r.key)
  const hiddenColumns = rows.filter((r) => r.hidden).map((r) => r.key)
  const columnOrder = rows.map((r) => r.key)
  const override: CardSlotsOverride = { columnOrder }
  if (title) override.title = title
  if (subtitle) override.subtitle = subtitle
  if (kv.length > 0) override.kv = kv
  if (hiddenColumns.length > 0) override.hiddenColumns = hiddenColumns
  return override
}

/** 把块在某渠道的 card 覆盖写入 channelProfiles（副本语义）；override 空=清该块回自动映射 */
export function writeChannelCardProfile(
  profiles: Record<string, Record<string, { card?: CardSlotsOverride }>> | undefined | null,
  channel: string,
  blockField: string,
  override: CardSlotsOverride | undefined,
): Record<string, Record<string, { card?: CardSlotsOverride }>> {
  const next: Record<string, Record<string, { card?: CardSlotsOverride }>> = JSON.parse(JSON.stringify(profiles ?? {}))
  const byBlock = next[channel] ?? (next[channel] = {})
  const isEmpty = !override || Object.keys(override).length === 0
  if (isEmpty) {
    delete byBlock[blockField]
    if (Object.keys(byBlock).length === 0) delete next[channel]
  } else {
    byBlock[blockField] = { card: override }
  }
  return next
}

// ==================== 内部助手 ====================

function slotOf(
  override: CardSlotsOverride,
  slot: 'title' | 'subtitle',
  base: ReturnType<typeof deriveCardSlots>,
  columns: readonly CardSlotColumn[],
): CardSlotColumn | null {
  if (slot in override) return pickCols([override[slot]!], columns)[0] ?? null
  return base[slot]
}

function pickCols(keys: string[], columns: readonly CardSlotColumn[]): CardSlotColumn[] {
  const byKey = new Map(columns.map((c) => [c.key, c]))
  return keys.map((k) => byKey.get(k)).filter((c): c is CardSlotColumn => !!c)
}
