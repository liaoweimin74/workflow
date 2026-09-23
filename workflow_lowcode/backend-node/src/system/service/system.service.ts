import { Injectable } from '@nestjs/common'
import { hash } from 'bcryptjs'
import { PageResult } from '../../common/domain/page-result'
import { BusinessException } from '../../common/exception/business-exception'
import { assertPageSize } from '../../framework/http/query-params'
import type {
  DictDataRow,
  DictTypeRow,
  MenuRow,
  OrgRow,
  OrgRowFull,
  RoleRow,
  UserRow,
} from '../repository/system.repository'
import { SystemRepository } from '../repository/system.repository'

/**
 * 新建/重置用户时的初始密码，对齐 Java `GlobalConstant.DEFAULT_PASSWORD`。
 */
const DEFAULT_PASSWORD = '123456'

/**
 * bcrypt 强度。
 *
 * ⚠️ 必须与 Java 的 `new BCryptPasswordEncoder()` 默认值一致（10）——
 *    否则新建用户拿去登录时校验仍然通过（bcrypt 的强度写在哈希里，校验时读哈希），
 *    但两边产出的哈希格式会不同。这里对齐它是为了让行为完全一致。
 */
const BCRYPT_ROUNDS = 10

/** 计算密码哈希。 */
async function hashPassword(plain: string): Promise<string> {
  return hash(plain, BCRYPT_ROUNDS)
}

/**
 * 系统管理服务（对齐 Java `com.workflow.system.service`）。
 *
 * ⚠️ 分页形状在这里是 `PageResult{total,page,size,rows}`，
 *    而流程模块用的是 `PageResponse{content,pageNumber,...}` ——
 *    本项目三种分页形状并存，必须按端点各自的黄金样本选（规格 §5.4.1）。
 */

export interface UserVO {
  id: number
  username: string
  nickname: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  orgId: number | null
  orgName: string | null
  status: number
  createdAt: Date | null
  roleIds: number[]
}

export interface RoleVO {
  id: number
  roleName: string
  roleCode: string
  description: string | null
  status: number
  createdAt: Date | null
}

/** 菜单树（与认证模块的 MenuTree 同构）。 */
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

/** 组织树。注意字段名是 label / code，不是 orgName / orgCode（实测确认）。 */
export interface TreeNodeVO {
  id: number
  parentId: number | null
  label: string
  code: string
  sortOrder: number | null
  status: number | null
  children: TreeNodeVO[] | null
}

export interface DictTypeVO {
  id: number
  dictCode: string
  dictName: string
  remark: string | null
  status: number
  createdAt: Date | null
}

/** 字典数据 VO，对齐 Java `DictDataVO`（7 个字段）。 */
export interface DictDataVO {
  id: number
  dictCode: string
  label: string
  value: string
  sortOrder: number | null
  status: number
  createdAt: Date | null
}

@Injectable()
export class SystemService {
  constructor(private readonly repo: SystemRepository) {}

  async listUsers(page: number, size: number): Promise<PageResult<UserVO>> {
    // Java 走 `PageRequest.of(page - 1, size)` ⇒ size < 1 抛 IllegalArgumentException → HTTP 400
    assertPageSize(size)
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.repo.listUsers((safePage - 1) * size, size)
    return new PageResult(total, safePage, size, await this.toUserVOs(rows))
  }

  /**
   * 按用户名模糊分页查用户（`/api/v1/internal/system/users` 用）。
   *
   * ⚠️ 与 `listUsers` 的区别有两处，都对齐 Java：
   *    1. 过滤条件是 **username 模糊**（调用方传的 `keyword` 落到 `UserQueryRequest.username`）
   *    2. 排序是 `created_at DESC`，而管理端 `/api/users` 用的是 `id ASC`
   *    这两个函数**不能合并** —— 合并必然丢掉其中一边的行为。
   */
  async listUsersByUsername(
    username: string | null,
    page: number,
    size: number,
  ): Promise<PageResult<UserVO>> {
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.repo.listUsersByUsername(
      username,
      (safePage - 1) * size,
      size,
    )
    return new PageResult(total, safePage, size, await this.toUserVOs(rows))
  }

