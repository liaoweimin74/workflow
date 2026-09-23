// ----- TDD: 共享列表布局模块 bizTableLayout（从 BizDataListPage 抽取，数据源数据管理页复用）-----
// npx vitest run src/utils/__tests__/bizTableLayout.test.ts
import { describe, it, expect } from 'vitest'
import {
  filterableColumnsOf,
  buildSearchFields,
  buildTableColumns,
  collectFilterConditions,
  renderByComponentType,
  formatArray,
  formatCell,
  formatDate,
  isColumnSortable,
  isExactMatchCol,
} from '../bizTableLayout'
import type { ColumnConfigItem } from '@/api/bizData'

/** 列配置快捷构造 */
function col(partial: Partial<ColumnConfigItem> & { key: string; label: string }): ColumnConfigItem {
  return {
    columnType: 'VARCHAR',
    length: null,
    scale: null,
    required: false,
    unique: false,
    indexed: false,
    ...partial,
  }
}

describe('filterableColumnsOf — 可筛选列推导', () => {
  const columns: ColumnConfigItem[] = [
    col({ key: 'name', label: '姓名', length: 64, indexed: true }),
    col({ key: 'age', label: '年龄', columnType: 'INT', indexed: true }),
    col({ key: 'remark', label: '备注', columnType: 'TEXT', length: 1024 }),
    col({ key: 'tags', label: '标签', columnType: 'JSON', componentType: 'checkbox', indexed: false }),
    col({ key: 'tags_text', label: '标签(文本)', columnType: 'VARCHAR', length: 500 }),
    col({ key: 'color', label: '颜色', columnType: 'VARCHAR', componentType: 'colorPicker', length: 32 }),
  ]

  it('保留普通可筛列（indexed 或短文本）', () => {
    const result = filterableColumnsOf(columns)
    expect(result.some(c => c.key === 'name')).toBe(true)
    expect(result.some(c => c.key === 'age')).toBe(true)
  })

  it('TEXT/JSON/colorPicker 列不可筛', () => {
    const result = filterableColumnsOf(columns)
    expect(result.some(c => c.key === 'remark')).toBe(false)
    expect(result.some(c => c.key === 'color')).toBe(false)
  })

  it('数组组件（JSON）列改用 <key>_text 冗余列，label 沿用主列', () => {
    const result = filterableColumnsOf(columns)
    const textCol = result.find(c => c.key === 'tags_text')
    expect(textCol).toBeTruthy()
    expect(textCol?.label).toBe('标签')
    expect(result.some(c => c.key === 'tags')).toBe(false)
  })

  it('数组组件无 <key>_text 冗余列时不可筛', () => {
    const result = filterableColumnsOf([
      col({ key: 'multi', label: '多选', columnType: 'JSON', componentType: 'multiSelect' }),
    ])
    expect(result.some(c => c.key === 'multi')).toBe(false)
  })

  it('声明 filterable=false 的列不筛（即使 indexed）', () => {
    const result = filterableColumnsOf([
      col({ key: 'dept', label: '部门', columnType: 'VARCHAR', length: 64, indexed: true, filterable: false }),
    ])
    expect(result.some(c => c.key === 'dept')).toBe(false)
  })

  it('声明 filterable=true 的列允许筛选（即使 TEXT/JSON）', () => {
    const result = filterableColumnsOf([
      col({ key: 'remark', label: '备注', columnType: 'TEXT', length: 1024, filterable: true }),
    ])
    expect(result.some(c => c.key === 'remark')).toBe(true)
  })
})

