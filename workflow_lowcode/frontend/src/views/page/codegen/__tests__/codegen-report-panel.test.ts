// ----- TDD: 出码报告面板（出码验证台的第一块内容）-----
// npx vitest run src/views/page/codegen/__tests__/codegen-report-panel.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import CodegenReportPanel from '../CodegenReportPanel.vue'
import type { GenerateReport } from '../ir'

/** 合成报告：只放要断言的那几项，其余给「全绿」默认值，这样每条用例的差异都是自己造出来的 */
function reportOf(patch: Partial<GenerateReport> = {}): GenerateReport {
  return {
    reportVersion: 1,
    pageKey: 'demo_page',
    codegenRate: { totalNodes: 98, registeredNodes: 95, emittableNodes: 94, rate: 94 / 98 },
    buckets: { A: 4, B: 0, C: 0 },
    holes: [],
    renameFailures: [],
    unsupported: [],
    registryCounts: { dropped: 3, warnings: 5, renames: 2, wireOnly: 1 },
    nodes: [{ type: 'page-table', path: 'rule[0]', propsKeys: ['columns'], blocked: null }],
    ...patch,
  } as GenerateReport
}

const open = (report: GenerateReport) => mount(CodegenReportPanel, { props: { report } })

describe('CodegenReportPanel — 摘要', () => {
  it('可出码率把分子分母都摆出来：只看百分比会掩盖节点数变化', () => {
    const text = open(reportOf()).text()
    expect(text).toContain('94/98')
    // 一位小数足够区分语料级别的变化，再细就是噪声
    expect(text).toContain('95.9%')
    expect(text).toContain('95/98')
  })

  it('空页面（0 个组件节点）不报 0/0：报告里 rate 记 1，界面得跟着说没有债', () => {
    const text = open(reportOf({ codegenRate: { totalNodes: 0, registeredNodes: 0, emittableNodes: 0, rate: 1 } })).text()
    expect(text).toContain('0/0')
    expect(text).toContain('100.0%')
  })

  it('C 桶非零才出红色警示，并把是哪几个子树点出来', () => {
    const clean = open(reportOf())
    expect(clean.find('.codegen-report__alert-c').exists()).toBe(false)

    const dirty = open(
      reportOf({
        buckets: { A: 0, B: 0, C: 1 },
        holes: [{ path: 'rule[2].props.rule[1]', kind: 'prop:props.columns', bucket: 'C', owner: 'page-list-cards' }],
      }),
    )
    const alert = dirty.find('.codegen-report__alert-c')
    expect(alert.exists()).toBe(true)
    // 光说「有 C 桶」不够：人要知道先去修哪个组件
    expect(alert.text()).toContain('page-list-cards')
    expect(alert.text()).toContain('rule[2].props.rule[1]')
  })

  it('四张登记表计数齐出，warnings 已含行为级与数据源级（面板不自己再加一遍）', () => {
    const text = open(reportOf()).text()
    expect(text).toMatch(/丢弃\s*3/)
    expect(text).toMatch(/告警\s*5/)
    expect(text).toMatch(/重命名\s*2/)
    expect(text).toMatch(/仅接线\s*1/)
  })
})

describe('CodegenReportPanel — 明细', () => {
  it('空洞、重命名失败、未登记能力三张表按数据出行', () => {
    const wrapper = open(
      reportOf({
        holes: [{ path: 'rule[0].props.rule[3]', kind: 'child', bucket: 'A', owner: 'page-custom' }],
        renameFailures: [{ path: 'rule[1].props.field', to: 'order_no', bucket: 'C', artifact: 'orderNo' }],
        unsupported: [{ path: 'rule[2]', type: 'page-chart', key: 'props.echarts', message: '组件不接这个 prop' }],
      }),
    )
    expect(wrapper.findAll('.codegen-report__hole')).toHaveLength(1)
    expect(wrapper.findAll('.codegen-report__rename-failure')).toHaveLength(1)
    expect(wrapper.find('.codegen-report__unsupported').text()).toContain('组件不接这个 prop')
  })

  it('没有差异时说明白「零」，不留一张空表让人以为面板坏了', () => {
    const text = open(reportOf()).text()
    expect(text).toContain('回读零空洞')
    expect(text).toContain('重命名全部核对通过')
    expect(text).toContain('没有未登记的组件能力')
  })

  it('节点明细把 blocked 归因原样列出来：A 桶的数字就是从这些行来的', () => {
    const wrapper = open(
      reportOf({
        nodes: [
          { type: 'page-table', path: 'rule[0]', propsKeys: [], blocked: null },
          { type: 'page-custom', path: 'rule[1]', propsKeys: [], blocked: 'unregistered:page-custom' },
        ],
      }),
    )
    const rows = wrapper.findAll('.codegen-report__node')
    expect(rows).toHaveLength(2)
    expect(rows[1]!.text()).toContain('unregistered:page-custom')
    expect(rows[0]!.text()).toContain('可出码')
  })
})

describe('CodegenReportPanel — 明细折叠', () => {
  it('全绿时明细收起：一屏要先看到双渲染对照，不是 98 行节点表', () => {
    expect(open(reportOf()).find('details').element.open).toBe(false)
  })

  it('计数一直写在标题上，收起也看得见', () => {
    const report = reportOf()
    expect(open(report).find('.codegen-report__summary').text()).toContain(`节点 ${report.nodes.length}`)
  })

  it('有空洞 / 未登记能力 / 走不进去的节点时自动展开：有问题不许藏在折叠里', () => {
    const cases: GenerateReport[] = [
      reportOf({ holes: [{ path: 'rule[0]', kind: 'child', bucket: 'A', owner: 'page-custom' }] }),
      reportOf({ unsupported: [{ path: 'rule[0]', type: 'page-chart', key: 'props.x', message: '没登记' }] }),
      reportOf({ nodes: [{ type: 'page-custom', path: 'rule[0]', propsKeys: [], blocked: 'unregistered:page-custom' }] }),
    ]
    for (const report of cases) expect(open(report).find('details').element.open, JSON.stringify(report)).toBe(true)
  })
})
