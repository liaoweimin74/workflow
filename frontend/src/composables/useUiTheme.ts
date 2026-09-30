/**
 * 界面外观状态（Task 27/28）：界面风格（classic 经典·靛蓝 / verdant 青墨·翡翠青）
 * × 明暗模式（light 亮色 / dark 暗色 / duo 明暗搭配：chrome 顶栏侧栏页签栏用暗色，内容区保持亮色）。
 *
 * 与门户起始页（Next.js 侧「外观切换」下拉）共用同一对 localStorage 键：
 *   portal-ui-theme = 'classic' | 'verdant'
 *   portal-ui-mode  = 'light' | 'dark' | 'duo'
 * 双方通过 storage 事件跨文档联动（门户切换 → 控制台即时生效，反之亦然；
 * 同页 iframe 同样会收到 storage 事件）。
 *
 * 预览 iframe 等禁用 storage 的上下文由 safe-storage（main.ts 首位引入）内存兜底，
 * 本模块的读写不会抛错。默认值 classic + light 与改版前的观感一致。
 */
import { ref, watch, effectScope } from 'vue'

export type UiTheme = 'classic' | 'verdant'
export type UiMode = 'light' | 'dark' | 'duo'

const THEME_KEY = 'portal-ui-theme'
const MODE_KEY = 'portal-ui-mode'

const uiTheme = ref<UiTheme>('classic')
const uiMode = ref<UiMode>('light')

let installed = false

/**
 * 模块级 detached effectScope：watcher 注册在其中，不归属于任何组件实例。
 * 关键修复（Task 29）：此前 watch 注册在首个调用方（AdminLayout）的 setup 作用域内，
 * 进入 /designer 等顶层全屏路由时 AdminLayout 卸载 → watcher 被销毁；
 * 返回后 installed=true 不再重装，导致外观切换只改状态不落 DOM。
 * detached scope 与页面同生命周期，任何路由进出都不再失效。
 */
const themeScope = effectScope(true)

/** 把当前外观写到 <html>：data-ui-theme 驱动风格，.dark 驱动暗色，.ui-duo 驱动明暗搭配（三者互斥 dark/duo）。 */
function applyToDom(): void {
  document.documentElement.dataset.uiTheme = uiTheme.value
  document.documentElement.classList.toggle('dark', uiMode.value === 'dark')
  document.documentElement.classList.toggle('ui-duo', uiMode.value === 'duo')
}

export function useUiTheme() {
  if (!installed) {
    installed = true

    // 恢复持久化外观（index.html 里的内联脚本已先行防闪烁，这里恢复响应式状态）
    try {
      const t = localStorage.getItem(THEME_KEY)
      if (t === 'classic' || t === 'verdant') uiTheme.value = t
      const m = localStorage.getItem(MODE_KEY)
      if (m === 'light' || m === 'dark' || m === 'duo') uiMode.value = m
    } catch {
      /* 内存兜底环境下仍可读写，异常忽略 */
    }
    applyToDom()

    // 门户起始页 / 其他标签页联动
    window.addEventListener('storage', (e) => {
      if (e.key === THEME_KEY && (e.newValue === 'classic' || e.newValue === 'verdant')) {
        uiTheme.value = e.newValue
      } else if (e.key === MODE_KEY && (e.newValue === 'light' || e.newValue === 'dark' || e.newValue === 'duo')) {
        uiMode.value = e.newValue
      }
    })

    // 任何来源（本地设置 / storage 联动）变化后统一应用（detached scope：不随组件卸载失效）
    themeScope.run(() => {
      watch([uiTheme, uiMode], applyToDom)
    })
  }

  function setUiTheme(t: UiTheme): void {
    uiTheme.value = t
    applyToDom() // 同步落 DOM，不依赖 watcher 时序（双保险）
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      /* 忽略：内存兜底下仅本页生效 */
    }
  }

  function setUiMode(m: UiMode): void {
    uiMode.value = m
    applyToDom() // 同步落 DOM，不依赖 watcher 时序（双保险）
    try {
      localStorage.setItem(MODE_KEY, m)
    } catch {
      /* 忽略 */
    }
  }

  return { uiTheme, uiMode, setUiTheme, setUiMode }
}