  /** 按 id 查用户；不存在抛 `用户不存在`（对齐 Java `UserServiceImpl.getById`）。 */
  async getUserById(id: number): Promise<UserVO> {
    const row = await this.repo.findUserById(id)
    if (row === null) throw new BusinessException('用户不存在')
    return (await this.toUserVOs([row]))[0]
  }

  /**
   * 按 id 批量查用户（对齐 Java `UserServiceImpl.findByIds`）。
   *
   * ⚠️ 入参为空时返回**空数组**而不是「全部用户」—— 这是 Java 的显式短路。
   *    少了这一句，`?ids=`（被解析成空列表）就会退化成全表查询。
   * ⚠️ Java 用 `findAllById`，**返回顺序不保证**与入参一致；这里保持同样的语义
   *    （按库返回顺序），不擅自按入参排序 —— 排序会让两侧在数据变化时分叉。
   */
  async getUsersByIds(ids: number[]): Promise<UserVO[]> {
    if (ids.length === 0) return []
    const rows = await this.repo.findUsersByIds(ids)
    return this.toUserVOs(rows)
  }

  /** UserRow[] → UserVO[]（补齐 roleIds / orgName）。 */
  private async toUserVOs(
    rows: Awaited<ReturnType<SystemRepository['listUsers']>>['rows'],
  ): Promise<UserVO[]> {
    const roleMap = await this.repo.findRoleIdsByUserIds(rows.map((r) => r.id))
    const orgMap = await this.repo.findOrgNames(
      rows.map((r) => r.org_id).filter((id): id is number => id !== null),
    )
    return rows.map((row) => ({
      id: row.id,
      username: row.username,
      nickname: row.nickname,
      email: row.email,
      phone: row.phone,
      avatar: row.avatar,
      orgId: row.org_id,
      orgName: row.org_id === null ? null : (orgMap.get(row.org_id) ?? null),
      status: row.status,
      createdAt: row.created_at,
      roleIds: roleMap.get(row.id) ?? [],
    }))
  }

  async listRoles(page: number, size: number): Promise<PageResult<RoleVO>> {
    assertPageSize(size)
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.repo.listRoles((safePage - 1) * size, size)

    const vos: RoleVO[] = rows.map((row) => ({
      id: row.id,
      roleName: row.role_name,
      roleCode: row.role_code,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
    }))

    return new PageResult(total, safePage, size, vos)
  }

  /** 菜单树（管理端，取全部未删除菜单，不做角色过滤）。 */
  async menuTree(): Promise<MenuTreeVO[]> {
    const menus = await this.repo.listAllMenus()

    const byParent = new Map<number | null, typeof menus>()
    for (const menu of menus) {
      const list = byParent.get(menu.parent_id) ?? []
      list.push(menu)
      byParent.set(menu.parent_id, list)
    }

    const build = (parentId: number | null): MenuTreeVO[] =>
      (byParent.get(parentId) ?? []).map((menu) => {
        const children = build(menu.id)
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
          // 空 children 必须是 null 而非 []（对齐 Java 的三元表达式）
          children: children.length === 0 ? null : children,
        }
      })

