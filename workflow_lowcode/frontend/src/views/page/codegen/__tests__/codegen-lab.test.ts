// ----- TDD: 出码验证台（人工验证入口，dev-only 路由 /codegen-lab/:pageKey?）-----
// npx vitest run src/views/page/codegen/__tests__/codegen-lab.test.ts
//
// 这里只验「接线」：schema 从哪来（语料 / 活库）、generatePage 的结果有没有真喂进报告面板与对照
// 面板、换页有没有先把 pageKey 写进地址栏（宿主侧内联渲染的身份来自 route.params.pageKey）。
// 报告怎么算的由 generate-report.test.ts 守，对照面板怎么渲染的由 codegen-compare-pane.test.ts 守。

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

import testPage from './fixtures/test_page.schema.json'

const mockRoute = vi.hoisted(() => ({ params: {} as Record<string, string>, query: {} as Record<string, string> }))
const replace = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRoute: () => mockRoute, useRouter: () => ({ replace }) }))

const getPageByKey = vi.hoisted(() => vi.fn())
vi.mock('@/api/page', () => ({ pageApi: { getPageByKey } }))

// 语料 glob 与磁盘产物 glob 换成可控桩：用例不能依赖 probe/ 当下有什么（生成物，不进 git）
const probe = vi.hoisted(() => ({
  CORPUS_KEYS: ['cardlist_test', 'dashboard'],
  corpusSchemaOf: vi.fn(),
  probeTextsOf: vi.fn(),
  probeComponentOf: vi.fn(),
  // 真口径在 probe-index.test.ts 里守；这里给同语义桩，好把「磁盘与本次生成不同」造出来
  mismatchedFiles: vi.fn((generated: Record<string, string>, disk: Record<string, string | undefined>) =>
    Object.keys(generated).filter((n) => disk[n] !== generated[n]),
  ),
}))
vi.mock('../probe-index', () => probe)

// 落盘通道：真实现要 vite dev 中间件，这里只验「按钮把本次生成的 files 原样交出去、成了就重读磁盘」
const sink = vi.hoisted(() => ({ writeProbeFiles: vi.fn() }))
vi.mock('../codegen-run', () => sink)

vi.mock('../CodegenReportPanel.vue', () => ({
  default: defineComponent({
    name: 'CodegenReportPanel',
    props: { report: { type: Object, required: true } },
    setup: () => () => h('div', { class: 'panel-stub' }),
  }),
}))

vi.mock('../CodegenComparePane.vue', () => ({
  default: defineComponent({
    name: 'CodegenComparePane',
    props: { pageKey: String, definition: Object, artifact: Object, mismatch: Array, revision: Number },
    setup: () => () => h('div', { class: 'pane-stub' }),
  }),
}))

import CodegenLabPage from '../CodegenLabPage.vue'

const panel = (wrapper: any) => wrapper.findComponent({ name: 'CodegenReportPanel' })
const pane = (wrapper: any) => wrapper.findComponent({ name: 'CodegenComparePane' })

beforeEach(() => {
  vi.clearAllMocks()
  probe.corpusSchemaOf.mockImplementation((key: string) =>
    key === 'cardlist_test' ? structuredClone(testPage) : undefined,
  )
  probe.probeTextsOf.mockImplementation(async (names: string[]) =>
    Object.fromEntries(names.map((n) => [n, 'DISK_TEXT'])),
  )
  probe.probeComponentOf.mockImplementation(async () =>
    defineComponent({ name: 'ProbeArtifact', setup: () => () => h('div', { class: 'artifact-stub' }) }),
  )
  probe.mismatchedFiles.mockImplementation(
    (generated: Record<string, string>, disk: Record<string, string | undefined>) =>
      Object.keys(generated).filter((n) => disk[n] !== generated[n]),
  )
})

async function open(params: Record<string, string> = { pageKey: 'cardlist_test' }, query: Record<string, string> = {}) {
  mockRoute.params = params
  mockRoute.query = query
  const wrapper = mount(CodegenLabPage, { global: { plugins: [ElementPlus] } })
  await vi.waitFor(() => expect(panel(wrapper).exists()).toBe(true), { timeout: 5000 })
  await flushPromises()
  return wrapper
}

describe('CodegenLabPage — 取定义与出报告', () => {
  it('语料来源：挂载即按地址栏 pageKey 生成，报告与对照面板拿到同一份结果', async () => {
    const wrapper = await open()
    expect(probe.corpusSchemaOf).toHaveBeenCalledWith('cardlist_test')

    const report = panel(wrapper).props('report') as any
    expect(report.pageKey).toBe('cardlist_test')
    expect(report.codegenRate.totalNodes, '报告是空的：生成器没真跑起来').toBeGreaterThan(0)

    const props = pane(wrapper).props() as any
    expect(props.pageKey).toBe('cardlist_test')
    expect(props.definition.pageKey).toBe('cardlist_test')
    expect(props.definition.type).toBe('PAGE')
    expect(props.artifact).toBeTruthy()
  })

  it('磁盘产物与本次生成不同：差异文件名必须交给对照面板去警示，不能悄悄比旧货', async () => {
    const wrapper = await open()
    const names = probe.probeTextsOf.mock.calls[0][0] as string[]
    expect(names.length, '本次生成一个文件都没出').toBeGreaterThan(0)
    const mismatch = pane(wrapper).props('mismatch') as string[]
    // 桩里磁盘内容一律不同 → 本次生成的每个文件都该被点名
    expect([...mismatch].sort()).toEqual([...names].sort())
  })

  it('活库来源按 preview=true 取最新定义（与 /page/<key>?preview=true 同口径）', async () => {
    getPageByKey.mockResolvedValue({
      data: { key: 'cardlist_test', name: '订单卡片页', type: 'PAGE', schema: JSON.stringify(structuredClone(testPage)) },
    })
    const wrapper = await open({ pageKey: 'cardlist_test' }, { source: 'live' })

    expect(getPageByKey).toHaveBeenCalledWith('cardlist_test', true)
    const props = pane(wrapper).props() as any
    expect(props.definition.name, '宿主侧用的不是接口那份定义').toBe('订单卡片页')
    expect((panel(wrapper).props('report') as any).pageKey).toBe('cardlist_test')
  })

  it('语料里没有这个 pageKey：说清楚，不出空白面板', async () => {
    mockRoute.params = { pageKey: 'no_such_page' }
    mockRoute.query = {}
    const wrapper = mount(CodegenLabPage, { global: { plugins: [ElementPlus] } })
    await vi.waitFor(() => expect(wrapper.find('.codegen-lab__error').exists()).toBe(true))
    expect(wrapper.text()).toContain('no_such_page')
    expect(panel(wrapper).exists()).toBe(false)
  })
})

