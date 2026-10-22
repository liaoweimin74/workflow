// ----- TDD: 设计器预览弹窗里的「出码」页签（出码前先看 Vue3 源码）-----
// npx vitest run src/views/page/codegen/__tests__/codegen-preview-pane.test.ts
//
// 只验这一页签自己的行径：什么时候出码（页签被点亮那一刻）、吃什么定义（每次都现读画布）、
// 出错了怎么说（错误/空态不许塌成空白格）、展示什么（默认 .vue 产物，可切 api 文件）。
// 报告怎么算的由 generate-report.test.ts 守，页签怎么进弹窗由
// src/views/page/__tests__/PageDesigner.codegen-preview-tab.test.ts 守。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ElementPlus from 'element-plus'

import testPage from './fixtures/test_page.schema.json'

// 生成器换成可计数的 spy：本用例只管线怎么接（何时触发、吃什么、结果落到哪个 <pre>），
// 产物内容本身由 golden-output.test.ts 与语料体检测试守，这里不重复审一遍。
const generatePageSpy = vi.hoisted(() => vi.fn())
vi.mock('../generate', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, generatePage: (...args: any[]) => generatePageSpy(...args) }
})

import CodegenPreviewPane from '../CodegenPreviewPane.vue'

const open = (props: Record<string, any> = {}) =>
  mount(CodegenPreviewPane, {
    props: {
      active: true,
      pageKey: 'test_page',
      pageName: '测试页',
      // 画布定义：页签不许缓存这份，每次出码都调它重新取
      getSchema: () => structuredClone(testPage) as any,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })

beforeEach(() => {
  vi.clearAllMocks()
  generatePageSpy.mockImplementation((schema: any, meta: any) => ({
    files: {
      'TestPage.vue': `<template><!-- real vue from ${meta.pageKey} --></template>`,
      'api/test-page.ts': 'export const listTestPage = () => {}',
    },
    manifest: {},
    report: {
      pageKey: meta.pageKey,
      codegenRate: { totalNodes: 12, registeredNodes: 12, emittableNodes: 12, rate: 1 },
      buckets: { A: 0, B: 0, C: 0 },
      holes: [],
      renameFailures: [],
      unsupported: [],
      registryCounts: { dropped: 0, warnings: 0, renames: 0, wireOnly: 0 },
      nodes: [],
    },
  }))
})

describe('CodegenPreviewPane', () => {
  it('页签点亮才出码，未点亮一次都不生成', async () => {
    open({ active: false })
    await flushPromises()
    expect(generatePageSpy).not.toHaveBeenCalled()

    const closed = mount(CodegenPreviewPane, {
      props: { active: false, pageKey: 'test_page', getSchema: () => structuredClone(testPage) as any },
      global: { plugins: [ElementPlus] },
    })
    await closed.setProps({ active: true })
    await flushPromises()
    expect(generatePageSpy).toHaveBeenCalledTimes(1)
  })

  it('每次回到页签都按当前画布重出：不能让人读着上一份源码看这一页', async () => {
    const taken: number[] = []
    const wrapper = open({
      getSchema: () => {
        taken.push(taken.length)
        return structuredClone(testPage)
      },
    })
    await flushPromises()
    await wrapper.setProps({ active: false })
    await wrapper.setProps({ active: true })
    await flushPromises()
    expect(taken.length).toBe(2)
    expect(generatePageSpy).toHaveBeenCalledTimes(2)
  })

  it('出码吃的是 pageKey / pageName 与画布定义，来源标记写明来自设计器预览', async () => {
    open()
    await flushPromises()
    const [schema, meta] = generatePageSpy.mock.calls[0]
    expect(schema.rule).toEqual((testPage as any).rule)
    expect(meta.pageKey).toBe('test_page')
    expect(meta.pageName).toBe('测试页')
    expect(meta.exportedAt).toContain('designer-preview@')
  })

  it('默认展示 .vue 产物源码，可切到 api 文件', async () => {
    const wrapper = open()
    await flushPromises()
    expect(wrapper.find('.codegen-preview-pane__source').text()).toContain('real vue from test_page')
    await wrapper.find('.codegen-preview-pane__file').setValue('api/test-page.ts')
    expect(wrapper.find('.codegen-preview-pane__source').text()).toContain('listTestPage')
  })

  it('可出码率连着分子分母与三桶一起显示（只有百分比看不出节点数变了）', async () => {
    const wrapper = open()
    await flushPromises()
    expect(wrapper.find('.codegen-preview-pane__rate').text()).toContain('12/12')
  })

  it('C 桶不为 0 时页签上就告警：保真退化不能只藏在验证台里', async () => {
    generatePageSpy.mockImplementation((schema: any, meta: any) => ({
      files: { 'TestPage.vue': '<template></template>' },
      manifest: {},
      report: {
        pageKey: meta.pageKey,
        codegenRate: { totalNodes: 12, registeredNodes: 12, emittableNodes: 11, rate: 11 / 12 },
        buckets: { A: 0, B: 1, C: 2 },
        holes: [],
        renameFailures: [],
        unsupported: [],
        registryCounts: { dropped: 0, warnings: 0, renames: 0, wireOnly: 0 },
        nodes: [],
      },
    }))
    const wrapper = open()
    await flushPromises()
    const warn = wrapper.find('.codegen-preview-pane__degraded')
    expect(warn.exists()).toBe(true)
    expect(warn.text()).toContain('2')
  })

  it('pageKey 为空时直说，不发一次生成', async () => {
    const wrapper = open({ pageKey: '  ' })
    await flushPromises()
    expect(generatePageSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.codegen-preview-pane__error').text()).toContain('页面标识为空')
  })

  it('生成炸了要把原因写在页签上：不许塌成空白格让人以为「产物就是空的」', async () => {
    generatePageSpy.mockImplementation(() => {
      throw new Error('契约表里没有这个组件类型：page-unknown')
    })
    const wrapper = open()
    await flushPromises()
    expect(wrapper.find('.codegen-preview-pane__error').text()).toContain('page-unknown')
    expect(wrapper.find('.codegen-preview-pane__source').exists()).toBe(false)
  })

  it('「重新生成」按钮再走一遍当前画布', async () => {
    const wrapper = open()
    await flushPromises()
    await wrapper.find('.codegen-preview-pane__regen').trigger('click')
    await flushPromises()
    expect(generatePageSpy).toHaveBeenCalledTimes(2)
  })
})
