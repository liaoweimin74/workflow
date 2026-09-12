import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MarkdownRenderer from '../MarkdownRenderer.vue'

describe('MarkdownRenderer', () => {
  it('渲染 markdown 文本', () => {
    const wrapper = mount(MarkdownRenderer, { props: { text: '**粗体**' } })

    expect(wrapper.html()).toContain('<strong>粗体</strong>')
  })

  it('点击站内链接 emit navigate', async () => {
    const wrapper = mount(MarkdownRenderer, {
      props: {
        text: '[用户管理](/system/user)',
        pages: [{ path: '/system/user', label: '用户管理' }],
      },
    })

    const anchor = wrapper.find('a[data-nav]')
    expect(anchor.exists()).toBe(true)

    await anchor.trigger('click')

    expect(wrapper.emitted('navigate')?.[0]).toEqual(['/system/user'])
  })
})
