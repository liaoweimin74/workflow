import { describe, expect, it } from 'vitest'

import { applyChannelProfiles, resolveCardSlots, resolveChannelBlockProfile } from '../channelProfiles'
import type { CardSlotColumn } from '../cardSlots'

/**
 * 端覆盖层（designs §5.1 第2层「布局配置级」）：schema 顶层 channelProfiles 按渠道类型
 * （WEB/H5/APP/MP）存每块的移动配置——列→卡片槽位、字段显隐、排序。缺省（无覆盖）走
 * deriveCardSlots 自动映射。纯函数合并：覆盖优先，未覆盖槽位回退缺省算法。
 */
const COLUMNS: CardSlotColumn[] = [
  { key: 'code', label: '编号' },
  { key: 'name', label: '名称' },
  { key: 'phone', label: '手机' },
  { key: 'addr', label: '地址' },
]

describe('resolveCardSlots（缺省 + 覆盖合并）', () => {
  it('falls back to default slot derivation with no profile', () => {
    const plan = resolveCardSlots(COLUMNS, undefined)
    expect(plan.title?.key).toBe('code')
    expect(plan.subtitle?.key).toBe('name')
    expect(plan.kv.map((c) => c.key)).toEqual(['phone', 'addr'])
  })

  it('honors explicit title/subtitle slot override', () => {
    const plan = resolveCardSlots(COLUMNS, { title: 'name', subtitle: 'code' })
    expect(plan.title?.key).toBe('name')
    expect(plan.subtitle?.key).toBe('code')
  })

  it('honors kv slot list override (order preserved, resolved against columns by key)', () => {
    const plan = resolveCardSlots(COLUMNS, { kv: ['addr', 'phone'] })
    expect(plan.kv.map((c) => c.key)).toEqual(['addr', 'phone'])
  })

  it('drops slots referencing unknown column keys (defensive against stale profiles)', () => {
    const plan = resolveCardSlots(COLUMNS, { title: 'ghost', subtitle: 'name' })
    expect(plan.title).toBeNull()
    expect(plan.subtitle?.key).toBe('name')
  })

  it('hides listed columns from every slot even when default would place them', () => {
    const plan = resolveCardSlots(COLUMNS, { hiddenColumns: ['code'] })
    expect(plan.title?.key).toBe('name') // 隐藏第1列后 code→被跳过，name 顶上
    expect(plan.kv.map((c) => c.key)).toEqual(['addr'])
  })

  it('reorders columns by columnOrder before slot distribution (unlisted keep original tail order)', () => {
    const plan = resolveCardSlots(COLUMNS, { columnOrder: ['phone', 'addr'] })
    // 排序后=[phone, addr, code, name]：标题=phone、副标题=addr、kv=[code, name]
    expect(plan.title?.key).toBe('phone')
    expect(plan.subtitle?.key).toBe('addr')
    expect(plan.kv.map((c) => c.key)).toEqual(['code', 'name'])
  })

  it('combines order + hidden + explicit slots in that pipeline order', () => {
    const plan = resolveCardSlots(COLUMNS, {
      columnOrder: ['addr', 'phone', 'name', 'code'],
      hiddenColumns: ['code'],
      title: 'addr',
      kv: ['phone', 'name'],
    })
    expect(plan.title?.key).toBe('addr')
    expect(plan.kv.map((c) => c.key)).toEqual(['phone', 'name'])
    // code 被隐藏，任何槽都不含它
    expect([plan.title, plan.subtitle, ...plan.kv, ...plan.more].filter(Boolean).map((c) => c!.key)).not.toContain('code')
  })
})

describe('resolveChannelBlockProfile（按渠道 + 块 field 取覆盖，容错缺渠道）', () => {
  const PROFILES = {
    H5: { dc1: { card: { title: 'name' } } },
    WEB: { dc1: { card: { title: 'code' } } },
  }

  it('reads the block profile under the given channel', () => {
    const profile = resolveChannelBlockProfile(PROFILES, 'H5', 'dc1')
    expect(profile?.card).toEqual({ title: 'name' })
  })

  it('returns undefined for a channel or block without a profile (renderer falls back to default)', () => {
    expect(resolveChannelBlockProfile(PROFILES, 'MP', 'dc1')).toBeUndefined()
    expect(resolveChannelBlockProfile(PROFILES, 'H5', 'other')).toBeUndefined()
    expect(resolveChannelBlockProfile(undefined, 'H5', 'dc1')).toBeUndefined()
  })
})

describe('applyChannelProfiles（宿主按渠道注入卡片槽位覆盖到块 props）', () => {
  it('injects the channel card override into a card block by field', () => {
    const [node] = applyChannelProfiles(
      [{ type: 'page-table', field: 'tbl1', props: { dataSourceId: 'ds1' } }],
      { H5: { tbl1: { card: { title: 'name', hiddenColumns: ['code'] } } } },
      'H5',
    )
    expect(node.props!.cardSlotsOverride).toEqual({ title: 'name', hiddenColumns: ['code'] })
    expect(node.props!.dataSourceId).toBe('ds1')
  })

  it('leaves the block untouched when it has no profile for the channel', () => {
    const rules = [{ type: 'page-table', field: 'tbl1', props: { dataSourceId: 'ds1' } }]
    const [node] = applyChannelProfiles(rules, { WEB: { tbl1: { card: { title: 'name' } } } }, 'H5')
    expect(node.props!.cardSlotsOverride).toBeUndefined()
  })

  it('only touches card blocks (page-table/page-list-cards), not form/detail/container', () => {
    const rules = [
      { type: 'page-form', field: 'f1', props: {} },
      { type: 'page-list-cards', field: 'f1', props: {} },
    ]
    const [formNode, cardNode] = applyChannelProfiles(rules, { H5: { f1: { card: { title: 'x' } } } }, 'H5')
    expect(formNode.props!.cardSlotsOverride).toBeUndefined()
    expect(cardNode.props!.cardSlotsOverride).toEqual({ title: 'x' })
  })

  it('recurses into layout children and injects there', () => {
    const [node] = applyChannelProfiles(
      [{ type: 'fcRow', children: [{ type: 'col', children: [{ type: 'page-table', field: 'tbl1', props: {} }] }] }],
      { H5: { tbl1: { card: { kv: ['a'] } } } },
      'H5',
    )
    const deep = ((node.children as Record<string, any>[])[0].children as Record<string, any>[])[0]
    expect(deep.props!.cardSlotsOverride).toEqual({ kv: ['a'] })
  })

  it('does not mutate the input rules', () => {
    const rules = [{ type: 'page-table', field: 'tbl1', props: {} }]
    applyChannelProfiles(rules, { H5: { tbl1: { card: { title: 'name' } } } }, 'H5')
    expect(rules[0].props).toEqual({})
  })
})
