import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DataSourceConfig from '../components/DataSourceConfig.vue'

const stubs = {
  'el-form': { template: '<form><slot /></form>' },
  'el-form-item': { template: '<div><slot /></div>' },
  'el-select': { template: '<div><slot /></div>' },
  'el-option': { template: '<span />' },
  'el-input': { template: '<textarea />' },
  'el-button': { props: ['disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>' },
}

describe('DataSourceConfig', () => {
  it('disables applying an incomplete mapping', () => {
    const wrapper = mount(DataSourceConfig, {
      global: { stubs },
      props: { sources: [{ id: 'ds-1', name: '用户', type: 'SYSTEM' }] },
    })
    expect(wrapper.find('button').attributes('disabled')).toBeDefined()
  })

  it('emits the complete mapping when configuration is valid', async () => {
    const wrapper = mount(DataSourceConfig, {
      global: { stubs },
      props: { modelValue: { dataSourceId: 'ds-1', labelField: 'name', valueField: 'id' }, sources: [] },
    })
    const button = wrapper.find('button')
    await button.trigger('click')
    expect(wrapper.emitted('update:modelValue')).toEqual([[{
      dataSourceId: 'ds-1', labelField: 'name', valueField: 'id', childrenField: '', parentField: '', filters: '',
    }]])
  })
})
