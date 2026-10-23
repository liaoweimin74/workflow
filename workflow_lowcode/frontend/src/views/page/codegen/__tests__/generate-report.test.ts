// ----- 5.1 GenerateReport：出码自检随产物返回 -----
// design D6 定的形态是「报告作为生成返回值，不建 UI」：语料体检测试与 CLI 消费，设计器不加口。
// spec 要求报告至少含 可出码节点率 / A·B·C 三桶空洞计数 / unsupported 明细 / 四张登记表计数。
// 本文件守的是「报告不能变成第二套真相」：
//  · 登记表计数直接累加本次 manifest，不在报告里重新判定；
//  · 桶计数必须等于当场回读（reverseToSchema）报出的空洞数，回读器是唯一出处；
//  · 分母（可出码口径）必须与生成器实际走到的位置一致 —— 契约把子规则登记成 prop 透传的节点，
//    生成器压根不递归进去，报告就不许把它算进成绩。
// 跑：npx vitest run src/views/page/codegen/__tests__/generate-report.test.ts

import { describe, expect, it } from 'vitest'

import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'
import dcPage from './fixtures/corpus/tmp_data_container_verify.json'
import testPage from './fixtures/test_page.schema.json'

const META = (key: string) => ({ pageKey: key, pageName: key, exportedAt: 'generate-report' })
const vueOf = (files: Record<string, string>) => files[Object.keys(files).find((f) => f.endsWith('.vue'))!]

describe('GenerateReport', () => {
  it('generatePage 返回 report，四块内容齐备且自洽', () => {
    const { report } = generatePage(testPage as any, META('test_page'))

    expect(report.reportVersion, '报告要带版本号：CLI 与体检脚本靠它认格式').toBe(1)
    expect(report.pageKey).toBe('test_page')

    expect(report.codegenRate.totalNodes).toBeGreaterThan(0)
    expect(report.codegenRate.emittableNodes).toBeLessThanOrEqual(report.codegenRate.registeredNodes)
    expect(report.codegenRate.registeredNodes).toBeLessThanOrEqual(report.codegenRate.totalNodes)
    expect(report.codegenRate.rate).toBeCloseTo(report.codegenRate.emittableNodes / report.codegenRate.totalNodes, 10)

    expect(Object.keys(report.buckets).sort()).toEqual(['A', 'B', 'C'])

    expect(Array.isArray(report.unsupported)).toBe(true)
    for (const key of ['dropped', 'warnings', 'renames', 'wireOnly'] as const)
      expect(typeof report.registryCounts[key], `registryCounts 缺 ${key}`).toBe('number')
  })

  it('登记表计数直接累加本次 manifest，不另起一套判定', () => {
    const gen = generatePage(testPage as any, META('test_page'))
    const sum = (pick: (n: (typeof gen.manifest.nodes)[number]) => unknown[]) =>
      gen.manifest.nodes.reduce((s, n) => s + pick(n).length, 0)

    expect(gen.report.registryCounts.dropped).toBe(sum((n) => n.dropped))
    expect(gen.report.registryCounts.renames).toBe(sum((n) => n.renames))
    expect(gen.report.registryCounts.wireOnly).toBe(sum((n) => n.wireOnly))
    // warnings 跨三张表：节点级 + 行为级 + 数据源级（数据源级登记的是页面级绝对路径）
    expect(gen.report.registryCounts.warnings).toBe(
      sum((n) => n.warnings) +
        gen.manifest.behaviors.reduce((s, b) => s + b.warnings.length, 0) +
        gen.manifest.dataSources.reduce((s, d) => s + d.warnings.length, 0),
    )
    expect(gen.report.unsupported).toEqual(gen.manifest.unsupported)
  })

  it('桶计数与回读空洞一一对应：回读器是唯一出处，报告不许自己数', () => {
    for (const [key, page] of [
      ['test_page', testPage],
      ['tmp_data_container_verify', dcPage],
    ] as const) {
      const gen = generatePage(page as any, META(key))
      const back = reverseToSchema(page as any, vueOf(gen.files), gen.manifest)
      expect(gen.report.holes.length, `${key} 桶总数与 holes 不符`).toBe(back.holes.length)
      expect(gen.report.buckets.A + gen.report.buckets.B + gen.report.buckets.C).toBe(back.holes.length)
      expect(
        gen.report.holes.map((h) => `${h.path}|${h.kind}`).sort(),
        `${key} holes 明细与回读不符`,
      ).toEqual(back.holes.map((h) => `${h.path}|${h.kind}`).sort())
      // C 桶 = 已登记组件子树上的不忠实出码，恒为 0（Gate 的硬指标）
      expect(gen.report.buckets.C, `${key} C 桶非空：${JSON.stringify(gen.report.holes)}`).toBe(0)
      expect(gen.report.renameFailures).toEqual(
        back.renameChecks.filter((r) => !r.ok).map((r) => expect.objectContaining({ path: r.path, to: r.to })),
      )
    }
  })

  it('分母诚实：契约把子规则登记成 prop 透传的节点，生成器没进去就不许算成绩', () => {
    const gen = generatePage(dcPage as any, META('tmp_data_container_verify'))
    const at = (path: string) => gen.report.nodes.find((n) => n.path === path)

    expect(at('rule[1]')?.blocked, '容器本体走得到').toBeNull()
    expect(at('rule[1].props.rule[0]')?.blocked).toBe('carrier:page-data-container')
    // 交叉核对生成器自己：那个位置的节点压根没进登记表（一份真相，报告不能嘴上说挡着、手里却出了码）
    expect(gen.manifest.nodes.some((n) => n.rulePath.startsWith('rule[1].props.rule['))).toBe(false)
    expect(gen.report.codegenRate.emittableNodes).toBe(
      gen.report.nodes.filter((n) => !n.blocked).length,
    )
  })

  it('空页面不报 NaN：没有组件节点即无债可出', () => {
    const gen = generatePage({ rule: [], option: {}, dataSources: [], actions: [] }, META('empty_page'))
    expect(gen.report.codegenRate.totalNodes).toBe(0)
    expect(gen.report.codegenRate.rate).toBe(1)
    expect(gen.report.buckets).toEqual({ A: 0, B: 0, C: 0 })
    expect(gen.report.registryCounts).toEqual({ dropped: 0, warnings: 0, renames: 0, wireOnly: 0 })
  })

  it('报告是返回值而不是产物内容：manifest 里不塞报告，产物字节不受影响', () => {
    const gen = generatePage(testPage as any, META('test_page'))
    expect(gen.manifest).not.toHaveProperty('report')
    expect(JSON.stringify(gen.files)).not.toContain('"reportVersion"')
  })
})

