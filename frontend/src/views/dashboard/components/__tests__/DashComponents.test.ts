/**
 * DashKpi / DashChart 组件测试（Task 119）。
 *
 * 覆盖：数据契约（aggregate 参数与结果映射）、setFilter/refresh 约定、
 * 设计态不取数、未绑定数据源空态。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import DashKpi from '../DashKpi.vue'
import DashChart from '../DashChart.vue'
import { dataSourceApi } from '@/api/data-source'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    aggregate: vi.fn(),
    getMetadata: vi.fn(),
  },
}))

const mockedAggregate = dataSourceApi.aggregate as unknown as ReturnType<typeof vi.fn>

beforeEach(() => {
  mockedAggregate.mockReset()
  mockedAggregate.mockResolvedValue({
    code: 200,
    msg: 'success',
    data: { rows: [{ key: '__all__', value: 42 }], total: 1 },
  })
})

describe('DashKpi', () => {
  it('以 group=__all__ 调聚合并把单行结果映射为数值', async () => {
    const wrapper = mount(DashKpi, {
      props: { title: '流程定义数', dsRefId: 'ds-1', agg: 'count' },
    })
    await flushPromises()
    expect(mockedAggregate).toHaveBeenCalledWith('ds-1', {
      group: '__all__',
      agg: 'count',
      metric: null,
      filter: null,
    })
    expect(wrapper.find('.dash-kpi-value').text()).toBe('42')
  })

  it('非 count 聚合携带 metric 字段', async () => {
    mount(DashKpi, { props: { dsRefId: 'ds-1', agg: 'sum', metric: 'leave_days' } })
    await flushPromises()
    expect(mockedAggregate).toHaveBeenCalledWith('ds-1', expect.objectContaining({ agg: 'sum', metric: 'leave_days' }))
  })

  it('设计态不取数', async () => {
    mount(DashKpi, { props: { dsRefId: 'ds-1', designMode: true } })
    await flushPromises()
    expect(mockedAggregate).not.toHaveBeenCalled()
  })

  it('ready 事件上报 setFilter/refresh 实例', async () => {
    const wrapper = mount(DashKpi, { props: { dsRefId: 'ds-1' } })
    await flushPromises()
    const payload = wrapper.emitted('ready')?.[0]?.[0] as Record<string, unknown>
    expect(typeof payload.setFilter).toBe('function')
    expect(typeof payload.refresh).toBe('function')
  })

  it('setFilter 追加条件并重查', async () => {
    const wrapper = mount(DashKpi, { props: { dsRefId: 'ds-1' } })
    await flushPromises()
    mockedAggregate.mockClear()
    ;(wrapper.emitted('ready')?.[0]?.[0] as any).setFilter({ status: 'running' })
    await flushPromises()
    expect(mockedAggregate).toHaveBeenCalledWith(
      'ds-1',
      expect.objectContaining({
        filter: JSON.stringify({ logic: 'AND', conditions: [{ column: 'status', op: 'eq', value: 'running' }] }),
      }),
    )
  })

  it('聚合失败时显示 -- 不抛错', async () => {
    mockedAggregate.mockRejectedValue(new Error('boom'))
    const wrapper = mount(DashKpi, { props: { dsRefId: 'ds-1' } })
    await flushPromises()
    expect(wrapper.find('.dash-kpi-value').text()).toBe('--')
  })
})

describe('DashChart', () => {
  it('按维度分组取数并把行集交给渲染', async () => {
    mockedAggregate.mockResolvedValue({
      code: 200,
      msg: 'success',
      data: {
        rows: [
          { key: '2026-09', value: 3 },
          { key: '2026-10', value: 5 },
        ],
        total: 2,
      },
    })
    const wrapper = mount(DashChart, {
      props: { dsRefId: 'ds-2', group: 'startTime', timeGrain: 'month', agg: 'count', chartType: 'bar' },
    })
    await flushPromises()
    expect(mockedAggregate).toHaveBeenCalledWith(
      'ds-2',
      expect.objectContaining({ group: 'startTime', timeGrain: 'month', agg: 'count', sort: 'key', order: 'asc', limit: 0 }),
    )
    // 画布容器出现（echarts init 在 jsdom 下可运行但不出图，容器存在即可）
    expect(wrapper.find('.dash-chart-canvas').exists()).toBe(true)
  })

  it('未绑定数据源显示空态且不取数', async () => {
    const wrapper = mount(DashChart, { props: { group: 'status' } })
    await flushPromises()
    expect(mockedAggregate).not.toHaveBeenCalled()
    expect(wrapper.find('.dash-chart-empty').exists()).toBe(true)
  })

  it('饼图类型同样走聚合契约', async () => {
    mount(DashChart, { props: { dsRefId: 'ds-2', group: 'status', chartType: 'pie' } })
    await flushPromises()
    expect(mockedAggregate).toHaveBeenCalledWith('ds-2', expect.objectContaining({ group: 'status' }))
  })
})
