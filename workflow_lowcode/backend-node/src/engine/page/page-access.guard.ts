import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import { BusinessException } from '../../common/exception/business-exception'
import type { DB } from '../../framework/database/types'
import { KYSELY } from '../../framework/database/database.module'
import type { LoginUser } from '../../framework/security/jwt-auth.guard'

/** 挂接菜单行（只取 PageMenuResponse.MenuItem 需要的列）。 */
export interface PageMenuRow {
  id: number
  menu_name: string
  path: string | null
  parent_id: number | null
  permission: string | null
  status: number
}

/**
 * 页面访问校验（对齐 Java `PageAccessGuard`）。
 *
 * 规则（OR 语义）：
 *   - 该页面 key 没有任何未删除菜单 → **404**（不暴露页面存在）
 *   - 禁用菜单（status != 1）与无权限码的菜单不参与授权
 *   - 命中任一关联菜单的权限码 → 放行
 *   - 全部可授权菜单都没权限 → **403**
 *   - admin 角色直接放行
 *
 * ⚠️ 与 Java 的差异（刻意且已知）：Java 在 JWT 过滤器里就把角色与权限装进
 *    `LoginUser`，这里按需查一次库。对**这些端点**判定结果等价，
 *    代价是每个受保护页面请求多两次查询。规格未决项 U14 记了这件事。
 */
@Injectable()
export class PageAccessGuard {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  async assertPageAccess(pageKey: string, user: LoginUser): Promise<void> {
    const menus = await this.findMenusByPath(`/page/${pageKey}`)
    if (menus.length === 0) {
      throw new BusinessException(404, '页面不存在或未挂接菜单')
    }

    const { roles, permissions } = await this.loadRolesAndPermissions(user.userId)
    // admin 绕过（兼容历史 'admin' 与系统角色 code 'ROLE_ADMIN'）
    if (roles.some((role) => role === 'admin' || role === 'ROLE_ADMIN')) return

    const granted = menus
      .filter((menu) => menu.status === 1)
      .map((menu) => menu.permission)
      .filter((p): p is string => p !== null && p.trim() !== '')
      .some((p) => permissions.includes(p))

    if (!granted) {
      throw new BusinessException(403, '无页面访问权限')
    }
  }

  /** 按 path 反查未删除菜单（对齐 `SysMenuRepository.findByPathAndIsDeleted(path, 0)`）。 */
  async findMenusByPath(path: string): Promise<PageMenuRow[]> {
    return this.db
      .selectFrom('sys_menu')
      .select(['id', 'menu_name', 'path', 'parent_id', 'permission', 'status'])
      .where('path', '=', path)
      .where('is_deleted', '=', 0)
      .execute()
  }

  /** 当前用户的角色编码与权限码（对齐 Java `LoginUserService.buildLoginUser` 的两段查询）。 */
  async loadRolesAndPermissions(
    userId: number,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const links = await this.db
      .selectFrom('sys_user_role')
      .select('role_id')
      .where('user_id', '=', userId)
      .execute()
    const roleIds = [...new Set(links.map((r) => r.role_id))]
    if (roleIds.length === 0) return { roles: [], permissions: [] }

    const roles = await this.db
      .selectFrom('sys_role')
      .select('role_code')
      .where('id', 'in', roleIds)
      .execute()

    const menuLinks = await this.db
      .selectFrom('sys_role_menu')
      .select('menu_id')
      .where('role_id', 'in', roleIds)
      .execute()
    const menuIds = [...new Set(menuLinks.map((r) => r.menu_id))]
    const permissions =
      menuIds.length === 0
        ? []
        : (
            await this.db
              .selectFrom('sys_menu')
              .select('permission')
              .where('id', 'in', menuIds)
              .execute()
          )
            .map((m) => m.permission)
            .filter((p): p is string => !!p && p !== '')

    return { roles: roles.map((r) => r.role_code), permissions: [...new Set(permissions)] }
  }
}
