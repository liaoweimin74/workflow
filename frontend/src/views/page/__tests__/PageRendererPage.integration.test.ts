// ----- TDD: 集成测试 - PageRendererPage + 真实 PageDataTable 联动（用户场景复现） -----
// 用户场景：页面 schema 含表格(edit 按钮, dataSourceId=ds_mta77dtz) + 容器(dataSourceId=ds_mta77dtz)
//          + 动作链(trigger=row-edit, source=ds_mta77dtz → open-container)
// 验证：点击操作列"编辑" → 容器弹窗打开（而非内建编辑窗口）
// npx vitest run src/views/page/__tests__/PageRendererPage.integration.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/page', () => ({
  pageApi: { getPageByKey: vi.fn() },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getData: vi.fn(() => Promise.resolve({ data: { id: 'R1', version: 1, data: { name: '张三' } } })),
    updateData: vi.fn(),
    createData: vi.fn(),
    deleteData: vi.fn(),
    getMetadata: vi.fn(() => Promise.resolve({ data: { writable: true, columns: [{ key: 'name', label: '姓名' }] } })),
    queryData: vi.fn(() => Promise.resolve({ data: { records: [{ id: 'R1', version: 1, data: { name: '张三' } }], total: 1 } })),
  },
}))

// 使用真实 normalizeForRender（验证 formContainer→FcRow 转换与 extractLinkageContainers 的交互）
// vi.mock('@/views/form/schemaRules', ...) 故意不 mock

vi.mock('@/utils/scriptSandbox', () => ({
  executeScript: vi.fn(),
  isScriptEventEnabled: () => false,
}))

vi.mock('@/utils/formDsBindingsStore', () => ({
  activeDsBindings: { value: [] },
  setActiveDsBindings: vi.fn(),
}))

// SearchTable 桩：渲染操作列按钮（actionButtons），暴露 openEdit/openFormDialog spy
const openEditSpy = vi.hoisted(() => vi.fn())
vi.mock('@/components/business/SearchTable.vue', () => {
  const SearchTableStub = defineComponent({
    name: 'SearchTableStub',
    props: ['actionButtons', 'toolbarButtons', 'fetchApi', 'columns', 'formConfig', 'showCreateButton', 'mergeDefaultActions'],
    setup(props, { expose }) {
      expose({ openEdit: openEditSpy, openFormDialog: vi.fn(), fetchList: vi.fn() })
      return () =>
        h('div', { class: 'search-table-stub' }, [
          ...(props.actionButtons || []).map((btn: any, i: number) =>
            h('button', {
              key: i,
              class: `stub-col-btn-${i}`,
              onClick: () => btn.onClick({ id: 'R1', name: '张三', version: 1 }),
            }, String(btn.label)),
          ),
        ])
    },
  })
  return { default: SearchTableStub }
})

// form-create 桩：page-table 渲染为真实 PageDataTable（保留其内部 dispatch 链路）
import PageDataTable from '../components/PageDataTable.vue'
vi.mock('@form-create/element-ui', () => {
  const FormCreateStub = defineComponent({
    name: 'FormCreate',
    props: ['modelValue', 'rule', 'option'],
    setup(props) {
      return () =>
        h('div', { class: 'fc-stub' }, [
          ...(props.rule || []).map((node: any, i: number) => {
            if (node?.type === 'page-table') {
              return h(PageDataTable, {
                key: i,
                ...node.props,
                pageKey: node.props?.pageKey,
                viewActions: node.props?.viewActions,
                viewEvents: node.props?.viewEvents,
                onReady: node.on?.['ready'],
              })
            }
            return h('div', { key: i, class: 'fc-node' }, JSON.stringify(node))
          }),
        ])
    },
  })
  ;(FormCreateStub as any).component = vi.fn()
  return { default: FormCreateStub }
})

// 引擎桩
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

const mockRoute = vi.hoisted(() => ({
  params: { pageKey: 'emp_page' },
  query: {} as Record<string, string>,
}))
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn(), resolve: (to: any) => ({ href: `/page/emp_page?${new URLSearchParams(to.query || {}).toString()}` }) }),
}))

