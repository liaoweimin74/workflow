import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import NodePalette from '../NodePalette.vue'

describe('NodePalette — 内嵌子流程入口', () => {
  it('活动组渲染「内嵌子流程」条目', () => {
    const wrapper = mount(NodePalette)
    expect(wrapper.text()).toContain('内嵌子流程')
  })
})