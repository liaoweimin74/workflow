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
const { openEdit, openFormDialog, setQuery, sortFn } = vi.hoisted(() => ({
  openEdit: vi.fn(),
  openFormDialog: vi.fn(),
  // 动作链的 set-page / set-sort 走这两个内部方法：产物要调就得先经 PageDataTable 暴露
  setQuery: vi.fn(),
  sortFn: vi.fn(),
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
      expose({ fetchList: vi.fn(), clearSelection: vi.fn(), openEdit, openFormDialog, setQuery, sort: sortFn })
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
// 顶部把 element-plus mock 成了 spy：链动作 type=message 的执行证据就落在这个 ElMessage 上
import { ElMessage } from 'element-plus'

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

// ==================== 阶段 4：列链 / 组件链的产物出口 ====================
// 接管语义只有一条：externalActions 为真时，事件在组件里“到此为止”——只 emit，
// 既不再自跑 viewEvents/列链，也不再派页面总线。产物侧那份 handler 是唯一执行者。
describe('列链 / 组件链出口（P2 阶段 4）', () => {
  const msgAction = (text: string) => ({
    type: 'message',
    params: [
      { key: 'text', value: text },
      { key: 'type', value: 'info' },
    ],
  })
  const columns = [{ prop: 'name', label: '名称', onCellClick: { actions: [msgAction('列链')] } }]
  const viewEvents = [
    { trigger: 'row-click', target: 'table', actions: [msgAction('行链')] },
    { trigger: 'cell-click', target: 'table', actions: [msgAction('格链')] },
    { trigger: 'selection-change', target: 'table', actions: [msgAction('选链')] },
    { trigger: 'sort-change', target: 'table', actions: [msgAction('排链')] },
  ]

  const mountChained = (externalActions: boolean) => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    return mountTable({ externalActions, columns, viewEvents })
  }

  beforeEach(() => {
    ElMessage.mockClear()
    getData.mockReset()
  })

  it('表格：接管模式下列点击只 emit，列链与组件链都不在组件里跑', async () => {
    const wrapper = await mountChained(true)
    await flushPromises()
    const dispatch = (wrapper.vm.$.provides as any).pageActionBus.dispatch
    ;(wrapper.vm as any).handleCellClick({ id: 'r1' }, { property: 'name' })
    await flushPromises()

    expect(wrapper.emitted('cell-click')).toEqual([[{ id: 'r1' }, { property: 'name' }]])
    expect(ElMessage, '列链在组件里跑过一遍、产物再跑一遍＝双执行').not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('表格：不传接管时列链照旧在组件里跑一次（现网零回归）', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    const wrapper = mountTable({ columns, viewEvents })
    await flushPromises()
    ;(wrapper.vm as any).handleCellClick({ id: 'r1' }, { property: 'name' })
    await flushPromises()

    expect(ElMessage).toHaveBeenCalledTimes(1)
    expect((ElMessage.mock.calls[0] as any[])[0]).toMatchObject({ message: '列链' })
  })

  it('表格：接管模式下行点击只 emit，不派总线也不跑 viewEvents', async () => {
    const wrapper = await mountChained(true)
    await flushPromises()
    const dispatch = (wrapper.vm.$.provides as any).pageActionBus.dispatch
    ;(wrapper.vm as any).handleRowClick({ id: 'r1' })
    await flushPromises()

    expect(wrapper.emitted('row-click')).toEqual([[{ id: 'r1' }]])
    expect(dispatch).not.toHaveBeenCalled()
    expect(ElMessage).not.toHaveBeenCalled()
  })

  it('表格：不传接管时行点击仍派总线 + 跑组件链（现网零回归）', async () => {
    const wrapper = await mountChained(false)
    await flushPromises()
    const dispatch = (wrapper.vm.$.provides as any).pageActionBus.dispatch
    ;(wrapper.vm as any).handleRowClick({ id: 'r1' })
    await flushPromises()

    expect(dispatch).toHaveBeenCalledWith('row-click', { node: { id: 'r1' }, row: { id: 'r1' }, source: undefined })
    expect(ElMessage).toHaveBeenCalledTimes(1)
    expect((ElMessage.mock.calls[0] as any[])[0]).toMatchObject({ message: '行链' })
  })

  it('表格：接管模式下 selection-change / sort-change 只 emit', async () => {
    const wrapper = await mountChained(true)
    await flushPromises()
    ;(wrapper.vm as any).handleSelectionChange([{ id: 'r1' }])
    ;(wrapper.vm as any).handleSortChange({ column: { property: 'name' }, prop: 'name', order: 'ascending' })
    await flushPromises()

    expect(wrapper.emitted('selection-change')).toEqual([[[{ id: 'r1' }]]])
    expect(wrapper.emitted('sort-change')).toEqual([[{ prop: 'name', order: 'ascending' }]])
    expect(ElMessage).not.toHaveBeenCalled()
  })

  it('卡片：接管模式下行点击不再派总线', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    const wrapper = mountCards({ externalActions: true })
    await flushPromises()
    const dispatch = (wrapper.vm.$.provides as any).pageActionBus.dispatch
    ;(wrapper.vm as any).handleRowClick({ id: 'r1' })
    await flushPromises()

    expect(wrapper.emitted('row-click')).toEqual([[{ id: 'r1' }]])
    expect(dispatch, '产物自己处理 row-click，组件再派一次就是双执行').not.toHaveBeenCalled()
  })

  it('卡片：不传接管时行点击仍派总线（现网零回归）', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    const wrapper = mountCards()
    await flushPromises()
    const dispatch = (wrapper.vm.$.provides as any).pageActionBus.dispatch
    ;(wrapper.vm as any).handleRowClick({ id: 'r1' })
    await flushPromises()

    expect(dispatch).toHaveBeenCalledWith('row-click', { node: { id: 'r1' }, row: { id: 'r1' }, source: undefined })
  })
})

// ==================== 产物链动作要调的暴露方法（契约面核对）====================
// 产物走的是模板上的 ref（listRef.value?.xxx），只吃 defineExpose；script setup 的
// 其余 setup 绑定在测试里也能从 vm 上摸到，所以断言必须落在内部实例的 exposed 上。
describe('链动作要的暴露面', () => {
  const exposedOf = (wrapper: ReturnType<typeof mountTable>) =>
    ((wrapper.vm.$ as unknown as { exposed?: Record<string, unknown> | null }).exposed ?? {}) as Record<
      string,
      unknown
    >

  it('表格：链动作能调的方法确实在 defineExpose 上（契约表据此判定可否生成）', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    const wrapper = mountTable()
    await flushPromises()
    const exposed = exposedOf(wrapper)
    for (const m of ['refresh', 'setFilter', 'resetFilter', 'setPage', 'setSort', 'clearSelection']) {
      expect(typeof exposed[m], m).toBe('function')
    }
    expect('records' in exposed, 'export 动作要取当前行数据').toBe(true)
  })

  it('表格：setPage / setSort 转给内部 SearchTable，与链动作 set-page / set-sort 同义', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    const wrapper = mountTable()
    await flushPromises()
    const exposed = exposedOf(wrapper) as Record<string, (...a: any[]) => void>
    exposed.setPage(3)
    exposed.setSort('name', 'descending')
    await flushPromises()

    expect(setQuery).toHaveBeenCalledWith({ page: 3 }, false)
    expect(sortFn).toHaveBeenCalledWith('name', 'descending')
  })

  it('卡片：没有 defineExpose（链动作落到卡片只能记 unsupported，不出假接线）', async () => {
    getMetadata.mockResolvedValue({ data: { columns: [], writable: true } })
    queryData.mockResolvedValue({ data: { records: [{ id: 'r1' }], total: 1 } })
    const wrapper = mountCards()
    await flushPromises()

    // Vue 给没调用 expose() 的组件留的是带 __v_skip 标记的空壳，成员名才算数
    const exposed = (wrapper.vm.$ as unknown as { exposed?: Record<string, unknown> }).exposed ?? {}
    expect(
      Object.keys(exposed).filter((k) => k !== '__v_skip'),
      '契约 expose=none 的依据：卡片没有 defineExpose，产物拿不到实例方法',
    ).toEqual([])
  })
})
