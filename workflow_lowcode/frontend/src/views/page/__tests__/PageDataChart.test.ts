// ----- Task ④: 图表视图形态（chartDataset 纯函数 + PageDataChart 渲染占位） -----
// npx vitest run src/views/page/__tests__/PageDataChart.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import PageDataChart from '../components/PageDataChart.vue'
import {
  normalizeChartConfig,
  buildChartDataset,
  buildPieDataset,
  dimensionLabel,
} from '../components/chartDataset'

/** BizDataVO 行形态（PageRenderer 查询产物：{id, data:{...}, version}） */
const voRows = [
  { id: '1', data: { dept: '研发', amount: 100 }, version: 1 },
  { id: '2', data: { dept: '研发', amount: 50 }, version: 1 },
  { id: '3', data: { dept: '销售', amount: 80 }, version: 1 },
  { id: '4', data: { dept: '', amount: null }, version: 1 },
]

const labelOf = (key: string) => (key === 'amount' ? '金额' : key)

describe('chartDataset.normalizeChartConfig — 畸形容错与缺省回填', () => {
  it('undefined/非对象 → 全缺省（bar/空维度/空指标/limit 20）', () => {
    expect(normalizeChartConfig(undefined)).toEqual({ type: 'bar', xField: '', yFields: [], limit: 20 })
    expect(normalizeChartConfig('x')).toEqual({ type: 'bar', xField: '', yFields: [], limit: 20 })
  })

  it('非法枚举/类型漂移回退缺省：type→bar、limit 非正数→20、yFields 非数组→[]', () => {
    expect(normalizeChartConfig({ type: 'area', xField: 1, yFields: 'nope', limit: -3 }).type).toBe('bar')
    const cfg = normalizeChartConfig({ type: 'pie', xField: 'dept', yFields: 'nope', limit: -3 })
    expect(cfg).toEqual({ type: 'pie', xField: 'dept', yFields: [], limit: 20 })
  })

  it('yFields 剔除空 key 项、非法 agg 补缺省 sum', () => {
    expect(
      normalizeChartConfig({
        type: 'bar',
        xField: 'dept',
        yFields: [{ key: 'amount', agg: 'avg' }, { key: '', agg: 'sum' }, { agg: 'max' }, { key: 'qty', agg: 'nope' }],
      }).yFields,
    ).toEqual([
      { key: 'amount', agg: 'avg' },
      { key: 'qty', agg: 'sum' },
    ])
  })
})

describe('chartDataset.buildChartDataset — 分组聚合（bar/line）', () => {
  it('按维度首现顺序分组 + 单指标聚合（sum 口径对齐汇总行 computeAggregate）', () => {
    const ds = buildChartDataset(
      voRows,
      { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }], limit: 20 },
      labelOf,
    )
    expect(ds).toEqual({
      dimensions: ['研发', '销售', '（空）'],
      series: [{ key: 'amount', name: '金额', data: [150, 80, 0] }],
    })
  })

  it('多指标系列（sum/avg/count 并存），数据与 dimensions 下标对齐', () => {
    const ds = buildChartDataset(voRows, {
      type: 'line',
      xField: 'dept',
      yFields: [
        { key: 'amount', agg: 'sum' },
        { key: 'amount', agg: 'avg' },
        { key: 'amount', agg: 'count' },
      ],
    })
    expect(ds!.dimensions).toEqual(['研发', '销售', '（空）'])
    expect(ds!.series.map((s) => s.data)).toEqual([
      [150, 80, 0],
      [75, 80, null],
      [2, 1, 0],
    ])
  })

  it('limit 截取前 N 个维度组；labelOf 未命中回退 key', () => {
    const ds = buildChartDataset(
      voRows,
      { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }], limit: 2 },
    )
    expect(ds!.dimensions).toEqual(['研发', '销售'])
    expect(ds!.series[0].name).toBe('amount')
  })

  it('未配置维度或指标 → null（组件给未配置空态）；空行数据 → 空数据集', () => {
    expect(buildChartDataset(voRows, { type: 'bar', xField: '', yFields: [{ key: 'amount', agg: 'sum' }] })).toBeNull()
    expect(buildChartDataset(voRows, { type: 'bar', xField: 'dept', yFields: [] })).toBeNull()
    expect(buildChartDataset([], { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }] })).toEqual({
      dimensions: [],
      series: [{ key: 'amount', name: 'amount', data: [] }],
    })
  })

  it('扁平行形态（{...字段, id}）与 BizDataVO 形态同结果（rowValueOf 双兼容）', () => {
    const flat = [
      { dept: '研发', amount: 100, id: '1' },
      { dept: '研发', amount: 50, id: '2' },
      { dept: '销售', amount: 80, id: '3' },
    ]
    expect(buildChartDataset(flat, { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }] })).toEqual({
      dimensions: ['研发', '销售'],
      series: [{ key: 'amount', name: 'amount', data: [150, 80] }],
    })
  })
})

