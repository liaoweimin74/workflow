import { describe, expect, it, vi, beforeEach } from 'vitest'
import { defineComponent, h, onMounted } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'

const { queryData } = vi.hoisted(() => ({ queryData: vi.fn() }))
const { getMetadata, getData } = vi.hoisted(() => ({ getMetadata: vi.fn(), getData: vi.fn() }))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: { queryData, getMetadata, getData },
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
    props: ['columns', 'fetchApi', 'cardMinWidth', 'defaultPageSize', 'showPagination', 'actions', 'designMode', 'groupBy'],
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
    expect(cardsStub.props('showPagination')).toBe(false)
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
          { key: 'edit', label: '编辑', placement: 'row' },
          { key: 'create', label: '新增', placement: 'toolbar' },
        ] },
      },
      global: { provide: { pageActionBus: { dispatch: vi.fn(), hasLinkedContainer: () => true, openLinkedContainer: vi.fn() } } },
    })
    await wrapper.vm.$nextTick()
    await flushPromises()

    const cardsStub = wrapper.findComponent({ name: 'ListCardsStub' })
    // 设计态也显示操作按钮：行级按钮透传（toolbar 按钮被过滤）
    expect(cardsStub.props('actions')).toEqual([{ key: 'edit', label: '编辑' }])
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
