import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import UniDataSourceBinding from '../UniDataSourceBinding.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn().mockResolvedValue({ data: { columns: [] } }),
  },
}))

describe('UniDataSourceBinding 数据源选择', () => {
  it('同一全局数据源名称下显示各自的页面数据源标识', async () => {
    const wrapper = mount(UniDataSourceBinding, {
      props: {
        formDataSources: [
          { id: 'orders-main', refId: 'global-orders', name: '订单数据源' },
          { id: 'orders-archive', refId: 'global-orders', name: '订单数据源' },
        ],
      },
      global: {
        stubs: {
          'el-form': defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
          'el-form-item': defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
          'el-select': defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) }),
          'el-option': defineComponent({ props: ['label', 'value'], setup: (props) => () => h('option', { value: props.value }, props.label) }),
          'el-divider': true,
          'el-tooltip': true,
          'el-icon': true,
          'el-radio-group': true,
          'el-radio-button': true,
          'el-button': true,
          'el-input': true,
        },
      },
    })
    await flushPromises()

    expect(wrapper.findAll('option').map((option) => option.text())).toEqual(['orders-main', 'orders-archive'])
  })
})
