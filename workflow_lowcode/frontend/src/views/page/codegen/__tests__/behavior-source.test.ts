// ----- actions[].source 保真：schema 没写的键，回导不许凭空补出空串 -----
// npx vitest run src/views/page/codegen/__tests__/behavior-source.test.ts

import { describe, expect, it } from 'vitest'

import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import testPageSchema from './fixtures/test_page.schema.json'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

const pages = Object.entries(corpus)
  .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
  .filter((x) => (x.schema.actions || []).length)
  .sort((a, b) => a.key.localeCompare(b.key))

function run(schema: Record<string, any>, key: string) {
  const gen = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'behavior-source' })
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return { gen, rev: reverseToSchema(schema as any, gen.files[vue], gen.manifest) }
}

describe('actions[].source 只在 schema 真写了才回导', () => {
  it('语料确实有"无 source 的显式动作"这一形态', () => {
    const withoutSource = pages.flatMap(({ schema }) => (schema.actions || []).filter((a: any) => !('source' in a)))
    expect(withoutSource.length).toBeGreaterThan(0)
  })

  it('无 source 的动作不报多造（空串兜底会凭空长出一个键）', () => {
    for (const { key, schema } of pages) {
      const { rev } = run(schema, key)
      const bad = rev.holes.filter((h) => /^actions\[\d+\]\.source$/.test(h.path))
      expect(bad, `${key} ${JSON.stringify(bad)}`).toEqual([])
    }
  })

  it('schema 显式写了 source 时照常回导（修复不许把有值的也丢掉）', () => {
    const { gen, rev } = run(testPageSchema as any, 'test_page')
    const src = (testPageSchema as any).actions[0].source
    expect(src).toBeTruthy()
    expect((rev.rebuilt as any).actions[0].source).toBe(src)
    expect(gen.manifest.behaviors.find((b) => b.origin.startsWith('actions['))?.source).toBe(src)
  })

  it('产物注释里的原形态不再混入空 source', () => {
    const { gen } = run(pages[0].schema, pages[0].key)
    const line = gen.files[Object.keys(gen.files).find((f) => f.endsWith('.vue'))!]
      .split('\n')
      .find((l) => l.startsWith('// 原形态：'))!
    const parsed = JSON.parse(line.slice('// 原形态：'.length))
    expect(parsed.every((x: any) => !('source' in x) || x.source)).toBe(true)
  })
})
