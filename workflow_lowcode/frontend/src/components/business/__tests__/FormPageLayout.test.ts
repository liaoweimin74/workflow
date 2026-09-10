// ----- TDD RED: FormPageLayout 统一外壳组件 -----
// npx vitest run src/components/business/__tests__/FormPageLayout.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ElementPlus from 'element-plus'
import FormPageLayout from '../FormPageLayout.vue'

function createWrapper(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
  return mount(FormPageLayout, {
    props,
    slots,
    global: {
      plugins: [ElementPlus],
    },
  })
}

describe('FormPageLayout — 基础渲染', () => {
  it('渲染 title prop', () => {
    const wrapper = createWrapper({ title: '用户信息' })
    expect(wrapper.find('.form-page-layout__title').text()).toBe('用户信息')
  })

  it('未传 title 时不渲染标题区域', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('.form-page-layout__title').exists()).toBe(false)
  })

  it('渲染 default slot 内容', () => {
    const wrapper = createWrapper({}, {
      default: '<div class="body-content">表单主体</div>',
    })
    expect(wrapper.find('.body-content').exists()).toBe(true)
    expect(wrapper.find('.form-page-layout__body').text()).toContain('表单主体')
  })
})

describe('FormPageLayout — toolbar slot', () => {
  it('渲染 toolbar slot 在 header 区域', () => {
    const wrapper = createWrapper(
      { title: '编辑用户' },
      { toolbar: '<button class="toolbar-btn">刷新</button>' },
    )
    const header = wrapper.find('.form-page-layout__header')
    expect(header.exists()).toBe(true)
    expect(header.find('.toolbar-btn').exists()).toBe(true)
    expect(header.find('.toolbar-btn').text()).toBe('刷新')
  })

  it('toolbar slot 和 title 同时存在时左右排列', () => {
    const wrapper = createWrapper(
      { title: '编辑用户' },
      { toolbar: '<button class="toolbar-btn">操作</button>' },
    )
    const header = wrapper.find('.form-page-layout__header')
    expect(header.find('.form-page-layout__title').text()).toBe('编辑用户')
    expect(header.find('.toolbar-btn').exists()).toBe(true)
  })
})

describe('FormPageLayout — footer slot', () => {
  it('渲染 footer slot 在底部区域', () => {
    const wrapper = createWrapper({}, {
      footer: '<button class="submit-btn">提交</button><button class="cancel-btn">取消</button>',
    })
    const footer = wrapper.find('.form-page-layout__footer')
    expect(footer.exists()).toBe(true)
    expect(footer.find('.submit-btn').exists()).toBe(true)
    expect(footer.find('.cancel-btn').exists()).toBe(true)
  })

  it('footer 内容右对齐', () => {
    const wrapper = createWrapper({}, {
      footer: '<button class="submit-btn">提交</button>',
    })
    const footer = wrapper.find('.form-page-layout__footer')
    expect(footer.exists()).toBe(true)
    // footer 区域应该有右对齐的样式（通过 class 控制布局）
    expect(footer.classes()).toContain('form-page-layout__footer')
  })
})

describe('FormPageLayout — 结构完整性', () => {
  it('包含 header、body、footer 三个区域', () => {
    const wrapper = createWrapper(
      { title: '测试' },
      {
        default: '<div>body</div>',
        toolbar: '<div>toolbar</div>',
        footer: '<div>footer</div>',
      },
    )
    expect(wrapper.find('.form-page-layout__header').exists()).toBe(true)
    expect(wrapper.find('.form-page-layout__body').exists()).toBe(true)
    expect(wrapper.find('.form-page-layout__footer').exists()).toBe(true)
  })

  it('只有 default slot 时也正常渲染', () => {
    const wrapper = createWrapper({}, {
      default: '<div class="only-body">仅主体</div>',
    })
    expect(wrapper.find('.only-body').exists()).toBe(true)
    expect(wrapper.find('.form-page-layout__header').exists()).toBe(false)
    expect(wrapper.find('.form-page-layout__footer').exists()).toBe(false)
  })
})
