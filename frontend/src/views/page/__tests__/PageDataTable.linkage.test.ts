// ----- TDD: PageDataTable 表格-容器联动事件触发（row-edit/row-view/row-create） -----
// npx vitest run src/views/page/__tests__/PageDataTable.linkage.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(() => Promise.resolve({ data: { writable: false, columns: [] } })),
    queryData: vi.fn(),
    getData: vi.fn(),
    updateData: vi.fn(),
    createData: vi.fn(),
    deleteData: vi.fn(),
  },
}))

vi.mock('@/utils/scriptSandbox', () => ({
  executeScript: vi.fn(),
  isScriptEventEnabled: () => false,
}))

// SearchTable 桩：渲染操作列按钮（actionButtons，携带行点击）与工具栏按钮（无行点击），
// expose openEdit/openFormDialog spy（默认行为验证用）
const openEditSpy = vi.hoisted(() => vi.fn())
const openFormDialogSpy = vi.hoisted(() => vi.fn())
vi.mock('@/components/business/SearchTable.vue', () => {
  const SearchTableStub = defineComponent({
    name: 'SearchTableStub',
    props: [
      'actionButtons', 'toolbarButtons', 'fetchApi', 'searchFields', 'columns',
      'formConfig', 'showCreateButton', 'showSearch', 'showPagination', 'deleteConfirm', 'mergeDefaultActions',
    ],
    setup(props, { expose }) {
      expose({ openEdit: openEditSpy, openFormDialog: openFormDialogSpy, fetchList: vi.fn() })
      return () =>
        h('div', { class: 'search-table-stub' }, [
          ...(props.actionButtons || []).map((btn: any, i: number) =>
            h('button', {
              key: `col-${i}`,
              class: `stub-col-btn-${i}`,
              onClick: () => btn.onClick({ id: 'R1', name: '张三' }),
            }, String(btn.label)),
          ),
          ...(props.toolbarButtons || []).map((btn: any, i: number) =>
            h('button', {
              key: `tb-${i}`,
              class: `stub-tb-btn-${i}`,
              onClick: () => btn.onClick(undefined),
            }, String(btn.label)),
          ),
        ])
    },
  })
  return { default: SearchTableStub }
})

/** 页面动作总线 mock（provide 注入；默认返回 false = 无动作链消费） */
const dispatchMock = vi.hoisted(() => vi.fn(() => false))

import PageDataTable from '../components/PageDataTable.vue'

const ROW = { id: 'R1', name: '张三' }

function mountTable(buttons: any[]) {
  return mount(PageDataTable, {
    props: {
      pageKey: 'p1',
      dataSourceId: 'ds1',
      viewActions: { buttons },
    },
    global: {
      plugins: [ElementPlus],
      provide: {
        pageActionBus: { dispatch: dispatchMock, register: vi.fn() },
      },
      stubs: {
        'el-dialog': { props: ['modelValue'], template: '<div class="dlg-stub" />' },
      },
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  dispatchMock.mockImplementation(() => false)
  openEditSpy.mockClear()
  openFormDialogSpy.mockClear()
})

describe('PageDataTable 表格-容器联动事件触发', () => {
  it('点击编辑按钮派发 row-edit 事件（含当前行数据 + 来源 dataSourceId）', async () => {
    const wrapper = mountTable([{ key: 'edit', label: '编辑', placement: 'column' }])
    await wrapper.find('.stub-col-btn-0').trigger('click')
    await flushPromises()

    expect(dispatchMock).toHaveBeenCalledTimes(1)
    const [trigger, payload] = dispatchMock.mock.calls[0]
    expect(trigger).toBe('row-edit')
    expect(payload.row).toEqual(ROW)
    expect(payload.node).toEqual(ROW)
    // 来源 = 表格 dataSourceId（动作 source 匹配依据）
    expect(payload.source).toBe('ds1')
    // 无动作链消费 → 默认行为执行（内置编辑弹窗）
    expect(openEditSpy).toHaveBeenCalledWith(ROW)
  })

  it('动作链消费（dispatch 返回 true）时跳过默认行为', async () => {
    dispatchMock.mockImplementation(() => true)
    const wrapper = mountTable([{ key: 'edit', label: '编辑', placement: 'column' }])
    await wrapper.find('.stub-col-btn-0').trigger('click')
    await flushPromises()

    expect(dispatchMock).toHaveBeenCalledWith('row-edit', expect.anything())
    expect(openEditSpy).not.toHaveBeenCalled()
  })

  it('点击查看按钮派发 row-view 事件（含当前行数据）', async () => {
    const wrapper = mountTable([{ key: 'view', label: '查看', placement: 'column' }])
    await wrapper.find('.stub-col-btn-0').trigger('click')
    await flushPromises()

    const [trigger, payload] = dispatchMock.mock.calls[0]
    expect(trigger).toBe('row-view')
    expect(payload.row).toEqual(ROW)
  })

  it('点击工具栏新增按钮派发 row-create 事件（无行数据）', async () => {
    const wrapper = mountTable([{ key: 'create', label: '新增', placement: 'toolbar' }])
    await wrapper.find('.stub-tb-btn-0').trigger('click')
    await flushPromises()

    const [trigger, payload] = dispatchMock.mock.calls[0]
    expect(trigger).toBe('row-create')
    expect(payload.row).toBeUndefined()
    // 无动作链消费 → 默认行为执行（内置新增弹窗）
    expect(openFormDialogSpy).toHaveBeenCalled()
  })

  it('按钮配置了组件级事件链时不派发页面总线（现有优先级不变）', async () => {
    const wrapper = mountTable([
      { key: 'edit', label: '编辑', placement: 'column', events: [{ actions: [{ type: 'message', params: [] }] }] },
    ])
    await wrapper.find('.stub-col-btn-0').trigger('click')
    await flushPromises()

    expect(dispatchMock).not.toHaveBeenCalled()
    // 组件级事件链优先，默认行为不执行
    expect(openEditSpy).not.toHaveBeenCalled()
  })

  it('行点击派发 row-click 事件（现有行为保持）', async () => {
    const wrapper = mountTable([])
    const table = wrapper.findComponent({ name: 'SearchTableStub' })
    ;(wrapper.vm as any)
    // 通过组件实例调用 handleRowClick（SearchTable 桩未转发 row-click emit，直接调用内部方法）
    // —— 更直接：PageDataTable 监听 @row-click，桩需要 emit。改用 emit 验证：
    table.vm.$emit('row-click', ROW)
    await flushPromises()

    expect(dispatchMock).toHaveBeenCalledWith('row-click', expect.objectContaining({ row: ROW }))
  })
})
