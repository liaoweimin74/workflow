/**
 * 端形态校验器（multi-client-support Task 3）。
 *
 * 纯函数：菜单拖拽/保存的落点合法性按「区域 + 端形态」约束，不触库。
 * - WEB 区沿用现状三层规则（对齐 Java MenuServiceImpl.validatePlacement，
 *   见 backend/src/main/java/com/workflow/system/service/impl/MenuServiceImpl.java）：
 *   目录只放根级或目录下；菜单必须挂目录下；按钮必须挂菜单下。
 * - 移动端（H5/APP/MP 任一开通 ⇒ 移动形态）：
 *   TAB 区 = 底部 Tab（mzone:tabs 的子节点），必须 menu_type=1 且总数 2~5；
 *   GRID 区 = 工作台宫格（mzone:grid 的子树），深度 ≤2；
 *   BUTTON 区 = 按钮跟随菜单（与现状同规则）。
 * - 两个 zone 根目录（component='mzone:tabs'/'mzone:grid'）locked：拒绝删除/移动/改名。
 *
 * 简报签名基础上补了 `parentType`：现状规则本身以父节点类型为准绳，缺它无法复刻。
 */

import { BusinessException } from '../../common/exception/business-exception'
import { ValidationError } from '../../common/exception/validation-error'

/** 落点所在形态区域。 */
export type MenuZone = 'WEB' | 'TAB' | 'GRID' | 'BUTTON'

/** sys_menu.menu_type：0 目录 / 1 菜单 / 2 按钮（与 V1 seed / Java 侧一致）。 */
const TYPE_DIRECTORY = 0
const TYPE_MENU = 1
const TYPE_BUTTON = 2

/** TAB 上限（下限 2 是终态完整性要求，不在插入时拦截——首条必须允许写入）。 */
const TAB_MAX = 5
const GRID_MAX_DEPTH = 2

/** zone 根目录的 component 标识（seed 由 V52 落库；此处只认约定值）。 */
const ZONE_ROOT_COMPONENTS = ['mzone:tabs', 'mzone:grid'] as const

export interface MenuPlacementInput {
  /** 落点所属形态区域。 */
  zone: MenuZone
  /** 被放置节点的类型 0/1/2。 */
  nodeType: number
  /** 被放置在第几层（1=区域根直下）。 */
  depth: number
  /** 落点父节点类型；null=区域根直下。 */
  parentType: number | null
  /** TAB 区现有子项数（判 2~5 上限）。其他区域传 0。 */
  tabSiblingCount: number
  /** 目标客户端是否移动形态（H5/APP/MP 任一 enabled）。 */
  mobile: boolean
}

/** 落点合法性校验；违规抛 BusinessException（对齐现状 MenuServiceImpl 的拒绝语义）。 */
export function assertMenuPlacement(input: MenuPlacementInput): void {
  // 形态与区域必须匹配：WEB 区只属桌面端，TAB/GRID/BUTTON 只属移动端。
  if (input.zone === 'WEB' && input.mobile) {
    throw new ValidationError('移动形态客户端不使用 WEB 三层区域')
  }
  if (input.zone !== 'WEB' && !input.mobile) {
    throw new ValidationError('桌面端客户端没有 ' + input.zone + ' 形态区域')
  }

  switch (input.nodeType) {
    case TYPE_DIRECTORY:
    case TYPE_MENU:
    case TYPE_BUTTON:
      break
    default:
      throw new BusinessException('未知的菜单类型')
  }

  switch (input.zone) {
    case 'WEB':
      assertWebPlacement(input.nodeType, input.parentType)
      return
    case 'TAB':
      assertTabPlacement(input)
      return
    case 'GRID':
      assertGridPlacement(input)
      return
    case 'BUTTON':
      assertButtonPlacement(input)
      return
  }
}

/** 现状三层规则，逐字对齐 Java validatePlacement 的三句拒绝文案。 */
function assertWebPlacement(nodeType: number, parentType: number | null): void {
  if (nodeType === TYPE_DIRECTORY) {
    if (parentType !== null && parentType !== TYPE_DIRECTORY) {
      throw new BusinessException('目录只能放在根级或其他目录下')
    }
    return
  }
  if (nodeType === TYPE_MENU) {
    if (parentType === null || parentType !== TYPE_DIRECTORY) {
      throw new BusinessException('菜单必须放在目录下')
    }
    return
  }
  // 按钮
  if (parentType === null || parentType !== TYPE_MENU) {
    throw new BusinessException('按钮必须放在菜单下')
  }
}

function assertTabPlacement(input: MenuPlacementInput): void {
  if (input.nodeType !== TYPE_MENU) {
    throw new BusinessException('底部 Tab 区只能放菜单（一级菜单 2~5 个）')
  }
  if (input.depth !== 1) {
    throw new BusinessException('底部 Tab 区只认一级节点')
  }
  if (input.tabSiblingCount + 1 > TAB_MAX) {
    throw new BusinessException(`底部 Tab 最多 ${TAB_MAX} 个菜单（现有 ${input.tabSiblingCount} 个）`)
  }
}

function assertGridPlacement(input: MenuPlacementInput): void {
  if (input.nodeType === TYPE_BUTTON) {
    // 按钮不占屏：移动端宫格里不放按钮（BUTTON 区语义）。
    throw new BusinessException('工作台宫格不放按钮，按钮跟随菜单')
  }
  if (input.depth > GRID_MAX_DEPTH) {
    throw new BusinessException(`工作台内层级最多 ${GRID_MAX_DEPTH} 层`)
  }
}

function assertButtonPlacement(input: MenuPlacementInput): void {
  if (input.nodeType !== TYPE_BUTTON) {
    throw new BusinessException('按钮区只能放按钮')
  }
  if (input.parentType !== TYPE_MENU) {
    throw new BusinessException('按钮必须放在菜单下')
  }
}

/** component 是否为 zone 根标识。 */
export function isZoneRootComponent(component: string | null | undefined): boolean {
  return component !== null && component !== undefined && (ZONE_ROOT_COMPONENTS as readonly string[]).includes(component)
}

export type ZoneRootAction = 'delete' | 'move' | 'rename'

/** zone 根目录 locked：对它的删除/移动/改名一律拒绝（对普通节点无操作）。 */
export function assertZoneRootEditable(
  component: string | null | undefined,
  action: ZoneRootAction,
): void {
  if (!isZoneRootComponent(component)) return
  const label = component === 'mzone:tabs' ? '底部 Tab 区' : '工作台宫格区'
  const verb = action === 'delete' ? '删除' : action === 'move' ? '移动' : '改名'
  throw new BusinessException(`${label}为锁定根目录，不允许${verb}`)
}
