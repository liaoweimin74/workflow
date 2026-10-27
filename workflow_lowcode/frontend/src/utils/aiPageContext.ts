/**
 * AI 页面上下文：当前页面组件清单注册中心 + L3 DOM 扫描。
 *
 * - L1/L2 页面（运行时渲染器 / 注册动作的管理页）在挂载/加载完成后调用 setPageManifest
 *   上报结构化清单，卸载/失活时 setPageManifest(null) 清除；
 * - 无注册清单的页面自动走 L3：扫描视口内可交互元素生成 domElements（index 写入
 *   data-ai-idx 属性，执行器据此定位）。
 */
import type { AiDomElement, AiPageManifest } from '@/types/aiPageAction'

let activeManifest: AiPageManifest | null = null
let activeRoute = ''

/** 注册当前页面清单（页面挂载/数据加载完成后调用）；传 null 清除 */
export function setPageManifest(manifest: AiPageManifest | null, routePath = ''): void {
  activeManifest = manifest
  activeRoute = routePath
}

/** 当前路由是否仍与注册时一致（keep-alive 缓存实例防串页） */
export function isManifestActive(routePath: string): boolean {
  return !!activeManifest && (!activeRoute || !routePath || activeRoute === routePath)
}

/** 获取当前页面清单；无 L1/L2 清单时自动 L3 DOM 扫描 */
export function getPageManifest(routePath = ''): AiPageManifest | null {
  if (activeManifest && isManifestActive(routePath)) {
    return activeManifest
  }
  // 兜底：L3 DOM 扫描（无注册执行器的页面）
  const dom = scanDomManifest()
  if (dom.length === 0) return null
  return { pageType: 'other', layer: 'L3', domElements: dom }
}

// ==================== L3 DOM 扫描 ====================

/** 最多扫描的元素数量（控制清单体积） */
const MAX_DOM_ELEMENTS = 50

/** 元素可见性粗判（有尺寸且未被祖先 display:none 隐藏） */
function isVisible(el: HTMLElement): boolean {
  const rect = el.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return false
  const style = window.getComputedStyle(el)
  return style.visibility !== 'hidden' && style.display !== 'none'
}

/** 提取元素的可读标签：aria-label > 关联 label > placeholder > 相邻文本 > value */
export function labelOf(el: HTMLElement): string {
  const anyEl = el as unknown as Record<string, string>
  const aria = el.getAttribute('aria-label') || el.getAttribute('title') || ''
  if (aria) return aria
  const id = el.getAttribute('id')
  if (id) {
    const label = document.querySelector(`label[for="${CSS.escape(id)}"]`)
    if (label?.textContent?.trim()) return label.textContent.trim().slice(0, 30)
  }
  const ph = el.getAttribute('placeholder') || ''
  if (ph) return ph.slice(0, 30)
  // form-item 内：取 .el-form-item__label / 前一个 label 兄弟
  const item = el.closest('.el-form-item')
  const itemLabel = item?.querySelector('.el-form-item__label')?.textContent?.trim()
  if (itemLabel) return itemLabel.slice(0, 30)
  if (el.tagName === 'BUTTON') {
    const text = el.textContent?.trim() ?? ''
    if (text) return text.slice(0, 30)
  }
  if (anyEl.value) return String(anyEl.value).slice(0, 30)
  return ''
}

/**
 * 扫描当前视口可交互元素，生成 L3 清单。
 * 同时把 index 写入元素 data-ai-idx 属性（执行器按 [data-ai-idx="N"] 定位）。
 */
export function scanDomManifest(): AiDomElement[] {
  const selector = [
    'input:not([type=hidden])',
    'textarea',
    'select',
    'button',
    '[role=button]',
    '[role=switch]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',')
  const all = Array.from(document.querySelectorAll<HTMLElement>(selector))
  const out: AiDomElement[] = []
  let index = 0
  // 排除 AI 助手自身（避免 AI 点自己）与已标记元素重扫
  for (const el of all) {
    if (out.length >= MAX_DOM_ELEMENTS) break
    if (el.closest('.ai-assistant-root')) continue
    if (!isVisible(el)) continue
    const tag = el.tagName.toLowerCase()
    const type = tag === 'input' ? el.getAttribute('type') || 'text' : tag === 'button' ? 'button' : tag
    const disabled = (el as unknown as { disabled?: boolean }).disabled === true || el.getAttribute('aria-disabled') === 'true'
    const anyEl = el as unknown as Record<string, string>
    const item: AiDomElement = {
      index,
      tag,
      type,
      label: labelOf(el) || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      value: anyEl.value !== undefined ? String(anyEl.value).slice(0, 60) : undefined,
      disabled: disabled || undefined,
    }
    el.setAttribute('data-ai-idx', String(index))
    out.push(item)
    index += 1
  }
  return out
}

/** L3 定位：按 index 找回元素（执行前重扫刷新映射，防 DOM 变化后错位） */
export function queryDomElement(index: number): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-ai-idx="${index}"]`)
  if (!el) return null
  // 元素被重渲染导致 data-ai-idx 丢失/漂移时，重扫一次再取
  if (!isVisible(el) || el.closest('.ai-assistant-root')) {
    scanDomManifest()
    return document.querySelector<HTMLElement>(`[data-ai-idx="${index}"]`)
  }
  return el
}
