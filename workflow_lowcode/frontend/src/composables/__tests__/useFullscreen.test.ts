import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useFullscreen } from '../useFullscreen'

/**
 * 全屏 composable 行为测试（Task 122 提升为平台级共享后）。
 *
 * jsdom 无 requestFullscreen / fullscreenEnabled 为 undefined → 原生策略不可用，
 * 恰好完整覆盖 CSS fixed 回退路径：进入锁滚动、Esc 退出还原、卸载自愈。
 */

const Host = defineComponent({
  setup() {
    const rootRef = ref<HTMLElement | null>(null)
    const api = useFullscreen(rootRef)
    return { rootRef, api }
  },
  render() {
    return h('div', { ref: 'rootRef' }, 'stage')
  },
})

type FullscreenApi = {
  isFullscreen: { value: boolean }
  isFallback: { value: boolean }
  toggle: () => Promise<void>
}

describe('useFullscreen（CSS fallback 路径）', () => {
  it('进入回退全屏：isFullscreen/isFallback 置位并锁定 body 滚动', async () => {
    const wrapper = mount(Host)
    const vm = wrapper.vm as unknown as { rootRef: HTMLElement; api: FullscreenApi }

    expect(vm.rootRef).toBeTruthy()
    await vm.api.toggle()

    expect(vm.api.isFullscreen.value).toBe(true)
    expect(vm.api.isFallback.value).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    wrapper.unmount()
  })

  it('回退态按 Esc 退出：还原 body 滚动与状态', async () => {
    const wrapper = mount(Host)
    const vm = wrapper.vm as unknown as { api: FullscreenApi }

    await vm.api.toggle()
    expect(vm.api.isFullscreen.value).toBe(true)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(vm.api.isFullscreen.value).toBe(false)
    expect(vm.api.isFallback.value).toBe(false)
    expect(document.body.style.overflow).toBe('')

    wrapper.unmount()
  })

  it('全屏态下卸载组件自愈退出（onBeforeUnmount 还原滚动）', async () => {
    const wrapper = mount(Host)
    const vm = wrapper.vm as unknown as { api: FullscreenApi }

    await vm.api.toggle()
    expect(vm.api.isFullscreen.value).toBe(true)
    expect(document.body.style.overflow).toBe('hidden')

    wrapper.unmount()
    expect(document.body.style.overflow).toBe('')
  })

  it('非全屏态按 Esc 无副作用', () => {
    const wrapper = mount(Host)
    const vm = wrapper.vm as unknown as { api: FullscreenApi }

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(vm.api.isFullscreen.value).toBe(false)

    wrapper.unmount()
  })
})
