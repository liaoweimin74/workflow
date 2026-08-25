import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DataSourceConfigPanel from '../DataSourceConfigPanel.vue'
import type { DataSourceDTO } from '@/api/data-source'

// Mock Element Plus
vi.mock('element-plus', () => ({
  ElInput: { template: '<input />', props: ['modelValue', 'placeholder'] },
  ElSelect: { template: '<select />', props: ['modelValue', 'placeholder', 'filterable'] },
  ElOption: { template: '<option />', props: ['label', 'value'] },
  ElButton: { template: '<button />', props: ['type', 'plain', 'link'] },
  ElEmpty: { template: '<div />', props: ['description', 'imageSize'] },
  ElIcon: { template: '<span />', props: [] },
}))

// Mock icons
vi.mock('@element-plus/icons-vue', () => ({
  Plus: { template: '<span />', name: 'Plus' },
  InfoFilled: { template: '<span />', name: 'InfoFilled' },
}))

describe('DataSourceConfigPanel', () => {
  const mockDataSources: DataSourceDTO[] = [
    { id: 'ds1', tenantId: 't1', name: '用户数据源', type: 'FORM', formKey: 'user', sourceKey: null, params: null, status: 'ENABLED', createdBy: null, createdAt: '', updatedAt: '' },
    { id: 'ds2', tenantId: 't1', name: '订单数据源', type: 'API', formKey: null, sourceKey: 'order', params: null, status: 'ENABLED', createdBy: null, createdAt: '', updatedAt: '' },
  ]

  it('renders empty state when no data sources', () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [],
        enabledDataSources: mockDataSources,
      },
    })

    expect(wrapper.text()).toContain('暂无数据源绑定')
  })

  it('renders existing data source bindings', () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [
          { id: 'myDs', refId: 'ds1' },
        ],
        enabledDataSources: mockDataSources,
      },
    })

    expect(wrapper.text()).toContain('myDs')
  })

  it('emits update:dataSources when adding a binding', async () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [],
        enabledDataSources: mockDataSources,
      },
    })

    // Find and click add button
    const addButton = wrapper.find('button')
    await addButton.trigger('click')

    expect(wrapper.emitted('update:dataSources')).toBeTruthy()
    expect(wrapper.emitted('update:dataSources')![0][0]).toHaveLength(1)
  })

  it('emits update:dataSources when removing a binding', async () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [
          { id: 'myDs', refId: 'ds1' },
        ],
        enabledDataSources: mockDataSources,
      },
    })

    // Find and click delete button
    const deleteButton = wrapper.findAll('button').find(b => b.text() === '删除')
    await deleteButton?.trigger('click')

    expect(wrapper.emitted('update:dataSources')).toBeTruthy()
    expect(wrapper.emitted('update:dataSources')![0][0]).toHaveLength(0)
  })

  it('validates duplicate page identifiers', async () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [
          { id: 'myDs', refId: 'ds1' },
          { id: 'myDs', refId: 'ds2' },
        ],
        enabledDataSources: mockDataSources,
      },
    })

    // Should show error for duplicate
    expect(wrapper.text()).toContain('页面内标识已存在')
  })

  it('validates empty page identifier', async () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [
          { id: '', refId: 'ds1' },
        ],
        enabledDataSources: mockDataSources,
      },
    })

    // Should show error for empty
    expect(wrapper.text()).toContain('页面内标识不能为空')
  })

  it('validates missing global data source selection', async () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [
          { id: 'myDs', refId: '' },
        ],
        enabledDataSources: mockDataSources,
      },
    })

    // Should show error for missing selection
    expect(wrapper.text()).toContain('请选择全局数据源')
  })
})
