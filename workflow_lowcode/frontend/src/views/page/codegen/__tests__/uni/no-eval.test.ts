// ----- Task 3.1: no-eval（运行期零解释纪律）-----
// design G3/D4：移动端产物由 emitUniApp 生成真实模板与普通函数，运行期零解释；
// 小程序环境禁 eval。全部产物文件遍历断言无 new Function( / eval( ——
// 该断言随语料页生成持续生效，后续 Task 5.x/7.x 落真实模板时同样被它兜住。
// npx vitest run src/views/page/codegen/__tests__/uni/no-eval.test.ts

import { describe, expect, it } from 'vitest'

import { generatePageUni } from '../../uni/emit-uni'
import { CLIENT } from './client-fixture'
import testPage from '../fixtures/test_page.schema.json'

describe('no-eval — 产物运行期零解释（Task 3.1）', () => {
  it('遍历全部产物文件：无 new Function( / eval(', () => {
    const { files } = generatePageUni(testPage as any, {
      pageKey: 'test_page',
      pageName: '测试页面',
      client: CLIENT,
    })
    expect(Object.keys(files).length).toBeGreaterThan(0)
    for (const [path, content] of Object.entries(files)) {
      expect(content, `${path} 含 new Function(`).not.toMatch(/new\s+Function\s*\(/)
      expect(content, `${path} 含 eval(`).not.toMatch(/(^|[^.\w])eval\s*\(/)
    }
  })
})
