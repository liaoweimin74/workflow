import { Inject, Injectable } from '@nestjs/common'
import { Kysely } from 'kysely'
import { KYSELY } from '../../framework/database/database.module'
import type { DB } from '../../framework/database/types'

/**
 * 系统管理的数据访问（对齐 Java `com.workflow.system.repository` 下的各个 Repository）。
 *
 * 与认证模块共用 sys_* 表，但关注点不同：认证关心"我能登录吗、我有什么权限"，
 * 这里关心"如何管理与展示用户/角色/菜单/组织/字典"。
 */

export interface UserRow {
  id: number
  username: string
  nickname: string | null
  email: string | null
  phone: string | null
  avatar: string | null
  org_id: number | null
  status: number
  created_at: Date | null
}

export interface RoleRow {
  id: number
  role_name: string
  role_code: string
  description: string | null
  status: number
  created_at: Date | null
}

export interface OrgRow {
  id: number
  org_code: string
  org_name: string
  parent_id: number | null
  sort_order: number | null
  status: number | null
}

/** 组织行的完整形态（写路径需要 `is_deleted`）。 */
export interface OrgRowFull extends OrgRow {
  is_deleted: number
}

/** 菜单行的完整形态（写路径需要 status / is_deleted）。 */
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
  status: number
  is_deleted: number
}

export interface DictTypeRow {
  id: number
  dict_code: string
  dict_name: string
  remark: string | null
  status: number
  is_deleted: number
  created_at: Date | null
}

/** 字典数据行（`sys_dict_data`）。 */
export interface DictDataRow {
  id: number
  dict_code: string
  label: string
  value: string
  sort_order: number | null
  status: number
  is_deleted: number
  created_at: Date | null
}

@Injectable()
export class SystemRepository {
  constructor(@Inject(KYSELY) private readonly db: Kysely<DB>) {}

  // ------------------------------------------------------------ 用户

