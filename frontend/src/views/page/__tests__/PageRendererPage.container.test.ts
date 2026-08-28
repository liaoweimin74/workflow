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
    deleteData: vi.fn(),
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
      saveAll: vi.fn().mockResolvedValue(true),
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

// el-dialog 桩：modelValue 为 true 时渲染标题与默认槽 + footer 槽（按钮区验证用）
const ElDialogStub = defineComponent({
  name: 'ElDialogStub',
  props: ['modelValue', 'title', 'width'],
  setup(props, { slots }) {
    return () =>
      h('div', { class: ['dialog-stub', { visible: !!props.modelValue }] }, [
        h('div', { class: 'dialog-title' }, String(props.title || '')),
        props.modelValue ? slots.default?.() : null,
        props.modelValue ? slots.footer?.() : null,
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

describe('PageRendererPage 容器按钮区', () => {
  /** 构造带按钮覆盖的页面 schema */
  function makeButtonPage(buttonOverrides: Record<string, any>, customButtons: any[] = []) {
    const schema = makePageSchema('dialog')
    const fc = schema.rule.find((r: any) => r.type === 'formContainer')
    Object.assign(fc.props, { showNewButton: true, showCancelButton: true, showConfirmButton: true, showDeleteButton: false, showCopyButton: false, customButtons: [], ...buttonOverrides })
    if (customButtons.length) fc.props.customButtons = customButtons
    return schema
  }

  it('默认渲染新增/取消/确定按钮，不渲染删除/复制', async () => {
    const wrapper = await mountPage(makeButtonPage({}))
    const dialog = wrapper.findComponent(ElDialogStub)
    expect(dialog.exists()).toBe(true)

    // 打开弹窗
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()

    const footer = dialog.find('.container-buttons')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain('新增')
    expect(footer.text()).toContain('取消')
    expect(footer.text()).toContain('确定')
    expect(footer.text()).not.toContain('删除')
    expect(footer.text()).not.toContain('复制')
  })

  it('配置 showDeleteButton 后渲染删除按钮', async () => {
    const wrapper = await mountPage(makeButtonPage({ showDeleteButton: true }))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()

    const footer = wrapper.findComponent(ElDialogStub).find('.container-buttons')
    expect(footer.text()).toContain('删除')
  })

  it('点击取消按钮关闭弹窗', async () => {
    const wrapper = await mountPage(makeButtonPage({}))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent(ElDialogStub)
    expect(dialog.props('modelValue')).toBe(true)

    await dialog.find('.btn-cancel').trigger('click')
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(false)
  })

  it('点击确定按钮 saveAll 引擎并关闭弹窗', async () => {
    const wrapper = await mountPage(makeButtonPage({}))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent(ElDialogStub)
    expect(dialog.props('modelValue')).toBe(true)

    await dialog.find('.btn-confirm').trigger('click')
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(false)
    // 容器引擎 saveAll 被调用（confirm 触发 saveAll，不是 flush）
    const saved = engineMocks.filter((e) => e.saveAll.mock.calls.length > 0)
    expect(saved.length).toBeGreaterThanOrEqual(1)
  })

  it('点击新增按钮清空表单与记录 ID', async () => {
    const wrapper = await mountPage(makeButtonPage({}))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent(ElDialogStub)

    await dialog.find('.btn-new').trigger('click')
    await flushPromises()
    // 弹窗保持打开（新增是清空，非关闭）
    expect(dialog.props('modelValue')).toBe(true)
  })

  it('自定义按钮渲染并点击触发事件链动作（close-container 可观察）', async () => {
    const schema = makeButtonPage({}, [
      { key: 'custom1', label: '自定义操作', actions: [{ op: 'close-container', target: 'dsForm' }] },
    ])
    const wrapper = await mountPage(schema)
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent(ElDialogStub)

    const footer = dialog.find('.container-buttons')
    expect(footer.text()).toContain('自定义操作')

    // 点击自定义按钮 → close-container 动作 → 弹窗关闭
    await footer.find('.btn-custom-custom1').trigger('click')
    await flushPromises()
    expect(dialog.props('modelValue')).toBe(false)
  })

  it('复制按钮调用 createData 创建副本（去除 id/version）', async () => {
    const { dataSourceApi } = await import('@/api/data-source')
    const wrapper = await mountPage(makeButtonPage({ showCopyButton: true }))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent(ElDialogStub)

    await dialog.find('.btn-copy').trigger('click')
    await flushPromises()
    expect(dataSourceApi.createData).toHaveBeenCalled()
  })
})

describe('PageRendererPage 动作 source 来源匹配（多数据源）', () => {
  /** 构造带 source 的动作链：row-click 触发 → 打开 dsForm 容器 */
  function makeSourcePage(source?: string) {
    const schema = makePageSchema('dialog')
    schema.actions = [
      {
        trigger: 'row-click',
        source, // undefined = 全局通配
        steps: [{ op: 'open-container', target: 'dsForm' }],
      },
    ]
    return schema
  }

  it('动作未配置 source（全局）时任意来源触发', async () => {
    const wrapper = await mountPage(makeSourcePage(undefined))
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(ElDialogStub).props('modelValue')).toBe(true)
  })

  it('动作配置 source 且来源匹配时触发', async () => {
    const schema = makeSourcePage('dsTable')
    // 页面 schema 的数据源绑定需包含 dsTable（表格 dataSourceId 来源）
    schema.dataSources = [
      { id: 'dsTable', refId: 'global-table' },
      { id: 'dsForm', refId: 'global-form' },
    ]
    const wrapper = await mountPage(schema)
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(ElDialogStub).props('modelValue')).toBe(true)
  })

  it('动作配置 source 且来源不匹配时不触发（返回未消费）', async () => {
    const schema = makeSourcePage('dsOther') // 表格来源是 dsTable，动作 source 是 dsOther
    schema.dataSources = [
      { id: 'dsTable', refId: 'global-table' },
      { id: 'dsForm', refId: 'global-form' },
    ]
    const wrapper = await mountPage(schema)
    await wrapper.find('.stub-row-click').trigger('click')
    await flushPromises()
    expect(wrapper.findComponent(ElDialogStub).props('modelValue')).toBe(false)
  })
})
