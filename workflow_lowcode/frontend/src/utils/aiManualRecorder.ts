/**
 * 用户手动操作捕获器（传统 UI 操作录制）。
 *
 * 在 document 捕获阶段监听 click/change/input，把用户的手动点击、输入、
 * 下拉选择反向映射为 page_action 协议动作（与 AI 对话动作同构），写入
 * aiTestRecorder 当前录制会话——同一份用例可以混合 AI 动作与手动动作，
 * 回放走同一执行器管线。
 *
 * 语义化策略（尽力而为）：
 * - 页面有 L1/L2 清单时：label → field 反查（queryFields/formFields），
 *   产出 set-query/set-value 等结构化动作，可精确回放；
 * - 无清单时产出 fill/click 通用动作（target 为中文标签/按钮文本），
 *   由 L3 按标签定位执行；
 * - 按钮按文本关键词映射语义 op（查询→search、重置→reset…）；
 * - 自动排除 AI 助手面板、消息弹窗等系统 UI；密码值掩码。
 */
import router from '@/router'
import type { AiPageAction, AiPageManifest } from '@/types/aiPageAction'
import { labelOf } from './aiPageContext'
import { getActiveManifest } from './aiPageExecutor'
import { aiTestRecorder } from './aiTestRecorder'

/** 输入防抖落账间隔（ms） */
const INPUT_DEBOUNCE_MS = 700
/** 同动作去重窗口（ms） */
const DEDUP_WINDOW_MS = 900

/** 系统级 UI（不录制） */
const EXCLUDE_SELECTOR = [
  '.ai-assistant-root',
  '.el-message-box',
  '.el-overlay-message-box',
  '.el-message',
  '.el-notification',
  '.el-popper[aria-hidden="true"]',
].join(',')

class AiManualRecorder {
  private active = false
  private paused = false
  private lastRoute = ''
  private lastRecord: { key: string; at: number } | null = null
  private inputTimers = new WeakMap<HTMLElement, number>()
  private lastSelectLabel = ''

