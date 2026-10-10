import { describe, it, expect } from 'vitest'
import {
  AGGREGATE_OPTIONS,
  aggregateOptionsOf,
  batchDeleteEnabled,
  buildHeaderFilterCondition,
  buildSummaryMethod,
  buildSummaryValues,
  computeAggregate,
  extractDistinctValues,
  featureEnabled,
  hasActiveHeaderFilter,
  headerFilterKindOf,
  isNumericColumnType,
  rowValueOf,
  selectedRowIds,
  type SummaryColumnSpec,
} from '../tableEnhance'

/** 两种行形态样例：扁平（PageDataTable）与 BizDataVO（PageRenderer/SearchTable） */
const flatRows = [
  { id: '1', name: '甲', amount: 10, score: '3.5', empty: '' },
  { id: '2', name: '乙', amount: 20.5, score: '4', empty: null },
  { id: '3', name: '甲', amount: null, score: null, empty: undefined },
]
const voRows = [
  { id: 'a', data: { name: '甲', amount: 1 } },
  { id: 'b', data: { name: '乙', amount: 2 } },
]

describe('tableEnhance — 行取值 rowValueOf', () => {
  it('扁平行取顶层字段', () => {
    expect(rowValueOf(flatRows[0], 'name')).toBe('甲')
    expect(rowValueOf(flatRows[0], 'amount')).toBe(10)
  })
  it('BizDataVO 行取 data 内字段', () => {
    expect(rowValueOf(voRows[1], 'name')).toBe('乙')
    expect(rowValueOf(voRows[1], 'amount')).toBe(2)
  })
  it('null/undefined 行安全返回 undefined', () => {
    expect(rowValueOf(null, 'x')).toBeUndefined()
    expect(rowValueOf(undefined, 'x')).toBeUndefined()
  })
})

describe('tableEnhance — 汇总行聚合', () => {
  it('数值列类型识别（大小写不敏感）', () => {
    expect(isNumericColumnType('DECIMAL')).toBe(true)
    expect(isNumericColumnType('int')).toBe(true)
    expect(isNumericColumnType('VARCHAR')).toBe(false)
    expect(isNumericColumnType(undefined)).toBe(false)
  })

  it('数值列开放全量聚合，非数值列仅计数', () => {
    expect(aggregateOptionsOf('DECIMAL')).toEqual(AGGREGATE_OPTIONS)
    expect(aggregateOptionsOf('VARCHAR').map((o) => o.value)).toEqual(['count'])
  })

  it('sum/avg/max/min 忽略空值与非数值；count 为非空计数', () => {
    expect(computeAggregate(flatRows, 'amount', 'sum')).toBe(30.5)
    expect(computeAggregate(flatRows, 'amount', 'avg')).toBe(15.25)
    expect(computeAggregate(flatRows, 'amount', 'max')).toBe(20.5)
    expect(computeAggregate(flatRows, 'amount', 'min')).toBe(10)
    expect(computeAggregate(flatRows, 'amount', 'count')).toBe(2)
    // 字符串数字可转数（'3.5'/'4'），null 不计
    expect(computeAggregate(flatRows, 'score', 'sum')).toBe(7.5)
    expect(computeAggregate(flatRows, 'score', 'count')).toBe(2)
    // 全类型可 count：文本列
    expect(computeAggregate(flatRows, 'name', 'count')).toBe(3)
  })

  it('avg 保留 2 位小数；无有效数值的 sum/avg/max/min 返回 null（count 仍计数）', () => {
    const rows = [{ v: 1 }, { v: 2 }, { v: 2 }]
    expect(computeAggregate(rows, 'v', 'avg')).toBe(1.67)
    expect(computeAggregate([{ v: 'abc' }, { v: null }], 'v', 'sum')).toBe(0)
    expect(computeAggregate([{ v: 'abc' }], 'v', 'avg')).toBeNull()
    expect(computeAggregate([], 'v', 'max')).toBeNull()
    expect(computeAggregate([], 'v', 'count')).toBe(0)
  })

  it('浮点误差清理：0.1+0.2 → 0.3', () => {
    expect(computeAggregate([{ v: 0.1 }, { v: 0.2 }], 'v', 'sum')).toBe(0.3)
  })

  it('buildSummaryValues 仅输出声明列；BizDataVO 行同样可聚合', () => {
    const specs: SummaryColumnSpec[] = [
      { key: 'amount', aggregate: 'sum' },
      { key: 'name', aggregate: 'count' },
    ]
    expect(buildSummaryValues(flatRows, specs)).toEqual({ amount: 30.5, name: 3 })
    expect(buildSummaryValues(voRows, [{ key: 'amount', aggregate: 'sum' }])).toEqual({ amount: 3 })
    expect(buildSummaryValues(voRows, [])).toEqual({})
  })

  it('buildSummaryMethod：聚合列出值、无值出占位、标签落在首个未配置聚合列', () => {
    const specs: SummaryColumnSpec[] = [{ key: 'amount', aggregate: 'sum' }]
    const method = buildSummaryMethod(specs)
    const columns = [
      { property: 'id' },
      { property: 'name' },
      { property: 'amount' },
      { property: undefined },
    ]
    const cells = method({ columns, data: flatRows as any })
    expect(cells).toEqual(['汇总', '', 30.5, ''])
  })

  it('buildSummaryMethod：聚合列无有效数值输出 — 占位', () => {
    const method = buildSummaryMethod([{ key: 'amount', aggregate: 'avg' }])
    expect(method({ columns: [{ property: 'amount' }], data: [{ amount: 'x' }] as any })).toEqual(['—'])
  })
})

