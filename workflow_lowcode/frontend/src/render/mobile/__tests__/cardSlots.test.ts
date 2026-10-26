import { describe, expect, it } from 'vitest'

import { deriveCardSlots } from '../cardSlots'

/**
 * 缺省卡片槽位映射（designs §5.1 布局层：VIEW 列→卡片槽位，端覆盖层未配置时的自动算法）。
 *
 * 口径：
 * - 参与集=WEB 可见的原生数据列（hidden 取消勾选的列不进槽位；expression/template/custom
 *   列的 key 不是数据列，卡片取不到行值，v1 不进槽位）；
 * - 槽位分配：第 1 列=标题、第 2 列=副标题、第 3~5 列=键值区；超出收进 more 由端覆盖层裁决；
 * - 纯函数无状态，覆盖层（channelProfiles）接入后以其结果覆写本缺省。
 */
describe('deriveCardSlots（列→卡片槽位缺省映射）', () => {
  it('maps first column to title and second to subtitle', () => {
    const slots = deriveCardSlots([
      { key: 'customer_code', label: '客户编号' },
      { key: 'name', label: '客户名称' },
    ])
    expect(slots.title?.key).toBe('customer_code')
    expect(slots.subtitle?.key).toBe('name')
    expect(slots.kv).toEqual([])
  })

  it('fills kv area with the third to fifth columns', () => {
    const slots = deriveCardSlots([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'B' },
      { key: 'c', label: 'C' },
      { key: 'd', label: 'D' },
      { key: 'e', label: 'E' },
      { key: 'f', label: 'F' },
    ])
    expect(slots.kv.map((col) => col.key)).toEqual(['c', 'd', 'e'])
    expect(slots.more.map((col) => col.key)).toEqual(['f'])
  })

  it('skips hidden columns for slot participation', () => {
    const slots = deriveCardSlots([
      { key: 'a', label: 'A' },
      { key: 'h', label: 'H', hidden: true },
      { key: 'b', label: 'B' },
    ])
    expect(slots.title?.key).toBe('a')
    expect(slots.subtitle?.key).toBe('b')
  })

  it('skips expression/template content columns and custom columns (no row value on mobile v1)', () => {
    const slots = deriveCardSlots([
      { key: 'name', label: '名称' },
      { key: 'badge', label: '徽标', contentType: 'expression', contentValue: '1+1' },
      { key: 'tpl', label: '模板', contentType: 'template', contentValue: '${name}' },
      { key: 'calc', label: '自定义列', custom: true },
      { key: 'phone', label: '手机号' },
    ])
    expect(slots.title?.key).toBe('name')
    expect(slots.subtitle?.key).toBe('phone')
  })

  it('omits subtitle when a single data column is available', () => {
    const slots = deriveCardSlots([{ key: 'only', label: '唯一列' }])
    expect(slots.title?.key).toBe('only')
    expect(slots.subtitle).toBeNull()
    expect(slots.kv).toEqual([])
  })

  it('yields an empty plan when nothing is usable', () => {
    const slots = deriveCardSlots([{ key: 'x', label: 'X', hidden: true }])
    expect(slots.title).toBeNull()
    expect(slots.subtitle).toBeNull()
    expect(slots.kv).toEqual([])
    expect(slots.more).toEqual([])
  })
})
