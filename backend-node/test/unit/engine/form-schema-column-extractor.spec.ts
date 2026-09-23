import { describe, expect, it } from 'vitest'
import {
  extract,
  extractFromSchema,
  inferColumnType,
} from '../../../src/engine/form/column/form-schema-column-extractor'

/**
 * 表单列定义解析器的单测（对齐 Java `FormSchemaColumnExtractor`）。
 *
 * 契约场景「WORKFLOW 数据源读路径」覆盖不到它 —— 那个场景用的 `baoxiaodan`
 * schema 是 **`[]`**（空数组），只证明了「空 schema → 空列」。
 * 而它是 WORKFLOW 数据源 metadata 的**唯一列来源**，规则又多（三级 label 回落、
 * 组件过滤、三种嵌套递归、类型推断），只能在这里逐条钉住。
 */

describe('inferColumnType', () => {
  it('组件类型 → 列类型（未命中的一律 VARCHAR）', () => {
    expect(inferColumnType('inputNumber')).toBe('INT')
    expect(inferColumnType('rate')).toBe('INT')
    expect(inferColumnType('inputTextarea')).toBe('TEXT')
    expect(inferColumnType('editor')).toBe('TEXT')
    for (const type of ['date', 'datetime', 'time', 'dateRange', 'dateTimeRange']) {
      expect(inferColumnType(type)).toBe('DATETIME')
    }
    expect(inferColumnType('switch')).toBe('TINYINT')
    expect(inferColumnType('checkbox')).toBe('TINYINT')
    expect(inferColumnType('input')).toBe('VARCHAR')
    expect(inferColumnType(null)).toBe('VARCHAR')
    expect(inferColumnType('  ')).toBe('VARCHAR')
  })
})

describe('extractFromSchema', () => {
  it('裸数组与 {rule:[...]} 两种形状都支持；空/非法 → 空列', () => {
    expect(extractFromSchema('[{"field":"a","type":"input"}]')).toHaveLength(1)
    expect(extractFromSchema('{"rule":[{"field":"a","type":"input"}]}')).toHaveLength(1)
    expect(extractFromSchema('[]')).toEqual([])
    expect(extractFromSchema('{"rule":[]}')).toEqual([])
    expect(extractFromSchema(null)).toEqual([])
    expect(extractFromSchema('{oops')).toEqual([])
  })

  it('label 三级回落：title → label → field；type 为空时也抽列（只是不写 componentType）', () => {
    const [title, labelNode, fallback] = extractFromSchema(
      '[{"field":"a","type":"input","title":"原因"},{"field":"b","type":"input","label":"金额"},{"field":"c"}]',
    )
    expect([title.label, labelNode.label, fallback.label]).toEqual(['原因', '金额', 'c'])
    expect(fallback.componentType).toBeNull()
    expect(title.componentType).toBe('input')
    // 中文标签在 title 上（form-create 的约定）；type 空 → VARCHAR
    expect(fallback.columnType).toBe('VARCHAR')
  })

  it('非法字段名（不以字母开头 / 含非法字符 / 超长 / 空）整列跳过', () => {
    const cols = extractFromSchema(
      JSON.stringify([
        { field: '1abc' },
        { field: 'a-b' },
        { field: 'ok_1' },
        { field: '', type: 'input' },
        { field: 'x'.repeat(65) },
      ]),
    )
    expect(cols.map((c) => c.key)).toEqual(['ok_1'])
  })

  it('不支持的组件不抽列（但**仍会递归子节点**）；整体跳过的组件连子节点都不看', () => {
    const cols = extractFromSchema(
      JSON.stringify([
        { field: 'picker', type: 'userPicker' },
        { field: 'line', type: 'divider' },
        { field: 'sub', type: 'subForm', children: [{ field: 'inner', type: 'input' }] },
        { field: 'ext', type: 'formContainer', children: [{ field: 'hidden', type: 'input' }] },
      ]),
    )
    // subForm 自己不是列，但它的 children 递归出来了
    expect(cols.map((c) => c.key)).toEqual(['inner'])
  })

  it('三种嵌套递归：children / props.rule / props.columns[].rule', () => {
    const cols = extractFromSchema(
      JSON.stringify([
        { type: 'row', children: [{ field: 'a', type: 'input' }] },
        { type: 'group', props: { rule: [{ field: 'b', type: 'inputNumber' }] } },
        {
          type: 'tableForm',
          props: { columns: [{ rule: [{ field: 'c', type: 'switch' }] }] },
        },
      ]),
    )
    expect(cols.map((c) => [c.key, c.columnType])).toEqual([
      ['a', 'VARCHAR'],
      ['b', 'INT'],
      ['c', 'TINYINT'],
    ])
  })
})

describe('extract（columnConfig 入口）', () => {
  it('解析 JSON 数组；空/非法/非数组 → **空列**（不抛错，与 parseBusinessColumnConfig 相反）', () => {
    const cols = extract('[{"key":"code","label":"编码","columnType":"VARCHAR","length":64}]')
    expect(cols.map((c) => [c.key, c.label, c.columnType, c.length])).toEqual([
      ['code', '编码', 'VARCHAR', 64],
    ])
    expect(extract(null)).toEqual([])
    expect(extract('  ')).toEqual([])
    expect(extract('{oops')).toEqual([])
    expect(extract('{"key":"a"}')).toEqual([])
  })
})
