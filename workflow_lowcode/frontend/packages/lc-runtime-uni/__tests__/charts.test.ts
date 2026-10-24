// ----- Task 7.3: @lc/runtime-uni/charts —— 图表语义层（web buildChartDataset 同源） -----
// 聚合语义对位 src/views/page/components/chartDataset.ts + tableEnhance.computeAggregate：
//  · 同名维度值分组合并（保持首现顺序，不按聚合值重排——服务端 sort 语义）、limit 截前 N 组；
//  · count=非空值计数（SQL COUNT(col) 语义）；sum/avg/max/min 剔除空值与不可转数的值；
//    avg 保留 2 位小数；组内全空 → null（bar/line 该点断线，pie 剔除该扇区）；
//  · rowValueOf 双形态兼容：扁平行 {...} 与 BizDataVO {id, data:{...}}；
// option 构造对位 PageDataChart.buildOption / DashChart.render（bar/line/pie 首版）：
// 静态对象字面量（no-eval——产物运行期零解释），空数据返回 null（模板 v-if 空态）。

import { describe, expect, it } from 'vitest'

import {
  buildUniAggregateOption,
  buildUniChartDataset,
  buildUniDatasetOption,
  buildUniPieDataset,
  computeAggregateUni,
  uniRowValueOf,
} from '../src/charts'

describe('@lc/runtime-uni/charts 聚合纯函数（chartDataset 同源）', () => {
  it('uniRowValueOf：扁平行直取；BizDataVO {data:{...}} 展开', () => {
    expect(uniRowValueOf({ amount: 10 }, 'amount')).toBe(10)
    expect(uniRowValueOf({ id: '1', data: { amount: 7 } }, 'amount')).toBe(7)
    expect(uniRowValueOf(null, 'amount')).toBeUndefined()
  })

  it('computeAggregateUni：count 非空计数；sum/avg/max/min 剔空；全空 → null', () => {
    const rows = [{ v: 1 }, { v: '2' }, { v: '' }, { v: null }, { v: 'x' }]
    expect(computeAggregateUni(rows, 'v', 'count')).toBe(3)
    expect(computeAggregateUni(rows, 'v', 'sum')).toBe(3)
    expect(computeAggregateUni([{ v: 1 }, { v: 2 }, { v: 4 }], 'v', 'avg')).toBe(2.33)
    expect(computeAggregateUni(rows, 'v', 'max')).toBe(2)
    expect(computeAggregateUni(rows, 'v', 'min')).toBe(1)
    expect(computeAggregateUni([{ v: '' }], 'v', 'sum')).toBeNull()
  })

  it('buildUniChartDataset：同名维度分组聚合、首现顺序、limit 截断、空聚合 null', () => {
    const rows = [
      { cat: '研发', amount: 100 },
      { cat: '市场', amount: 50 },
      { cat: '研发', amount: 20 },
      { cat: '交付', amount: '' },
    ]
    const ds = buildUniChartDataset(
      rows,
      { type: 'bar', xField: 'cat', yFields: [{ key: 'amount', agg: 'sum' }], limit: 20 },
    )
    expect(ds).toEqual({
      dimensions: ['研发', '市场', '交付'],
      series: [{ key: 'amount', name: 'amount', data: [120, 50, null] }],
    })
    // limit 截前 2 组
    const ds2 = buildUniChartDataset(rows, { type: 'bar', xField: 'cat', yFields: [{ key: 'amount', agg: 'sum' }], limit: 2 })
    expect(ds2!.dimensions).toEqual(['研发', '市场'])
  })

  it('buildUniChartDataset：未配置 xField/yFields → null；labelOf 映射系列名', () => {
    const rows = [{ cat: 'a', amount: 1 }]
    expect(buildUniChartDataset(rows, { type: 'bar', xField: '', yFields: [], limit: 20 })).toBeNull()
    expect(buildUniChartDataset(rows, { type: 'bar', xField: 'cat', yFields: [], limit: 20 })).toBeNull()
    const ds = buildUniChartDataset(rows, { type: 'bar', xField: 'cat', yFields: [{ key: 'amount', agg: 'sum' }], limit: 20 }, (k) => (k === 'amount' ? '金额' : k))
    expect(ds!.series[0].name).toBe('金额')
  })

  it('buildUniPieDataset：只取第一个指标；null 聚合组剔除', () => {
    const rows = [
      { cat: '已发货', amount: 100 },
      { cat: '待发货', amount: 50 },
      { cat: '已取消', amount: '' },
    ]
    const pie = buildUniPieDataset(rows, { type: 'pie', xField: 'cat', yFields: [{ key: 'amount', agg: 'sum' }], limit: 20 })
    expect(pie).toEqual([
      { name: '已发货', value: 100 },
      { name: '待发货', value: 50 },
    ])
  })
})

describe('@lc/runtime-uni/charts option 构造（no-eval 静态字面量）', () => {
  const rows = [
    { cat: '研发', amount: 100 },
    { cat: '市场', amount: 50 },
    { cat: '研发', amount: 20 },
  ]
  const config = { type: 'bar' as const, xField: 'cat', yFields: [{ key: 'amount', agg: 'sum' as const }], limit: 20 }

  it('buildUniDatasetOption bar：category X 轴 + 多系列（type/ smooth 按 chartType）', () => {
    const opt = buildUniDatasetOption('bar', rows, config) as any
    expect(opt).not.toBeNull()
    expect(opt.tooltip).toEqual({ trigger: 'axis' })
    expect(opt.xAxis).toEqual({ type: 'category', data: ['研发', '市场'] })
    expect(opt.yAxis).toEqual({ type: 'value' })
    expect(opt.series).toEqual([{ name: 'amount', type: 'bar', data: [120, 50] }])
    // no-eval：option 全静态（无函数/formatter）
    expect(JSON.stringify(opt)).not.toContain('function')
  })

  it('buildUniDatasetOption line：smooth=true；pie：单环图 data=[{name,value}]', () => {
    const line = buildUniDatasetOption('line', rows, config) as any
    expect(line.series[0].type).toBe('line')
    expect(line.series[0].smooth).toBe(true)
    const pie = buildUniDatasetOption('pie', rows, config) as any
    expect(pie.tooltip).toEqual({ trigger: 'item' })
    expect(pie.series[0].type).toBe('pie')
    expect(pie.series[0].data).toEqual([
      { name: '研发', value: 120 },
      { name: '市场', value: 50 },
    ])
  })

  it('buildUniDatasetOption：空数据/未配置 → null（模板 v-if 空态）', () => {
    expect(buildUniDatasetOption('bar', [], config)).toBeNull()
    expect(buildUniDatasetOption('bar', rows, { type: 'bar', xField: '', yFields: [], limit: 20 })).toBeNull()
  })

  it('buildUniAggregateOption：aggregate rows [{key,value}] → bar/line/pie（空 key → （空））', () => {
    const aggRows = [
      { key: '研发', value: 120 },
      { key: '', value: 3 },
    ]
    const bar = buildUniAggregateOption('bar', aggRows, '数量') as any
    expect(bar.xAxis).toEqual({ type: 'category', data: ['研发', '（空）'] })
    expect(bar.series).toEqual([{ name: '数量', type: 'bar', data: [120, 3] }])
    const pie = buildUniAggregateOption('pie', aggRows, '数量') as any
    expect(pie.series[0].data).toEqual([
      { name: '研发', value: 120 },
      { name: '（空）', value: 3 },
    ])
    expect(buildUniAggregateOption('bar', [], '数量')).toBeNull()
  })
})
