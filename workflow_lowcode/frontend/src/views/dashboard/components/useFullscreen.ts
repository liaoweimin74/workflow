/**
 * 组件级全屏 composable（Task 120 仪表盘）。
 *
 * 双策略：
 *   1. 首选原生 Fullscreen API（requestFullscreen/exitFullscreen）；
 *   2. 不可用时（iframe 未授权 / Safari 老版 / jsdom 测试）回退 CSS fixed 覆盖层，
 *      z-index 拉满并锁滚动，行为对用户一致。
 *
 * 用法：
 *   const { isFullscreen, toggle, bind } = useFullscreen(rootRef)
 *   <div ref="bind" :class="{ 'is-fullscreen': isFullscreen }">
 */
import { ref, onBeforeUnmount, type Ref } from 'vue'

export function useFullscreen(rootRef: Ref<HTMLElement | null>) {
  const isFullscreen = ref(false)
  let fallbackActive = false
  let previousOverflow = ''

  function nativeSupported(): boolean {
    return (
      typeof document !== 'undefined' &&
      typeof document.fullscreenEnabled !== 'undefined' &&
      document.fullscreenEnabled !== false &&
      typeof rootRef.value?.requestFullscreen === 'function'
    )
  }

  async function enter(): Promise<void> {
    const el = rootRef.value
    if (el === null) return
    if (nativeSupported()) {
      try {
        await el.requestFullscreen()
        isFullscreen.value = true
        return
      } catch {
        /* 原生失败（权限/iframe）→ 走回退 */
      }
    }
    // CSS fixed 覆盖层回退
    fallbackActive = true
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    isFullscreen.value = true
  }

  function exit(): void {
    if (fallbackActive) {
      fallbackActive = false
      document.body.style.overflow = previousOverflow
      isFullscreen.value = false
      return
    }
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
    isFullscreen.value = false
  }

  function toggle(): void {
    if (isFullscreen.value) exit()
    else void enter()
  }

  function onNativeChange(): void {
    // 用户按 Esc 退出原生全屏时同步状态
    if (typeof document !== 'undefined' && !document.fullscreenElement && !fallbackActive) {
      isFullscreen.value = false
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', onNativeChange)
  }

  onBeforeUnmount(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', onNativeChange)
    }
    if (isFullscreen.value) exit()
  })

  return { isFullscreen, toggle }
}
