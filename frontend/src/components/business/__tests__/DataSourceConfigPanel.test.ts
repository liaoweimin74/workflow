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
  ElTabs: { template: '<div><slot /></div>', props: ['modelValue', 'type'] },
  ElTabPane: { template: '<div><slot /></div>', props: ['label', 'name'] },
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

  it('renders panel with tabs', () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [],
        enabledDataSources: mockDataSources,
      },
    })

    // Check that the component renders
    expect(wrapper.exists()).toBe(true)
    // Check for panel header
    expect(wrapper.text()).toContain('数据源绑定配置')
  })

  it('has correct props interface', () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [],
        enabledDataSources: mockDataSources,
        actions: [],
      },
    })

    const vm = wrapper.vm as any
    expect(vm.localDataSources).toEqual([])
    expect(vm.localActions).toEqual([])
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

    const vm = wrapper.vm as any
    // Trigger validation
    vm.validateAll()
    await wrapper.vm.$nextTick()

    // Should have errors for duplicate
    expect(vm.errors.length).toBe(2)
    expect(vm.errors[0].id).toBe('页面内标识已存在')
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

    const vm = wrapper.vm as any
    // Trigger validation
    vm.validateAll()
    await wrapper.vm.$nextTick()

    // Should have error for empty
    expect(vm.errors.length).toBe(1)
    expect(vm.errors[0].id).toBe('页面内标识不能为空')
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

    const vm = wrapper.vm as any
    // Trigger validation
    vm.validateAll()
    await wrapper.vm.$nextTick()

    // Should have error for missing selection
    expect(vm.errors.length).toBe(1)
    expect(vm.errors[0].refId).toBe('请选择全局数据源')
  })

  it('supports actions prop', async () => {
    const wrapper = mount(DataSourceConfigPanel, {
      props: {
        dataSources: [],
        enabledDataSources: mockDataSources,
        actions: [
          { trigger: 'node-click', steps: [{ op: 'refresh', target: 'ds1' }] },
        ],
      },
    })

    expect(wrapper.emitted('update:actions')).toBeFalsy()
  })
})