describe('tableEnhance — 表头筛选', () => {
  it('列类型 → 筛选形态：日期/数值/文本', () => {
    expect(headerFilterKindOf('DATE')).toBe('date')
    expect(headerFilterKindOf('DATETIME')).toBe('date')
    expect(headerFilterKindOf('TIMESTAMP')).toBe('date')
    expect(headerFilterKindOf('BIGINT')).toBe('number')
    expect(headerFilterKindOf('decimal')).toBe('number')
    expect(headerFilterKindOf('VARCHAR')).toBe('text')
    expect(headerFilterKindOf(null)).toBe('text')
  })

  it('多选值 → op=in；剔除空值后为空则不产生条件', () => {
    expect(buildHeaderFilterCondition('status', { mode: 'in', values: ['a', 'b'] }))
      .toEqual({ column: 'status', op: 'in', value: ['a', 'b'] })
    expect(buildHeaderFilterCondition('status', { mode: 'in', values: ['', null] })).toBeNull()
    expect(buildHeaderFilterCondition('status', { mode: 'in', values: [] })).toBeNull()
  })

  it('区间 → op=range；缺一边丢弃（后端 range 要求起止同时存在）', () => {
    expect(buildHeaderFilterCondition('age', { mode: 'range', min: 1, max: 9 }))
      .toEqual({ column: 'age', op: 'range', value: [1, 9] })
    expect(buildHeaderFilterCondition('age', { mode: 'range', min: 1, max: '' })).toBeNull()
    expect(buildHeaderFilterCondition('age', { mode: 'range', min: '', max: 9 })).toBeNull()
    expect(buildHeaderFilterCondition('age', null)).toBeNull()
    expect(buildHeaderFilterCondition('age', undefined)).toBeNull()
  })

  it('hasActiveHeaderFilter：有生效条件为 true', () => {
    expect(hasActiveHeaderFilter({ mode: 'in', values: ['a'] })).toBe(true)
    expect(hasActiveHeaderFilter({ mode: 'in', values: [] })).toBe(false)
    expect(hasActiveHeaderFilter({ mode: 'range', min: 1, max: 2 })).toBe(true)
    expect(hasActiveHeaderFilter({ mode: 'range', min: 1, max: '' })).toBe(false)
    expect(hasActiveHeaderFilter(null)).toBe(false)
  })

  it('extractDistinctValues：去重、扁平化数组值、剔除空值/对象值', () => {
    const rows = [
      { tag: 'a' },
      { tag: 'a' },
      { tag: ['b', 'c'] },
      { tag: '' },
      { tag: null },
      { tag: { deep: 1 } },
      { tag: 'b' },
    ]
    expect(extractDistinctValues(rows, 'tag')).toEqual(['a', 'b', 'c'])
    expect(extractDistinctValues([], 'tag')).toEqual([])
    // 数组内对象剔除
    expect(extractDistinctValues([{ tag: [{ x: 1 }, 'ok'] }], 'tag')).toEqual(['ok'])
  })
})

describe('tableEnhance — 批量操作开关与选择逻辑', () => {
  it('featureEnabled：boolean / {enabled} / 缺省 均归一化为 boolean', () => {
    expect(featureEnabled(true)).toBe(true)
    expect(featureEnabled(false)).toBe(false)
    expect(featureEnabled({ enabled: true })).toBe(true)
    expect(featureEnabled({ enabled: false })).toBe(false)
    expect(featureEnabled({})).toBe(false)
    expect(featureEnabled(undefined)).toBe(false)
    expect(featureEnabled(null)).toBe(false)
  })

  it('batchDeleteEnabled：批量未启用恒 false；启用时 delete 缺省开启、显式 false 关闭', () => {
    expect(batchDeleteEnabled(false)).toBe(false)
    expect(batchDeleteEnabled(undefined)).toBe(false)
    expect(batchDeleteEnabled({ enabled: true })).toBe(true)
    expect(batchDeleteEnabled({ enabled: true, delete: false })).toBe(false)
    expect(batchDeleteEnabled({ enabled: true, delete: true })).toBe(true)
    expect(batchDeleteEnabled(true)).toBe(true)
    expect(batchDeleteEnabled({ enabled: false, delete: true })).toBe(false)
  })

  it('selectedRowIds：提取顶层 id、剔除无 id 行、空输入安全', () => {
    expect(selectedRowIds(flatRows)).toEqual(['1', '2', '3'])
    expect(selectedRowIds(voRows)).toEqual(['a', 'b'])
    expect(selectedRowIds([{ name: '无id' }, { id: 'x' }, null])).toEqual(['x'])
    expect(selectedRowIds([])).toEqual([])
    expect(selectedRowIds(undefined as any)).toEqual([])
  })
})
