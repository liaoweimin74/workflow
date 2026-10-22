// ----- TDD: probe-index（验证台的取数层：语料 fixture glob + 磁盘产物 glob）-----
// npx vitest run src/views/page/codegen/__tests__/probe-index.test.ts

import { describe, it, expect } from 'vitest'

import { CORPUS_KEYS, corpusSchemaOf, mismatchedFiles, probeComponentOf, probeTextsOf } from '../probe-index'

describe('语料清单', () => {
  it('仓库语料全在清单里，schema 取得出来', () => {
    // 语料页数只增不减，这里只钉「有 cardlist_test/dashboard」这两个 e2e 在用的页，
    // 不钉总数——加一页语料不该红在这个用例上
    expect(CORPUS_KEYS).toContain('cardlist_test')
    expect(CORPUS_KEYS).toContain('dashboard')
    expect(Array.isArray(corpusSchemaOf('cardlist_test')?.rule)).toBe(true)
    expect(corpusSchemaOf('no_such_page')).toBeUndefined()
  })
})

describe('磁盘产物索引', () => {
  it('probe/ 是生成物（不进 git）：没有文件时必须答「没有」，不许抛', async () => {
    expect(await probeComponentOf('NoSuchPage.vue')).toBeUndefined()
    const texts = await probeTextsOf(['NoSuchPage.vue'])
    expect(texts['NoSuchPage.vue']).toBeUndefined()
  })

  it('glob 的键是 probe/ 下的相对路径，与 generatePage 的 files 键同一坐标系', async () => {
    const keys = Object.keys(await probeTextsOf(['CardlistTest.vue']))
    expect(keys).toEqual(['CardlistTest.vue'])
  })
})

describe('落盘一致性判定', () => {
  const generated = { 'A.vue': 'x', 'api/a.ts': 'y' }

  it('磁盘缺文件与内容不同都算差异，逐字节相同才算一致', () => {
    expect(mismatchedFiles(generated, {})).toEqual(['A.vue', 'api/a.ts'])
    expect(mismatchedFiles(generated, { 'A.vue': 'x', 'api/a.ts': 'y' })).toEqual([])
    expect(mismatchedFiles(generated, { 'A.vue': 'x', 'api/a.ts': 'y ' })).toEqual(['api/a.ts'])
  })

  it('磁盘上多出本次没生成的文件不算差异：对照只比这一页的产物', () => {
    expect(mismatchedFiles({ 'A.vue': 'x' }, { 'A.vue': 'x', 'B.vue': 'z' })).toEqual([])
  })
})
