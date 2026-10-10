// ----- Task ④: 图表视图形态 — chartDataset 纯逻辑单测（配置归一化 + 行数据 → ECharts 数据集映射） -----
// npx vitest run src/views/page/components/__tests__/chartDataset.test.ts

import { describe, it, expect } from 'vitest'
import {
  buildChartDataset,
  buildPieDataset,
  dimensionLabel,
  normalizeChartConfig,
  type ViewChartConfig,
} from '../chartDataset'

/** BizDataVO 行形态（PageRenderer 查询产物：{id, data:{...}}） */
const voRows = [
  { id: '1', data: { dept: '研发', amount: 100 } },
  { id: '2', data: { dept: '研发', amount: 50 } },
  { id: '3', data: { dept: '销售', amount: 80 } },
  { id: '4', data: { dept: '', amount: null } },
]

/** 列显示名映射（对齐 PageDataChart 的 labelOf） */
const labelOf = (key: string) => (key === 'amount' ? '金额' : key)

describe('chartDataset.normalizeChartConfig — 缺省与容错', () => {
  it('未配置（undefined/null/非对象）→ 合理缺省：bar / 空维度 / 空指标 / limit 20', () => {
    expect(normalizeChartConfig(undefined)).toEqual({ type: 'bar', xField: '', yFields: [], limit: 20 })
    expect(normalizeChartConfig(null)).toEqual({ type: 'bar', xField: '', yFields: [], limit: 20 })
    expect(normalizeChartConfig('chart')).toEqual({ type: 'bar', xField: '', yFields: [], limit: 20 })
  })

  it('非法枚举/畸形字段回退缺省：type 非闭集 → bar；agg 非闭集 → sum；limit 非正数 → 20', () => {
    expect(normalizeChartConfig({ type: 'area', xField: 42, yFields: 'x', limit: -1 })).toEqual({
      type: 'bar',
      xField: '',
      yFields: [],
      limit: 20,
    })
  })

  it('yFields 剔除空 key 项、每项补 agg 缺省 sum；合法配置原样保留', () => {
    const cfg = normalizeChartConfig({
      type: 'pie',
      xField: 'dept',
      yFields: [{ key: 'amount' }, { key: '', agg: 'max' }, null, { key: 'qty', agg: 'avg' }],
      limit: 50,
    })
    expect(cfg).toEqual({
      type: 'pie',
      xField: 'dept',
      yFields: [
        { key: 'amount', agg: 'sum' },
        { key: 'qty', agg: 'avg' },
      ],
      limit: 50,
    })
  })
})

describe('chartDataset.buildChartDataset — rows → {dimensions, series}', () => {
  const cfg: ViewChartConfig = { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg: 'sum' }], limit: 20 }

  it('按维度分组聚合：同名维度值合并，维度保持首现顺序，空值维度归入（空）', () => {
    expect(buildChartDataset(voRows, cfg, labelOf)).toEqual({
      dimensions: ['研发', '销售', '（空）'],
      series: [{ key: 'amount', name: '金额', data: [150, 80, 0] }],
    })
  })

  it('多指标列：每个 yField 一个系列，聚合口径各自独立（sum/avg）', () => {
    const multi: ViewChartConfig = {
      type: 'line',
      xField: 'dept',
      yFields: [
        { key: 'amount', agg: 'sum' },
        { key: 'amount', agg: 'avg' },
      ],
      limit: 20,
    }
    expect(buildChartDataset(voRows, multi, labelOf)).toEqual({
      dimensions: ['研发', '销售', '（空）'],
      series: [
        { key: 'amount', name: '金额', data: [150, 80, 0] },
        { key: 'amount', name: '金额', data: [75, 80, null] },
      ],
    })
  })

  it('聚合口径对齐汇总行：avg 两位小数、max/min 极值、count 非空计数、非数值剔除', () => {
    const rows = [
      { id: '1', data: { dept: 'A', amount: '10' } },
      { id: '2', data: { dept: 'A', amount: 'abc' } },
      { id: '3', data: { dept: 'A', amount: 5 } },
    ]
    const aggOf = (agg: ViewChartConfig['yFields'][number]['agg']) =>
      buildChartDataset(rows, { type: 'bar', xField: 'dept', yFields: [{ key: 'amount', agg }], limit: 20 })!
    expect(aggOf('sum').series[0].data).toEqual([15])
    expect(aggOf('avg').series[0].data).toEqual([7.5])
    expect(aggOf('count').series[0].data).toEqual([3])
    expect(aggOf('max').series[0].data).toEqual([10])
    expect(aggOf('min').series[0].data).toEqual([5])
  })

  it('limit 取前 N 条：按数据顺序截取前 N 个维度组', () => {
    const rows = [
      { id: '1', data: { dept: 'A', amount: 1 } },
      { id: '2', data: { dept: 'B', amount: 2 } },
      { id: '3', data: { dept: 'C', amount: 3 } },
      { id: '4', data: { dept: 'D', amount: 4 } },
    ]
    const ds = buildChartDataset(rows, { ...cfg, limit: 2 }, labelOf)!
    expect(ds.dimensions).toEqual(['A', 'B'])
    expect(ds.series[0].data).toEqual([1, 2])
  })

  it('扁平行形态（{...字段, id}）与 BizDataVO 形态同结果（rowValueOf 双兼容）', () => {
    const flat = [
      { dept: '研发', amount: 100 },
      { dept: '研发', amount: 50 },
      { dept: '销售', amount: 80 },
    ]
    expect(buildChartDataset(flat, cfg, labelOf)).toEqual({
      dimensions: ['研发', '销售'],
      series: [{ key: 'amount', name: '金额', data: [150, 80] }],
    })
  })

  it('labelOf 未提供时系列名回退列 key', () => {
    const ds = buildChartDataset(voRows, cfg)!
    expect(ds.series[0].name).toBe('amount')
  })

  it('未配置维度 / 未配置指标 → null（组件给「未配置」空态）；空数据 → 空数据集', () => {
    expect(buildChartDataset(voRows, { ...cfg, xField: '' }, labelOf)).toBeNull()
    expect(buildChartDataset(voRows, { ...cfg, yFields: [] }, labelOf)).toBeNull()
    expect(buildChartDataset([], cfg, labelOf)).toEqual({
      dimensions: [],
      series: [{ key: 'amount', name: '金额', data: [] }],
    })
  })
})

