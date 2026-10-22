// ----- 真机探测 harness：把语料页面的出码产物原样落盘到 codegen/probe/ -----
// 产物由路由 /codegen-probe/<页名> 直接挂载（不经过 PageRendererPage），用来量
// "纸面零空洞"的产物在真机上到底缺什么。
// 一个页：PROBE_PAGE=skel_instance_1 npx vitest run ...；多个页（双渲染 e2e 用）：
// PROBE_PAGES=cardlist_test,dashboard npx vitest run ...（路由按页名挑产物，见 CodegenProbeShell.vue）
// npx vitest run src/views/page/codegen/__tests__/runtime-probe.test.ts

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import { generatePage } from '../generate'

// 默认页必须是 PUBLISHED 且挂了菜单的：/page/:key 只渲染这类页，DRAFT 页做不了 A/B 双渲染对比
const PAGES = (process.env.PROBE_PAGES || process.env.PROBE_PAGE || 'cardlist_test')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
const PROBE_DIR = resolve(process.cwd(), 'src/views/page/codegen/probe')

describe('真机探测产物落盘', () => {
  for (const PAGE of PAGES) {
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
      console.log(`unsupported（${PAGE}）：\n` + gen.manifest.unsupported.map((u) => `  ${u.path} [${u.key}] ${u.message}`).join('\n'))
      // 声明了数据源的页面：取数身份必须一条不带丢地出来（断在这里，真机上就是空列表/空图）。
      // 不能写成「非空」—— dash-filter + dash-todo 这类页面本来就不声明页面数据源。
      const declared = (schema.dataSources ?? []).length
      if (declared) {
        expect(gen.manifest.dataSources.map((d) => d.refId), `${PAGE} 数据源身份丢失`).toHaveLength(declared)
      }

      // 体检报告顺手打出来：e2e 的 Gate 一半读的就是这几个数
      expect(gen.report.buckets.C, `${PAGE} 出现 C 桶（已登记组件不忠实出码）`).toBe(0)
      console.log(`report（${PAGE}）：可出码 ${gen.report.codegenRate.emittableNodes}/${gen.report.codegenRate.totalNodes}`)

      // 容器接线必须是真接：spike 4 查出的「假出码」就是 el-dialog 出了、openContainer 没人调
      const vue = gen.files[Object.keys(gen.files).find((f) => f.endsWith('.vue'))!]
      if (gen.manifest.nodes.some((n) => n.type === 'page-table' || n.type === 'page-list-cards')) {
        expect(vue).toContain(':external-actions="true"')
        expect(vue).toContain('@button-click="onButtonClick"')
        expect(vue).toMatch(/case '[^']+':\s*\n\s*void openContainer/)
      }
      // dashboard：fcTable 出静态表格，几何与 slot 都要落在产物里（真机 A/B 的对照面）
      if (gen.manifest.nodes.some((n) => n.type === 'fcTable')) {
        expect(vue).toContain('<table lc:node')
        expect(vue).toMatch(/<td colspan="\d+" rowspan="\d+"/)
        expect(gen.manifest.unsupported.filter((u) => u.type === 'fcTable')).toEqual([])
      }
    })
  }
})
