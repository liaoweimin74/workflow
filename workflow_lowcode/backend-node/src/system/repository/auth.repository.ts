import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import type { DB } from '../../framework/database/types'
import { KYSELY } from '../../framework/database/database.module'

/**
 * 认证相关的数据访问，逐条对齐 Java 侧的 Repository 查询。
 *
 * 系统表（sys_*）没有 JPA 实体级的关联映射，全部显式 join/查询 ——
 * 这也符合本项目「大量裸 SQL」的现状。
 */

export interface SysUserRow {
  id: number
  username: string
  nickname: string | null
  password: string
  email: string | null
  phone: string | null
  avatar: string | null
  org_id: number | null
  status: number
}

export interface MenuRow {
  id: number
  parent_id: number | null
  menu_name: string
  menu_type: number
  path: string | null
  component: string | null
  permission: string | null
  icon: string | null
  sort_order: number | null
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  /**
   * 按用户名查用户。
   *
   * 注意：Java 侧 `findByUsername` 是 Spring Data 派生查询，**不带 is_deleted 条件** ——
   * 为保持行为一致（包括已删用户仍能登录这一可疑行为），这里也不过滤 is_deleted。
   * 若将来要改为过滤，必须同步改 Java 侧，否则契约会分叉。
   */
  async findUserByUsername(username: string): Promise<SysUserRow | null> {
    const row = await this.db
      .selectFrom('sys_user')
      .select(['id', 'username', 'nickname', 'password', 'email', 'phone', 'avatar', 'org_id', 'status'])
      .where('username', '=', username)
      .executeTakeFirst()
    return row ?? null
  }

  async findUserById(userId: number): Promise<SysUserRow | null> {
    const row = await this.db
      .selectFrom('sys_user')
      .select(['id', 'username', 'nickname', 'password', 'email', 'phone', 'avatar', 'org_id', 'status'])
      .where('id', '=', userId)
      .executeTakeFirst()
    return row ?? null
  }

  /** 用户的角色 ID 列表。 */
  async findRoleIdsByUserId(userId: number): Promise<number[]> {
    const rows = await this.db
      .selectFrom('sys_user_role')
      .select('role_id')
      .where('user_id', '=', userId)
      .execute()
    return rows.map((r) => r.role_id)
  }

  /** 角色 ID → role_code。 */
  async findRoleCodesByIds(roleIds: number[]): Promise<string[]> {
    if (roleIds.length === 0) return []
    const rows = await this.db
      .selectFrom('sys_role')
      .select('role_code')
      .where('id', 'in', roleIds)
      .execute()
    return rows.map((r) => r.role_code)
  }

  /** 角色 → 菜单权限码集合（对齐 Java 的 roleMenuRepository + menuRepository.findAllById）。 */
  async findPermissionsByRoleIds(roleIds: number[]): Promise<string[]> {
    if (roleIds.length === 0) return []
    const menuRows = await this.db
      .selectFrom('sys_role_menu')
      .select('menu_id')
      .where('role_id', 'in', roleIds)
      .execute()
    const menuIds = [...new Set(menuRows.map((r) => r.menu_id))]
    if (menuIds.length === 0) return []

    const menus = await this.db
      .selectFrom('sys_menu')
      .select('permission')
      .where('id', 'in', menuIds)
      .execute()
    // Java 侧 filter(p -> p != null && !p.isEmpty()) 后放进 HashSet
    return [...new Set(menus.map((m) => m.permission).filter((p): p is string => !!p && p !== ''))]
  }

  async findOrgNameById(orgId: number): Promise<string | null> {
    const row = await this.db
      .selectFrom('sys_organization')
      .select('org_name')
      .where('id', '=', orgId)
      .executeTakeFirst()
    return row?.org_name ?? null
  }

  /** 顶级菜单（parent_id 为空）。 */
  async findRootMenus(): Promise<MenuRow[]> {
    return this.db
      .selectFrom('sys_menu')
      .select(['id', 'parent_id', 'menu_name', 'menu_type', 'path', 'component', 'permission', 'icon', 'sort_order'])
      .where('parent_id', 'is', null)
      .orderBy('sort_order', 'asc')
      .execute()
  }

  /** 某父菜单下的子菜单。 */
  async findMenusByParentId(parentId: number): Promise<MenuRow[]> {
    return this.db
      .selectFrom('sys_menu')
      .select(['id', 'parent_id', 'menu_name', 'menu_type', 'path', 'component', 'permission', 'icon', 'sort_order'])
      .where('parent_id', '=', parentId)
      .orderBy('sort_order', 'asc')
      .execute()
  }

  /** 角色 → 菜单 ID 列表（对齐 Java 的 roleMenuRepository.findByRoleIdIn）。 */
  async findMenuIdsByRoleIds(roleIds: number[]): Promise<number[]> {
    if (roleIds.length === 0) return []
    const rows = await this.db
      .selectFrom('sys_role_menu')
      .select('menu_id')
      .where('role_id', 'in', roleIds)
      .execute()
    return [...new Set(rows.map((r) => r.menu_id))]
  }

  /** 按 ID 批量查菜单（用于非管理员的树构建）。 */
  async findMenusByIds(menuIds: number[]): Promise<MenuRow[]> {
    if (menuIds.length === 0) return []
    return this.db
      .selectFrom('sys_menu')
      .select(['id', 'parent_id', 'menu_name', 'menu_type', 'path', 'component', 'permission', 'icon', 'sort_order'])
      .where('id', 'in', menuIds)
      .execute()
  }

  /** 菜单的启用状态与删除标记（Java 侧在内存里 filter，这里一并取出）。 */
  async findMenuFlags(menuIds: number[]): Promise<Map<number, { status: number; is_deleted: number }>> {
    if (menuIds.length === 0) return new Map()
    const rows = await this.db
      .selectFrom('sys_menu')
      .select(['id', 'status', 'is_deleted'])
      .where('id', 'in', menuIds)
      .execute()
    return new Map(rows.map((r) => [r.id, { status: r.status, is_deleted: r.is_deleted }]))
  }
}