  private onClick = (e: MouseEvent): void => {
    if (!this.active || this.paused) return
    const raw = e.target as HTMLElement | null
    if (!raw) return
    if (raw.closest(EXCLUDE_SELECTOR)) return

    // el-select 触发器：记住其标签，选项点击时回填
    const selectWrap = raw.closest<HTMLElement>('.el-select')
    if (selectWrap) {
      this.lastSelectLabel = labelOf(selectWrap.querySelector('input') ?? selectWrap)
      return
    }
    // el-select 下拉选项：转成 set-value
    const option = raw.closest<HTMLElement>('.el-select-dropdown__item')
    if (option) {
      const text = option.textContent?.trim() ?? ''
      if (text) {
        this.emit({ op: 'set-value', field: this.lastSelectLabel || '下拉选项', value: text })
      }
      return
    }
    // 开关：读切换后的状态（异步一拍）
    const sw = raw.closest<HTMLElement>('.el-switch')
    if (sw) {
      const label = this.formLabelOf(sw)
      window.setTimeout(() => {
        const on = sw.querySelector('input')?.checked || sw.getAttribute('aria-checked') === 'true'
        this.emit({ op: 'set-value', field: label, value: on ? '开启' : '关闭' })
      }, 60)
      return
    }
    // 页签
    const tab = raw.closest<HTMLElement>('.el-tabs__item')
    if (tab) {
      this.emit({ op: 'click', target: `页签「${tab.textContent?.trim() ?? ''}」` })
      return
    }
    // 分页
    if (raw.closest('.el-pagination')) {
      const btn = raw.closest<HTMLElement>('.el-pager li, button, .btn-prev, .btn-next')
      const text = btn?.textContent?.trim() || btn?.getAttribute('aria-label') || ''
      if (text) this.emit({ op: 'click', target: `分页「${text}」` })
      return
    }

    // 通用按钮类：button/[role=button]/a/.el-button/.el-dropdown-menu__item
    const btn = raw.closest<HTMLElement>('button, [role="button"], a, .el-button, .el-dropdown-menu__item, .el-radio-button__inner, .el-checkbox-button__inner')
    if (!btn || btn.closest(EXCLUDE_SELECTOR)) return
    // 表单控件的原生 label/input 点击不算按钮（change 会处理）
    if (btn instanceof HTMLInputElement || btn instanceof HTMLSelectElement || btn instanceof HTMLTextAreaElement) return
    const text = (btn.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
      || btn.getAttribute('aria-label')?.trim().slice(0, 30)
      || btn.getAttribute('title')?.trim().slice(0, 30)
      || ''
    if (!text) return
    this.emit({ op: mapClickOp(text, btn), target: text })
  }

  private onChange = (e: Event): void => {
    if (!this.active || this.paused) return
    const t = e.target as HTMLElement | null
    if (!t || t.closest(EXCLUDE_SELECTOR)) return
    const input = t as unknown as { value?: string; checked?: boolean; type?: string }
    // switch 已在 click 分支处理（避免双记）
    if (t.closest('.el-switch')) return
    if (t instanceof HTMLSelectElement) {
      const label = this.formLabelOf(t)
      const text = t.selectedOptions?.[0]?.textContent?.trim() ?? input.value ?? ''
      this.emit({ op: 'set-value', field: label, value: text })
      return
    }
    if (t instanceof HTMLInputElement) {
      if (t.type === 'checkbox' || t.type === 'radio') {
        this.emit({ op: 'set-value', field: this.formLabelOf(t), value: t.checked ? '选中' : '取消选中' })
        return
      }
      if (t.type === 'password') {
        this.emit({ op: 'set-value', field: this.formLabelOf(t), value: '******' })
        return
      }
      // 文本类输入：blur 产生的 change 通常与 input 防抖重复，直接落账（去重器会拦）
      this.emitFill(t, input.value ?? '')
      return
    }
    if (t instanceof HTMLTextAreaElement) {
      this.emitFill(t, input.value ?? '')
    }
  }

  private onInput = (e: Event): void => {
    if (!this.active || this.paused) return
    const t = e.target as HTMLElement | null
    if (!t || t.closest(EXCLUDE_SELECTOR)) return
    if (!(t instanceof HTMLInputElement) && !(t instanceof HTMLTextAreaElement)) return
    const el = t as HTMLInputElement
    if (el.type === 'password' || el.type === 'checkbox' || el.type === 'radio') return
    if (el.readOnly) return
    // 防抖：停止输入 700ms 后落账
    const prev = this.inputTimers.get(el)
    if (prev) window.clearTimeout(prev)
    const timer = window.setTimeout(() => {
      this.inputTimers.delete(el)
      this.emitFill(el, el.value ?? '')
    }, INPUT_DEBOUNCE_MS)
    this.inputTimers.set(el, timer)
  }

  /** 路由变化 → 记录 navigate（回放时自动走完整路径） */
  private onRouteChange = (to: { path: string }): void => {
    if (!this.active || this.paused) return
    if (to.path === this.lastRoute) return
    this.lastRoute = to.path
    this.emit({ op: 'navigate', target: to.path })
  }

  private formLabelOf(el: HTMLElement): string {
    const item = el.closest('.el-form-item')
    const label = item?.querySelector('.el-form-item__label')?.textContent?.trim()
    if (label) return label.slice(0, 30)
    return labelOf(el) || '字段'
  }

  /** 输入类落账：优先映射 L1/L2 结构化字段 */
  private emitFill(el: HTMLElement, value: string): void {
    const label = this.formLabelOf(el)
    const mapped = mapFieldByManifest(label, value)
    if (mapped) {
      this.emit(mapped)
    } else {
      this.emit({ op: 'fill', target: label, value })
    }
  }

  /** 落账（去重 + 写录制器） */
  private emit(action: AiPageAction): void {
    const key = `${action.op}|${action.target ?? action.field ?? ''}|${JSON.stringify(action.value ?? null)}`
    const now = Date.now()
    if (this.lastRecord && this.lastRecord.key === key && now - this.lastRecord.at < DEDUP_WINDOW_MS) {
      this.lastRecord.at = now
      return
    }
    this.lastRecord = { key, at: now }
    aiTestRecorder.recordManualAction(action)
  }

  // ==================== 生命周期 ====================

  start(): void {
    if (this.active) return
    this.active = true
    this.paused = false
    this.lastRoute = router.currentRoute.value.path
    this.lastRecord = null
    document.addEventListener('click', this.onClick, true)
    document.addEventListener('change', this.onChange, true)
    document.addEventListener('input', this.onInput, true)
    this.offRoute = router.afterEach((to) => this.onRouteChange(to))
  }

  private offRoute: (() => void) | null = null

  stop(): void {
    this.active = false
    document.removeEventListener('click', this.onClick, true)
    document.removeEventListener('change', this.onChange, true)
    document.removeEventListener('input', this.onInput, true)
    this.offRoute?.()
    this.offRoute = null
  }

  /** 回放等场景暂停捕获（防止把回放动作二次录入） */
  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  isCapturing(): boolean {
    return this.active
  }
}

/** 扩展清单：兼容 L2 页自定义的 searchFields 键 */
type ManifestWithSearch = AiPageManifest & { searchFields?: { field: string; title: string }[] }

/** label → L1/L2 结构化字段动作（查当前页面清单；兼容 L1 queryFields 与 L2 searchFields 键名） */
function mapFieldByManifest(label: string, value: string): AiPageAction | null {
  let manifest: ManifestWithSearch | null = null
  try {
    manifest = getActiveManifest() as ManifestWithSearch
  } catch {
    return null
  }
  if (!manifest) return null
  const q = (manifest.queryFields ?? manifest.searchFields ?? [])?.find((f) => f.title === label || f.field === label)
  if (q) return { op: 'set-query', target: q.field, value }
  const f = manifest.formFields?.find((x) => x.title === label || x.field === label)
  if (f) return { op: 'set-value', field: f.field, value }
  return null
}

/** 按钮文本 → 语义 op */
function mapClickOp(text: string, el: HTMLElement): string {
  const t = text.toLowerCase()
  if (/查询|搜索|search|筛选/.test(t)) return 'search'
  if (/重置|清空|reset/.test(t)) return 'reset'
  if (/刷新|refresh/.test(t)) return 'refresh'
  if (/^(新建|新增|添加|创建)$|新建|新增|添加|create/.test(t) && !el.closest('.el-table')) return 'open-create'
  if (/保存|提交|确定|save|submit/.test(t)) return 'submit'
  if (/删除|delete/.test(t)) return 'delete-rows'
  return 'click'
}

export const aiManualRecorder = new AiManualRecorder()
