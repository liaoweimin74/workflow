import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import DataSourceConfig from '../components/DataSourceConfig.vue'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getEnabledDataSources: vi.fn().mockResolvedValue({ data: [] }),
    getMetadata: vi.fn().mockResolvedValue({ data: { columns: [] } }),
  },
}))

const stubs = {
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<span />' },
  'el-input': { template: '<textarea />' },
  'el-tabs': { template: '<div><slot /></div>' },
  'el-tab-pane': { props: ['label'], template: '<section><span>{{ label }}</span><slot /></section>' },
  'el-dialog': { props: ['modelValue'], template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>' },
  'el-alert': { template: '<div><slot /></div>' },
  'el-button': { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
}

describe('DataSourceConfig', () => {
  beforeEach(() => vi.clearAllMocks())

  it('opens a dialog with source and field tabs', async () => {
    const wrapper = mount(DataSourceConfig, {
      global: { stubs },
      props: { modelValue: undefined },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('数据源')
    expect(wrapper.text()).toContain('字段配置')
  })

  it('emits the complete mapping when configuration is valid', async () => {
    const wrapper = mount(DataSourceConfig, {
      global: { stubs },
      props: { modelValue: { dataSourceId: 'ds-1', labelField: 'name', valueField: 'id' } },
    })
    await wrapper.find('button').trigger('click')
    const button = wrapper.findAll('button').at(-1)
    if (!button) throw new Error('confirm button missing')
    await button.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[{
      dataSourceId: 'ds-1', labelField: 'name', valueField: 'id',
    }]])
  })
})
