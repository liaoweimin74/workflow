// ----- el-table 行拖拽排序 composable（把手模式） -----
// 与 QueryColumnsConfig / ActionsConfig 的 sortablejs 直绑 tbody 先例同款，
// 统一封装 create/destroy 生命周期；行内含输入控件的表格必须配 handle 把手，
// 否则整行拖拽会与行内 el-input/el-select/el-checkbox 交互冲突。
import { onBeforeUnmount } from 'vue'
import Sortable from 'sortablejs'

export interface TableDragSortOptions {
  /** 返回待绑定的 tbody 元素（通常 wrapper.querySelector('.el-table__body-wrapper tbody')） */
  getTbody: () => HTMLElement | null | undefined
  /** 拖拽把手选择器（如 '.drag-handle'） */
  handle: string
  /** 返回 true 时跳过绑定（如只读模式）；init/绑定前都会复查 */
  disabled?: () => boolean
  /** 拖拽完成回调：oldIndex/newIndex 为 tbody 行索引 */
  onReorder: (oldIndex: number, newIndex: number) => void
}

/**
 * el-table 行拖拽排序绑定。
 *
 * - `init()` 幂等：先销毁旧实例再绑定（tbody 未就绪时静默跳过）；
 *   表格由 v-if 控制渲染时，在变为可见后 nextTick 调用。
 * - `destroy()` 解绑；组件卸载时自动调用。
 * - Sortable 绑定在 tbody 容器上，行元素增删后无需重新绑定。
 */
export function useTableDragSort(options: TableDragSortOptions) {
  let instance: Sortable | null = null
  /** 每次拖拽只处理一次 onEnd：原生 DnD 的 drop 与 dragend 在部分环境
   * （Playwright 合成事件等）会双双进入完成路径，重复触发会抵消重排结果。 */
  let endHandled = false

  function destroy() {
    if (instance) {
      instance.destroy()
      instance = null
    }
  }

  function init() {
    destroy()
    if (options.disabled?.()) return
    const tbody = options.getTbody()
    if (!tbody) return
    instance = Sortable.create(tbody, {
      handle: options.handle,
      animation: 150,
      onStart: () => {
        endHandled = false
      },
      onEnd: (evt: { oldIndex?: number; newIndex?: number }) => {
        if (endHandled) return
        endHandled = true
        const { oldIndex, newIndex } = evt
        if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return
        options.onReorder(oldIndex, newIndex)
      },
    })
  }

  onBeforeUnmount(destroy)

  return { init, destroy }
}

/**
 * 就地重排：把 oldIndex 位置的元素移动到 newIndex（splice 语义，保持数组引用不变，
 * 触发 Vue 响应式更新且与 Sortable 已完成的 DOM 顺序一致）。
 */
export function moveItem<T>(list: T[], oldIndex: number, newIndex: number): void {
  if (oldIndex === newIndex) return
  if (oldIndex < 0 || newIndex < 0 || oldIndex >= list.length || newIndex >= list.length) return
  const [moved] = list.splice(oldIndex, 1)
  list.splice(newIndex, 0, moved)
}