    return build(null)
  }

  /** 组织树。 */
  async orgTree(): Promise<TreeNodeVO[]> {
    const orgs = await this.repo.listAllOrgs()

    const byParent = new Map<number | null, typeof orgs>()
    for (const org of orgs) {
      const list = byParent.get(org.parent_id) ?? []
      list.push(org)
      byParent.set(org.parent_id, list)
    }

    const build = (parentId: number | null): TreeNodeVO[] =>
      (byParent.get(parentId) ?? [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((org) => {
          const children = build(org.id)
          return {
            id: org.id,
            parentId: org.parent_id,
            // ⚠️ 字段名是 label / code（实测确认），不是 orgName / orgCode
            label: org.org_name,
            code: org.org_code,
            sortOrder: org.sort_order,
            status: org.status,
            children: children.length === 0 ? null : children,
          }
        })

    return build(null)
  }

  async listDictTypes(page: number, size: number): Promise<PageResult<DictTypeVO>> {
    assertPageSize(size)
    const safePage = Math.max(page, 1)
    const { rows, total } = await this.repo.listDictTypes((safePage - 1) * size, size)

    const vos: DictTypeVO[] = rows.map((row) => ({
      id: row.id,
      dictCode: row.dict_code,
      dictName: row.dict_name,
      remark: row.remark,
      status: row.status,
      createdAt: row.created_at,
    }))

    return new PageResult(total, safePage, size, vos)
  }

  // ------------------------------------------------------------ 角色（写）

  async createRole(request: {
    roleName: string
    roleCode: string
    description?: string
    status?: number
  }): Promise<RoleVO> {
    if (await this.repo.roleCodeExists(request.roleCode)) {
      throw new BusinessException(`角色编码已存在: ${request.roleCode}`)
    }
    const id = await this.repo.insertRole({
      role_name: request.roleName,
      role_code: request.roleCode,
      description: request.description ?? null,
      status: request.status ?? 1,
    })
    return this.requireRoleVO(id)
  }

  async updateRole(
    id: number,
    request: { roleName?: string; description?: string; status?: number },
  ): Promise<RoleVO> {
    await this.requireRole(id)
    const patch: Record<string, unknown> = {}
    if (request.roleName !== undefined) patch.role_name = request.roleName
    if (request.description !== undefined) patch.description = request.description
    if (request.status !== undefined) patch.status = request.status
    await this.repo.updateRole(id, patch)
    return this.requireRoleVO(id)
  }

  async deleteRole(id: number): Promise<void> {
    // 内置超管角色不允许删除 —— 删掉会让系统失去唯一的管理入口
    if (id === 1) throw new BusinessException('超级管理员角色不允许删除')
    await this.requireRole(id)
    await this.repo.deleteRole(id)
  }

  async getRoleMenus(roleId: number): Promise<number[]> {
    await this.requireRole(roleId)
    return this.repo.findMenuIdsByRoleId(roleId)
  }

  async assignRoleMenus(roleId: number, menuIds: number[]): Promise<void> {
    await this.requireRole(roleId)
    await this.repo.replaceRoleMenus(roleId, menuIds)
  }

  private async requireRole(id: number): Promise<RoleRow> {
    const role = await this.repo.findRoleById(id)
    if (role === null || role.status === undefined) {
      throw new BusinessException(`角色不存在: ${id}`)
    }
    return role
  }

  private async requireRoleVO(id: number): Promise<RoleVO> {
    const row = await this.requireRole(id)
    return {
      id: row.id,
      roleName: row.role_name,
      roleCode: row.role_code,
      description: row.description,
      status: row.status,
      createdAt: row.created_at,
    }
  }

  // ------------------------------------------------------------ 字典类型（写）

  async createDictType(request: {
    dictCode: string
    dictName: string
    remark?: string
    status?: number
  }): Promise<DictTypeVO> {
    const id = await this.repo.insertDictType({
      dict_code: request.dictCode,
      dict_name: request.dictName,
      remark: request.remark ?? null,
      status: request.status ?? 1,
    })
    return this.requireDictTypeVO(id)
  }

  async updateDictType(
    id: number,
    request: { dictName?: string; remark?: string; status?: number },
  ): Promise<DictTypeVO> {
    await this.requireDictType(id)
    const patch: Record<string, unknown> = {}
    if (request.dictName !== undefined) patch.dict_name = request.dictName
    if (request.remark !== undefined) patch.remark = request.remark
    if (request.status !== undefined) patch.status = request.status
    await this.repo.updateDictType(id, patch)
    return this.requireDictTypeVO(id)
  }

  async deleteDictType(id: number): Promise<void> {
    await this.requireDictType(id)
    await this.repo.deleteDictType(id)
  }

  private async requireDictType(id: number): Promise<DictTypeRow> {
    const row = await this.repo.findDictTypeById(id)
    if (row === null) throw new BusinessException(`字典类型不存在: ${id}`)
    return row
  }

  private async requireDictTypeVO(id: number): Promise<DictTypeVO> {
    const row = await this.requireDictType(id)
    return {
      id: row.id,
      dictCode: row.dict_code,
      dictName: row.dict_name,
      remark: row.remark,
      status: row.status,
      createdAt: row.created_at,
    }
  }

  // ------------------------------------------------------------ 字典数据

  /**
   * 按字典编码列出字典数据（过滤已逻辑删除的行）。
   *
   * ⚠️ 过滤在**服务层**做（对齐 Java：SQL 查全量 + stream filter）。
   *    删完再查应返回 `[]` —— 契约场景把这条钉住了。
   */
  async listDictData(dictCode: string): Promise<DictDataVO[]> {
    const rows = await this.repo.listDictDataByCode(dictCode)
    return rows.filter((row) => row.is_deleted === 0).map(toDictDataVO)
  }

  /** 新建字典数据。字典类型不存在 → 业务异常（HTTP 200 + code 500）。 */
  async createDictData(request: {
    dictCode: string
    label: string
    value: string
    sortOrder?: number | null
    status?: number | null
  }): Promise<DictDataVO> {
    await this.requireDictTypeExists(request.dictCode)
    const id = await this.repo.insertDictData({
      dict_code: request.dictCode,
      label: request.label,
      value: request.value,
      // sortOrder 为空落 0、status 为空落 1（对齐 Java）
      sort_order: request.sortOrder ?? 0,
      status: request.status ?? 1,
    })
    return toDictDataVO(await this.requireDictData(id))
  }

  /**
   * 修改字典数据。
   *
   * ⚠️ 字段都是「有文本才改」/「非 null 才改」（对齐 Java 的 `StringUtils.hasText`
   *    与 `!= null`）—— 传空串等于不改，传 null 也等于不改。
   */
  async updateDictData(
    id: number,
    request: {
      dictCode?: string | null
      label?: string | null
      value?: string | null
      sortOrder?: number | null
      status?: number | null
    },
  ): Promise<DictDataVO> {
    await this.requireDictData(id)
    const patch: Partial<DictDataRow> = {}
    if (hasText(request.dictCode)) {
      await this.requireDictTypeExists(String(request.dictCode))
      patch.dict_code = String(request.dictCode)
    }
    if (hasText(request.label)) patch.label = String(request.label)
    if (hasText(request.value)) patch.value = String(request.value)
    if (request.sortOrder !== null && request.sortOrder !== undefined) {
      patch.sort_order = request.sortOrder
    }
    if (request.status !== null && request.status !== undefined) patch.status = request.status
    if (Object.keys(patch).length > 0) await this.repo.updateDictData(id, patch)
    return toDictDataVO(await this.requireDictData(id))
  }

  /** 删除字典数据（**软删除**）。 */
  async deleteDictData(id: number): Promise<void> {
    const row = await this.repo.findDictDataById(id)
    if (row === null) throw new BusinessException('字典数据不存在')
    await this.repo.softDeleteDictData(id)
  }

  private async requireDictData(id: number): Promise<DictDataRow> {
    const row = await this.repo.findDictDataById(id)
    if (row === null) throw new BusinessException('字典数据不存在')
    return row
  }

  private async requireDictTypeExists(dictCode: string): Promise<void> {
    if ((await this.repo.findDictTypeByCode(dictCode)) === null) {
      throw new BusinessException('字典类型不存在')
    }
  }

  // ------------------------------------------------------------ 用户（写）

  /**
   * 新建用户。
   *
   * ⚠️ 用户名查重**不过滤 `is_deleted`**（Java 的 `findByUsername` 是派生查询，
   *    没有这个条件）—— 于是「已逻辑删除的用户仍会挡住同名新建」。
   *    这是 Java 的行为，照抄。
   * ⚠️ 初始密码是 `bcrypt(DEFAULT_PASSWORD)`，`DEFAULT_PASSWORD = "123456"`。
   *    用 bcryptjs 的默认强度 10，与 Java 的 `new BCryptPasswordEncoder()` 一致 ——
   *    这样新建出来的用户**能真的登录**（不只是形状对）。
   */
  async createUser(request: {
    username: string
    nickname: string
    email?: string | null
    phone?: string | null
    orgId?: number | null
    roleIds?: number[] | null
    status?: number | null
  }): Promise<UserVO> {
    if ((await this.repo.findUserByUsername(request.username)) !== null) {
      throw new BusinessException('用户名已存在')
    }
    const id = await this.repo.insertUser({
      username: request.username,
      nickname: request.nickname,
      password: await hashPassword(DEFAULT_PASSWORD),
      email: request.email ?? null,
      phone: request.phone ?? null,
      org_id: request.orgId ?? null,
      status: request.status ?? 1,
    })
    // Java 是逐个 save，**不做去重**；重复的 roleId 会插出重复行
    if (request.roleIds !== null && request.roleIds !== undefined) {
      for (const roleId of request.roleIds) {
        await this.repo.insertUserRole(id, roleId)
      }
    }
    return this.getUserById(id)
  }

  /**
   * 修改用户。
   *
   * ⚠️ `roleIds` 的语义是**整批替换**：Java 把「已有序」与「新序」各自排序后比较，
   *    不同才删旧插新。这里照抄 —— 包括「相同就什么都不做」
   *    （直接重插会改变行顺序，进而让 `roleIds` 的返回顺序漂移）。
   */
  async updateUser(
    id: number,
    request: {
      nickname?: string | null
      email?: string | null
      phone?: string | null
      orgId?: number | null
      roleIds?: number[] | null
      status?: number | null
    },
  ): Promise<UserVO> {
    await this.requireUser(id)
    const patch: Partial<UserRow> = {}
    if (hasText(request.nickname)) patch.nickname = String(request.nickname)
    if (hasText(request.email)) patch.email = String(request.email)
    if (hasText(request.phone)) patch.phone = String(request.phone)
    if (request.orgId !== null && request.orgId !== undefined) patch.org_id = request.orgId
    if (request.status !== null && request.status !== undefined) patch.status = request.status
    if (Object.keys(patch).length > 0) await this.repo.updateUser(id, patch)

    if (request.roleIds !== null && request.roleIds !== undefined) {
      const existing = (await this.repo.findRoleIdsByUserIds([id])).get(id) ?? []
      const existingSorted = [...existing].sort((a, b) => a - b)
      const newSorted = [...request.roleIds].sort((a, b) => a - b)
      if (existingSorted.join(',') !== newSorted.join(',')) {
        await this.repo.deleteUserRoles(id)
        for (const roleId of newSorted) {
          await this.repo.insertUserRole(id, roleId)
        }
      }
    }
    return this.getUserById(id)
  }

  /** 删除用户（**逻辑删除**）。 */
  async deleteUser(id: number): Promise<void> {
    await this.requireUser(id)
    await this.repo.softDeleteUser(id)
  }

  /** 修改用户状态。 */
  async updateUserStatus(id: number, status: number | null): Promise<void> {
    await this.requireUser(id)
    await this.repo.updateUser(id, { status: status ?? 0 })
  }

  /** 重置密码为 `bcrypt(DEFAULT_PASSWORD)`。 */
  async resetUserPassword(id: number): Promise<void> {
    await this.requireUser(id)
    await this.repo.updateUser(id, { password: await hashPassword(DEFAULT_PASSWORD) })
  }

  private async requireUser(id: number): Promise<UserRow> {
    const row = await this.repo.findUserById(id)
    if (row === null) throw new BusinessException('用户不存在')
    return row
  }

  // ------------------------------------------------------------ 菜单（写）
  //
  // ⚠️ 这三个端点**不在契约网里** —— Java 的 `POST /api/menus` 因
  //    `@NotBlank Integer menuType` 恒 500，无法产出 golden（规格 U19）。
  //    Node 侧按**正确语义**实现（新建应成功），行为正确性由集成测试保证。
  //    这是刻意的行为差异：Java 那边是缺陷，不是契约。

  /** 新建菜单（`sortOrder` 空落 0、`status` 空落 1）。 */
  async createMenu(request: {
    parentId: number | null
    menuName: string
    menuType: number
    path?: string | null
    component?: string | null
    permission?: string | null
    icon?: string | null
    sortOrder?: number | null
    status?: number | null
  }): Promise<MenuTreeVO> {
    const id = await this.repo.insertMenu({
      parent_id: request.parentId,
      menu_name: request.menuName,
      menu_type: request.menuType,
      path: request.path ?? null,
      component: request.component ?? null,
      permission: request.permission ?? null,
      icon: request.icon ?? null,
      sort_order: request.sortOrder ?? 0,
      status: request.status ?? 1,
    })
    return this.menuTreeOf(id)
  }

  /**
   * 修改菜单。
   *
   * ⚠️ **`parentId` 不可改** —— Java 的 `MenuUpdateRequest` 里没有这个字段。
   *    字段语义：`menuName` 是「有文本才改」，其余是「非 null 才改」。
   */
  async updateMenu(
    id: number,
    request: {
      menuName?: string | null
      menuType?: number | null
      path?: string | null
      component?: string | null
      permission?: string | null
      icon?: string | null
      sortOrder?: number | null
      status?: number | null
    },
  ): Promise<MenuTreeVO> {
    await this.requireMenu(id)
    const patch: Partial<MenuRow> = {}
    if (hasText(request.menuName)) patch.menu_name = String(request.menuName)
    if (request.menuType !== null && request.menuType !== undefined) patch.menu_type = request.menuType
    if (request.path !== null && request.path !== undefined) patch.path = request.path
    if (request.component !== null && request.component !== undefined) patch.component = request.component
    if (request.permission !== null && request.permission !== undefined) patch.permission = request.permission
    if (request.icon !== null && request.icon !== undefined) patch.icon = request.icon
    if (request.sortOrder !== null && request.sortOrder !== undefined) patch.sort_order = request.sortOrder
    if (request.status !== null && request.status !== undefined) patch.status = request.status
    if (Object.keys(patch).length > 0) await this.repo.updateMenu(id, patch)
    return this.menuTreeOf(id)
  }

  /** 删除菜单（**软删除**）；有子菜单时拒绝。 */
  async deleteMenu(id: number): Promise<void> {
    await this.requireMenu(id)
    if ((await this.repo.countMenusByParentId(id)) > 0) {
      throw new BusinessException('存在子菜单，无法删除')
    }
    await this.repo.softDeleteMenu(id)
  }

  private async requireMenu(id: number): Promise<MenuRow> {
    const row = await this.repo.findMenuById(id)
    if (row === null) throw new BusinessException('菜单不存在')
    return row
  }

  /** 取单个菜单并组装其子树（对齐 Java `toMenuTree`，空 children 为 null）。 */
  private async menuTreeOf(id: number): Promise<MenuTreeVO> {
    const row = await this.requireMenu(id)
    const menus = await this.repo.listAllMenus()
    const byParent = new Map<number | null, typeof menus>()
    for (const menu of menus) {
      const list = byParent.get(menu.parent_id) ?? []
      list.push(menu)
      byParent.set(menu.parent_id, list)
    }
    const build = (menu: (typeof menus)[number]): MenuTreeVO => {
      const children = (byParent.get(menu.id) ?? []).map(build)
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
        // 空 children 必须是 null 而非 []（对齐 Java 的三元表达式）
        children: children.length === 0 ? null : children,
      }
    }
    return build(menus.find((m) => m.id === row.id) ?? toMenuRowLike(row))
  }

  // ------------------------------------------------------------ 组织（写）

  /** 新建组织（`sortOrder` 空落 0、`status` 空落 1）。 */
  async createOrg(request: {
    parentId: number | null
    orgName: string
    orgCode: string
    sortOrder?: number | null
    status?: number | null
  }): Promise<TreeNodeVO> {
    const id = await this.repo.insertOrg({
      parent_id: request.parentId,
      org_name: request.orgName,
      org_code: request.orgCode,
      sort_order: request.sortOrder ?? 0,
      status: request.status ?? 1,
    })
    return this.orgTreeNodeOf(id)
  }

  /**
   * 修改组织。
   *
   * ⚠️ **`parentId` 不可改** —— Java 的 `OrganizationUpdateRequest` 里没有这个字段。
   *    字段语义：`orgName`/`orgCode` 是「有文本才改」，其余是「非 null 才改」。
   */
  async updateOrg(
    id: number,
    request: {
      orgName?: string | null
      orgCode?: string | null
      sortOrder?: number | null
      status?: number | null
    },
  ): Promise<TreeNodeVO> {
    await this.requireOrg(id)
    const patch: Partial<OrgRowFull> = {}
    if (hasText(request.orgName)) patch.org_name = String(request.orgName)
    if (hasText(request.orgCode)) patch.org_code = String(request.orgCode)
    if (request.sortOrder !== null && request.sortOrder !== undefined) patch.sort_order = request.sortOrder
    if (request.status !== null && request.status !== undefined) patch.status = request.status
    if (Object.keys(patch).length > 0) await this.repo.updateOrg(id, patch)
    return this.orgTreeNodeOf(id)
  }

  /**
   * 删除组织（**软删除**）。三重校验，顺序不可换（决定报哪条错误）：
   *   不存在 → 有子节点 → 有用户。
   */
  async deleteOrg(id: number): Promise<void> {
    await this.requireOrg(id)
    if ((await this.repo.countOrgsByParentId(id)) > 0) {
      throw new BusinessException('存在子节点，无法删除')
    }
    if ((await this.repo.countUsersByOrgId(id)) > 0) {
      throw new BusinessException('该机构下存在用户，无法删除')
    }
    await this.repo.softDeleteOrg(id)
  }

  private async requireOrg(id: number): Promise<OrgRowFull> {
    const row = await this.repo.findOrgById(id)
    if (row === null) throw new BusinessException('组织机构不存在')
    return row
  }

  /** 取单个组织并组装其子树（对齐 Java `toTreeNode`，空 children 为 null）。 */
  private async orgTreeNodeOf(id: number): Promise<TreeNodeVO> {
    const orgs = await this.repo.listAllOrgs()
    const byParent = new Map<number | null, OrgRow[]>()
    for (const org of orgs) {
      const list = byParent.get(org.parent_id) ?? []
      list.push(org)
      byParent.set(org.parent_id, list)
    }
    const build = (org: OrgRow): TreeNodeVO => {
      const children = (byParent.get(org.id) ?? [])
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map(build)
      return {
        id: org.id,
        parentId: org.parent_id,
        // ⚠️ 字段名是 label / code（实测确认），不是 orgName / orgCode
        label: org.org_name,
        code: org.org_code,
        sortOrder: org.sort_order,
        status: org.status,
        children: children.length === 0 ? null : children,
      }
    }
    const row = await this.requireOrg(id)
    const found = orgs.find((o) => o.id === id)
    return build(found ?? { ...row })
  }
}

/** 把 `MenuRow` 补成 `listAllMenus` 的元素形状（`menuTreeOf` 内部用）。 */
function toMenuRowLike(row: MenuRow): {
  id: number
  parent_id: number | null
  menu_name: string
  menu_type: number
  path: string | null
  component: string | null
  permission: string | null
  icon: string | null
  sort_order: number | null
} {
  return {
    id: row.id,
    parent_id: row.parent_id,
    menu_name: row.menu_name,
    menu_type: row.menu_type,
    path: row.path,
    component: row.component,
    permission: row.permission,
    icon: row.icon,
    sort_order: row.sort_order,
  }
}

/** Java `StringUtils.hasText`：null / 空串 / 纯空白 都算「没给值」。 */
function hasText(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== ''
}
function toDictDataVO(row: DictDataRow): DictDataVO {
  return {
    id: row.id,
    dictCode: row.dict_code,
    label: row.label,
    value: row.value,
    sortOrder: row.sort_order,
    status: row.status,
    createdAt: row.created_at,
  }
}
