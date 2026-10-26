import { describe, expect, it } from 'vitest'

import { fromPanelRows, toPanelRows, writeChannelCardProfile } from '../mobileCardPanel'
import type { PanelRow } from '../mobileCardPanel'
import type { CardSlotColumn } from '../cardSlots'

/**
 * 设计器「移动」配置面板的数据层（§5.1 只做三件事：列→槽位、显隐、排序）。
 * 面板行模型 ↔ channelProfiles card 覆盖双向转换 + 渠道键写入助手。
 * 「所见即所得」：无覆盖时初始行=缺省槽位解析结果，确认后固化当前生效映射（幂等）。
 */
const COLUMNS: CardSlotColumn[] = [
  { key: 'code', label: '编号' },
  { key: 'name', label: '名称' },
  { key: 'phone', label: '手机' },
  { key: 'addr', label: '地址' },
  { key: 'type', label: '类型' },
]

describe('toPanelRows（覆盖/缺省 → 面板行初值）', () => {
  it('shows default slot derivation as initial rows when no override', () => {
    const rows = toPanelRows(COLUMNS, undefined)
    expect(rows.map((r) => r.slot)).toEqual(['title', 'subtitle', 'kv', 'kv', 'kv'])
    expect(rows.map((r) => r.key)).toEqual(['code', 'name', 'phone', 'addr', 'type'])
  })

  it('reflects override slots, hidden columns and columnOrder', () => {
    const rows = toPanelRows(COLUMNS, {
      columnOrder: ['name', 'addr', 'phone'],
      title: 'name',
      subtitle: 'addr',
      kv: ['phone'],
      hiddenColumns: ['type'],
    })
    expect(rows.map((r) => `${r.key}:${r.slot}:${r.hidden}`)).toEqual([
      'name:title:false',
      'addr:subtitle:false',
      'phone:kv:false',
      // 未列出的列按原序接尾：type 被隐藏
      'code:none:false',
      'type:none:true',
    ])
  })

  it('marks columns with hidden flag hidden regardless of override', () => {
    const rows = toPanelRows([...COLUMNS, { key: 'x', label: 'X', hidden: true }], undefined)
    expect(rows.find((r) => r.key === 'x')!.hidden).toBe(true)
  })

  it('excludes custom/contentType columns from panel (never slot-able)', () => {
    const rows = toPanelRows(
      [...COLUMNS, { key: 'calc', label: '公式', custom: true }, { key: 'ct', label: '内容', contentType: 'expression' }],
      undefined,
    )
    expect(rows.map((r) => r.key)).not.toContain('calc')
    expect(rows.map((r) => r.key)).not.toContain('ct')
  })
})

describe('fromPanelRows（面板行 → card 覆盖）', () => {
  it('serializes slots/hidden/order back to an override', () => {
    const rows: PanelRow[] = [
      { key: 'name', label: '名称', slot: 'title', hidden: false },
      { key: 'code', label: '编号', slot: 'subtitle', hidden: false },
      { key: 'phone', label: '手机', slot: 'kv', hidden: false },
      { key: 'type', label: '类型', slot: 'none', hidden: true },
    ]
    expect(fromPanelRows(rows)).toEqual({
      columnOrder: ['name', 'code', 'phone', 'type'],
      title: 'name',
      subtitle: 'code',
      kv: ['phone'],
      hiddenColumns: ['type'],
    })
  })

  it('round-trips an override through to→from unchanged', () => {
    const override = { title: 'name', subtitle: 'code', kv: ['addr', 'phone'], hiddenColumns: ['type'] }
    const rows = toPanelRows(COLUMNS, override)
    const back = fromPanelRows(rows)
    expect(back.title).toBe('name')
    expect(back.subtitle).toBe('code')
    expect(back.kv).toEqual(['addr', 'phone'])
    expect(back.hiddenColumns).toEqual(['type'])
  })

  it('drops duplicate title/subtitle picks defensively (first row wins)', () => {
    const rows: PanelRow[] = [
      { key: 'a', label: 'A', slot: 'title', hidden: false },
      { key: 'b', label: 'B', slot: 'title', hidden: false },
    ]
    expect(fromPanelRows(rows).title).toBe('a')
  })

  it('produces undefined slot keys when nothing picked (all-none panel)', () => {
    const rows: PanelRow[] = [{ key: 'a', label: 'A', slot: 'none', hidden: false }]
    const out = fromPanelRows(rows)
    // 序列化契约=空值省略键（覆盖层不留 [''] 脏数据）
    expect(out.title).toBeUndefined()
    expect(out.subtitle).toBeUndefined()
    expect(out.kv).toBeUndefined()
    expect(out.hiddenColumns).toBeUndefined()
    expect(out.columnOrder).toEqual(['a'])
  })
})

describe('writeChannelCardProfile（渠道键写入，副本语义）', () => {
  it('writes the card override under channel and block field, preserving other channels', () => {
    const profiles = { WEB: { t1: { card: { title: 'x' } } } }
    const next = writeChannelCardProfile(profiles, 'H5', 't1', { title: 'name' })
    expect(next).toEqual({
      WEB: { t1: { card: { title: 'x' } } },
      H5: { t1: { card: { title: 'name' } } },
    })
    expect(profiles.H5).toBeUndefined()
  })

  it('empty override clears the block profile entry (back to auto-mapping)', () => {
    const profiles = { H5: { t1: { card: { title: 'name' } }, t2: { card: {} } } }
    const next = writeChannelCardProfile(profiles, 'H5', 't1', undefined)
    expect(next).toEqual({ H5: { t2: { card: {} } } })
  })
})

describe('固化语义：to→from→to 稳定（面板确认幂等）', () => {
  it('reopening a confirmed panel shows the same rows', () => {
    const frozen = fromPanelRows(toPanelRows(COLUMNS, undefined))
    const before = toPanelRows(COLUMNS, undefined).map((r) => `${r.key}:${r.slot}:${r.hidden}`)
    const after = toPanelRows(COLUMNS, frozen).map((r) => `${r.key}:${r.slot}:${r.hidden}`)
    expect(after).toEqual(before)
    expect(frozen.columnOrder).toEqual(['code', 'name', 'phone', 'addr', 'type'])
    expect(frozen.title).toBe('code')
    expect(frozen.subtitle).toBe('name')
    expect(frozen.kv).toEqual(['phone', 'addr', 'type'])
  })
})
