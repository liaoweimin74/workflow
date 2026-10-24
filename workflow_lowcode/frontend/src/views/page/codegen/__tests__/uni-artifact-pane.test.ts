// ----- TDD: 设计器预览弹窗里的「产物预览」页签（Task 8.1，发布前核对） -----
// npx vitest run src/views/page/codegen/__tests__/uni-artifact-pane.test.ts
//
// 只验这一页签自己的行径：什么时候构建（页签被点亮那一刻）、吃什么定义（每次现读画布）、
// 构建成功 iframe 加载什么（版本令牌重挂）、失败怎么说话（保留上次产物对照）。
// 通道本身（generatePageUni + POST）由 uni-preview-run 的用例守，接线由
// PageDesigner.artifact-preview.test.ts 守，这里不重复。

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'

import testPage from './fixtures/test_page.schema.json'

const runUniArtifactPreviewSpy = vi.hoisted(() => vi.fn())
vi.mock('../uni-preview-run', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, runUniArtifactPreview: (...args: any[]) => runUniArtifactPreviewSpy(...args) }
})

import UniArtifactPreviewPane from '../UniArtifactPreviewPane.vue'

const OK_OUT = {
  files: { 'src/pages/gen/test_page.vue': '<template><view class="lc-page">hi</view></template>' },
  report: { pageKey: 'test_page', codegenRate: { totalNodes: 8, registeredNodes: 8, emittableNodes: 8, rate: 1 }, buckets: { A: 6, B: 2, C: 0 } },
  version: 2,
  builtAt: '2026-10-24T06:00:00.000Z',
  previewUrl: 'http://localhost:5301/#/pages/gen/test_page?v=2',
}

const open = (props: Record<string, any> = {}) =>
  mount(UniArtifactPreviewPane, {
    props: {
      active: true,
      pageKey: 'test_page',
      pageName: '测试页',
      getSchema: () => structuredClone(testPage) as any,
      ...props,
    },
    global: { plugins: [ElementPlus] },
  })

beforeEach(() => {
  vi.clearAllMocks()
  runUniArtifactPreviewSpy.mockResolvedValue(OK_OUT)
})

describe('UniArtifactPreviewPane', () => {
  it('页签点亮才构建，未点亮一次都不跑', async () => {
    open({ active: false })
    await flushPromises()
    expect(runUniArtifactPreviewSpy).not.toHaveBeenCalled()

    const closed = mount(UniArtifactPreviewPane, {
      props: { active: false, pageKey: 'test_page', getSchema: () => structuredClone(testPage) as any },
      global: { plugins: [ElementPlus] },
    })
    await closed.setProps({ active: true })
    await flushPromises()
    expect(runUniArtifactPreviewSpy).toHaveBeenCalledTimes(1)
  })

  it('每次回到页签都按当前画布重新构建：不能让人看着上一次的产物核这一页', async () => {
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
    expect(runUniArtifactPreviewSpy).toHaveBeenCalledTimes(2)
  })

  it('构建成功：iframe src 就是带版本令牌的 previewUrl', async () => {
    const wrapper = open()
    await flushPromises()
    const frame = wrapper.find('iframe')
    expect(frame.exists()).toBe(true)
    expect(frame.attributes('src')).toBe('http://localhost:5301/#/pages/gen/test_page?v=2')
  })

  it('重复构建版本令牌递增：iframe 元素被替换（重挂），陈旧产物不许残留', async () => {
    const wrapper = open()
    await flushPromises()
    const first = wrapper.find('iframe').element
    runUniArtifactPreviewSpy.mockResolvedValue({ ...OK_OUT, version: 3, previewUrl: 'http://localhost:5301/#/pages/gen/test_page?v=3' })
    await wrapper.find('.uni-artifact-pane__build').trigger('click')
    await flushPromises()
    const frame = wrapper.find('iframe')
    expect(frame.attributes('src')).toBe('http://localhost:5301/#/pages/gen/test_page?v=3')
    // :key=version 变了 → Vue 销毁重建 iframe 元素（而不是原地改 src）
    expect(frame.element).not.toBe(first)
  })

  it('构建失败：错误写在页签上，iframe 不塌掉（保留上一次成功产物供对照）', async () => {
    const wrapper = open()
    await flushPromises()
    runUniArtifactPreviewSpy.mockRejectedValue(new Error('uni build 失败（exit 1）：template syntax'))
    await wrapper.find('.uni-artifact-pane__build').trigger('click')
    await flushPromises()
    expect(wrapper.find('.uni-artifact-pane__error').text()).toContain('uni build 失败')
    // 失败不清场：上次成功的 iframe 还在，人工能对照新旧
    expect(wrapper.find('iframe').exists()).toBe(true)
  })

  it('首次构建就失败：没有 iframe，给引导文案而不是空白', async () => {
    runUniArtifactPreviewSpy.mockRejectedValue(new Error('落盘失败：非法 pageKey'))
    const wrapper = open()
    await flushPromises()
    expect(wrapper.find('iframe').exists()).toBe(false)
    expect(wrapper.find('.uni-artifact-pane__error').text()).toContain('非法 pageKey')
  })

  it('pageKey 为空时直说，不发一次构建', async () => {
    const wrapper = open({ pageKey: '  ' })
    await flushPromises()
    expect(runUniArtifactPreviewSpy).not.toHaveBeenCalled()
    expect(wrapper.find('.uni-artifact-pane__error').text()).toContain('页面标识为空')
  })

  it('构建成功后能看到本次产物源码（右侧源码视图），默认展示页面 SFC', async () => {
    const wrapper = open()
    await flushPromises()
    expect(wrapper.find('.uni-artifact-pane__source').text()).toContain('lc-page')
  })

  it('可出码报告随手可见（发布前核对口径：报告与产物同屏）', async () => {
    const wrapper = open()
    await flushPromises()
    expect(wrapper.find('.uni-artifact-pane__report').text()).toContain('8/8')
  })
})
