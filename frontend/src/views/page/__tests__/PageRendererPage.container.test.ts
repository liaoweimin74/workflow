// ----- TDD: PageRendererPage 表格-容器联动宿主（displayMode：dialog/newTab/inline） -----
// npx vitest run src/views/page/__tests__/PageRendererPage.container.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/page', () => ({
  pageApi: { getPageByKey: vi.fn() },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getData: vi.fn(),
    updateData: vi.fn(),
    createData: vi.fn(),
    getMetadata: vi.fn(() => Promise.resolve({ data: { writable: true, columns: [] } })),
    queryData: vi.fn(),
  },
}))

vi.mock('@/views/form/schemaRules', () => ({
  normalizeForRender: (rules: any[]) => rules,
}))

// form-create 桩：渲染 rule 节点——page-table 渲染为触发按钮（调用 transformComponent 注入的 on 处理器），
// 其他节点输出 JSON 文本（主树内容验证用）；同时保留 component() 静态方法（注册 page-table/page-tree 用）
vi.mock('@form-create/element-ui', () => {
  const FormCreateStub = defineComponent({
    name: 'FormCreate',
    props: ['modelValue', 'rule', 'option'],
    setup(props) {
      return () =>
        h('div', { class: 'fc-stub' }, [
          ...(props.rule || []).map((node: any, i: number) => {
            if (node?.type === 'page-table' || node?.type === 'page-tree') {
              return h('button', {
                key: i,
                class: 'stub-row-click',
                onClick: () => node.on?.['row-click']?.({ id: 'R1', name: '张三' }),
              }, 'row-click')
            }
            return h('div', { key: i, class: 'fc-node' }, JSON.stringify(node))
          }),
        ])
    },
  })
  ;(FormCreateStub as any).component = vi.fn()
  return { default: FormCreateStub }
})

// 引擎桩：记录每次创建的引擎（页面引擎 + 各联动容器引擎）
const engineMocks: any[] = []
vi.mock('@/views/form/components/DsBindingEngine', () => ({
  createDsBindingEngine: vi.fn((_opts: any, deps: any) => {
    const engine = {
      mount: vi.fn(() => true),
      loadRecord: vi.fn(),
      flush: vi.fn(),
      getLastRecord: vi.fn(),
      _deps: deps,
    }
    engineMocks.push(engine)
    return engine
  }),
}))

// PageDataTable 桩：渲染触发按钮，点击 emit row-click（携带行数据）
// （桩必须在 vi.mock 工厂内定义——工厂会被提升到文件顶部）
vi.mock('../components/PageDataTable.vue', () => {
  const PageDataTableStub = defineComponent({
    name: 'PageDataTableStub',
    props: ['pageKey', 'dataSourceId', 'dsRefId'],
    emits: ['ready', 'row-click', 'loaded'],
    setup(_props, { emit }) {
      return () =>
        h('button', {
          class: 'stub-row-click',
          onClick: () => emit('row-click', { id: 'R1', name: '张三' }),
        }, 'row-click')
    },
  })
  return { default: PageDataTableStub }
})

vi.mock('../components/PageDataTree.vue', () => ({
  default: defineComponent({ name: 'PageDataTreeStub', setup: () => () => h('div') }),
}))

// el-dialog 桩：modelValue 为 true 时渲染标题与默认槽
const ElDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: ['modelValue', 'title', 'width'],
  setup(props, { slots }) {
    return () =>
      h('div', { class: ['dialog-stub', { visible: !!props.modelValue }] }, [
        h('div', { class: 'dialog-title' }, String(props.title || '')),
        props.modelValue ? slots.default?.() : null,
      ])
  },
})

const mockRoute = vi.hoisted(() => ({
  params: { pageKey: 'emp_page' },
  query: {} as Record<string, string>,
}))

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({
    push: vi.fn(),
    resolve: (to: any) => ({ href: `/page/emp_page?${new URLSearchParams(to.query || {}).toString()}` }),
  }),
}))

import { pageApi } from '@/api/page'
import PageRendererPage from '../PageRendererPage.vue'

/** 构造含 formContainer 的页面 schema（displayMode 可配置） */
function makePageSchema(displayMode: string, stepOverrides: Record<string, any> = {}) {
  return {
    type: 'PAGE',
    rule: [
      { type: 'page-table', field: 't1', title: '列表', props: { dataSourceId: 'dsTable' } },
      {
        type: 'formContainer',
        field: 'FC1',
        title: '员工编辑',
        props: {
          dataSourceId: 'dsForm',
          displayMode,
          dialogWidth: '900px',
          dialogHeight: '500px',
          tabTitle: '编辑员工',
          rule: [{ type: 'input', field: 'name', title: '姓名' }],
        },
      },
    ],
    dataSources: [
      { id: 'dsTable', refId: 'global-table' },
      { id: 'dsForm', refId: 'global-form' },
    ],
    actions: [
      {
        trigger: 'row-click',
        steps: [
          { op: 'open-container', target: 'dsForm', ...stepOverrides },
          { op: 'load-record', target: 'dsForm', recordId: '{row.id}', ...stepOverrides },
        ],
      },
    ],
  }
}

