// ----- 产物容器的取数回填：字段在 BizDataVO.data 里，摊错层就是空表单 -----
// 真机 A/B（/codegen-probe 点「编辑」）查出：容器弹窗按页面 schema 正常打开了，
// 但 12 个字段全是空的。生成代码写的是 `Object.assign(form, res.data ?? {})`，
// 而后端单条查询返的是 BizDataVO = { id, version, data: {...字段} }（http 拦截器已把 R 包装剥掉，
// res.data 就是这个 VO）—— 于是 form 里进的是 id/data/version 三个键，业务字段一个都没摊开。
// 现网三处取单条都是 `r.data.data`（PageDataForm.vue:203-207、PageDataCards.vue:688-690、
// DsBindingEngine.ts:74-82），并且都把 version 留住做乐观锁；DsBindingEngine 那处离产物最近：
// 它是「按已知字段名从记录里取值」，只填声明过的字段，不把整条记录灌进模型 —— 否则保存时
// { ...form } 会把容器根本没在编辑的业务字段一起写回去。id/version 也一律留在字段模型之外
// （PageDataForm 用 activeRecordId、PageDataCards 用 localFormId），产物侧对应 containerRecordId/containerVersion。
// 顺带同一条函数的第二个洞：打开前只重置了第一个字段，看完整条记录再点「新建」，其余字段还留着上一条的值。
// npx vitest run src/views/page/codegen/__tests__/container-record.test.ts

import { describe, expect, it } from 'vitest'

import { generatePage } from '../generate'
import testPageSchema from './fixtures/test_page.schema.json'

const corpus = import.meta.glob('./fixtures/corpus/*.json', { eager: true, import: 'default' }) as Record<
  string,
  Record<string, any>
>

/** 产物里容器函数的函数体（从 openContainer 到 closeContainer 之前） */
function openBody(source: string): string {
  const start = source.indexOf('async function openContainer')
  expect(start, '产物里没有 openContainer').toBeGreaterThan(-1)
  const end = source.indexOf('function closeContainer', start)
  return source.slice(start, end === -1 ? start + 1200 : end)
}

function gen(schema: Record<string, any>, key: string) {
  const res = generatePage(schema as any, { pageKey: key, pageName: key, exportedAt: 'container-record' })
  return res.files[Object.keys(res.files).find((f) => f.endsWith('.vue'))!]
}

const containerPages = Object.entries(corpus)
  .map(([p, schema]) => ({ key: p.split('/').pop()!.replace('.json', ''), schema }))
  .filter(({ schema }) => schema.rule?.some((n: any) => n.type === 'formContainer'))

describe('产物容器的取数与回填', () => {
  it('业务字段从 BizDataVO.data 摊开，且只填容器声明过的字段', () => {
    const body = openBody(gen(testPageSchema, 'test_page'))
    expect(body).toMatch(/const vo = \(res\.data \?\? \{\}\)/)
    expect(body, 'record 必须取 vo.data：取 res.data 就是摊错层，字段全空').toMatch(/const record = vo\.data \?\? \{\}/)
    expect(body).not.toContain('Object.assign(form, res.data ?? {})')
    expect(body, '整条记录灌进 form：保存时把没在编辑的字段一起写回去').not.toMatch(/Object\.assign\(form, /)
    expect(body).toMatch(/if \(k in record\) form\[k\] = record\[k\]/)
    expect(body, 'id 不能进字段模型（会跟着 { ...form } 存进业务数据）').not.toMatch(/form\.id\b|form\[[^\]]*\] = vo\.id/)
  })

  it('version 留住并传给 updateData（后端乐观锁，缺了就是覆盖写）', () => {
    const source = gen(testPageSchema, 'test_page')
    const body = openBody(source)
    expect(body).toMatch(/containerVersion\.value = typeof vo\.version === 'number' \? vo\.version : undefined/)
    expect(source).toMatch(/containerVersion = ref<number \| undefined>\(undefined\)/)
    expect(body, '打开时不置空：编辑完再点新建，会拿上一条的 version 去提交').toMatch(/containerVersion\.value = undefined/)
    expect(source).toContain('await updateData(containerRecordId.value, { ...form }, containerVersion.value)')
  })

  it('打开前重置全部字段，不是只重置第一个', () => {
    const body = openBody(gen(testPageSchema, 'test_page'))
    expect(body, '整表重置得是「全部置空」这一行，不是回填那一行').toMatch(
      /Object\.keys\(form\)\.forEach\(\(k\) => \{ form\[k\] = '' \}\)/,
    )
    const firstOnly = body.match(/^ {2}form\.\w+ = ''$/m)
    expect(firstOnly, '只重置首个字段会串上一条记录的脏值').toBeNull()
  })

  it('语料所有带容器的页面都按同一形态出码（不只是 fixture）', () => {
    expect(containerPages.length).toBeGreaterThan(0)
    for (const { key, schema } of containerPages) {
      const source = gen(schema, key)
      const body = openBody(source)
      expect(body, `${key} 没从 vo.data 按字段回填`).toMatch(/const record = vo\.data \?\? \{\}/)
      expect(body, `${key} 没按声明字段回填`).toMatch(/if \(k in record\) form\[k\] = record\[k\]/)
      expect(body, `${key} 没重置整表`).toMatch(/Object\.keys\(form\)\.forEach\(\(k\) => \{ form\[k\] = '' \}\)/)
      expect(source, `${key} 保存没带 version`).toContain('containerVersion.value)')
    }
  })
})
