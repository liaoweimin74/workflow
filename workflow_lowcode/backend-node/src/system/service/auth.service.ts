import { Injectable } from '@nestjs/common'
import { compare } from 'bcryptjs'
import { BusinessException } from '../../common/exception/business-exception'
import { JwtTokenProvider, REFRESH_TOKEN_TYPE } from '../../framework/security/jwt-token.provider'
import { AuthRepository, type MenuRow, type SysUserRow } from '../repository/auth.repository'

/**
 * 认证服务，逐条对齐 Java `AuthServiceImpl`。
 *
 * ⚠️ 重要事实（与规格早期假设不同，已由源码核实）：
 *   Java 侧的 `logout` 是 **no-op**（源码注释写着 "No-op: Redis disabled"），
 *   `refreshToken` 也**完全不使用 Redis** —— 只校验 JWT 后重发新令牌。
 *   因此认证**不需要 Redis**。
 */

export interface UserInfoVO {
  id: number
  username: string
  nickname: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  orgId: number | null
  orgName: string | null
  roles: string[]
  permissions: string[]
}

export interface LoginResponseVO {
  accessToken: string | null
  refreshToken: string | null
  user: UserInfoVO
}

/** 菜单树节点。children 为空时必须是 **null**（对齐 Java toMenuTree 的三元表达式）。 */
export interface MenuTreeVO {
  id: number
  parentId: number | null
  menuName: string
  menuType: number
  path: string | null
  component: string | null
  permission: string | null
  icon: string | null
  sortOrder: number | null
  children: MenuTreeVO[] | null
}

