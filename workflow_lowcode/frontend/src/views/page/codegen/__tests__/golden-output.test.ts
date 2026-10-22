/**
 * golden 产物 Gate（P2 阶段 1）：IR 重放必须先证明「产物字节不变」。
 *
 * 快照记录的是 IR 重构之前的生成结果；重构后只要有一个字符变化，这里就会失败。
 * 覆盖全部语料页 + spike 1 的 test_page，产物与 manifest 都进快照 —— manifest 的
 * 四张登记表顺序也是回读协议的组成部分，不能只看 SFC。
 */
import { describe, expect, it } from 'vitest'

import { generatePage } from '../generate'
import testPage from './fixtures/test_page.schema.json'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

const pages = [
  { key: 'test_page', schema: testPage as Record<string, any> },
  ...Object.entries(corpus)
    .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
    .sort((a, b) => a.key.localeCompare(b.key)),
]

const META = (key: string) => ({ pageKey: key, pageName: key, exportedAt: '2026-10-22' })

describe('golden：出码产物与 manifest 逐字节稳定', () => {
  for (const { key, schema } of pages) {
    it(key, () => {
      const res = generatePage(schema as any, META(key))
      const files = Object.keys(res.files).sort()
      expect(files).toMatchSnapshot('file list')
      for (const f of files) expect(res.files[f]).toMatchSnapshot(`file ${f}`)
      expect(res.manifest).toMatchSnapshot('manifest')
    })
  }
})
