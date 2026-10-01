/**
 * 全屏 composable（Task 120 仪表盘组件级 → Task 122 提升为平台级共享，
 * 布局页签页与仪表盘组件共用同一实现）。
 *
 * 双策略：
 *   1. 首选原生 Fullscreen API（requestFullscreen/exitFullscreen）；
 *   2. 不可用时（iframe 未授权 / Safari 老版 / jsdom 测试）回退 CSS fixed 覆盖层，
 *      z-index 拉满并锁滚动，行为对用户一致。
 *
 * Task 122 增强：
 *   - 导出 isFallback（调用方可按「原生/回退」分别渲染样式，如 :fullscreen 与 fixed 类）；
 *   - 回退态下监听 Esc 退出（原生态 Esc 由浏览器处理，此前回退态按 Esc 无响应）。
 *
 * 用法：
 *   const { isFullscreen, isFallback, toggle } = useFullscreen(rootRef)
 *   <div ref="root" :class="{ 'is-fallback-fullscreen': isFullscreen && isFallback }">
 */
import { ref, onBeforeUnmount, type Ref } from 'vue'

export function useFullscreen(rootRef: Ref<HTMLElement | null>) {
  const isFullscreen = ref(false)
  const isFallback = ref(false)
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
        isFallback.value = false
        return
      } catch {
        /* 原生失败（权限/iframe）→ 走回退 */
      }
    }
    // CSS fixed 覆盖层回退
    fallbackActive = true
    isFallback.value = true
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    isFullscreen.value = true
  }

  function exit(): void {
    if (fallbackActive) {
      fallbackActive = false
      isFallback.value = false
      document.body.style.overflow = previousOverflow
      isFullscreen.value = false
      return
    }
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined)
    }
    isFullscreen.value = false
    isFallback.value = false
  }

  function toggle(): void {
    if (isFullscreen.value) exit()
    else void enter()
  }

  function onNativeChange(): void {
    // 用户按 Esc 退出原生全屏时同步状态
    if (typeof document !== 'undefined' && !document.fullscreenElement && !fallbackActive) {
      isFullscreen.value = false
      isFallback.value = false
    }
  }

  /** 回退态 Esc 退出（原生态由浏览器消费 Esc 并触发 fullscreenchange 同步） */
  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && fallbackActive) exit()
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('fullscreenchange', onNativeChange)
    document.addEventListener('keydown', onKeyDown)
  }

  onBeforeUnmount(() => {
    if (typeof document !== 'undefined') {
      document.removeEventListener('fullscreenchange', onNativeChange)
      document.removeEventListener('keydown', onKeyDown)
    }
    if (isFullscreen.value) exit()
  })

  return { isFullscreen, isFallback, toggle }
}
