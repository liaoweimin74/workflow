import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive, nextTick } from 'vue'
import TemplatePreview from '../TemplatePreview.vue'

/** form-create 注入对象（与 LookupPicker 相同的取值方式，含响应式 form model） */
function makeInject(values: Record<string, unknown>) {
  return {
    api: {
      getValue: (field: string) => values[field],
      form: { ...values },
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

  it('Markdown 内容（contentType=MARKDOWN）按富文本渲染', () => {
    const wrapper = mount(TemplatePreview, {
      props: {
        source: 'content',
        label: '内容预览',
        formCreateInject: makeInject({
          contentType: 'MARKDOWN',
          content: '# 任务通知\n- 步骤一\n- 步骤二\n\n**重要**',
        }),
      },
    })
    const html = wrapper.html()
    expect(html).toContain('<h1>')
    expect(html).toContain('<strong>')
    expect(html).toContain('<li>')
  })

  it('纯文本内容（contentType=TEXT）不渲染 Markdown 标签', () => {
    const wrapper = mount(TemplatePreview, {
      props: {
        source: 'content',
        label: '内容预览',
        formCreateInject: makeInject({ contentType: 'TEXT', content: '# 不是标题' }),
      },
    })
    // 纯文本模式：原文展示，不生成 <h1> 标签
    expect(wrapper.text()).toContain('# 不是标题')
    expect(wrapper.html()).not.toContain('<h1')
  })

  it('从响应式 form model（api.form）读取字段值（新建未保存时预览实时反映输入）', () => {
    const wrapper = mount(TemplatePreview, {
      props: {
        source: 'content',
        label: '内容预览',
        formCreateInject: makeInject({ contentType: 'TEXT', content: '刚输入的内容' }),
      },
    })
    expect(wrapper.text()).toContain('刚输入的内容')
  })

  it('api.form 为响应式时，字段变化后预览实时更新（不依赖 getValue 快照）', async () => {
    const form = reactive({ contentType: 'TEXT', content: '' })
    const wrapper = mount(TemplatePreview, {
      props: {
        source: 'content',
        label: '内容预览',
        formCreateInject: { api: { getValue: (f: string) => form[f as keyof typeof form], form } },
      },
    })
    // 初始为空 → 占位
    expect(wrapper.text()).toContain('（未填写）')

    // 模拟用户输入内容（form-create 更新响应式 model），轮询同步在 300ms 内反映
    form.content = '刚输入的新内容'
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('刚输入的新内容')
    }, { timeout: 1500, interval: 50 })
  })
})
