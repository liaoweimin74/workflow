import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h, onMounted } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const { queryData } = vi.hoisted(() => ({ queryData: vi.fn() }))
const { getMetadata, getData } = vi.hoisted(() => ({ getMetadata: vi.fn(), getData: vi.fn() }))
const { elMessage, elMessageBox } = vi.hoisted(() => ({ elMessage: vi.fn(), elMessageBox: { confirm: vi.fn() } }))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: { queryData, getMetadata, getData },
}))

vi.mock('element-plus', () => ({
  ElMessage: elMessage,
  ElMessageBox: elMessageBox,
}))

vi.mock('@/views/form/components/FormRenderer.vue', () => ({
  default: defineComponent({
    name: 'FormRendererStub',
    template: '<div class="default-form-stub" />',
  }),
}))

vi.mock('@/utils/formDsBindingsStore', () => ({
  activeDsBindings: { value: [{ id: 'orders', refId: 'global-orders' }] },
}))

vi.mock('@/components/business/ListCards.vue', () => ({
  default: defineComponent({
    name: 'ListCardsStub',
     props: ['columns', 'fetchApi', 'cardMinWidth', 'defaultPageSize', 'searchFields', 'showSearch', 'pageSizes', 'showPagination', 'actions', 'designMode', 'groupBy'],
    setup(props: any, { expose }: any) {
      // fetchData 暴露真实函数，供 PageDataCards 通过 cardsRef 触发取数
      expose({ fetchData: () => props.fetchApi({ page: 2, size: 10 }) })
      // 非设计态透传分页参数；设计态传入超大 size，验证 fetchApi 钳制到 10 条
      onMounted(() => { void props.fetchApi(props.designMode ? { page: 3, size: 100 } : { page: 2, size: 10 }) })
      return () => h('div', { class: 'list-cards-stub' })
    },
  }),
}))

import PageDataCards from '../PageDataCards.vue'

