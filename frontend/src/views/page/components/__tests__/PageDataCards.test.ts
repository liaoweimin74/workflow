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
    props: ['columns', 'fetchApi', 'cardMinWidth', 'defaultPageSize', 'showPagination', 'actions', 'designMode'],
    setup(props: any, { expose }: any) {
      expose({ fetchData: vi.fn() })
      onMounted(() => { if (!props.designMode) void props.fetchApi({ page: 2, size: 10 }) })
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

  it('设计态只取元数据并生成一条按字段类型映射的 Mock 数据', async () => {
    getMetadata.mockResolvedValueOnce({ data: { columns: [
      { key: 'name', label: '名称', columnType: 'VARCHAR' },
      { key: 'count', label: '数量', columnType: 'INT' },
      { key: 'amount', label: '金额', columnType: 'DECIMAL' },
      { key: 'createdAt', label: '创建时间', columnType: 'DATETIME' },
      { key: 'enabled', label: '启用', columnType: 'BOOLEAN' },
      { key: 'extra', label: '扩展', columnType: 'JSON' },
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
    expect(queryData).not.toHaveBeenCalled()
    expect(cardsStub.props('actions')).toEqual([])
    expect(cardsStub.props('showPagination')).toBe(false)
    expect(cardsStub.props('columns')).toEqual(expect.arrayContaining([
      expect.objectContaining({ prop: 'name' }),
      expect.objectContaining({ prop: 'count' }),
      expect.objectContaining({ prop: 'amount' }),
      expect.objectContaining({ prop: 'createdAt' }),
      expect.objectContaining({ prop: 'enabled' }),
      expect.objectContaining({ prop: 'extra' }),
    ]))
    expect(cardsStub.props('fetchApi')).toBeTypeOf('function')
    wrapper.unmount()
  })
})