// ----- Task 2.4: per-target 分桶（spec: uniapp-codegen-target「per-target 可出码率 Gate」）-----
// 「出码报告 SHALL 按 target（web/uniapp）分桶统计可出码率与 unsupported 明细」；
// web-only 组件（PageIframe、树/树表族）登记 unsupported 含路径与原因，MUST NOT 静默丢弃。
// 判定读 target-profile（Task 2.3 矩阵），与契约阻断（blocked）正交：前者是端能力，
// 后者是编译广度。web 目标（默认）行为与现状逐字节一致。
const mixedSchema = {
  rule: [
    { type: 'page-iframe', field: 'frame1', props: { url: 'https://example.com' } },
    { type: 'page-tree', field: 'tree1', props: {} },
    { type: 'page-tree-table', field: 'tt1', props: {} },
    { type: 'input', field: 'name', props: {} },
  ],
  option: {},
  dataSources: [],
  actions: [],
}

describe('GenerateReport — per-target（Task 2.4）', () => {
  it('target=uniapp：web-only 组件登记 unsupported（含路径与原因），双端共享组件不登记', () => {
    const gen = generatePage(mixedSchema as any, { ...META('uniapp_target'), target: 'uniapp' })
    const byType = new Map(gen.report.unsupported.map((u) => [u.type, u]))
    for (const [i, t] of ['page-iframe', 'page-tree', 'page-tree-table'].entries()) {
      const u = byType.get(t)
      expect(u, `${t} 应登记 unsupported`).toBeTruthy()
      expect(u!.path, `${t} 登记要带路径`).toBe(`rule[${i}]`)
      expect(u!.message, `${t} 登记要带原因`).toContain('仅 Web')
    }
    expect(byType.has('input'), '双端共享组件不进 unsupported').toBe(false)
  })

  it('target=web（默认）：能力登记不参与，unsupported 与 manifest 同源（行为与现状一致）', () => {
    const gen = generatePage(mixedSchema as any, META('web_target'))
    expect(gen.report.unsupported).toEqual(gen.manifest.unsupported)
    // page-iframe 等未登记类型在 web 目标也有登记（parse 侧契约缺失，既有行为），
    // 但不得追加「三区能力矩阵」能力原因——那是 uniapp 目标的登记维度
    expect(gen.report.unsupported.every((u) => !u.message.includes('三区能力矩阵'))).toBe(true)
  })

  it('bucketsByTarget：web 键 = 现行为（与顶层 buckets 一致）；uniapp 键不把 web-only 子树空洞记成 uniapp 的债', () => {
    const web = generatePage(testPage as any, META('test_page'))
    const uni = generatePage(testPage as any, { ...META('test_page'), target: 'uniapp' })
    expect(Object.keys(uni.report.bucketsByTarget).sort()).toEqual(['uniapp', 'web'])
    expect(uni.report.bucketsByTarget.web).toEqual(web.report.buckets)
    const sum = (b: { A: number; B: number; C: number }) => b.A + b.B + b.C
    expect(sum(uni.report.bucketsByTarget.uniapp), 'uniapp 桶 ⊆ web 桶').toBeLessThanOrEqual(sum(uni.report.bucketsByTarget.web))
    // 桶计数仍与回读空洞自洽（web 键）
    expect(sum(uni.report.bucketsByTarget.web)).toBe(uni.report.holes.length)
  })

  it('codegenRateByTarget：web 与顶层 codegenRate 一致；uniapp 分母排除 web-only（能力过滤与契约阻断正交）', () => {
    const gen = generatePage(mixedSchema as any, { ...META('uniapp_rate'), target: 'uniapp' })
    expect(gen.report.codegenRateByTarget.web).toEqual({
      totalNodes: gen.report.codegenRate.totalNodes,
      emittableNodes: gen.report.codegenRate.emittableNodes,
      rate: gen.report.codegenRate.rate,
    })
    expect(gen.report.codegenRateByTarget.uniapp.totalNodes).toBe(4)
    expect(gen.report.codegenRateByTarget.uniapp.emittableNodes, '仅 input 双端可出').toBe(1)
    expect(gen.report.codegenRateByTarget.uniapp.rate).toBeCloseTo(0.25, 10)
  })
})
