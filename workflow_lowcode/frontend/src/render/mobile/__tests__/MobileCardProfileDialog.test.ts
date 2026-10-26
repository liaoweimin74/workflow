import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import { describe, expect, it } from 'vitest'

import MobileCardProfileDialog from '../MobileCardProfileDialog.vue'
import type { CardSlotColumn } from '../../cardSlots'

/**
 * 设计器「移动卡片配置」对话框（§5.1 三件事的可编辑面）：
 * 打开=toPanelRows(columns, 当前覆盖) 初值；编辑行=槽位/显隐/排序；
 * 应用=fromPanelRows 序列化覆盖回传（设计器写回 channelProfiles）；
 * 恢复自动映射=confirm(null) 清除该块配置。
 */
const COLUMNS: CardSlotColumn[] = [
  { key: 'code', label: '编号' },
  { key: 'name', label: '名称' },
  { key: 'phone', label: '手机' },
]

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(MobileCardProfileDialog, {
    props: { modelValue: true, columns: COLUMNS, ...props },
    global: { plugins: [ElementPlus] },
  })
}

describe('MobileCardProfileDialog（移动卡片槽位面板）', () => {
  it('opens with default-derived rows when no override exists', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    const rows = wrapper.findAll('.m-panel__row')
    expect(rows).toHaveLength(3)
    // 缺省自动映射：第1列=标题、第2列=副标题、第3列=键值区
    expect(rows[0].attributes('data-key')).toBe('code')
    expect(rows[0].attributes('data-slot')).toBe('title')
    expect(rows[1].attributes('data-slot')).toBe('subtitle')
    expect(rows[2].attributes('data-slot')).toBe('kv')
  })

  it('initializes rows from the existing override (subtitle untouched falls back)', async () => {
    const wrapper = mountDialog({ override: { title: 'name', subtitle: 'code', kv: ['phone'] } })
    await flushPromises()
    const rows = wrapper.findAll('.m-panel__row')
    expect(rows.map((r) => `${r.attributes('data-key')}:${r.attributes('data-slot')}`)).toEqual([
      'name:title',
      'code:subtitle',
      'phone:kv',
    ])
  })

  it('applies the panel back as a card override and closes', async () => {
    const wrapper = mountDialog({ override: { title: 'name', subtitle: 'code', kv: ['phone'] } })
    await flushPromises()
    wrapper.find('.m-panel__btn-apply').trigger('click')
    await flushPromises()
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toEqual({
      columnOrder: ['name', 'code', 'phone'],
      title: 'name',
      subtitle: 'code',
      kv: ['phone'],
    })
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toBe(false)
  })

  it('"restore auto" confirms null to clear the block profile', async () => {
    const wrapper = mountDialog({ override: { title: 'name' } })
    await flushPromises()
    wrapper.find('.m-panel__btn-auto').trigger('click')
    expect(wrapper.emitted('confirm')?.[0]?.[0]).toBeNull()
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toBe(false)
  })

  it('guides to configure columns first when none declared', async () => {
    const wrapper = mountDialog({ columns: [] })
    await flushPromises()
    expect(wrapper.text()).toContain('请先在数据块配置显示列')
    wrapper.find('.m-panel__btn-apply').trigger('click')
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })

  it('toggling a row hidden removes it from slots on apply', async () => {
    const wrapper = mountDialog()
    await flushPromises()
    // 隐藏首行（缺省标题槽列）：应用后不应再有 title，kv 顺位上移由渲染管线兜缺省
    await wrapper.findAll('.m-panel__row')[0].find('.m-panel__hide input').setValue(true)
    await flushPromises()
    wrapper.find('.m-panel__btn-apply').trigger('click')
    const out = wrapper.emitted('confirm')?.[0]?.[0] as Record<string, unknown>
    expect(out.hiddenColumns).toEqual(['code'])
    expect(out.title).toBeUndefined()
  })
})