describe('chartDataset.buildPieDataset — pie 退化', () => {
  it('只取第一个指标列；聚合为 null 的维度组剔除（avg 空组）', () => {
    expect(buildPieDataset(voRows, { type: 'pie', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }] })).toEqual([
      { name: '研发', value: 150 },
      { name: '销售', value: 80 },
      { name: '（空）', value: 0 },
    ])
    expect(buildPieDataset(voRows, { type: 'pie', xField: 'dept', yFields: [{ key: 'amount', agg: 'avg' }] })).toEqual([
      { name: '研发', value: 75 },
      { name: '销售', value: 80 },
    ])
  })

  it('未配置指标 → null', () => {
    expect(buildPieDataset(voRows, { type: 'pie', xField: 'dept', yFields: [] })).toBeNull()
  })
})

describe('chartDataset.dimensionLabel — 维度显示值', () => {
  it('空值 →（空）；对象 → JSON 文本；其余 String()', () => {
    expect(dimensionLabel(null)).toBe('（空）')
    expect(dimensionLabel('')).toBe('（空）')
    expect(dimensionLabel(undefined)).toBe('（空）')
    expect(dimensionLabel({ a: 1 })).toBe('{"a":1}')
    expect(dimensionLabel(0)).toBe('0')
    expect(dimensionLabel('IT')).toBe('IT')
  })
})

describe('PageDataChart — 渲染组件（rows 由 PageRenderer 下发）', () => {
  function mountChart(props: Record<string, unknown>) {
    return mount(PageDataChart, { props, global: { plugins: [ElementPlus] } })
  }

  it('未配置维度/指标：占位提示，不渲染画布', () => {
    const wrapper = mountChart({ rows: voRows, config: null })
    expect(wrapper.text()).toContain('请在视图设计器中配置图表的维度列与指标列')
    expect(wrapper.find('.page-data-chart-canvas').isVisible()).toBe(false)
    wrapper.unmount()
  })

  it('有数据：画布可见（jsdom 无 canvas 只跳过绘制，不抛错）', () => {
    const wrapper = mountChart({
      rows: voRows,
      config: { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }] },
      columns: [{ key: 'amount', label: '金额' }],
    })
    expect(wrapper.find('.page-data-chart-canvas').isVisible()).toBe(true)
    wrapper.unmount()
  })

  it('空数据：占位「暂无数据」；取数中：占位「数据加载中…」', () => {
    const empty = mountChart({
      rows: [],
      config: { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }] },
    })
    expect(empty.text()).toContain('暂无数据')
    empty.unmount()

    const loading = mountChart({
      rows: [],
      config: { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }] },
      loading: true,
    })
    expect(loading.text()).toContain('数据加载中…')
    loading.unmount()
  })

  it('rows/config 变化（父级重取/搜索）→ 重算数据集（空态 ↔ 数据态切换）', async () => {
    const wrapper = mountChart({
      rows: [],
      config: { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }] },
    })
    expect(wrapper.text()).toContain('暂无数据')
    await wrapper.setProps({ rows: voRows })
    expect(wrapper.find('.page-data-chart-canvas').isVisible()).toBe(true)
    await wrapper.setProps({ rows: [] })
    expect(wrapper.text()).toContain('暂无数据')
    wrapper.unmount()
  })
})