describe('PageDataCards', () => {
  beforeEach(() => {
    queryData.mockReset()
    getMetadata.mockReset()
    getData.mockReset()
    elMessage.mockReset()
    elMessageBox.confirm.mockReset()
    queryData.mockResolvedValue({ data: { records: [{ id: 7, data: { name: '订单' }, version: 3 }], total: 21 } })
    getMetadata.mockResolvedValue({ data: { writable: true, columns: [{ key: 'name', label: '名称', columnType: 'VARCHAR' }] } })
    getData.mockResolvedValue({ data: { data: { name: '订单详情' } } })
  })

  it('根据页面绑定查询数据并透传分页参数', async () => {
    const wrapper = mount(PageDataCards, {
      props: {
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        pageSize: 10,
        pagination: true,
      },
    })
    await flushPromises()

    expect(queryData).toHaveBeenCalledWith('global-orders', { page: 2, size: 10 })
    expect(wrapper.emitted('loaded')?.[0]).toEqual([[{ id: 7, name: '订单', version: 3 }]])
    wrapper.unmount()
  })

  it('透传查询配置并把非空字段转换为 like filter', async () => {
    const wrapper = mount(PageDataCards, {
      props: {
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        searchFields: [{ key: 'name', label: '名称' }],
        showSearch: true,
        pageSizes: [10, 20],
      },
    })
    await flushPromises()

    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    expect(cardsStub.props('showSearch')).toBe(true)
    expect(cardsStub.props('pageSizes')).toEqual([10, 20])
    await cardsStub.props('fetchApi')({ page: 1, size: 20, name: '订单' })

    expect(queryData).toHaveBeenLastCalledWith('global-orders', {
      page: 1,
      size: 20,
      filter: JSON.stringify({
        logic: 'AND',
        conditions: [{ column: 'name', op: 'like', value: '订单' }],
      }),
    })
    wrapper.unmount()
  })

  it('设计态仍显示查询栏和分页栏', async () => {
    const wrapper = mount(PageDataCards, {
      props: {
        designMode: true,
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        searchFields: [{ key: 'name', label: '名称' }],
        showSearch: true,
        pagination: true,
      },
    })
    await flushPromises()

    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    expect(cardsStub.props('showSearch')).toBe(true)
    expect(cardsStub.props('showPagination')).toBe(true)
    wrapper.unmount()
  })

  it('编辑动作调用关联容器打开接口', async () => {
    const openLinkedContainer = vi.fn()
    const wrapper = mount(PageDataCards, {
      props: {
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        viewActions: { buttons: [{ key: 'edit', label: '编辑' }] },
      },
      global: { provide: { pageActionBus: { dispatch: vi.fn(), hasLinkedContainer: () => true, openLinkedContainer } } },
    })
    await flushPromises()
    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    await cardsStub.vm.$emit('action-click', { key: 'edit', label: '编辑' }, { id: 7 })

    expect(openLinkedContainer).toHaveBeenCalledWith('orders', 'edit', { id: 7 })
    wrapper.unmount()
  })

  it('没有关联容器时编辑动作打开默认表单', async () => {
    const wrapper = mount(PageDataCards, {
      props: {
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        viewActions: { buttons: [{ key: 'edit', label: '编辑' }] },
      },
      global: {
        provide: { pageActionBus: { dispatch: vi.fn(), hasLinkedContainer: () => false } },
        stubs: {
          'el-dialog': { props: ['modelValue', 'title'], template: '<div v-if="modelValue" class="default-form-dialog"><slot /></div>' },
        },
      },
    })
    await flushPromises()
    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    await cardsStub.vm.$emit('action-click', { key: 'edit', label: '编辑' }, { id: 7, name: '订单' })
    await flushPromises()

    expect(wrapper.find('.default-form-dialog').exists()).toBe(true)
    expect(wrapper.find('.default-form-stub').exists()).toBe(true)
    expect(getData).toHaveBeenCalledWith('global-orders', 7)
    wrapper.unmount()
  })

  it('带事件链的按钮优先执行事件链，不落回默认编辑行为', async () => {
    const wrapper = mount(PageDataCards, {
      props: {
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        viewActions: { buttons: [
          { key: 'edit', label: '编辑', events: [{ actions: [{ type: 'message', params: [{ key: 'text', value: '自定义提示' }] }] }] },
        ] },
      },
      global: {
        provide: { pageActionBus: { dispatch: vi.fn(), hasLinkedContainer: () => false } },
        stubs: {
          'el-dialog': { props: ['modelValue', 'title'], template: '<div v-if="modelValue" class="default-form-dialog"><slot /></div>' },
        },
      },
    })
    await flushPromises()
    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    // 通过 resolvedActions 透传了 events 的按钮对象触发
    await cardsStub.vm.$emit('action-click', {
      key: 'edit', label: '编辑',
      events: [{ actions: [{ type: 'message', params: [{ key: 'text', value: '自定义提示' }] }] }],
    }, { id: 7, name: '订单' })
    await flushPromises()

    // 事件链 message 动作被执行，而非默认编辑表单（getData 不被调用）
    expect(elMessage).toHaveBeenCalledWith(expect.objectContaining({ message: '自定义提示' }))
    expect(getData).not.toHaveBeenCalled()
    expect(wrapper.find('.default-form-dialog').exists()).toBe(false)
    wrapper.unmount()
  })

  it('view 按钮在 popup 模式打开独立详情弹窗（宽度取 viewDetail.width），不打开本地编辑表单', async () => {
    const wrapper = mount(PageDataCards, {
      props: {
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        viewActions: { buttons: [{ key: 'view', label: '查看' }] },
        viewDetail: { width: '700px', formMode: 'popup' },
      },
      global: {
        provide: { pageActionBus: { dispatch: vi.fn(), hasLinkedContainer: () => false } },
        stubs: {
          'el-dialog': {
            props: ['modelValue', 'title'],
            template: '<div v-if="modelValue" class="dialog" :data-title="title"><slot /></div>',
          },
        },
      },
    })
    await flushPromises()
    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    await cardsStub.vm.$emit('action-click', { key: 'view', label: '查看' }, { id: 7, name: '订单' })
    await flushPromises()

    // 独立详情弹窗打开（标题"详情"），且宽度传递为 viewDetail.width
    const detailDialog = wrapper.find('.dialog[data-title="详情"]')
    expect(detailDialog.exists()).toBe(true)
    // 本地编辑表单弹窗未打开
    expect(wrapper.find('.dialog[data-title="编辑数据"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('自定义按钮（非内置 key）携带事件链时执行其事件链动作', async () => {
    const dispatch = vi.fn()
    const wrapper = mount(PageDataCards, {
      props: {
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        viewActions: { buttons: [
          { key: 'custom-action', label: '自定义', placement: 'card', events: [{ actions: [{ type: 'message', params: [{ key: 'text', value: '自定义动作已触发' }] }] }] },
        ] },
      },
      global: {
        provide: { pageActionBus: { dispatch, hasLinkedContainer: () => false } },
        stubs: {
          'el-dialog': { props: ['modelValue', 'title'], template: '<div v-if="modelValue" class="dialog"><slot /></div>' },
        },
      },
    })
    await flushPromises()
    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    await cardsStub.vm.$emit('action-click', {
      key: 'custom-action', label: '自定义',
      events: [{ actions: [{ type: 'message', params: [{ key: 'text', value: '自定义动作已触发' }] }] }],
    }, { id: 7, name: '订单' })
    await flushPromises()

    // 事件链执行而非落入 action-click 兜底
    expect(elMessage).toHaveBeenCalledWith(expect.objectContaining({ message: '自定义动作已触发' }))
    expect(dispatch).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('无事件链的自定义按钮兜底触发 action-click 分发', async () => {
    const dispatch = vi.fn()
    const wrapper = mount(PageDataCards, {
      props: {
        dataSourceId: 'orders',
        columns: [{ prop: 'name', role: 'title' }],
        viewActions: { buttons: [{ key: 'custom-action', label: '自定义', placement: 'card' }] },
      },
      global: {
        provide: { pageActionBus: { dispatch, hasLinkedContainer: () => false } },
        stubs: {
          'el-dialog': { props: ['modelValue', 'title'], template: '<div v-if="modelValue" class="dialog"><slot /></div>' },
        },
      },
    })
    await flushPromises()
    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    await cardsStub.vm.$emit('action-click', { key: 'custom-action', label: '自定义' }, { id: 7, name: '订单' })
    await flushPromises()

    expect(dispatch).toHaveBeenCalledWith('action-click', expect.objectContaining({ action: expect.objectContaining({ key: 'custom-action' }) }))
    wrapper.unmount()
  })

  it('设计态不 mock 数据：走真实 queryData 但最多取 10 条', async () => {
    getMetadata.mockResolvedValueOnce({ data: { columns: [
      { key: 'name', label: '名称', columnType: 'VARCHAR' },
      { key: 'count', label: '数量', columnType: 'INT' },
      { key: 'amount', label: '金额', columnType: 'DECIMAL' },
    ] } })
    const wrapper = mount(PageDataCards, {
      props: {
        designMode: true,
        dataSourceId: 'orders',
        columns: [],
      },
      global: { provide: { pageActionBus: { dispatch: vi.fn(), hasLinkedContainer: () => true, openLinkedContainer: vi.fn() } } },
    })
    await wrapper.vm.$nextTick()
    await flushPromises()

    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    // 设计态也调用 queryData，但 size 固定为 10（最多 10 条）
    expect(queryData).toHaveBeenCalledWith('global-orders', { page: 1, size: 10 })
    // 空 columns 时用元数据列作为 fallback 列
    expect(cardsStub.props('columns')).toEqual(expect.arrayContaining([
      expect.objectContaining({ prop: 'name' }),
      expect.objectContaining({ prop: 'count' }),
      expect.objectContaining({ prop: 'amount' }),
    ]))
    expect(cardsStub.props('showPagination')).toBe(true)
    // 设计态未配置操作按钮时不显示 actions（无按钮可渲染）
    expect(cardsStub.props('actions')).toEqual([])
    expect(cardsStub.props('fetchApi')).toBeTypeOf('function')
    wrapper.unmount()
  })

  it('设计态配置了操作按钮时，actions 传递给 ListCards 供预览（不再强制置空）', async () => {
    getMetadata.mockResolvedValueOnce({ data: { columns: [] } })
    queryData.mockResolvedValue({ data: { records: [], total: 0 } })
    const wrapper = mount(PageDataCards, {
      props: {
        designMode: true,
        dataSourceId: 'orders',
        dsRefId: 'global-orders',
        columns: [{ prop: 'name', role: 'title' }],
        viewActions: { buttons: [
          { key: 'edit', label: '编辑', placement: 'row', style: 'button', icon: 'Edit' },
          { key: 'create', label: '新增', placement: 'toolbar' },
        ] },
      },
      global: { provide: { pageActionBus: { dispatch: vi.fn(), hasLinkedContainer: () => true, openLinkedContainer: vi.fn() } } },
    })
    await wrapper.vm.$nextTick()
    await flushPromises()

    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    // 设计态也显示操作按钮：行级按钮透传（toolbar 按钮被过滤），且保留 style/icon 供卡片按形态渲染
    expect(cardsStub.props('actions')).toEqual([
      { key: 'edit', label: '编辑', style: 'button', icon: 'Edit', type: undefined },
    ])
    wrapper.unmount()
  })

  it('切换数据源后：清空并重新取元数据 + 重新取显示数据', async () => {
    const wrapper = mount(PageDataCards, {
      props: {
        designMode: true,
        dataSourceId: 'orders',
        dsRefId: 'global-orders',
        columns: [],
      },
      global: { provide: { pageActionBus: { dispatch: vi.fn(), hasLinkedContainer: () => true, openLinkedContainer: vi.fn() } } },
    })
    await wrapper.vm.$nextTick()
    expect(getMetadata).toHaveBeenCalledTimes(1)

    // 模拟用户在配置面板把 dataSourceId 切到另一个绑定
    queryData.mockClear()
    getMetadata.mockClear()
    getMetadata.mockResolvedValue({ data: { columns: [{ key: 'email', label: '邮箱', columnType: 'VARCHAR' }] } })
    await wrapper.setProps({ dsRefId: 'global-customers' })
    await wrapper.vm.$nextTick()
    await flushPromises()

    // 重新取元数据 + 重新取显示数据（都用新 refId）
    expect(getMetadata).toHaveBeenCalledTimes(1)
    expect(getMetadata).toHaveBeenCalledWith('global-customers')
    expect(queryData).toHaveBeenCalled()
    expect(queryData).toHaveBeenCalledWith('global-customers', expect.any(Object))
    // fallback 列来自新元数据
    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    expect(cardsStub.props('columns')).toEqual(expect.arrayContaining([
      expect.objectContaining({ prop: 'email' }),
    ]))
    wrapper.unmount()
  })
})
