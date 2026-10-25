// ----- 菜单拖动落点判定（纯函数，无 DOM） -----
// 层级规则与后端 MenuServiceImpl 保持一致，前端只做即时反馈，最终裁决仍在后端：
//   目录(0)：根级 或 目录之下
//   菜单(1)：必须在目录之下
//   按钮(2)：必须在菜单之下
import type { MenuTree } from '@/types/menu'

export const MENU_TYPE_DIR = 0
export const MENU_TYPE_MENU = 1
export const MENU_TYPE_BUTTON = 2

/** 落点位置带：拖到行的上边缘=排在该行之前，下边缘=排在该行之后，行中间=成为该行的子节点 */
export type DropBand = 'before' | 'after' | 'into'

export interface DropTarget {
  parentId: number | null
  /** 在「目标父级排除被拖节点后」的子项列表中的插入位置 */
  index: number
}

export type DropResult =
  | { ok: true; target: DropTarget; noop: boolean }
  | { ok: false; message: string }

/** 历史数据里根节点parentId可能是 0（接口现返回 null），统一按根处理 */
export function normalizeParentId(parentId?: number | null): number | null {
  return parentId === undefined || parentId === null || parentId === 0 ? null : parentId
}

/**
 * 移动端形态的分区根（V50 约定）：component='mzone:tabs'（底部 Tab 区）/
 * 'mzone:grid'（工作台宫格区）。服务端 locked 拒绝其改名/移动/删除（Task 4），
 * 前端据此把它渲染为分区带标题且不给拖拽把手。
 */
export function isZoneRoot(node: { component?: string | null }): boolean {
  return typeof node.component === 'string' && node.component.startsWith('mzone:')
}

export function findNode(tree: MenuTree[], id: number): MenuTree | null {
  for (const node of tree) {
    if (node.id === id) return node
    const found = node.children ? findNode(node.children, id) : null
    if (found) return found
  }
  return null
}

export function containsNode(node: MenuTree, id: number): boolean {
  if (node.id === id) return true
  return (node.children || []).some((child) => containsNode(child, id))
}

/** 子类型能否挂在 parentType 之下（parentType=null 表示根级）；非法时给出提示文案 */
export function placementError(childType: number, parentType: number | null): string | null {
  if (childType === MENU_TYPE_DIR) {
    return parentType === null || parentType === MENU_TYPE_DIR ? null : '目录只能放在根级或其他目录下'
  }
  if (childType === MENU_TYPE_MENU) {
    return parentType === MENU_TYPE_DIR ? null : '菜单必须放在目录下'
  }
  if (childType === MENU_TYPE_BUTTON) {
    return parentType === MENU_TYPE_MENU ? null : '按钮必须放在菜单下'
  }
  return '未知的菜单类型，无法放置'
}

/** 某父级下的子项列表（排除被拖节点自身），index 即在此列表上计算 */
function siblingsUnder(tree: MenuTree[], parentId: number | null, excludeId: number): MenuTree[] {
  const children = parentId === null ? tree : findNode(tree, parentId)?.children || []
  return children.filter((node) => node.id !== excludeId)
}

/**
 * 把「拖到 hover 行的某个位置带」翻译成后端 move 需要的 { parentId, index }。
 * 数据源是当前树（DOM 只负责告诉我们是哪一行、哪个位置带），因此不受折叠状态影响。
 */
export function resolveDrop(
  tree: MenuTree[],
  dragId: number,
  hoverId: number,
  band: DropBand,
): DropResult {
  const drag = findNode(tree, dragId)
  const hover = findNode(tree, hoverId)
  if (!drag || !hover) return { ok: false, message: '菜单数据已变化，请刷新后重试' }
  if (dragId === hoverId) return { ok: false, message: '不能把菜单放到它自己上' }
  if (isZoneRoot(drag)) return { ok: false, message: '系统分区目录已锁定，不可移动' }
  if (containsNode(drag, hoverId)) return { ok: false, message: '不能把菜单移动到自己的子节点之下' }

  const parentId = band === 'into' ? hover.id : normalizeParentId(hover.parentId)
  const parent = parentId === null ? null : findNode(tree, parentId)
  if (parentId !== null && !parent) return { ok: false, message: '菜单数据已变化，请刷新后重试' }

  const error = placementError(drag.menuType, parent ? parent.menuType : null)
  if (error) return { ok: false, message: error }

  const list = siblingsUnder(tree, parentId, dragId)
  let index: number
  if (band === 'into') {
    index = list.length
  } else {
    const at = list.findIndex((node) => node.id === hoverId)
    index = at < 0 ? list.length : at + (band === 'after' ? 1 : 0)
  }

  // 原位比较：index 是在「排除自身」的列表上算的，插回自己原来的下标即为未移动
  const originParentId = normalizeParentId(drag.parentId)
  const originList = originParentId === null ? tree : findNode(tree, originParentId)?.children || []
  const current = originList.findIndex((node) => node.id === dragId)
  const noop = parentId === originParentId && index === current

  return { ok: true, target: { parentId, index }, noop }
}

/** 按类型给出「新增子菜单」应预置的子类型：目录→菜单，菜单→按钮 */
export function defaultChildType(parentType: number): number | null {
  if (parentType === MENU_TYPE_DIR) return MENU_TYPE_MENU
  if (parentType === MENU_TYPE_MENU) return MENU_TYPE_BUTTON
  return null
}
