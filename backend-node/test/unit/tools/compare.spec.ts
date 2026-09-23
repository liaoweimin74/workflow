import { describe, expect, it } from 'vitest'
import {
  compareShape,
  formatDiffs,
  sortArraysAtPaths,
  splitBySeverity,
} from '../../../tools/lib/compare'

/**
 * 「顺序不是契约」这条声明的实现。
 *
 * ⚠️ 这里有一个**真实踩过的坑**：最早的排序键是 `JSON.stringify(element)`，
 *    而两侧的**键顺序不同**（Java 的 Jackson 开了 SORT_PROPERTIES_ALPHABETICALLY，
 *    Node 是代码里的字面量顺序）—— 元素内容完全相同的两个数组会排出不同的顺序，
 *    表现为「明明声明了 unorderedArrays，却还是按位置报一堆不一致」。
 *    所以下面的用例专门锁住「键顺序不影响排序结果」。
 */
describe('sortArraysAtPaths', () => {
  it('命中路径时按内容排序（键顺序不同也排成一样）', () => {
    const javaStyle = [
      { createdAt: '<TIME>', formKey: 'person', name: 'p' },
      { createdAt: '<TIME>', formKey: 'baoxiaodan', name: 'b' },
    ]
    const nodeStyle = [
      { name: 'b', formKey: 'baoxiaodan', createdAt: '<TIME>' },
      { name: 'p', formKey: 'person', createdAt: '<TIME>' },
    ]
    const a = sortArraysAtPaths({ data: javaStyle }, ['$.data']) as { data: unknown[] }
    const b = sortArraysAtPaths({ data: nodeStyle }, ['$.data']) as { data: unknown[] }
    // 排序结果必须逐元素相等 —— 这正是「顺序不是契约」要保证的
    expect(a.data).toEqual(b.data)
    expect((a.data[0] as { formKey: string }).formKey).toBe('baoxiaodan')
  })

  it('未命中的路径保持原顺序', () => {
    const input = { other: [{ b: 2 }, { a: 1 }] }
    expect(sortArraysAtPaths(input, ['$.data'])).toEqual(input)
  })

  it('精确匹配路径，不做后缀匹配（$.data 不会命中 $.other.data）', () => {
    const input = { other: { data: [{ b: 2 }, { a: 1 }] } }
    expect(sortArraysAtPaths(input, ['$.data'])).toEqual(input)
  })

  it('嵌套数组里的元素不被误排（只排命中路径那一层）', () => {
    const input = { data: [{ children: [{ b: 2 }, { a: 1 }] }] }
    const out = sortArraysAtPaths(input, ['$.data']) as {
      data: Array<{ children: unknown[] }>
    }
    expect(out.data[0].children).toEqual([{ b: 2 }, { a: 1 }])
  })

  it('不修改入参（返回新数组）', () => {
    const original = { data: [{ b: 2 }, { a: 1 }] }
    const snapshot = JSON.parse(JSON.stringify(original)) as unknown
    sortArraysAtPaths(original, ['$.data'])
    expect(original).toEqual(snapshot)
  })
})

describe('compareShape', () => {
  it('完全一致返回空数组', () => {
    expect(compareShape({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toEqual([])
  })

  it('缺字段报 missing', () => {
    expect(compareShape({ a: 1, b: 2 }, { a: 1 })).toEqual([
      { path: '$.b', kind: 'missing', expected: 2, actual: undefined },
    ])
  })

  it('多字段报 extra', () => {
    expect(compareShape({ a: 1 }, { a: 1, c: 3 })).toEqual([
      { path: '$.c', kind: 'extra', expected: undefined, actual: 3 },
    ])
  })

  it('类型不同报 type（数字 vs 字符串数字）', () => {
    expect(compareShape({ a: 1 }, { a: '1' })).toEqual([
      { path: '$.a', kind: 'type', expected: 1, actual: '1' },
    ])
  })

  it('null 与 undefined 视为类型不同（不是静默通过）', () => {
    const diffs = compareShape({ a: null }, { a: undefined })
    expect(diffs).toHaveLength(1)
    expect(diffs[0].kind).toBe('type')
    expect(diffs[0].path).toBe('$.a')
  })

  it('null 与 null 一致', () => {
    expect(compareShape({ a: null }, { a: null })).toEqual([])
  })

  it('同类型不同值报 value', () => {
    expect(compareShape({ a: 1 }, { a: 2 })).toEqual([
      { path: '$.a', kind: 'value', expected: 1, actual: 2 },
    ])
  })

  it('数组长度不同报 length（由调用方按告警处理，不算契约破损）', () => {
    const diffs = compareShape({ a: [1, 2] }, { a: [1] })
    expect(diffs.filter((d) => d.kind === 'length')).toEqual([
      { path: '$.a', kind: 'length', expected: 2, actual: 1 },
    ])
  })

  it('长度不同时公共部分仍逐元素比对，元素形状问题不会被掩盖', () => {
    const diffs = compareShape({ rows: [{ id: 1, name: 'a' }] }, { rows: [{ id: 1 }, { id: 2 }] })
    // 既有长度差异，也有第 0 个元素缺 name 的真实契约问题
    expect(diffs.some((d) => d.kind === 'length')).toBe(true)
    expect(diffs.some((d) => d.kind === 'missing' && d.path === '$.rows[0].name')).toBe(true)
  })

  it('一边为空一边非空时只报 length，不谎称做了元素形状校验', () => {
    const diffs = compareShape({ rows: [] }, { rows: [{ id: 1 }] })
    expect(diffs).toEqual([{ path: '$.rows', kind: 'length', expected: 0, actual: 1 }])
  })

  it('splitBySeverity 把 length 归为告警、其余归为失败', () => {
    const diffs = compareShape({ a: [1, 2], b: 1 }, { a: [1], b: '1' })
    const { failures, notices } = splitBySeverity(diffs)
    expect(notices.map((d) => d.kind)).toEqual(['length'])
    expect(failures.every((d) => d.kind !== 'length')).toBe(true)
    expect(failures.some((d) => d.kind === 'type' && d.path === '$.b')).toBe(true)
  })

  it('数组元素递归比较，路径带下标', () => {
    expect(compareShape({ rows: [{ id: '<ID>' }] }, { rows: [{ id: 'x' }] })).toEqual([
      { path: '$.rows[0].id', kind: 'value', expected: '<ID>', actual: 'x' },
    ])
  })

  it('嵌套对象缺字段能定位到完整路径', () => {
    expect(compareShape({ data: { user: { id: 1, name: 'a' } } }, { data: { user: { id: 1 } } })).toEqual(
      [{ path: '$.data.user.name', kind: 'missing', expected: 'a', actual: undefined }],
    )
  })

  it('顶层数组', () => {
    expect(compareShape([1, 2], [1, 2])).toEqual([])
    expect(compareShape([1, 2], [1, 3])[0].path).toBe('$[1]')
  })

  it('多个差异全部返回，不只是第一个', () => {
    const diffs = compareShape({ a: 1, b: 2, c: 3 }, { a: 9, c: 3, d: 4 })
    expect(diffs.map((d) => d.path).sort()).toEqual(['$.a', '$.b', '$.d'])
  })

  it('空对象与空对象一致', () => {
    expect(compareShape({}, {})).toEqual([])
  })

  it('formatDiffs 输出可读的多行文本', () => {
    const text = formatDiffs(compareShape({ a: 1, b: 2 }, { a: 'x' }))
    expect(text).toContain('$.a')
    expect(text).toContain('类型不符')
    expect(text).toContain('$.b')
    expect(text).toContain('缺少字段')
  })
})
