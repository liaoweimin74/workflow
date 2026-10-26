import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'

import MobileDetail from '../blocks/MobileDetail.vue'

/**
 * 移动详情块（page-detail 的移动实现）：桌面 el-descriptions 弹窗/面板 → Vant cell 键值列表。
 * 协议对齐 PageDataDetail：纯展示不自行取数，记录经 expose load/clear 注入；
 * columns 缺省回退记录键（剔除 <key>_text 内部显示列）；formatter 支持 $row.x 模板串。
 * load/clear 后 DOM 更新是异步的——断言前必须 nextTick。
 */
describe('MobileDetail（Vant KV 详情块）', () => {
  it('shows the empty hint until a record is injected via load()', () => {
    const wrapper = mount(MobileDetail)
    expect(wrapper.text()).toContain('暂无详情')
    expect(wrapper.findAll('.m-detail__row')).toHaveLength(0)
  })

  it('renders declared columns as label/value cells', async () => {
    const wrapper = mount(MobileDetail, {
      props: { columns: [{ key: 'name', label: '名称' }, { key: 'phone', label: '手机号' }] },
    })
    wrapper.vm.load({ name: '张三', phone: '139****0002' })
    await wrapper.vm.$nextTick()
    const rows = wrapper.findAll('.m-detail__row')
    expect(rows).toHaveLength(2)
    expect(rows[0].text()).toContain('名称')
    expect(rows[0].text()).toContain('张三')
    expect(rows[1].text()).toContain('139****0002')
  })

  it('falls back to record keys and strips internal _text columns when no columns declared', async () => {
    const wrapper = mount(MobileDetail)
    wrapper.vm.load({ code: 'C001', user: 'u1', user_text: '张三' })
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('C001')
    expect(text).toContain('u1')
    expect(text).not.toContain('张三')
  })

  it('applies $row.x template formatters and joins array values', async () => {
    const wrapper = mount(MobileDetail, {
      props: {
        columns: [
          { key: 'name', label: '名称', formatter: '$row.name（$row.code）' },
          { key: 'tags', label: '标签' },
        ],
      },
    })
    wrapper.vm.load({ name: '张三', code: 'C001', tags: ['a', 'b'] })
    await wrapper.vm.$nextTick()
    const text = wrapper.text()
    expect(text).toContain('张三（C001）')
    expect(text).toContain('a, b')
  })

  it('clear() returns to the empty state', async () => {
    const wrapper = mount(MobileDetail)
    wrapper.vm.load({ code: 'C001' })
    await wrapper.vm.$nextTick()
    expect(wrapper.findAll('.m-detail__row')).toHaveLength(1)
    wrapper.vm.clear()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('暂无详情')
  })

  it('emits ready with the instance (renderer 联动归档协议，对齐桌面)', async () => {
    const wrapper = mount(MobileDetail)
    const ready = wrapper.emitted('ready')
    expect(ready).toHaveLength(1)
    expect((ready![0][0] as { load: unknown }).load).toBeTypeOf('function')
  })
})
