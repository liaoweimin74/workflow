// ----- 真机探测 harness：把语料页面的出码产物原样落盘到 codegen/probe/ -----
// 产物由路由 /codegen-probe 直接挂载（不经过 PageRendererPage），用来量
// "纸面零空洞"的产物在真机上到底缺什么。
// 换页面：PROBE_PAGE=skel_instance_1 npx vitest run ...（改完要同步 router/index.ts 的 /codegen-probe 指向）
// npx vitest run src/views/page/codegen/__tests__/runtime-probe.test.ts

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { generatePage } from '../generate'

// 默认页必须是 PUBLISHED 且挂了菜单的：/page/:key 只渲染这类页，DRAFT 页做不了 A/B 双渲染对比
const PAGE = process.env.PROBE_PAGE || 'cardlist_test'
const PROBE_DIR = resolve(process.cwd(), 'src/views/page/codegen/probe')

describe('真机探测产物落盘', () => {
  it(`probe/ 下是 ${PAGE} 的最新产物（生成器一改就红，防止拿旧产物得出真机结论）`, () => {
    const schema = JSON.parse(
      readFileSync(resolve(process.cwd(), `src/views/page/codegen/__tests__/fixtures/corpus/${PAGE}.json`), 'utf8'),
    )
    const gen = generatePage(schema, { pageKey: PAGE, pageName: PAGE, exportedAt: 'runtime-probe' })
    for (const [name, text] of Object.entries(gen.files)) {
      const target = join(PROBE_DIR, name)
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, text, 'utf8')
      console.log(`已写出 ${target}`)
    }
    // 真机上会撞到的语义债：产物里出了标签/事件，但组件侧没有对应能力
    console.log('unsupported：\n' + gen.manifest.unsupported.map((u) => `  ${u.path} [${u.key}] ${u.message}`).join('\n'))
    expect(gen.manifest.dataSources.map((d) => d.refId)).not.toEqual([])

    // 容器接线必须是真接：spike 4 查出的「假出码」就是 el-dialog 出了、openContainer 没人调
    const vue = gen.files[Object.keys(gen.files).find((f) => f.endsWith('.vue'))!]
    expect(vue).toContain(':external-actions="true"')
    expect(vue).toContain('@button-click="onButtonClick"')
    expect(vue).toMatch(/case '[^']+':\s*\n\s*void openContainer/)
  })
})
