// ----- TDD: 设计器把「出码」页签接进预览弹窗 -----
// npx vitest run src/views/page/__tests__/PageDesigner.codegen-preview-tab.test.ts
//
// 这三条都是「静默失效」型的：接线断了不会报错，只会让页签不见了或页签里读的是旧定义。
// 整页挂载 PageDesigner 要拖起画布与十几个弹窗，成本换来的覆盖不如直接钉结构。

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

describe('PageDesigner 预览弹窗的出码页签', () => {
  it('把出码页签喂进 vendor 的 previewTabs 插槽，并按插槽带出的当前页签名点亮', () => {
    expect(SOURCE).toContain('<template #previewTabs="{ status }">')
    expect(SOURCE).toContain(':active="status === \'codegen\'"')
    expect(SOURCE).toContain('name="codegen"')
  })

  it('出码栈只在 dev 里被引到：生产包既不能带几 MB 的死重，也不能留一个空的出码页签', () => {
    // 静态 import 会把 generate → report → reverse（含 @vue/compiler-sfc）整条链拖进设计器 chunk
    expect(SOURCE).not.toMatch(/^import\s+\w+\s+from '\.\/codegen\/CodegenPreviewPane\.vue'/m)
    expect(SOURCE).toMatch(
      /const CodegenPreviewPane =[\s\S]{0,120}import\.meta\.env\.DEV[\s\S]{0,120}defineAsyncComponent\(\(\) => import\('\.\/codegen\/CodegenPreviewPane\.vue'\)\)[\s\S]{0,60}\: null/,
    )
    // DEV 为假时组件是 null：页签整块不渲染，而不是留一张点得开却空白的页签
    expect(SOURCE).toContain('v-if="CodegenPreviewPane"')
  })

  it('画布定义只有一个出口：保存 JSON、出码按钮、预览页签读的是同一份', () => {
    expect(SOURCE).toMatch(/function canvasSchema\(\)/)
    expect(SOURCE).toContain('JSON.stringify(canvasSchema())')
    expect(SOURCE).toContain('schema: canvasSchema()')
    expect(SOURCE).toContain(':get-schema="canvasSchema"')
  })
})