describe('buildSearchFields — 搜索栏字段映射', () => {
  const filterable = [
    col({ key: 'name', label: '姓名', indexed: true }),
    col({ key: 'birth', label: '生日', columnType: 'DATE', indexed: true }),
    col({ key: 'dept_id', label: '部门', indexed: true, componentType: 'LookupPicker' }),
  ]

  it('默认文本列映射为 input', () => {
    const fields = buildSearchFields(filterable, [])
    const f = fields.find(x => x.prop === 'name')
    expect(f?.type).toBe('input')
    expect(f?.placeholder).toBe('姓名')
  })

  it('日期列映射为 date-picker', () => {
    const fields = buildSearchFields(filterable, [])
    const f = fields.find(x => x.prop === 'birth')
    expect(f?.type).toBe('date-picker')
  })

  it('数据引用列映射为 lookupPicker 且透传 rule.props', () => {
    const rules = [{
      field: 'dept_id',
      type: 'LookupPicker',
      title: '部门',
      props: { fetch: { url: '/x', params: { t: 1 } }, displayField: 'name' },
    }]
    const fields = buildSearchFields(filterable, rules)
    const f = fields.find(x => x.prop === 'dept_id')
    expect(f?.type).toBe('lookupPicker')
    expect((f as any).lookupProps?.displayField).toBe('name')
  })

  it('数组列 _text 去后缀匹配 rule（checkbox → input 文本搜索）', () => {
    const columns = [
      col({ key: 'tags', label: '标签', columnType: 'JSON', componentType: 'checkbox' }),
      col({ key: 'tags_text', label: '标签(文本)', columnType: 'VARCHAR', length: 500 }),
    ]
    const filterable = filterableColumnsOf(columns)
    const fields = buildSearchFields(filterable, [{ field: 'tags', type: 'checkbox', title: '标签' }])
    const f = fields.find(x => x.prop === 'tags_text')
    expect(f).toBeTruthy()
    expect(f?.type).toBe('input')
  })

  it('matchType=like：一律文本 input（覆盖组件类型）', () => {
    const fields = buildSearchFields([
      col({ key: 'dept_id', label: '部门', columnType: 'VARCHAR', componentType: 'LookupPicker', matchType: 'like' }),
    ], [])
    const f = fields.find(x => x.prop === 'dept_id')
    expect(f?.type).toBe('input')
  })

  it('matchType=range：日期列 date-range / 数值列 number-range', () => {
    const fields = buildSearchFields([
      col({ key: 'birth', label: '生日', columnType: 'DATE', matchType: 'range' }),
      col({ key: 'amount', label: '金额', columnType: 'DECIMAL', matchType: 'range' }),
    ], [])
    expect(fields.find(x => x.prop === 'birth')?.type).toBe('date-range')
    expect(fields.find(x => x.prop === 'amount')?.type).toBe('number-range')
  })
})

describe('buildTableColumns — 表格列渲染构建', () => {
  const columns: ColumnConfigItem[] = [
    col({ key: 'name', label: '姓名', columnType: 'VARCHAR', indexed: true }),
    col({ key: 'color', label: '颜色', columnType: 'VARCHAR', componentType: 'colorPicker' }),
    col({ key: 'tags', label: '标签', columnType: 'JSON', componentType: 'checkbox' }),
    col({ key: 'tags_text', label: '标签(文本)', columnType: 'VARCHAR', length: 500 }),
  ]
  const bizCols = columns.filter(c => !c.hidden && !c.unsupported)
  const tableCols = buildTableColumns(bizCols)

  it('每列生成 prop/label/sortable 且带 render', () => {
    const nameCol = tableCols.find(c => c.prop === 'name')
    expect(nameCol?.label).toBe('姓名')
    expect(nameCol?.render).toBeTypeOf('function')
  })

  it('尾列追加 updatedAt 且用 formatDate', () => {
    const updatedAt = tableCols[tableCols.length - 1]
    expect(updatedAt.prop).toBe('updatedAt')
    expect(updatedAt.label).toBe('更新时间')
    expect(updatedAt.width).toBe(160)
  })

  it('appendUpdatedAt=false 时不追加更新时间尾列（列严格等于传入列）', () => {
    const cols = buildTableColumns(bizCols, { appendUpdatedAt: false })
    expect(cols.some((c) => c.prop === 'updatedAt')).toBe(false)
    expect(cols).toHaveLength(bizCols.length)
  })

  it('colorPicker 列 render 输出色块', () => {
    const c = tableCols.find(x => x.prop === 'color')
    const vnode = (c!.render as any)({ data: { color: '#ff6600' } })
    expect(vnode.type).toBe('div')
  })

  it('数组值列 render 优先显示 <key>_text 冗余文本', () => {
    const c = tableCols.find(x => x.prop === 'tags')
    const vnode = (c!.render as any)({ data: { tags: ['a', 'b'], tags_text: '["标签A","标签B"]' } })
    expect(vnode).toContain('标签A')
  })

  it('JSON/TEXT/colorPicker 列不可排序', () => {
    const colorCol = tableCols.find(x => x.prop === 'color')
    expect(colorCol?.sortable).toBe(false)
  })

  it('声明 sortable=false 的列不可排序（覆盖类型推导）', () => {
    const cols = buildTableColumns([col({ key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: false })])
    expect(cols.find(c => c.prop === 'name')?.sortable).toBe(false)
  })

  it('声明 sortable=true 的列可排序（覆盖类型推导）', () => {
    const cols = buildTableColumns([col({ key: 'j', label: 'J', columnType: 'JSON', sortable: true })])
    expect(cols.find(c => c.prop === 'j')?.sortable).toBe(true)
  })
})