describe('CodegenLabPage — 换页与出口', () => {
  it('换页先把 pageKey 写进地址栏：宿主侧内联渲染的身份来自 route.params', async () => {
    const wrapper = await open()
    await wrapper.find('.codegen-lab__picker').setValue('dashboard')
    await vi.waitFor(() => expect(replace).toHaveBeenCalled())
    expect(String(replace.mock.calls[0][0])).toContain('/codegen-lab/dashboard')
    await vi.waitFor(() => expect(probe.corpusSchemaOf).toHaveBeenCalledWith('dashboard'))
  })

  it('产物源码就在页面上：文件列表来自本次生成，切换文件换正文', async () => {
    const wrapper = await open()
    const options = wrapper.findAll('.codegen-lab__file').map((o) => o.text())
    expect(options.some((n) => n.endsWith('.vue')), `文件列表没出 vue 产物：${options.join(', ')}`).toBe(true)
    const vueText = wrapper.find('.codegen-lab__source').text()
    expect(vueText).toContain('<template')

    const other = options.find((n) => !n.endsWith('.vue'))
    if (other) {
      await wrapper.find('.codegen-lab__file-picker').setValue(other)
      expect(wrapper.find('.codegen-lab__source').text()).not.toEqual(vueText)
    }
  })

  it('重新生成要连着换掉宿主侧的挂载令牌（definition 变了 PageRendererPage 不会自己重读）', async () => {
    const wrapper = await open()
    const first = pane(wrapper).props('revision') as number
    await wrapper.find('.codegen-lab__regen').trigger('click')
    await vi.waitFor(() => expect(pane(wrapper).props('revision')).toBe(first + 1))
  })

  it('两条真机路由的入口挂在工具条上（要看全屏表现跳出去）', async () => {
    const wrapper = await open()
    expect(wrapper.find('.codegen-lab__link-host').attributes('href')).toContain('/page/cardlist_test?preview=true')
    expect(wrapper.find('.codegen-lab__link-artifact').attributes('href')).toContain('/codegen-probe/cardlist_test')
  })
})

describe('CodegenLabPage — 落盘产物（把命令行那一步做成按钮）', () => {
  /** 桩成中间件的行为：收下文件后，磁盘读出来的就是这份 */
  function sinkWritesToDisk() {
    sink.writeProbeFiles.mockImplementation(async (_key: string, files: Record<string, string>) => {
      probe.probeTextsOf.mockImplementation(async (names: string[]) =>
        Object.fromEntries(names.map((n) => [n, files[n]])),
      )
      return Object.keys(files)
    })
  }

  it('点落盘：交出去的就是本次生成的 files，成功后重读磁盘、差异清零', async () => {
    sinkWritesToDisk()
    const wrapper = await open()
    const openedComponentCalls = probe.probeComponentOf.mock.calls.length
    // 桩里磁盘是假文本 → 落盘前必然报不一致
    expect((pane(wrapper).props('mismatch') as string[]).length).toBeGreaterThan(0)

    await wrapper.find('.codegen-lab__write').trigger('click')
    await vi.waitFor(() => expect(pane(wrapper).props('mismatch')).toEqual([]))

    const [key, files] = sink.writeProbeFiles.mock.calls[0] as [string, Record<string, string>]
    expect(key).toBe('cardlist_test')
    expect(Object.keys(files).some((n) => n.endsWith('.vue'))).toBe(true)
    const vueName = Object.keys(files).find((n) => n.endsWith('.vue'))!
    expect(files[vueName]).toContain('<template')
    // 落盘后产物组件也要重挂：glob 里刚出现的文件不重读就还是空的
    expect(probe.probeComponentOf.mock.calls.length).toBeGreaterThan(openedComponentCalls)
  })

  it('落盘失败：把中间件给的归因显示出来，不能假装已一致', async () => {
    sink.writeProbeFiles.mockRejectedValue(new Error('出码落盘失败（HTTP 403）：只接受同源请求'))
    const wrapper = await open()
    const before = pane(wrapper).props('mismatch') as string[]

    await wrapper.find('.codegen-lab__write').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('.codegen-lab__write-error').exists()).toBe(true))

    expect(wrapper.find('.codegen-lab__write-error').text()).toContain('只接受同源请求')
    expect(pane(wrapper).props('mismatch')).toEqual(before)
  })
})
