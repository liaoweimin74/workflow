import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TemplatePreview from '../TemplatePreview.vue'

/** form-create 注入对象（与 LookupPicker 相同的取值方式） */
function makeInject(values: Record<string, unknown>) {
  return {
    api: {
      getValue: (field: string) => values[field],
    },
  }
}

describe('TemplatePreview', () => {
  it('未填写时显示占位文本', () => {
    const wrapper = mount(TemplatePreview, {
      props: {
        source: 'title',
        label: '标题预览',
        formCreateInject: makeInject({ title: '' }),
      },
    })
    expect(wrapper.text()).toContain('（未填写）')
  })

  it('读取表单值并展示', () => {
    const wrapper = mount(TemplatePreview, {
      props: {
        source: 'content',
        label: '内容预览',
        formCreateInject: makeInject({ content: '任务已创建' }),
      },
    })
    expect(wrapper.text()).toContain('任务已创建')
  })

  it('英文变量 ${var} 解析为 [var]', () => {
    const wrapper = mount(TemplatePreview, {
      props: {
        source: 'content',
        label: '内容预览',
        formCreateInject: makeInject({ content: '任务 ${taskName} 已创建' }),
      },
    })
    expect(wrapper.text()).toContain('任务 [taskName] 已创建')
  })

  it('中文变量 ${变量名} 解析为 [变量名]', () => {
    const wrapper = mount(TemplatePreview, {
      props: {
        source: 'content',
        label: '内容预览',
        formCreateInject: makeInject({ content: '任务 ${任务名称} 已创建' }),
      },
    })
    expect(wrapper.text()).toContain('任务 [任务名称] 已创建')
  })
})