describe('collectFilterConditions — fetchApi 结构化 filter 组装', () => {
  const filterable = [
    col({ key: 'name', label: '姓名', columnType: 'VARCHAR', indexed: true }),
    col({ key: 'age', label: '年龄', columnType: 'INT', indexed: true }),
    col({ key: 'dept', label: '部门', columnType: 'VARCHAR', componentType: 'cascader', indexed: true }),
  ]

  it('文本列 LIKE，数值列 eq', () => {
    const conds = collectFilterConditions(filterable, { name: '张三', age: 18 })
    expect(conds).toContainEqual({ column: 'name', op: 'like', value: '张三' })
    expect(conds).toContainEqual({ column: 'age', op: 'eq', value: 18 })
  })

  it('数组选中值 join(/)，空值跳过', () => {
    const conds = collectFilterConditions(filterable, { dept: ['华东', '研发'], name: '' })
    expect(conds).toContainEqual({ column: 'dept', op: 'like', value: '华东/研发' })
    expect(conds.some(c => c.column === 'name')).toBe(false)
  })

  it('matchType 声明优先：like 数值列、eq 文本列', () => {
    const conds = collectFilterConditions([
      col({ key: 'amount', label: '金额', columnType: 'DECIMAL', matchType: 'like' }),
      col({ key: 'name', label: '姓名', columnType: 'VARCHAR', matchType: 'eq' }),
    ], { amount: '19.9', name: '张三' })
    expect(conds).toContainEqual({ column: 'amount', op: 'like', value: '19.9' })
    expect(conds).toContainEqual({ column: 'name', op: 'eq', value: '张三' })
  })

  it('matchType=range：op range 且数组值原样保留', () => {
    const conds = collectFilterConditions([
      col({ key: 'birth', label: '生日', columnType: 'DATE', matchType: 'range' }),
    ], { birth: ['2026-01-01', '2026-12-31'] })
    expect(conds).toContainEqual({ column: 'birth', op: 'range', value: ['2026-01-01', '2026-12-31'] })
  })
})

describe('renderByComponentType — 组件类型定制渲染', () => {
  it('null/undefined → 占位符', () => {
    expect(renderByComponentType(undefined, 'VARCHAR', null)).toBe('—')
  })

  it('colorPicker 输出色块 div', () => {
    const vnode = renderByComponentType('colorPicker', 'VARCHAR', '#fff') as any
    expect(vnode.type).toBe('div')
    expect(JSON.stringify(vnode.children)).toContain('#fff')
  })

  it('数组值组件逗号拼接', () => {
    expect(renderByComponentType('checkbox', 'JSON', ['A', 'B'])).toBe('A, B')
  })

  it('无组件类型按原始值转字符串', () => {
    expect(renderByComponentType(undefined, 'VARCHAR', 'abc')).toBe('abc')
  })
})

describe('format 系列', () => {
  it('formatArray：数组/JSON 数组/普通字符串', () => {
    expect(formatArray(['a', 'b'])).toBe('a, b')
    expect(formatArray('["x","y"]')).toBe('x, y')
    expect(formatArray('plain')).toBe('plain')
  })

  it('formatCell：null 占位、对象 JSON', () => {
    expect(formatCell(null)).toBe('—')
    expect(formatCell({ a: 1 })).toBe('{"a":1}')
  })

  it('formatDate 输出 YYYY-MM-DD HH:mm', () => {
    expect(formatDate('2026-01-02T03:04:05')).toBe('2026-01-02 03:04')
    expect(formatDate('')).toBe('—')
  })
})

describe('isColumnSortable / isExactMatchCol', () => {
  it('JSON/TEXT/colorPicker/子表列不可排序', () => {
    expect(isColumnSortable(col({ key: 'j', columnType: 'JSON' }))).toBe(false)
    expect(isColumnSortable(col({ key: 't', columnType: 'TEXT' }))).toBe(false)
    expect(isColumnSortable(col({ key: 'c', componentType: 'colorPicker' }))).toBe(false)
    expect(isColumnSortable(col({ key: 's', subColumns: [col({ key: 'x', label: 'X' })] }))).toBe(false)
    expect(isColumnSortable(col({ key: 'ok', columnType: 'VARCHAR' }))).toBe(true)
  })

  it('数值/日期列等值匹配', () => {
    expect(isExactMatchCol(col({ key: 'i', columnType: 'INT' }))).toBe(true)
    expect(isExactMatchCol(col({ key: 'd', columnType: 'DATE' }))).toBe(true)
    expect(isExactMatchCol(col({ key: 'v', columnType: 'VARCHAR' }))).toBe(false)
  })
})