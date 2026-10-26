import { flushPromises, mount } from '@vue/test-utils'
import Vant from 'vant'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { dataSourceApi } from '@/api/data-source'
import MobileDataContainer from '../blocks/MobileDataContainer.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: { queryData: vi.fn() },
}))

const queryData = vi.mocked(dataSourceApi.queryData)
const GLOBALS = { plugins: [Vant] }

/**
 * 移动端数据容器（page-data-container → 模板 container）：与桌面 PageDataContainer 同协议
 * （绑一个数据源自取数，{rows}/{row} 作用域供给子规则展示文案），差异=内嵌渲染走
 * @form-create/vant 实例 + 子规则过移动改写（pending/unsupported 块与 EP-only 字段占位）。
 */
function mockRows(rows: Array<Record<string, unknown>>, total = rows.length) {
  queryData.mockResolvedValue({
    data: { records: rows.map((data, i) => ({ id: `r${i}`, data, version: 1 })), total, page: 1, size: 20 },
  } as never)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('MobileDataContainer（Vant 数据容器）', () => {
  it('fetches rows by dsRefId and applies scope interpolation to child rule texts', async () => {
    mockRows([{ name: '张三', amount: 100 }])
    const wrapper = mount(MobileDataContainer, {
      props: {
        dsRefId: 'ref-1',
        title: '订单区',
        childRules: [{ type: 'input', field: 'x', title: '{rows[0].name}的金额' }],
      },
      global: GLOBALS,
    })
    await flushPromises()
    expect(queryData).toHaveBeenCalledWith('ref-1', expect.objectContaining({ page: 1 }))
    // 子规则经内嵌 vant 实例渲染：作用域插值后的 title + van-field
    expect(wrapper.text()).toContain('张三的金额')
    expect(wrapper.find('.van-field').exists()).toBe(true)
  })

  it('rewrites EP-only child fields to placeholders inside the embedded instance', async () => {
    mockRows([{ name: '张三' }])
    const wrapper = mount(MobileDataContainer, {
      props: {
        dsRefId: 'ref-1',
        childRules: [{ type: 'LookupPicker', field: 'u', title: '负责人' }],
      },
      global: GLOBALS,
    })
    await flushPromises()
    expect(wrapper.text()).toContain('LookupPicker')
  })

  it('shows 未绑定数据源 when no source resolvable', async () => {
    const wrapper = mount(MobileDataContainer, { props: { childRules: [] }, global: GLOBALS })
    await flushPromises()
    expect(wrapper.text()).toContain('未绑定数据源')
    expect(queryData).not.toHaveBeenCalled()
  })

  it('shows 容器里还没有组件 when bound but empty childRules', async () => {
    mockRows([{ a: 1 }])
    const wrapper = mount(MobileDataContainer, { props: { dsRefId: 'ref-1', childRules: [] }, global: GLOBALS })
    await flushPromises()
    expect(wrapper.text()).toContain('容器里还没有组件')
  })

  it('exposes refresh and setFilter via ready emit (action-bus protocol, aligned with desktop)', async () => {
    mockRows([{ name: '张三' }])
    const wrapper = mount(MobileDataContainer, { props: { dsRefId: 'ref-1', childRules: [] }, global: GLOBALS })
    await flushPromises()
    const ready = wrapper.emitted('ready')
    expect(ready).toHaveLength(1)
    const instance = ready![0][0] as { refresh: () => void; setFilter: (c: Record<string, unknown>) => void }
    expect(instance.refresh).toBeTypeOf('function')

    queryData.mockClear()
    // setFilter 入参形状（桌面同款）：key=列名，value=标量 或 {op,value} 结构
    instance.setFilter({ name: { op: 'like', value: '张' } })
    await flushPromises()
    expect(queryData).toHaveBeenCalledTimes(1)
    expect(JSON.parse(queryData.mock.calls[0][1]!.filter!)).toMatchObject({
      conditions: [{ column: 'name', op: 'like', value: '张' }],
    })
  })

  it('single queryMode fetches exactly one row', async () => {
    mockRows([{ name: '张三' }], 5)
    mount(MobileDataContainer, {
      props: { dsRefId: 'ref-1', queryMode: 'single', childRules: [{ type: 'input', field: 'x' }] },
      global: GLOBALS,
    })
    await flushPromises()
    expect(queryData).toHaveBeenCalledWith('ref-1', expect.objectContaining({ size: 1 }))
  })
})
