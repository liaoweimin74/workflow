import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import StyleRuleTable from '../StyleRuleEditor.vue'

describe('StyleRuleTable', () => {
  it('显示紧凑规则表格且不显示规则名称列', async () => {
    const wrapper = mount(StyleRuleTable, { props: { modelValue: [{ enabled: true, when: '$row.status === \'异常\'', css: 'color: red;', className: '' }], scope: 'card' }, global: { plugins: [ElementPlus] } })
    await nextTick()
    expect(wrapper.text()).toContain('添加条件样式')
    expect(wrapper.text()).not.toContain('规则名称')
    expect(wrapper.text()).not.toContain('启用')
    expect(wrapper.findAllComponents({ name: 'ElTableColumn' })).toHaveLength(4)
  })

  it('添加规则生成启用、空条件、空脚本和空 class', async () => {
    const wrapper = mount(StyleRuleTable, { props: { modelValue: [], scope: 'field' }, global: { plugins: [ElementPlus] } })
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]?.[0]).toEqual([{ enabled: true, when: '', css: '', className: '' }])
  })

  it('条件表格使用三等分内容列和固定操作列', async () => {
    const wrapper = mount(StyleRuleTable, { props: { modelValue: [{ enabled: true, when: 'true', css: 'color:red;', className: '' }], scope: 'card' }, global: { plugins: [ElementPlus] } })
    await nextTick()
    const columns = wrapper.findAllComponents({ name: 'ElTableColumn' })
    expect(columns).toHaveLength(4)
    expect(columns[0].props('width')).toBe('calc((100% - 56px) / 3)')
    expect(columns[1].props('width')).toBe('calc((100% - 56px) / 3)')
    expect(columns[2].props('width')).toBe('calc((100% - 56px) / 3)')
    expect(columns[3].props('width')).toBe('56')
  })
})