import { pageApi } from '@/api/page'
import type { PageDefinitionDetailDTO } from '@/api/page'
import PageRendererPage from '../PageRendererPage.vue'

/** 用户场景页面 schema */
function userPageSchema() {
  return {
    type: 'PAGE',
    rule: [
      {
        type: 'page-table',
        field: 't1',
        title: '数据表格',
        props: {
          dataSourceId: 'ds_mta77dtz',
          columns: [{ prop: 'name', label: '姓名' }],
          viewActions: {
            buttons: [{ key: 'edit', label: '编辑', placement: 'column', style: 'text' }],
          },
        },
      },
      {
        type: 'formContainer',
        field: 'FC1',
        title: '数据容器',
        props: {
          dataSourceId: 'ds_mta77dtz',
          displayMode: 'dialog',
          dialogWidth: '800px',
          rule: [{ type: 'input', field: 'name', title: '姓名' }],
        },
      },
    ],
    dataSources: [{ id: 'ds_mta77dtz', refId: 'global1' }],
    actions: [
      {
        trigger: 'row-edit',
        steps: [{ op: 'open-container', target: 'ds_mta77dtz', displayMode: 'dialog' }],
        source: 'ds_mta77dtz',
      },
    ],
  }
}

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

async function mountPage(schema: any, props: Record<string, unknown> = {}) {
  ;(pageApi.getPageByKey as any).mockResolvedValue({ data: { type: 'PAGE', schema: JSON.stringify(schema) } })
  const wrapper = mount(PageRendererPage, {
    props,
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
  openEditSpy.mockClear()
  engineMocks.length = 0
  mockRoute.query = {}
})

describe('用户场景：表格编辑按钮 → 容器弹窗联动', () => {
  it('点击操作列"编辑" → open-container 打开容器弹窗（不弹内建编辑窗口）', async () => {
    const wrapper = await mountPage(userPageSchema())

    // 操作列编辑按钮（SearchTable 桩渲染）
    const editBtn = wrapper.find('.stub-col-btn-0')
    expect(editBtn.exists()).toBe(true)

    await editBtn.trigger('click')
    await flushPromises()

    // 容器弹窗（class=linkage-container-dialog 的 el-dialog stub）
    const containerDialogs = wrapper.findAll('.dialog-stub.visible')
    expect(containerDialogs.length).toBeGreaterThanOrEqual(1)
    // 内建编辑窗口未打开
    expect(openEditSpy).not.toHaveBeenCalled()
  })

  it('source 不匹配时回退内建编辑窗口（复现诊断路径）', async () => {
    const schema = userPageSchema()
    schema.actions[0].source = 'ds_other' // 来源不匹配
    const wrapper = await mountPage(schema)

    await wrapper.find('.stub-col-btn-0').trigger('click')
    await flushPromises()

    // 容器未打开（无 visible dialog）
    expect(wrapper.findAll('.dialog-stub.visible').length).toBe(0)
    // 回退内建编辑
    expect(openEditSpy).toHaveBeenCalled()
  })
})

describe('definition props 下传（PAGE definition 单次加载）', () => {
  function buildDefinition(schema: unknown): PageDefinitionDetailDTO {
    return {
      id: 'p1',
      name: '用户页',
      key: 'emp_page',
      type: 'PAGE',
      formKey: null,
      dataSourceId: null,
      version: 1,
      status: 'PUBLISHED',
      publishedVersion: 1,
      createdBy: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      schema: JSON.stringify(schema),
    }
  }

  it('传入 definition props 时不发起 getPageByKey 请求，直接渲染 schema', async () => {
    const wrapper = await mountPage(userPageSchema(), { definition: buildDefinition(userPageSchema()) })

    expect(pageApi.getPageByKey).not.toHaveBeenCalled()
    // 渲染成功标志：page-table 操作列按钮（SearchTable 桩渲染）
    expect(wrapper.find('.stub-col-btn-0').exists()).toBe(true)
  })

  it('未传 definition 时回退自行加载（getPageByKey 恰 1 次）', async () => {
    const wrapper = await mountPage(userPageSchema())

    expect(pageApi.getPageByKey).toHaveBeenCalledTimes(1)
    expect(wrapper.find('.stub-col-btn-0').exists()).toBe(true)
  })
})
