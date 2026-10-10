/**
 * jsonStructure 单测：JSON 实例 → 字段结构树推断。
 * 覆盖：对象根/数组根（object 元素键并集、标量数组收敛）/标量根/嵌套展开/
 *       截断上限（单层键数、深度、总节点预算）/非法输入容错。
 */
import { describe, expect, it } from 'vitest'
import {
  inferStructureFromJsonText,
  statFields,
  JSON_INFER_MAX_DEPTH,
  JSON_INFER_MAX_KEYS,
  JSON_INFER_MAX_TOTAL,
} from '../jsonStructure'

describe('inferStructureFromJsonText · 基础推断', () => {
  it('对象根 → 顶层字段按序展开 + 嵌套 object 递归', () => {
    const r = inferStructureFromJsonText('{"code":0,"msg":"ok","data":{"id":123,"name":"n"}}')
    expect(r.ok).toBe(true)
    expect(r.fields?.map((f) => f.path)).toEqual(['code', 'msg', 'data'])
    expect(r.fields?.[0].type).toBe('number')
    const data = r.fields?.[2]
    expect(data?.type).toBe('object')
    expect(data?.children?.map((c) => c.path)).toEqual(['id', 'name'])
  })

  it('数组根（元素全为 object）→ items 包装 + 键并集（首次出现序）', () => {
    const r = inferStructureFromJsonText('[{"sku":"A","qty":1},{"sku":"B","price":9.9}]')
    expect(r.ok).toBe(true)
    const items = r.fields?.[0]
    expect(items?.path).toBe('items')
    expect(items?.type).toBe('array<object>')
    expect(items?.children?.map((c) => c.path)).toEqual(['sku', 'qty', 'price'])
  })

  it('标量数组根 → items 叶子（array<string>，无 children）', () => {
    const r = inferStructureFromJsonText('["a","b"]')
    expect(r.fields?.[0]).toMatchObject({ path: 'items', type: 'array<string>' })
    expect(r.fields?.[0].children ?? null).toBeNull()
  })

  it('对象内数组（元素为 object）→ array<object> 带子结构', () => {
    const r = inferStructureFromJsonText('{"data":{"items":[{"sku":"A","qty":2}]}}')
    const items = r.fields?.[0].children?.[0]
    expect(items?.path).toBe('items')
    expect(items?.type).toBe('array<object>')
    expect(items?.children?.map((c) => c.path)).toEqual(['sku', 'qty'])
  })

  it('对象内标量数组 → array<number> 叶子', () => {
    const r = inferStructureFromJsonText('{"tags":[1,2,3]}')
    expect(r.fields?.[0]).toMatchObject({ path: 'tags', type: 'array<number>' })
    expect(r.fields?.[0].children ?? null).toBeNull()
  })

  it('标量根 → value 单字段', () => {
    const r = inferStructureFromJsonText('42')
    expect(r.ok).toBe(true)
    expect(r.fields).toEqual([{ path: 'value', type: 'number' }])
  })

  it('null / boolean 字段类型推断', () => {
    const r = inferStructureFromJsonText('{"a":null,"ok":true}')
    expect(r.fields?.[0].type).toBe('null')
    expect(r.fields?.[1].type).toBe('boolean')
  })
})

describe('inferStructureFromJsonText · 边界与容错', () => {
  it('空输入 → 报错', () => {
    expect(inferStructureFromJsonText('   ').ok).toBe(false)
  })

  it('非法 JSON → 报错信息可读', () => {
    const r = inferStructureFromJsonText('{"a":}')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('JSON 解析失败')
  })

  it('空数组根 → 报错（无元素可推断）', () => {
    expect(inferStructureFromJsonText('[]').ok).toBe(false)
  })

  it('单层键数超上限 → truncated 且仅保留前 MAX_KEYS 键', () => {
    const obj: Record<string, number> = {}
    for (let i = 0; i < JSON_INFER_MAX_KEYS + 5; i++) obj['k' + i] = i
    const r = inferStructureFromJsonText(JSON.stringify(obj))
    expect(r.ok).toBe(true)
    expect(r.fields?.length).toBe(JSON_INFER_MAX_KEYS)
    expect(r.stats?.truncated).toBe(true)
  })

  it('嵌套深度超上限 → truncated', () => {
    let inner: unknown = 1
    for (let i = 0; i < JSON_INFER_MAX_DEPTH + 2; i++) inner = { nested: inner }
    const r = inferStructureFromJsonText(JSON.stringify(inner))
    expect(r.ok).toBe(true)
    expect(r.stats?.truncated).toBe(true)
  })

  it('总节点超预算 → truncated（子层截断向上传播）', () => {
    const two: Record<string, number> = {}
    for (let i = 0; i < JSON_INFER_MAX_TOTAL + 1; i++) two['x' + i] = i
    const r = inferStructureFromJsonText(JSON.stringify({ deep: two }))
    expect(r.ok).toBe(true)
    expect(r.stats?.truncated).toBe(true)
  })
})

describe('statFields', () => {
  it('统计顶层/总节点/最大深度', () => {
    const fields = [
      { path: 'a', type: 'object', children: [{ path: 'b', type: 'object', children: [{ path: 'c', type: 'string' }] }] },
      { path: 'd', type: 'string' },
    ]
    expect(statFields(fields)).toEqual({ top: 2, total: 4, depth: 3, truncated: false })
  })
})
