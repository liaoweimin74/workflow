// ----- externalActions：出码产物接管按钮语义，组件不再走总线/本地兜底表单 -----
// 真机探测查出：产物里的容器 el-dialog 没有任何调用入口，点"编辑"弹的是组件自己的
// 兜底表单（rule 来自数据源业务表单，不是页面配的容器）。
// npx vitest run src/views/page/components/__tests__/externalActions.test.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const { queryData, getMetadata, getData } = vi.hoisted(() => ({
  queryData: vi.fn(),
  getMetadata: vi.fn(),
  getData: vi.fn(),
}))
const { getFormDefinitionByKey } = vi.hoisted(() => ({ getFormDefinitionByKey: vi.fn() }))
// popup 模式下表格的兜底表单由 SearchTable 自己弹，所以拿它当"组件仍在自己处理"的证据
const { openEdit, openFormDialog } = vi.hoisted(() => ({
  openEdit: vi.fn(),
  openFormDialog: vi.fn(),
}))

vi.mock('@/api/data-source', () => ({ dataSourceApi: { queryData, getMetadata, getData } }))
vi.mock('@/api/form', () => ({ formApi: { getFormDefinitionByKey } }))
vi.mock('element-plus', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, ElMessage: vi.fn(), ElMessageBox: { confirm: vi.fn() } }
})
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, params: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/utils/formDsBindingsStore', () => ({ activeDsBindings: { value: [] } }))
vi.mock('@/views/form/components/FormRenderer.vue', () => ({
  default: defineComponent({ name: 'FormRendererStub', template: '<div class="form-stub" />' }),
}))
vi.mock('@/components/business/SearchTable.vue', () => ({
  default: defineComponent({
    name: 'SearchTableStub',
    setup(_, { expose }) {
      expose({ fetchList: vi.fn(), clearSelection: vi.fn(), openEdit, openFormDialog })
      return () => h('div', { class: 'search-table-stub' })
    },
  }),
}))
// 卡片子组件只当事件源：真机点按钮时 ListCards 派的就是 action-click
vi.mock('@/components/business/ListCards.vue', () => ({
  default: defineComponent({
    name: 'ListCardsStub',
    props: ['fetchApi'],
    emits: ['action-click'],
    setup(_, { emit, expose }) {
      expose({ refresh: vi.fn(), fetchData: vi.fn() })
      return () => {
        void 0
        return h('div', {
          class: 'list-cards-stub',
          onClick: () => emit('action-click', { key: 'edit', label: '编辑' }, { id: 'r1' }),
        })
      }
    },
  }),
}))

import PageDataCards from '../PageDataCards.vue'
import PageDataTable from '../PageDataTable.vue'

const VIEW_ACTIONS = { buttons: [{ key: 'edit', label: '编辑', placement: 'column' }] }

function mountCards(props: Record<string, unknown> = {}) {
  return mount(PageDataCards, {
    props: { dsRefId: 'ds-1', viewActions: VIEW_ACTIONS, ...props },
    global: { provide: { pageActionBus: { dispatch: vi.fn(() => false), hasLinkedContainer: () => false } } },
  })
}

function mountTable(props: Record<string, unknown> = {}) {
  return mount(PageDataTable, {
    props: { pageKey: 'p1', dsRefId: 'ds-1', viewActions: VIEW_ACTIONS, ...props },
    global: { provide: { pageActionBus: { dispatch: vi.fn(() => false), hasLinkedContainer: () => false } } },
  })
}

const editClick = (wrapper: ReturnType<typeof mountTable>) =>
  (wrapper.vm as any).handleActionClick({ key: 'edit', label: '编辑' }, { id: 'r1' })

describe('externalActions 出口', () => {
  // SearchTable 的弹窗方法是模块级 spy，跨用例累加会让"没弹兜底表单"的断言假绿
  beforeEach(() => {
    openEdit.mockClear()
    openFormDialog.mockClear()
    getData.mockReset()
  })

  it('卡片：为真时按钮只 emit，不碰总线也不弹本地兜底表单', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    const wrapper = mountCards({ externalActions: true })
    await flushPromises()
    editClick(wrapper)
    await flushPromises()

    expect(wrapper.emitted('button-click'), '产物靠这条事件打开自己的容器').toEqual([
      [{ key: 'edit', label: '编辑', row: { id: 'r1' } }],
    ])
    expect((wrapper.vm as any).localFormVisible).toBe(false)
    expect((wrapper.vm as any).detailVisible).toBe(false)
  })

  it('卡片：不传时行为一字不变（现网仍走本地兜底表单，零回归）', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    getData.mockResolvedValue({ data: { data: { id: 'r1', name: 'x' } } })
    getFormDefinitionByKey.mockResolvedValue({ data: { schema: '{"rule":[]}' } })
    const wrapper = mountCards()
    await flushPromises()
    editClick(wrapper)
    await flushPromises()

    expect(wrapper.emitted('button-click')).toBeUndefined()
    expect((wrapper.vm as any).localFormVisible).toBe(true)
  })

  it('表格：为真时只 emit，事件链也不再在组件内跑', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    const wrapper = mountTable({ externalActions: true })
    await flushPromises()
    const dispatch = (wrapper.vm.$.provides as any).pageActionBus.dispatch
    editClick(wrapper)
    await flushPromises()

    expect(wrapper.emitted('button-click')).toEqual([[{ key: 'edit', label: '编辑', row: { id: 'r1' } }]])
    expect(dispatch).not.toHaveBeenCalled()
    expect(openEdit).not.toHaveBeenCalled()
  })

  it('表格：不传时仍走原路径，不 emit', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    getData.mockResolvedValue({ data: { data: { id: 'r1' } } })
    getFormDefinitionByKey.mockResolvedValue({ data: { schema: '{"rule":[]}' } })
    const wrapper = mountTable()
    await flushPromises()
    editClick(wrapper)
    await flushPromises()

    expect(wrapper.emitted('button-click')).toBeUndefined()
    expect(openEdit).toHaveBeenCalledWith({ id: 'r1' })
  })
})