  async listUsers(
    offset: number,
    limit: number,
  ): Promise<{ rows: UserRow[]; total: number }> {
    const countRow = await this.db
      .selectFrom('sys_user')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('is_deleted', '=', 0)
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('sys_user')
      .select(['id', 'username', 'nickname', 'email', 'phone', 'avatar', 'org_id', 'status', 'created_at'])
      .where('is_deleted', '=', 0)
      // ⚠️ 排序必须是 `created_at DESC`（对齐 Java `UserServiceImpl.list` 的
      //    `Sort.by(DESC, "createdAt")`）。这里曾经写成 `id ASC`，
      //    两个用户时两种排序**恰好**给出同样结果所以一直没暴露；
      //    契约场景「用户写操作」造出第三个用户后立刻报错 —— 典型的「偶然成立」。
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows: rows as UserRow[], total: Number(countRow?.c ?? 0) }
  }

  /**
   * 按用户名分页查用户（对齐 Java `UserServiceImpl.list` 的 username 条件）。
   *
   * ⚠️ Java 侧 `internalUsers` 把查询参数 `keyword` 传进了 `UserQueryRequest.username`
   *    —— 也就是**按用户名**模糊，不是「用户名或昵称」。
   *    别按名字里的 keyword 想当然地扩大到多个字段。
   */
  async listUsersByUsername(
    username: string | null,
    offset: number,
    limit: number,
  ): Promise<{ rows: UserRow[]; total: number }> {
    let rowsQuery = this.db
      .selectFrom('sys_user')
      .select(['id', 'username', 'nickname', 'email', 'phone', 'avatar', 'org_id', 'status', 'created_at'])
      .where('is_deleted', '=', 0)
    let countQuery = this.db
      .selectFrom('sys_user')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('is_deleted', '=', 0)

    if (username !== null) {
      const pattern = `%${username}%`
      rowsQuery = rowsQuery.where('username', 'like', pattern)
      countQuery = countQuery.where('username', 'like', pattern)
    }

    const rows = await rowsQuery
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()
    const countRow = await countQuery.executeTakeFirst()
    return { rows: rows as UserRow[], total: Number(countRow?.c ?? 0) }
  }

  /**
   * 按 id 查用户。
   *
   * ⚠️ **不过滤 `is_deleted`** —— 这里曾经写成 `.where('is_deleted', '=', 0)`，
   *    还配了一句「对齐 Java」的注释，但那句注释是错的：Java 用的
   *    `userRepository.findById(id)` 是 JPA 内建方法，SQL 里**没有** `is_deleted` 条件。
   *    后果是「软删除之后再按 id 查」两侧行为不同（Java 返回用户、Node 报用户不存在）。
   *    这个分歧被契约场景「用户写操作」的 `userByIdAfterDelete` 步骤抓了出来 ——
   *    该步骤是特意加的，就是为了让契约网自己去发现它（而不是靠人去"觉得"）。
   */
  async findUserById(id: number): Promise<UserRow | null> {
    const row = await this.db
      .selectFrom('sys_user')
      .select(['id', 'username', 'nickname', 'email', 'phone', 'avatar', 'org_id', 'status', 'created_at'])
      .where('id', '=', id)
      .executeTakeFirst()
    return (row as UserRow | undefined) ?? null
  }

  /**
   * 按 id 批量查用户（对齐 Java `userRepository.findAllById(ids)`）。
   *
   * ⚠️ 不加 ORDER BY：Java 的 `findAllById` 不保证顺序，这里保持一致 ——
   *    自行排序会让两侧在数据变化时静默分叉。
   */
  async findUsersByIds(ids: number[]): Promise<UserRow[]> {
    if (ids.length === 0) return []
    const rows = await this.db
      .selectFrom('sys_user')
      .select(['id', 'username', 'nickname', 'email', 'phone', 'avatar', 'org_id', 'status', 'created_at'])
      .where('id', 'in', ids)
      .execute()
    return rows as UserRow[]
  }

  // ------------------------------------------------------------ 用户（写）

  /**
   * 按用户名查（对齐 Java `userRepository.findByUsername`）。
   *
   * ⚠️ **不过滤 `is_deleted`** —— 于是「已逻辑删除的用户仍会挡住同名新建」
   *    （报「用户名已存在」）。这是 Java 的行为，照抄。
   */
  async findUserByUsername(username: string): Promise<UserRow | null> {
    const row = await this.db
      .selectFrom('sys_user')
      .select(['id', 'username', 'nickname', 'email', 'phone', 'avatar', 'org_id', 'status', 'created_at'])
      .where('username', '=', username)
      .executeTakeFirst()
    return (row as UserRow | undefined) ?? null
  }

  async insertUser(row: {
    username: string
    nickname: string | null
    password: string
    email: string | null
    phone: string | null
    org_id: number | null
    status: number
  }): Promise<number> {
    const result = await this.db
      .insertInto('sys_user')
      .values({ ...row, is_deleted: 0, created_at: new Date(), updated_at: new Date() })
      .executeTakeFirst()
    return Number(result.insertId)
  }

  /**
   * 局部更新用户。`password` 不在 `UserRow` 里（查询不返回它），
   * 所以 patch 类型单独把它带上 —— 重置密码要用，而它不该出现在任何出参里。
   */
  async updateUser(id: number, patch: Partial<UserRow> & { password?: string }): Promise<void> {
    await this.db
      .updateTable('sys_user')
      .set({ ...patch, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  /** 软删除（Java 的 `user.setIsDeleted(1)`）。 */
  async softDeleteUser(id: number): Promise<void> {
    await this.db
      .updateTable('sys_user')
      .set({ is_deleted: 1 })
      .where('id', '=', id)
      .execute()
  }

  async insertUserRole(userId: number, roleId: number): Promise<void> {
    await this.db.insertInto('sys_user_role').values({ user_id: userId, role_id: roleId }).execute()
  }

  async deleteUserRoles(userId: number): Promise<void> {
    await this.db.deleteFrom('sys_user_role').where('user_id', '=', userId).execute()
  }

  /** userId → roleIds（供 `UserVO.roleIds`；批量版，列表接口用）。 */
  async findRoleIdsByUserIds(userIds: number[]): Promise<Map<number, number[]>> {
    if (userIds.length === 0) return new Map()
    const rows = await this.db
      .selectFrom('sys_user_role')
      .select(['user_id', 'role_id'])
      .where('user_id', 'in', userIds)
      .execute()
    const out = new Map<number, number[]>()
    for (const row of rows) {
      const list = out.get(row.user_id) ?? []
      list.push(row.role_id)
      out.set(row.user_id, list)
    }
    return out
  }

  /** 组织 id → 名称（供 UserVO.orgName）。 */
  async findOrgNames(orgIds: number[]): Promise<Map<number, string>> {
    const ids = [...new Set(orgIds)]
    if (ids.length === 0) return new Map()
    const rows = await this.db
      .selectFrom('sys_organization')
      .select(['id', 'org_name'])
      .where('id', 'in', ids)
      .execute()
    return new Map(rows.map((r) => [r.id, r.org_name]))
  }

  // ------------------------------------------------------------ 角色

  async listRoles(offset: number, limit: number): Promise<{ rows: RoleRow[]; total: number }> {
    const countRow = await this.db
      .selectFrom('sys_role')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('is_deleted', '=', 0)
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('sys_role')
      .select(['id', 'role_name', 'role_code', 'description', 'status', 'created_at'])
      .where('is_deleted', '=', 0)
      // 对齐 Java `RoleServiceImpl.list` 的 `Sort.by(DESC, "createdAt")`
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows: rows as RoleRow[], total: Number(countRow?.c ?? 0) }
  }

  // ------------------------------------------------------------ 菜单

  async listAllMenus(): Promise<
    Array<{
      id: number
      parent_id: number | null
      menu_name: string
      menu_type: number
      path: string | null
      component: string | null
      permission: string | null
      icon: string | null
      sort_order: number | null
    }>
  > {
    return this.db
      .selectFrom('sys_menu')
      .select(['id', 'parent_id', 'menu_name', 'menu_type', 'path', 'component', 'permission', 'icon', 'sort_order'])
      .where('is_deleted', '=', 0)
      .orderBy('sort_order', 'asc')
      .execute()
  }

  // ------------------------------------------------------------ 组织

  async listAllOrgs(): Promise<OrgRow[]> {
    return this.db
      .selectFrom('sys_organization')
      .select(['id', 'org_code', 'org_name', 'parent_id', 'sort_order', 'status'])
      .where('is_deleted', '=', 0)
      .orderBy('sort_order', 'asc')
      .execute()
  }

  // ------------------------------------------------------------ 菜单（写）
  //
  // ⚠️ 菜单的写端点**不在契约网里**：Java 的 `POST /api/menus` 因
  //    `@NotBlank Integer menuType` 恒 500（Hibernate Validator 报
  //    HV000030），无法产出 golden。这三个端点的正确行为由
  //    `test/integration/menu-org-writes.spec.ts` 的 CRUD 往返测试保证。
  //    详见规格未决项 U19。

  async findMenuById(id: number): Promise<MenuRow | null> {
    const row = await this.db
      .selectFrom('sys_menu')
      .select(['id', 'parent_id', 'menu_name', 'menu_type', 'path', 'component', 'permission', 'icon', 'sort_order', 'status', 'is_deleted'])
      .where('id', '=', id)
      .executeTakeFirst()
    return (row as MenuRow | undefined) ?? null
  }

  async insertMenu(row: {
    parent_id: number | null
    menu_name: string
    menu_type: number
    path: string | null
    component: string | null
    permission: string | null
    icon: string | null
    sort_order: number
    status: number
  }): Promise<number> {
    const result = await this.db
      .insertInto('sys_menu')
      .values({ ...row, is_deleted: 0, created_at: new Date(), updated_at: new Date() })
      .executeTakeFirst()
    return Number(result.insertId)
  }

  async updateMenu(id: number, patch: Partial<MenuRow>): Promise<void> {
    await this.db
      .updateTable('sys_menu')
      .set({ ...patch, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  /** 软删除（Java 的 `menu.setIsDeleted(1)`）。 */
  async softDeleteMenu(id: number): Promise<void> {
    await this.db
      .updateTable('sys_menu')
      .set({ is_deleted: 1 })
      .where('id', '=', id)
      .execute()
  }

  /** 子菜单数量（对齐 Java `countByParentId`）—— **不过滤 is_deleted**。 */
  async countMenusByParentId(parentId: number): Promise<number> {
    const row = await this.db
      .selectFrom('sys_menu')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('parent_id', '=', parentId)
      .executeTakeFirst()
    return Number(row?.c ?? 0)
  }

  // ------------------------------------------------------------ 组织（写）

  async findOrgById(id: number): Promise<OrgRowFull | null> {
    const row = await this.db
      .selectFrom('sys_organization')
      .select(['id', 'org_code', 'org_name', 'parent_id', 'sort_order', 'status', 'is_deleted'])
      .where('id', '=', id)
      .executeTakeFirst()
    return (row as OrgRowFull | undefined) ?? null
  }

  async insertOrg(row: {
    parent_id: number | null
    org_name: string
    org_code: string
    sort_order: number
    status: number
  }): Promise<number> {
    const result = await this.db
      .insertInto('sys_organization')
      .values({ ...row, is_deleted: 0, created_at: new Date(), updated_at: new Date() })
      .executeTakeFirst()
    return Number(result.insertId)
  }

  async updateOrg(id: number, patch: Partial<OrgRowFull>): Promise<void> {
    await this.db
      .updateTable('sys_organization')
      .set({ ...patch, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  /** 软删除（Java 的 `org.setIsDeleted(1)`）。 */
  async softDeleteOrg(id: number): Promise<void> {
    await this.db
      .updateTable('sys_organization')
      .set({ is_deleted: 1 })
      .where('id', '=', id)
      .execute()
  }

  /** 子机构数量（对齐 Java `countByParentId`）—— **不过滤 is_deleted**。 */
  async countOrgsByParentId(parentId: number): Promise<number> {
    const row = await this.db
      .selectFrom('sys_organization')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('parent_id', '=', parentId)
      .executeTakeFirst()
    return Number(row?.c ?? 0)
  }

  /**
   * 某机构下的用户数（对齐 Java `userRepository.countByOrgId`）。
   *
   * ⚠️ **不过滤 `is_deleted`** —— Java 的派生查询 `countByOrgId` 没有这个条件。
   *    于是已逻辑删除的用户仍会挡住机构删除。照抄这个（可疑的）行为：
   *    自行加上过滤会让「该机构下存在用户，无法删除」这条错误在两侧不同时出现。
   */
  async countUsersByOrgId(orgId: number): Promise<number> {
    const row = await this.db
      .selectFrom('sys_user')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('org_id', '=', orgId)
      .executeTakeFirst()
    return Number(row?.c ?? 0)
  }

  // ------------------------------------------------------------ 字典类型

  async listDictTypes(
    offset: number,
    limit: number,
  ): Promise<{ rows: DictTypeRow[]; total: number }> {
    const countRow = await this.db
      .selectFrom('sys_dict_type')
      .select((eb) => eb.fn.countAll<number>().as('c'))
      .where('is_deleted', '=', 0)
      .executeTakeFirst()

    const rows = await this.db
      .selectFrom('sys_dict_type')
      .select(['id', 'dict_code', 'dict_name', 'remark', 'status', 'is_deleted', 'created_at'])
      .where('is_deleted', '=', 0)
      // 对齐 Java `DictTypeServiceImpl.list` 的 `Sort.by(DESC, "createdAt")`
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute()

    return { rows: rows as DictTypeRow[], total: Number(countRow?.c ?? 0) }
  }

  // ------------------------------------------------------------ 角色（写）

  async findRoleById(id: number): Promise<RoleRow | null> {
    const row = await this.db
      .selectFrom('sys_role')
      .select(['id', 'role_name', 'role_code', 'description', 'status', 'created_at'])
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }

  /** 角色编码是否已被占用（角色编码是唯一键）。 */
  async roleCodeExists(roleCode: string, excludeId?: number): Promise<boolean> {
    let query = this.db
      .selectFrom('sys_role')
      .select('id')
      .where('role_code', '=', roleCode)
    if (excludeId !== undefined) query = query.where('id', '!=', excludeId)
    const row = await query.executeTakeFirst()
    return row !== undefined
  }

  async insertRole(row: Omit<RoleRow, 'id' | 'created_at'>): Promise<number> {
    const result = await this.db
      .insertInto('sys_role')
      .values({ ...row, is_deleted: 0, created_at: new Date(), updated_at: new Date() })
      .executeTakeFirst()
    return Number(result.insertId)
  }

  async updateRole(id: number, patch: Partial<RoleRow>): Promise<void> {
    await this.db
      .updateTable('sys_role')
      .set({ ...patch, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  /** 删除角色。系统内置的超管角色（id=1）不允许删除。 */
  async deleteRole(id: number): Promise<void> {
    await this.db.updateTable('sys_role').set({ is_deleted: 1 }).where('id', '=', id).execute()
    await this.db.deleteFrom('sys_role_menu').where('role_id', '=', id).execute()
    await this.db.deleteFrom('sys_user_role').where('role_id', '=', id).execute()
  }

  // ------------------------------------------------------------ 角色菜单

  async findMenuIdsByRoleId(roleId: number): Promise<number[]> {
    const rows = await this.db
      .selectFrom('sys_role_menu')
      .select('menu_id')
      .where('role_id', '=', roleId)
      .execute()
    return rows.map((r) => r.menu_id)
  }

  async replaceRoleMenus(roleId: number, menuIds: number[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('sys_role_menu').where('role_id', '=', roleId).execute()
      if (menuIds.length > 0) {
        await trx
          .insertInto('sys_role_menu')
          .values(menuIds.map((menuId) => ({ role_id: roleId, menu_id: menuId })))
          .execute()
      }
    })
  }

  // ------------------------------------------------------------ 字典类型（写）

  async findDictTypeById(id: number): Promise<DictTypeRow | null> {
    const row = await this.db
      .selectFrom('sys_dict_type')
      .select(['id', 'dict_code', 'dict_name', 'remark', 'status', 'is_deleted', 'created_at'])
      .where('id', '=', id)
      .executeTakeFirst()
    return row ?? null
  }

  async insertDictType(row: {
    dict_code: string
    dict_name: string
    remark: string | null
    status: number
  }): Promise<number> {
    const result = await this.db
      .insertInto('sys_dict_type')
      .values({ ...row, is_deleted: 0, created_at: new Date(), updated_at: new Date() })
      .executeTakeFirst()
    return Number(result.insertId)
  }

  async updateDictType(id: number, patch: Partial<DictTypeRow>): Promise<void> {
    await this.db
      .updateTable('sys_dict_type')
      .set({ ...patch, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  async deleteDictType(id: number): Promise<void> {
    await this.db
      .updateTable('sys_dict_type')
      .set({ is_deleted: 1 })
      .where('id', '=', id)
      .execute()
  }

  /** 按 dictCode 找未删除的字典类型（`create` 的存在性校验用）。 */
  async findDictTypeByCode(dictCode: string): Promise<DictTypeRow | null> {
    const row = await this.db
      .selectFrom('sys_dict_type')
      .select(['id', 'dict_code', 'dict_name', 'remark', 'status', 'is_deleted', 'created_at'])
      .where('dict_code', '=', dictCode)
      .where('is_deleted', '=', 0)
      .executeTakeFirst()
    return row ?? null
  }

  // ------------------------------------------------------------ 字典数据

  /**
   * 按 dictCode 取字典数据，按 sortOrder 升序。
   *
   * ⚠️ **不带 `is_deleted = 0` 条件** —— Java 是
   *    `findByDictCodeOrderBySortOrder(dictCode).stream().filter(isDeleted == 0)`
   *    （内存过滤），SQL 里不过滤。这里保持同样的分工：
   *    仓储层返回全部，服务层过滤。看着绕，但把过滤放进 SQL
   *    会让「Java 只查一次拿全量」这类差异在将来接分页时爆掉。
   */
  async listDictDataByCode(dictCode: string): Promise<DictDataRow[]> {
    return this.db
      .selectFrom('sys_dict_data')
      .select(['id', 'dict_code', 'label', 'value', 'sort_order', 'status', 'is_deleted', 'created_at'])
      .where('dict_code', '=', dictCode)
      .orderBy('sort_order', 'asc')
      .execute() as Promise<DictDataRow[]>
  }

  async findDictDataById(id: number): Promise<DictDataRow | null> {
    const row = await this.db
      .selectFrom('sys_dict_data')
      .select(['id', 'dict_code', 'label', 'value', 'sort_order', 'status', 'is_deleted', 'created_at'])
      .where('id', '=', id)
      .executeTakeFirst()
    return (row as DictDataRow | undefined) ?? null
  }

  async insertDictData(row: {
    dict_code: string
    label: string
    value: string
    sort_order: number
    status: number
  }): Promise<number> {
    const result = await this.db
      .insertInto('sys_dict_data')
      .values({ ...row, is_deleted: 0, created_at: new Date(), updated_at: new Date() })
      .executeTakeFirst()
    return Number(result.insertId)
  }

  async updateDictData(id: number, patch: Partial<DictDataRow>): Promise<void> {
    await this.db
      .updateTable('sys_dict_data')
      .set({ ...patch, updated_at: new Date() })
      .where('id', '=', id)
      .execute()
  }

  /** 软删除（`is_deleted = 1`）—— 不是物理删除。 */
  async softDeleteDictData(id: number): Promise<void> {
    await this.db
      .updateTable('sys_dict_data')
      .set({ is_deleted: 1 })
      .where('id', '=', id)
      .execute()
  }
}
