// ----- 菜单树形表格的行拖动（层级 + 排序）-----
// 为什么不用 sortablejs 的 oldIndex/newIndex：el-table 树形把嵌套数据拍平成一串 <tr>，
// 下标语义只能表达「同级插入」，无法把节点拖进一个还没有子节点的目录；且拖一个带子树的
// 目录时 Sortable 只搬一行，DOM 会与数据彻底错位。所以这里：
//   1. 落点由「鼠标悬停的行 + 行内位置带」判定（dragover 时算，见 bandFor），
//      层级/序号换算交给纯函数 resolveDrop；
//   2. Sortable 只负责启动拖拽并在结束时给出 onEnd，完全不碰 DOM（sort: false）。
//      默认 Sortable 会在 dragover 时把被拖的 <tr> 插到悬停位置当占位符，那样
//      evt.target.closest('tr') 取到的永远是被拖行自己，hoverId === dragId，
//      落点判定就会全部失效；且树形只搬一行会让 DOM 与数据错位。
//      顺序变化统一交给 onDrop 之后重新取数、由数据驱动渲染。
import { onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'
import type { DropBand, DropTarget } from './menuDrop'

export type MenuDropJudgement =
  | { ok: true; target: DropTarget; noop: boolean }
  | { ok: false; message: string }

export interface MenuTreeDragOptions {
  /** 返回待绑定的 tbody（el-table 的 body-wrapper 由内部异步渲染，未就绪时会重试） */
  getTbody: () => HTMLElement | null | undefined
  /** 判定落点是否合法、以及换算成 { parentId, index } */
  judge: (dragId: number, hoverId: number, band: DropBand) => MenuDropJudgement
  /** 合法且非原位时提交 */
  onDrop: (dragId: number, target: DropTarget) => Promise<void> | void
  /** 非法落点提示 */
  onRejected: (message: string) => void
  /** 返回 true 时跳过绑定（如无更新权限） */
  disabled?: () => boolean
}

const HANDLE_SELECTOR = '.menu-drag-handle'
const MARK_CLASSES = ['menu-drop-before', 'menu-drop-after', 'menu-drop-into', 'menu-drop-invalid']

/** 行内位置带：上 28% 排前面，下 28% 排后面，中间成为该行的子节点 */
function bandFor(rect: DOMRect, clientY: number): DropBand {
  const ratio = (clientY - rect.top) / rect.height
  if (ratio < 0.28) return 'before'
  if (ratio > 0.72) return 'after'
  return 'into'
}

function rowMenuId(tr: Element): number | null {
  const raw = tr.querySelector('[data-menu-id]')?.getAttribute('data-menu-id')
  const id = Number(raw)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function useMenuTreeDrag(options: MenuTreeDragOptions) {
  let instance: Sortable | null = null
  let tbody: HTMLElement | null = null
  let bindSession = 0
  /** 每次拖动只走一次完成路径：原生 DnD 的 drop 与 dragend 在部分环境会双双触发 */
  let endHandled = false
  let dragId: number | null = null
  let markedRow: Element | null = null
  let hover: { hoverId: number; band: DropBand; judgement: MenuDropJudgement } | null = null

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
    const hoverId = rowMenuId(tr)
    if (hoverId === null || hoverId === dragId) {
      // hoverId 为 null：「暂无数据」占位行等没有菜单身份的行；
      // hoverId === dragId：正悬停在自己那一行上，放下去位置不会变。
      // 两种都不算落点，也不该在松手时弹「不能放到自己上」。
      clearMark()
      hover = null
      return
    }
    const band = bandFor(tr.getBoundingClientRect(), evt.clientY)
    const judgement = options.judge(dragId, hoverId, band)
    clearMark()
    tr.classList.add(judgement.ok ? `menu-drop-${band}` : 'menu-drop-invalid')
    markedRow = tr
    hover = { hoverId, band, judgement }
  }

  function finishDrag() {
    if (endHandled) return
    endHandled = true
    clearMark()
    const current = hover
    hover = null
    if (!current || dragId === null) return
    if (!current.judgement.ok) {
      options.onRejected(current.judgement.message)
      return
    }
    if (current.judgement.noop) return
    void options.onDrop(dragId, current.judgement.target)
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
        // 只用 Sortable 起拖和收尾，禁掉同列表内的排序：
        // 否则它会在 dragover 时把被拖的 <tr> 插到悬停位置，closest('tr') 就恒为被拖行
        sort: false,
        onStart: (evt) => {
          endHandled = false
          dragId = rowMenuId(evt.item)
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