@Injectable()
export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly jwt: JwtTokenProvider,
  ) {}

  async login(username: string, password: string): Promise<LoginResponseVO> {
    const user = await this.repo.findUserByUsername(username)
    // 用户不存在与密码错误共用同一条消息（不泄露账号是否存在）
    if (user === null) throw new BusinessException('用户名或密码错误')

    const matched = await compare(password, user.password)
    if (!matched) throw new BusinessException('用户名或密码错误')

    if (user.status !== 1) throw new BusinessException('账号已被禁用')

    return {
      accessToken: this.jwt.createAccessToken(user.id, user.username),
      refreshToken: this.jwt.createRefreshToken(user.id, user.username),
      user: await this.buildUserInfo(user),
    }
  }

  /**
   * 登出。**故意为 no-op**：Java 侧实现就是空方法（Redis 未启用，没有黑名单）。
   * 保持 no-op 才能让契约一致 —— 登出后原 token 仍然可用。
   */
  logout(): void {
    // no-op（对齐 Java AuthServiceImpl.logout）
  }

  async refreshToken(refreshToken: string): Promise<LoginResponseVO> {
    if (!this.jwt.validateToken(refreshToken)) {
      throw new BusinessException('Refresh Token 无效或已过期')
    }
    // 必须是 refresh 类型的令牌（不能拿 access token 来换）
    if (this.jwt.getTokenType(refreshToken) !== REFRESH_TOKEN_TYPE) {
      throw new BusinessException('Refresh Token 无效或已过期')
    }

    const userId = this.jwt.getUserIdFromToken(refreshToken)
    const user = await this.repo.findUserById(userId)
    if (user === null) throw new BusinessException('用户不存在')

    return {
      accessToken: this.jwt.createAccessToken(user.id, user.username),
      refreshToken: this.jwt.createRefreshToken(user.id, user.username),
      user: await this.buildUserInfo(user),
    }
  }

  /** 当前用户信息。token 两个字段为 null（对齐 Java getCurrentUser）。 */
  async getCurrentUser(userId: number): Promise<LoginResponseVO> {
    const user = await this.repo.findUserById(userId)
    if (user === null) throw new BusinessException('用户不存在')
    return { accessToken: null, refreshToken: null, user: await this.buildUserInfo(user) }
  }

  private async buildUserInfo(user: SysUserRow): Promise<UserInfoVO> {
    const roleIds = await this.repo.findRoleIdsByUserId(user.id)
    const roles = await this.repo.findRoleCodesByIds(roleIds)
    const permissions = await this.repo.findPermissionsByRoleIds(roleIds)
    const orgName = user.org_id === null ? null : await this.repo.findOrgNameById(user.org_id)

    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar,
      orgId: user.org_id,
      orgName,
      roles,
      permissions,
    }
  }

  /**
   * 当前用户的菜单树，逐条对齐 Java `getCurrentUserMenus`：
   *   - 管理员（含 ROLE_ADMIN）→ 取全部顶级菜单，不做权限过滤
   *   - 非管理员 → 取授权菜单并**向上回溯补齐祖先目录**，保证父级目录也在列表里
   *   - 逐级过滤 is_deleted==0 且 status==1
   */
  async getCurrentUserMenus(userId: number): Promise<MenuTreeVO[]> {
    const roleIds = await this.repo.findRoleIdsByUserId(userId)
    const roleCodes = await this.repo.findRoleCodesByIds(roleIds)
    const isAdmin = roleCodes.includes('ROLE_ADMIN')

    if (isAdmin) {
      const roots = await this.repo.findRootMenus()
      return this.buildMenuTree(roots, null)
    }

    // 非管理员：取授权菜单 + 回溯祖先
    const authorized = await this.collectAuthorizedMenus(roleIds)
    const roots = authorized.roots
    return this.buildMenuTree(roots, new Set(authorized.allIds))
  }

  /** 收集授权菜单及其全部祖先，返回顶级祖先（按 sortOrder 升序）与全部授权 ID。 */
  private async collectAuthorizedMenus(
    roleIds: number[],
  ): Promise<{ roots: MenuRow[]; allIds: number[] }> {
    const menuIds = await this.repo.findMenuIdsByRoleIds(roleIds)
    const cache = new Map<number, MenuRow>()
    const rootIds = new Set<number>()

    for (const menuId of menuIds) {
      const menu = (await this.repo.findMenusByIds([menuId]))[0]
      if (menu === undefined) continue
      cache.set(menu.id, menu)

      // 向上回溯祖先，保证父级目录也出现在列表里（对齐 Java 的回溯逻辑）
      let current = menu
      while (current.parent_id !== null) {
        if (cache.has(current.parent_id)) break
        const parent = (await this.repo.findMenusByIds([current.parent_id]))[0]
        if (parent === undefined) break
        cache.set(parent.id, parent)
        current = parent
      }
      if (current.parent_id === null) rootIds.add(current.id)
    }

    const roots = [...rootIds]
      .map((id) => cache.get(id))
      .filter((m): m is MenuRow => m !== undefined)
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

    return { roots, allIds: [...cache.keys()] }
  }

  private async buildMenuTree(
    menus: MenuRow[],
    authorizedMenuIds: Set<number> | null,
  ): Promise<MenuTreeVO[]> {
    const allowed = await this.filterAllowed(menus, authorizedMenuIds)
    return Promise.all(allowed.map((m) => this.toMenuTree(m, authorizedMenuIds)))
  }

  /** 逐级过滤：is_deleted == 0 且 status == 1，且（无授权集合 或 在授权集合内）。 */
  private async filterAllowed(
    menus: MenuRow[],
    authorizedMenuIds: Set<number> | null,
  ): Promise<MenuRow[]> {
    const flags = await this.repo.findMenuFlags(menus.map((m) => m.id))
    return menus.filter((m) => {
      const flag = flags.get(m.id)
      if (flag === undefined) return false
      if (flag.is_deleted !== 0) return false
      if (flag.status !== 1) return false
      if (authorizedMenuIds !== null && !authorizedMenuIds.has(m.id)) return false
      return true
    })
  }

  private async toMenuTree(
    menu: MenuRow,
    authorizedMenuIds: Set<number> | null,
  ): Promise<MenuTreeVO> {
    const rawChildren = await this.repo.findMenusByParentId(menu.id)
    const allowedChildren = await this.filterAllowed(rawChildren, authorizedMenuIds)
    const children = await Promise.all(
      allowedChildren.map((c) => this.toMenuTree(c, authorizedMenuIds)),
    )

    return {
      id: menu.id,
      parentId: menu.parent_id,
      menuName: menu.menu_name,
      menuType: menu.menu_type,
      path: menu.path,
      component: menu.component,
      permission: menu.permission,
      icon: menu.icon,
      sortOrder: menu.sort_order,
      // ⚠️ 空时必须为 null 而非 []（对齐 Java 的 childTrees.isEmpty() ? null : childTrees）
      children: children.length === 0 ? null : children,
    }
  }
}