/** 挂载页面（getPageByKey 返回指定 schema） */
async function mountPage(schema: any, query: Record<string, string> = {}) {
  mockRoute.query = query
  ;(pageApi.getPageByKey as any).mockResolvedValue({
    data: { type: 'PAGE', schema: JSON.stringify(schema) },
  })
  const wrapper = mount(PageRendererPage, {
    global: {
      plugins: [ElementPlus],
      stubs: {
        'el-dialog': ElDialogStub,
        'el-result': { template: '<div class="result-stub" />' },
        'el-empty': { template: '<div class="empty-stub" />' },
        teleport: true,
      },
    },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  engineMocks.length = 0
  mockRoute.query = {}
})

describe('PageRendererPage 表格-容器联动宿主', () => {
  it('dialog 容器从主渲染树移除，注册为联动容器（主树无 formContainer）', async () => {
    const wrapper = await mountPage(makePageSchema('dialog'))
    const fcStubs = wrapper.findAll('.fc-stub')
    expect(fcStubs.length).toBeGreaterThanOrEqual(1)
    // 主树（第一个 fc-stub）不含 formContainer 节点
    expect(fcStubs[0].text()).not.toContain('formContainer')
  })

  it('inline 容器保留在主渲染树', async () => {
    const wrapper = await mountPage(makePageSchema('inline'))
    const fcStubs = wrapper.findAll('.fc-stub')
    const mainTree = fcStubs[0].text()
    expect(mainTree).toContain('FC1')
    expect(mainTree).toContain('formContainer')
  })

  it('open-container 动作按默认 dialog 模式打开弹窗', async () => {
    const wrapper = await mountPage(makePageSchema('dialog'))
    const dialog = wrapper.findComponent(ElDialogStub)
    expect(dialog.exists()).toBe(true)
    expect(dialog.props('modelValue')).toBe(false)

    // 触发表格行点击 → 动作链执行 → dialog 打开
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(true)
    // dialog 标题使用 tabTitle 配置
    expect(dialog.props('title')).toBe('编辑员工')
    // dialog 宽度使用 dialogWidth 配置
    expect(dialog.props('width')).toBe('900px')
  })

  it('open-container 动作 displayMode 参数覆盖容器默认配置（dialog→inline 不弹窗）', async () => {
    const wrapper = await mountPage(makePageSchema('dialog', { displayMode: 'inline' }))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent(ElDialogStub)
    expect(dialog.props('modelValue')).toBe(false)
  })

  it('load-record 动作将记录 ID 加载到联动容器引擎', async () => {
    const wrapper = await mountPage(makePageSchema('dialog'))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()

    // 存在页面引擎或容器引擎，至少一个 loadRecord 收到 R1
    const loaded = engineMocks.filter((e) => e.loadRecord.mock.calls.some((c: any[]) => c[0] === 'R1'))
    expect(loaded.length).toBeGreaterThanOrEqual(1)
  })

  it('close-container 动作关闭弹窗（open→close 同链执行后关闭）', async () => {
    const schema = makePageSchema('dialog')
    schema.actions = [
      {
        trigger: 'row-click',
        steps: [
          { op: 'open-container', target: 'dsForm' },
          { op: 'close-container', target: 'dsForm' },
        ],
      },
    ]
    const wrapper = await mountPage(schema)
    const dialog = wrapper.findComponent(ElDialogStub)

    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    // open 后立即 close → 最终状态为关闭
    expect(dialog.props('modelValue')).toBe(false)
  })

  it('newTab 模式 open-container 调用 window.open 打开新页签', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation((() => null) as any)
    const wrapper = await mountPage(makePageSchema('newTab'))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()

    expect(openSpy).toHaveBeenCalledTimes(1)
    const url = openSpy.mock.calls[0][0] as string
    expect(url).toContain('container=dsForm')
    openSpy.mockRestore()
  })

  it('页面加载时 query.container 自动打开对应容器（newTab 落地页场景）', async () => {
    const wrapper = await mountPage(makePageSchema('dialog'), {
      container: 'dsForm',
      recordId: 'R100',
    })
    await flushPromises()
    const dialog = wrapper.findComponent(ElDialogStub)
    expect(dialog.props('modelValue')).toBe(true)
    // 自动加载 recordId
    const loaded = engineMocks.filter((e) => e.loadRecord.mock.calls.some((c: any[]) => c[0] === 'R100'))
    expect(loaded.length).toBeGreaterThanOrEqual(1)
  })
})
