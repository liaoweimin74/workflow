// ----- 字典项表格的行拖动排序（扁平列表，只改 sortOrder）-----
// 沿用菜单拖动的取舍：只用 Sortable 起拖和收尾，禁掉它同列表内的排序（sort: false），
// 让它完全不碰 DOM。因为 el-table 的 <tr> 由 Vue 按数据渲染，普通表格又没有 row-key，
// Sortable 一旦把行插到别处，Vue 的下标 diff 就会和 DOM 错位。
// 落点由「鼠标悬停的行 + 上/下半带」判定，顺序变化交给 onDrop 之后重新取数、由数据驱动渲染。
import { onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'
import type { DropBand } from './dictSort'

export interface DictDataDragOptions {
  /** 返回待绑定的 tbody（el-table 的 body-wrapper 由内部异步渲染，未就绪时会重试） */
  getTbody: () => HTMLElement | null | undefined
  /** 松手在另一行上时回传落点；放回原位不会调用 */
  onDrop: (dragId: number, hoverId: number, band: DropBand) => Promise<void> | void
  /** 返回 true 时跳过绑定（如无更新权限） */
  disabled?: () => boolean
}

const HANDLE_SELECTOR = '.dict-drag-handle'
const MARK_CLASSES = ['dict-drop-before', 'dict-drop-after']

/** 扁平列表只有前后：行的上半段=排它前面，下半段=排它后面 */
function bandFor(rect: DOMRect, clientY: number): DropBand {
  return (clientY - rect.top) / rect.height < 0.5 ? 'before' : 'after'
}

function rowId(tr: Element): number | null {
  const id = Number(tr.querySelector('[data-dict-row-id]')?.getAttribute('data-dict-row-id'))
  return Number.isFinite(id) && id > 0 ? id : null
}

export function useDictDataDrag(options: DictDataDragOptions) {
  let instance: Sortable | null = null
  let tbody: HTMLElement | null = null
  let bindSession = 0
  /** 每次拖动只走一次完成路径：原生 DnD 的 drop 与 dragend 在部分环境会双双触发 */
  let endHandled = false
  let dragId: number | null = null
  let markedRow: Element | null = null
  let hover: { hoverId: number; band: DropBand } | null = null

  function clearMark() {
    if (markedRow) {
      markedRow.classList.remove(...MARK_CLASSES)
      markedRow = null
    }
  }

  function handleDragOver(evt: DragEvent) {
    if (!tbody || dragId === null || !evt.target) return
    const tr = (evt.target as Element).closest('tr')
    if (!tr || !tbody.contains(tr)) {
      clearMark()
      hover = null
      return
    }
    const hoverId = rowId(tr)
    // hoverId 为 null：「暂无数据」占位行等没有字典项身份的行；
    // hoverId === dragId：正悬停在自己那一行上，放下去位置不会变。两种都不算落点。
    if (hoverId === null || hoverId === dragId) {
      clearMark()
      hover = null
      return
    }
    const band = bandFor(tr.getBoundingClientRect(), evt.clientY)
    clearMark()
    tr.classList.add(`dict-drop-${band}`)
    markedRow = tr
    hover = { hoverId, band }
  }

  function finishDrag() {
    if (endHandled) return
    endHandled = true
    clearMark()
    const current = hover
    hover = null
    if (!current || dragId === null) return
    void options.onDrop(dragId, current.hoverId, current.band)
  }

  function destroy() {
    bindSession++
    if (instance) {
      instance.destroy()
      instance = null
    }
    if (tbody) tbody.removeEventListener('dragover', handleDragOver)
    tbody = null
    dragId = null
    hover = null
    clearMark()
  }

  function init() {
    destroy()
    if (options.disabled?.()) return
    const session = bindSession
    const bind = (attempt: number): void => {
      if (session !== bindSession || instance) return
      const el = options.getTbody()
      if (!el) {
        if (attempt > 0) requestAnimationFrame(() => bind(attempt - 1))
        return
      }
      tbody = el
      el.addEventListener('dragover', handleDragOver)
      instance = Sortable.create(el, {
        handle: HANDLE_SELECTOR,
        sort: false,
        onStart: (evt) => {
          endHandled = false
          dragId = rowId(evt.item)
          hover = null
        },
        onEnd: finishDrag,
      })
    }
    bind(60)
  }

  onBeforeUnmount(destroy)

  return { init, destroy }
}
