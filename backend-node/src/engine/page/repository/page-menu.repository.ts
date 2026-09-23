import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import { BusinessException } from '../../../common/exception/business-exception'
import type { DB } from '../../../framework/database/types'
import { KYSELY } from '../../../framework/database/database.module'

/** 挂接菜单行的完整形状（`mount-menu` 的响应只用到其中一部分）。 */
export interface PageMenuRow {
  id: number
  menu_name: string
  path: string | null
  parent_id: number | null
  permission: string | null
  status: number
}

/**
 * 页面挂接菜单的数据访问（对齐 Java `PageMenuController` 用到的
 * `SysMenuRepository` / `SysRoleRepository` / `SysRoleMenuRepository`）。
 *
 * ⚠️ 这里**只**覆盖页面挂接需要的四个动作；菜单模块自己的写路径
 *    （`POST /api/menus` 等，规格 U19）另有一套，不要往这里堆。
 *
 * ⚠️ 「解除挂接」是**软删除**（`is_deleted = 1`），行仍在库里 ——
 *    所以 `findById` 不判 `is_deleted`，「重复解除」不会 404，
 *    只有**行不存在**才 404（golden 用 999999999 钉住了这一条）。
 */
@Injectable()
export class PageMenuRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /** 新建菜单（对齐 Java `menuRepository.save(new SysMenu())`）。 */
  async insert(row: {
    menuName: string
    path: string
    component: string
    permission: string
    menuType: number
    parentId: number | null
    sortOrder: number
    status: number
    isDeleted: number
  }): Promise<PageMenuRow> {
    const now = new Date()
    const inserted = await this.db
      .insertInto('sys_menu')
      .values({
        menu_name: row.menuName,
        path: row.path,
        component: row.component,
        permission: row.permission,
        menu_type: row.menuType,
        parent_id: row.parentId,
        sort_order: row.sortOrder,
        status: row.status,
        is_deleted: row.isDeleted,
        icon: null,
        created_at: now,
        created_by: null,
        updated_at: now,
        updated_by: null,
      })
      .executeTakeFirst()
    // 自增主键：`insertId` 由驱动给出（对齐 Java 侧 `save()` 回填的 id）
    const id = Number(inserted.insertId)
    return {
      id,
      menu_name: row.menuName,
      path: row.path,
      parent_id: row.parentId,
      permission: row.permission,
      status: row.status,
    }
  }

  /** 按 id 取菜单（**不判 `is_deleted`**，对齐 `findById`）。 */
  async findById(id: number): Promise<PageMenuRow | null> {
    const row = await this.db
      .selectFrom('sys_menu')
      .select(['id', 'menu_name', 'path', 'parent_id', 'permission', 'status'])
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }

  /** 软删除菜单（`is_deleted = 1`）。 */
  async softDelete(id: number): Promise<void> {
    await this.db
      .updateTable('sys_menu')
      .set({ is_deleted: 1, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  /**
   * 管理员挂接时把新菜单授权给 ROLE_ADMIN（对齐 Java `grantAdminRoleIfAdmin`）。
   *
   * 三处「静默返回」照抄：角色不存在 → 不授权；已授权过 → 不重复插；
   * 非管理员 → 不授权。任何一处改成就地抛错都会让挂接行为分叉。
   */
  async grantAdminRole(menuId: number, isAdmin: boolean): Promise<void> {
    if (!isAdmin) return
    const role = await this.db
      .selectFrom('sys_role')
      .select('id')
      .where('role_code', '=', 'ROLE_ADMIN')
      .executeTakeFirst()
    if (role === undefined) return

    const existing = await this.db
      .selectFrom('sys_role_menu')
      .select('menu_id')
      .where('role_id', '=', role.id)
      .execute()
    if (existing.some((link) => link.menu_id === menuId)) return

    await this.db
      .insertInto('sys_role_menu')
      .values({ role_id: role.id, menu_id: menuId })
      .execute()
  }

  /** 按 id 取菜单，不存在 → 404「菜单不存在或已解除」。 */
  async requireById(id: number): Promise<PageMenuRow> {
    const row = await this.findById(id)
    if (row === null) {
      throw new BusinessException(404, '菜单不存在或已解除')
    }
    return row
  }
}
