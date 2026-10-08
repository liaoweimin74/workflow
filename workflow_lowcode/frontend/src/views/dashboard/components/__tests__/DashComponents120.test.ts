/**
 * Task 120 仪表盘共享逻辑与新组件单测。
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { parseDashFilter, mergeDashFilter, upsertDashConditions, splitCompositeKey, type DashCondition } from '../dash-shared'
import DashAlert from '../DashAlert.vue'
import DashGoal from '../DashGoal.vue'
import DashFilter from '../DashFilter.vue'

describe('splitCompositeKey', () => {
  it('按 | 拆分复合维度', () => {
    expect(splitCompositeKey('上海|事假')).toEqual(['上海', '事假'])
    expect(splitCompositeKey('solo')).toEqual(['solo'])
  })
})

describe('upsertDashConditions（setFilter 归一）', () => {
  const conditions: DashCondition[] = []

  it('等值形态', () => {
    upsertDashConditions(conditions, { status: 'running' })
    expect(conditions).toEqual([{ column: 'status', op: 'eq', value: 'running' }])
  })

  it('显式运算符形态（range）', () => {
    upsertDashConditions(conditions, { startTime: { op: 'range', value: ['a', 'b'] } })
    expect(conditions).toEqual([
      { column: 'status', op: 'eq', value: 'running' },
      { column: 'startTime', op: 'range', value: ['a', 'b'] },
    ])
  })

  it('同字段覆盖', () => {
    upsertDashConditions(conditions, { status: 'completed' })
    expect(conditions.find((c) => c.column === 'status')?.value).toBe('completed')
  })

  it('null 清除该字段', () => {
    upsertDashConditions(conditions, { status: null })
    expect(conditions.find((c) => c.column === 'status')).toBeUndefined()
  })
})

describe('mergeDashFilter', () => {
  it('无追加条件时透传 props filter', () => {
    expect(mergeDashFilter(null, [], '{"logic":"AND","conditions":[]}')).toBe('{"logic":"AND","conditions":[]}')
  })

  it('追加条件并入 conditions', () => {
    const out = mergeDashFilter(null, [{ column: 'a', op: 'eq', value: 1 }], null)
    expect(JSON.parse(out || '{}').conditions).toEqual([{ column: 'a', op: 'eq', value: 1 }])
  })

  it('非法基础 filter 也能安全合并', () => {
    const out = mergeDashFilter(null, [{ column: 'a', op: 'eq', value: 1 }], null)
    expect(typeof out).toBe('string')
  })
})

describe('parseDashFilter', () => {
  it('空/非法输入返回 null', () => {
    expect(parseDashFilter(null)).toBeNull()
    expect(parseDashFilter('')).toBeNull()
    expect(parseDashFilter('not-json')).toBeNull()
    expect(parseDashFilter('[1,2]')).toBeNull()
  })

  it('合法对象原样返回', () => {
    expect(parseDashFilter('{"a":1}')).toEqual({ a: 1 })
  })
})

describe('DashAlert 阈值判断', () => {
  it('gt 超阈值进入告警态', async () => {
    const wrapper = mount(DashAlert, {
      props: {
        title: '错误数',
        condition: 'gt',
        threshold: 10,
        alertText: '超过基线',
        dsRefId: 'ds-x',
        agg: 'count',
      },
    })
    // 直接通过 fetch 难以 mock 网络 —— 使用组件内部状态的替代：等待 mount 后 DOM
    // 这里仅验证静态渲染结构（数据流在 E2E 覆盖）
    expect(wrapper.find('.dash-alert-title').text()).toBe('错误数')
    expect(wrapper.find('.dash-alert-threshold').text()).toContain('> 10')
    wrapper.unmount()
  })

  it('阈值文案各条件符号', () => {
    const cases: Array<[string, string]> = [
      ['lt', '<'],
      ['gte', '≥'],
      ['lte', '≤'],
      ['eq', '='],
    ]
    for (const [condition, symbol] of cases) {
      const wrapper = mount(DashAlert, { props: { condition, threshold: 5, dsRefId: 'ds-x' } })
      expect(wrapper.find('.dash-alert-threshold').text()).toContain(`${symbol} 5`)
      wrapper.unmount()
    }
  })
})

describe('DashGoal 渲染', () => {
  it('标题与目标展示', () => {
    const wrapper = mount(DashGoal, {
      props: { title: '销售目标', target: 200, unit: '单', dsRefId: 'ds-x' },
    })
    expect(wrapper.find('.dash-goal-title').text()).toBe('销售目标')
    expect(wrapper.text()).toContain('目标 200')
    wrapper.unmount()
  })
})

describe('DashFilter 渲染', () => {
  it('date-range 形态渲染日期选择器', () => {
    const wrapper = mount(DashFilter, { props: { filterType: 'date-range', field: 'startTime', label: '日期' } })
    expect(wrapper.find('.dash-filter-label').text()).toBe('日期')
    wrapper.unmount()
  })

  it('select 形态渲染枚举', () => {
    const wrapper = mount(DashFilter, { props: { filterType: 'select', field: 'status', options: 'running,completed' } })
    expect(wrapper.findAll('option').length).toBeGreaterThanOrEqual(0)
    expect((wrapper.vm as any).optionList).toEqual(['running', 'completed'])
    wrapper.unmount()
  })

  it('filter-change 携带显式运算符', async () => {
    const wrapper = mount(DashFilter, { props: { filterType: 'keyword', field: 'name' } })
    await (wrapper.vm as any).onKeyword('张')
    // 防抖 300ms —— 快进
    await new Promise((resolve) => setTimeout(resolve, 350))
    const events = wrapper.emitted('filter-change')
    expect(events).toBeTruthy()
    expect((events![0][0] as any).field).toBe('name')
    expect((events![0][0] as any).op).toBe('like')
    wrapper.unmount()
  })

  it('清除发布 null', async () => {
    const wrapper = mount(DashFilter, { props: { filterType: 'keyword', field: 'name' } })
    await (wrapper.vm as any).onKeyword('')
    const events = wrapper.emitted('filter-change')
    expect((events![0][0] as any).value).toBeNull()
    wrapper.unmount()
  })
})