describe('chartDataset.buildPieDataset — pie 退化（只取第一个 yField）', () => {
  it('只取第一个指标列聚合，后续 yField 忽略；维度顺序与 limit 与 bar/line 一致', () => {
    const cfg: ViewChartConfig = {
      type: 'pie',
      xField: 'dept',
      yFields: [
        { key: 'amount', agg: 'sum' },
        { key: 'qty', agg: 'avg' },
      ],
      limit: 20,
    }
    const rows = [
      { id: '1', data: { dept: '研发', amount: 100, qty: 0 } },
      { id: '2', data: { dept: '研发', amount: 50, qty: 0 } },
      { id: '3', data: { dept: '销售', amount: 80, qty: 0 } },
    ]
    expect(buildPieDataset(rows, cfg)).toEqual([
      { name: '研发', value: 150 },
      { name: '销售', value: 80 },
    ])
  })

  it('聚合为 null 的维度组剔除（组内该列全空）；limit 生效', () => {
    const rows = [
      { id: '1', data: { dept: 'A', amount: 1 } },
      { id: '2', data: { dept: 'B', amount: null } },
      { id: '3', data: { dept: 'C', amount: 3 } },
    ]
    const cfg: ViewChartConfig = { type: 'pie', xField: 'dept', yFields: [{ key: 'amount', agg: 'avg' }], limit: 20 }
    expect(buildPieDataset(rows, cfg)).toEqual([
      { name: 'A', value: 1 },
      { name: 'C', value: 3 },
    ])
    expect(buildPieDataset(rows, { ...cfg, limit: 1 })).toEqual([{ name: 'A', value: 1 }])
  })

  it('未配置维度 / 未配置指标 → null', () => {
    expect(buildPieDataset(voRows, { type: 'pie', xField: '', yFields: [{ key: 'amount', agg: 'sum' }], limit: 20 })).toBeNull()
    expect(buildPieDataset(voRows, { type: 'pie', xField: 'dept', yFields: [], limit: 20 })).toBeNull()
  })
})

describe('chartDataset.dimensionLabel — 维度显示值', () => {
  it('空值归（空）；对象/数组 JSON 文本；其余 String 化', () => {
    expect(dimensionLabel(null)).toBe('（空）')
    expect(dimensionLabel(undefined)).toBe('（空）')
    expect(dimensionLabel('')).toBe('（空）')
    expect(dimensionLabel({ a: 1 })).toBe('{"a":1}')
    expect(dimensionLabel([1, 2])).toBe('[1,2]')
    expect(dimensionLabel(0)).toBe('0')
    expect(dimensionLabel('研发')).toBe('研发')
  })
})
