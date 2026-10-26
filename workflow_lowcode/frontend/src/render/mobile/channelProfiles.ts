/**
 * 端覆盖层（channelProfiles）模型与缺省合并（designs §5.1 第2层「布局配置级」）。
 *
 * 存储：页面 schema 顶层 `channelProfiles[渠道类型][块 field]`，渠道=WEB/H5/APP/MP
 * （sys_client_channel.channelType 口径）。每块的移动配置只做三件事——
 * 列→卡片槽位（title/subtitle/kv）、字段显隐（hiddenColumns）、排序（columnOrder）。
 * 缺省（无覆盖）走 deriveCardSlots 自动映射；覆盖存在时按显式槽位覆盖，
 * 未指定的槽位回退缺省算法。纯函数无副作用，渲染器与设计器预览共用。
 */
import { deriveCardSlots, type CardSlotColumn, type CardSlotPlan } from './cardSlots'

/** 块级卡片槽位覆盖（引用列 key；未知 key 忽略，防陈旧配置渲染脏值） */
export interface CardSlotsOverride {
  title?: string
  subtitle?: string
  /** 键值区列 key 顺序表 */
  kv?: string[]
  /** 从所有槽位隐藏这些列（优先于排序/显式槽） */
  hiddenColumns?: string[]
  /** 列参与槽位分配的顺序（未列出的按原顺序接在末尾） */
  columnOrder?: string[]
}

/** 单块移动配置（当前仅卡片；后续按需扩展 form/detail 覆盖键） */
export interface ChannelBlockProfile {
  card?: CardSlotsOverride
}

/** 渠道类型 → 块 field → 覆盖 */
export type ChannelProfiles = Record<string, Record<string, ChannelBlockProfile>>

/** 按渠道 + 块 field 取覆盖；渠道或块无配置返回 undefined（渲染器走缺省） */
export function resolveChannelBlockProfile(
  profiles: ChannelProfiles | undefined | null,
  channel: string,
  blockField: string,
): ChannelBlockProfile | undefined {
  return profiles?.[channel]?.[blockField]
}

/** 稳定排序：按 columnOrder 列出的 key 前置（给定顺序），其余保持原序接末尾；未知 key 忽略 */
function applyOrder(columns: CardSlotColumn[], order: string[] | undefined): CardSlotColumn[] {
  if (!order || order.length === 0) return columns
  const byKey = new Map(columns.map((c) => [c.key, c]))
  const ordered: CardSlotColumn[] = []
  const seen = new Set<string>()
  for (const key of order) {
    const col = byKey.get(key)
    if (col && !seen.has(key)) {
      ordered.push(col)
      seen.add(key)
    }
  }
  for (const col of columns) {
    if (!seen.has(col.key)) ordered.push(col)
  }
  return ordered
}

/** 把覆盖里的列 key 解析成列对象（按可参与槽位的列集），未知 key 丢弃 */
function pickKeys(keys: string[] | undefined, usable: CardSlotColumn[]): CardSlotColumn[] {
  if (!keys) return []
  const byKey = new Map(usable.map((c) => [c.key, c]))
  return keys.map((k) => byKey.get(k)).filter((c): c is CardSlotColumn => !!c)
}

/** 卡片类块（覆盖层唯一消费面=§5.1「列→槽位/显隐/排序」三件事） */
const CARD_BLOCKS: ReadonlySet<string> = new Set(['page-table', 'page-list-cards'])

interface ProfileRuleNode {
  type?: string
  field?: string
  props?: Record<string, any>
  children?: unknown[]
  [key: string]: unknown
}

/**
 * 宿主注入：按渠道把块的 card 覆盖写进 props.cardSlotsOverride（副本语义）。
 * 无覆盖的块原样透传；只触卡片类块，字段名与 MobileCardList props 对齐。
 */
export function applyChannelProfiles(
  rules: readonly ProfileRuleNode[],
  profiles: ChannelProfiles | undefined | null,
  channel: string,
): ProfileRuleNode[] {
  if (!profiles) return [...rules]
  return rules.map((node) => {
    let next = node
    if (CARD_BLOCKS.has(node.type || '') && node.field) {
      const card = resolveChannelBlockProfile(profiles, channel, node.field)?.card
      if (card && (!next.props || !next.props.cardSlotsOverride)) {
        next = { ...next, props: { ...next.props, cardSlotsOverride: card } }
      }
    }
    if (Array.isArray(next.children)) {
      next = {
        ...next,
        children: next.children.map((child) =>
          child && typeof child === 'object' && typeof (child as ProfileRuleNode).type === 'string'
            ? applyChannelProfiles([child as ProfileRuleNode], profiles, channel)[0]
            : child,
        ),
      }
    }
    return next
  })
}

/**
 * 卡片槽位解析：缺省算法 + 覆盖合并。
 * 管线顺序=①columnOrder 排序 → ②hiddenColumns 剔除 → ③缺省分配 → ④显式槽位覆盖（未指定槽位回退缺省）。
 */
export function resolveCardSlots(
  columns: readonly CardSlotColumn[],
  override: CardSlotsOverride | undefined,
): CardSlotPlan {
  const hidden = new Set(override?.hiddenColumns ?? [])
  const ordered = applyOrder(
    columns.filter((c) => !hidden.has(c.key)),
    override?.columnOrder,
  )
  const base = deriveCardSlots(ordered)

  if (!override) return base

  // 可参与覆盖显式槽位的列集=覆盖管线后的可用列（与 deriveCardSlots 同口径）
  const usable = ordered.filter(
    (c) =>
      !c.hidden &&
      !c.custom &&
      c.contentType !== 'expression' &&
      c.contentType !== 'template',
  )

  const title = 'title' in override ? (pickKeys([override.title!], usable)[0] ?? null) : base.title
  const subtitle = 'subtitle' in override ? (pickKeys([override.subtitle!], usable)[0] ?? null) : base.subtitle
  const kv = override.kv ? pickKeys(override.kv, usable) : base.kv

  return { title, subtitle, kv, more: base.more }
}
