// ----- 多数据源登记：manifest.dataSources 必须逐源记账，不能再只写 dataSources[0] -----
// npx vitest run src/views/page/codegen/__tests__/datasources-manifest.test.ts

import { describe, expect, it } from 'vitest'

import { DATA_SOURCE_CONTRACT } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

const pages = Object.entries(corpus)
  .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
  .sort((a, b) => a.key.localeCompare(b.key))

function run(schema: Record<string, any>, key: string) {
  const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'datasources' })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return { gen, rev: reverseToSchema(schema as any, gen.files[vue], gen.manifest), source: gen.files[vue] }
}

describe('数据源逐源登记', () => {
  it('语料确实覆盖多源与零源两种形态', () => {
    const counts = pages.map(({ schema }) => (schema.dataSources || []).length)
    expect(Math.max(...counts)).toBeGreaterThanOrEqual(4)
    expect(Math.min(...counts)).toBe(0)
  })

  it('manifest.dataSources 与 schema 逐源对齐（条数、顺序、id/refId）', () => {
    for (const { key, schema } of pages) {
      const { gen } = run(schema, key)
      const declared = (schema.dataSources || []).map((d: any) => ({ id: String(d.id ?? ''), refId: String(d.refId ?? '') }))
      const registered = gen.manifest.dataSources.map((d) => ({ id: d.id, refId: d.refId }))
      expect(registered, key).toEqual(declared)
    }
  })

  it('每个声明源的 id/refId 都落进产物常量表（证据在模板里，不在登记表里）', () => {
    for (const { key, schema } of pages) {
      const { gen, source } = run(schema, key)
      const entries = gen.manifest.dataSources
      if (!entries.length) continue
      expect(source, key).toContain('const dataSources = {')
      for (const d of entries) {
        expect(source, `${key} 缺 ${d.id}`).toContain(`'${d.id}': '${d.refId}',`)
      }
    }
  })

  it('篡改产物常量表的 refId 必须报差异：证明回读吃的是产物证据不是登记表', () => {
    const multi = pages.find(({ schema }) => (schema.dataSources || []).length > 1)!
    const { gen, source } = run(multi.schema, multi.key)
    const tampered = source.replace(/(const dataSources = \{[^}]*\})/, (_, block: string) =>
      block.replace(/: '([0-9a-f]{6})/, ": 'ffffff"),
    )
    expect(tampered).not.toBe(source)
    const rev = reverseToSchema(multi.schema as any, tampered, gen.manifest)
    expect(rev.holes.some((h) => h.path.startsWith('dataSources[') && /\.refId$/.test(h.path))).toBe(true)
  })

  it('设计期键（name/label/searchFields）的丢弃逐源登记，不是空数组兜底', () => {
    const design = ['name', 'label', 'searchFields']
    for (const { key, schema } of pages) {
      const { gen } = run(schema, key)
      ;(schema.dataSources || []).forEach((src: any, i: number) => {
        const entry = gen.manifest.dataSources[i]
        expect(entry, `${key}[${i}] 无登记条目`).toBeDefined()
        const warned = new Set(entry.warnings.filter((w) => design.includes(w.path.split('.')[1]!)).map((w) => w.path))
        for (const k of design) {
          if (!(k in src)) continue
          expect(warned, `${key}[${i}] ${k} 未登记丢弃`).toContain(`dataSources[${i}].${k}`)
        }
      })
    }
  })

  it('契约表外的数据源键出 error，不静默丢', () => {
    const schema = JSON.parse(JSON.stringify(pages[0].schema))
    schema.dataSources[0].extraKey = 1
    const { gen } = run(schema, 'mutated_ds')
    expect(gen.manifest.unsupported.some((u) => u.path.includes('dataSources[0].extraKey'))).toBe(true)
  })

  it('回读后 dataSources 零空洞：长度不符消失，设计期键由登记豁免', () => {
    for (const { key, schema } of pages) {
      const { rev } = run(schema, key)
      const bad = rev.holes.filter((h) => h.path.startsWith('dataSources'))
      expect(bad, `${key} ${JSON.stringify(bad)}`).toEqual([])
    }
  })

  it('契约表就是这三类落点（补键要显式改这张表）', () => {
    expect(Object.keys(DATA_SOURCE_CONTRACT).sort()).toEqual(['id', 'label', 'name', 'refId', 'searchFields'])
    expect(DATA_SOURCE_CONTRACT.id).toEqual({ emit: 'binding' })
  })
})
