import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { R } from '../../common/domain/r'
import { PageResult } from '../../common/domain/page-result'
import { JavaStatusOk } from '../../framework/http/java-status.decorator'
import { bindIntegerProperty } from '../../framework/http/query-params'
import {
  SystemService,
  type DictDataVO,
  type DictTypeVO,
  type MenuTreeVO,
  type RoleVO,
  type TreeNodeVO,
  type UserVO,
} from '../service/system.service'

/**
 * 用户接口（对齐 Java `UserController`，前缀 `/api/users`）。
 *
 * ⚠️ 分页形状是 `PageResult{total,page,size,rows}`，不是流程模块的 PageResponse。
 */
@Controller('api/users')
@JavaStatusOk()
export class UserController {
  constructor(private readonly service: SystemService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResult<UserVO>>> {
    return R.ok(await this.service.listUsers(bindIntegerProperty(page, 1), bindIntegerProperty(size, 20)))
  }

  /**
   * 按 id 批量查用户。
   *
   * ⚠️ 必须声明在 `:id` **之前**：Java 侧 `/batch` 也排在 `/{id}` 之前，
   *    而 Nest 按声明顺序匹配 —— 顺序反了 `batch` 会被当成 id，
   *    `Number('batch')` → NaN → `WHERE id = NaN`。
   *    （同一个坑在 `/internal/system/users/metadata` 上已经踩过一次。）
   *
   * `ids` 对应 Java 的 `@RequestParam(required = false) List<Long> ids`：
   * 缺省时 Java 显式置为空列表并返回空数组（**不是**查全部）。
   */
  @Get('batch')
  async batch(@Query('ids') ids?: string | string[]): Promise<R<UserVO[]>> {
    return R.ok(await this.service.getUsersByIds(toIdList(ids)))
  }

  /** 用户详情。 */
  @Get(':id')
  async getById(@Param('id') id: string): Promise<R<UserVO>> {
    return R.ok(await this.service.getUserById(Number(id)))
  }

  /**
   * 新建用户。
   *
   * ⚠️ 用户名查重不过滤 `is_deleted`：已逻辑删除的用户仍会挡住同名新建
   *    （报「用户名已存在」）。这是 Java 的行为。
   */
  @Post()
  async create(@Body() body: UserSaveRequest): Promise<R<UserVO>> {
    return R.ok(
      await this.service.createUser({
        username: body.username,
        nickname: body.nickname,
        email: body.email ?? null,
        phone: body.phone ?? null,
        orgId: body.orgId ?? null,
        roleIds: body.roleIds ?? null,
        status: body.status ?? null,
      }),
    )
  }

  /** 修改用户（`roleIds` 是**整批替换**；相同则不动作）。 */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<UserSaveRequest>,
  ): Promise<R<UserVO>> {
    return R.ok(
      await this.service.updateUser(Number(id), {
        nickname: body.nickname ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        orgId: body.orgId ?? null,
        roleIds: body.roleIds ?? null,
        status: body.status ?? null,
      }),
    )
  }

  /** 删除用户（**逻辑删除**：列表不再返回，但按 id 仍然查得到）。 */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteUser(Number(id))
    return R.ok()
  }

  /**
   * 修改用户状态。
   *
   * ⚠️ Java 的 handler 是 `@RequestBody StatusRequest request` 后取 `request.status()`：
   *    请求体为 `null` 时不会 500，而是 `NullPointerException` → 500。这里 `status` 缺省落 0。
   */
  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status?: number | null } | null,
  ): Promise<R<null>> {
    await this.service.updateUserStatus(Number(id), body?.status ?? null)
    return R.ok()
  }

  /** 重置密码为 `bcrypt('123456')`。 */
  @Put(':id/reset-password')
  async resetPassword(@Param('id') id: string): Promise<R<null>> {
    await this.service.resetUserPassword(Number(id))
    return R.ok()
  }
}

/** 用户保存请求体，对齐 Java `UserCreateRequest` / `UserUpdateRequest`。 */
interface UserSaveRequest {
  username: string
  nickname: string
  email?: string | null
  phone?: string | null
  orgId?: number | null
  roleIds?: number[] | null
  status?: number | null
}

/** `ids` 查询参数 → 数字数组（兼容单值、重复参数、逗号分隔三种形态）。 */
function toIdList(value: string | string[] | undefined): number[] {
  if (value === undefined) return []
  const raw = Array.isArray(value) ? value : [value]
  const out: number[] = []
  for (const item of raw) {
    for (const part of item.split(',')) {
      const trimmed = part.trim()
      if (trimmed === '') continue
      const n = Number(trimmed)
      if (Number.isFinite(n)) out.push(Math.trunc(n))
    }
  }
  return out
}

/** 角色接口（`/api/roles`）。 */
@Controller('api/roles')
@JavaStatusOk()
export class RoleController {
  constructor(private readonly service: SystemService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResult<RoleVO>>> {
    return R.ok(await this.service.listRoles(bindIntegerProperty(page, 1), bindIntegerProperty(size, 20)))
  }

  @Post()
  async create(
    @Body() body: { roleName: string; roleCode: string; description?: string; status?: number },
  ): Promise<R<RoleVO>> {
    return R.ok(await this.service.createRole(body))
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { roleName?: string; description?: string; status?: number },
  ): Promise<R<RoleVO>> {
    return R.ok(await this.service.updateRole(Number(id), body ?? {}))
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteRole(Number(id))
    return R.ok()
  }

  @Get(':id/menus')
  async getMenus(@Param('id') id: string): Promise<R<number[]>> {
    return R.ok(await this.service.getRoleMenus(Number(id)))
  }

  @Put(':id/menus')
  async assignMenus(
    @Param('id') id: string,
    @Body() body: { menuIds?: number[] },
  ): Promise<R<null>> {
    await this.service.assignRoleMenus(Number(id), body?.menuIds ?? [])
    return R.ok()
  }
}

/** 菜单接口（`/api/menus`）。 */
@Controller('api/menus')
@JavaStatusOk()
export class MenuController {
  constructor(private readonly service: SystemService) {}

  @Get('tree')
  async tree(): Promise<R<MenuTreeVO[]>> {
    return R.ok(await this.service.menuTree())
  }

  /**
   * 新建菜单。
   *
   * ⚠️ **这个端点在 Java 侧恒 500**（`MenuCreateRequest` 上写了
   *    `@NotBlank Integer menuType`，而 `@NotBlank` 只能用于 CharSequence，
   *    Hibernate Validator 抛 HV000030）。所以它不在契约网里 ——
   *    Node 按**正确语义**实现，正确性由集成测试保证。详见规格 U19。
   */
  @Post()
  async create(@Body() body: MenuSaveRequest): Promise<R<MenuTreeVO>> {
    return R.ok(
      await this.service.createMenu({
        parentId: body.parentId ?? null,
        menuName: body.menuName,
        menuType: body.menuType,
        path: body.path ?? null,
        component: body.component ?? null,
        permission: body.permission ?? null,
        icon: body.icon ?? null,
        sortOrder: body.sortOrder ?? null,
        status: body.status ?? null,
      }),
    )
  }

  /** 修改菜单（**不接受 `parentId`**；`menuName` 有文本才改、其余非 null 才改）。 */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<MenuSaveRequest>,
  ): Promise<R<MenuTreeVO>> {
    return R.ok(
      await this.service.updateMenu(Number(id), {
        menuName: body.menuName ?? null,
        menuType: body.menuType ?? null,
        path: body.path ?? null,
        component: body.component ?? null,
        permission: body.permission ?? null,
        icon: body.icon ?? null,
        sortOrder: body.sortOrder ?? null,
        status: body.status ?? null,
      }),
    )
  }

  /** 删除菜单（**软删除**；有子菜单时拒绝）。 */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteMenu(Number(id))
    return R.ok()
  }
}

/** 菜单保存请求体，对齐 Java `MenuCreateRequest` / `MenuUpdateRequest`。 */
interface MenuSaveRequest {
  parentId?: number | null
  menuName: string
  menuType: number
  path?: string | null
  component?: string | null
  permission?: string | null
  icon?: string | null
  sortOrder?: number | null
  status?: number | null
}

/** 组织接口（`/api/orgs`）。 */
@Controller('api/orgs')
@JavaStatusOk()
export class OrganizationController {
  constructor(private readonly service: SystemService) {}

  @Get('tree')
  async tree(): Promise<R<TreeNodeVO[]>> {
    return R.ok(await this.service.orgTree())
  }

  /** 新建组织（`sortOrder` 空落 0、`status` 空落 1）。 */
  @Post()
  async create(@Body() body: OrgSaveRequest): Promise<R<TreeNodeVO>> {
    return R.ok(
      await this.service.createOrg({
        parentId: body.parentId ?? null,
        orgName: body.orgName,
        orgCode: body.orgCode,
        sortOrder: body.sortOrder ?? null,
        status: body.status ?? null,
      }),
    )
  }

  /** 修改组织（**不接受 `parentId`**；`orgName`/`orgCode` 有文本才改、其余非 null 才改）。 */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<OrgSaveRequest>,
  ): Promise<R<TreeNodeVO>> {
    return R.ok(
      await this.service.updateOrg(Number(id), {
        orgName: body.orgName ?? null,
        orgCode: body.orgCode ?? null,
        sortOrder: body.sortOrder ?? null,
        status: body.status ?? null,
      }),
    )
  }

  /**
   * 删除组织（**软删除**）。三重校验决定报哪条错误：
   * 不存在 → 有子节点 → 有用户。
   */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteOrg(Number(id))
    return R.ok()
  }
}

/** 组织保存请求体，对齐 Java `OrganizationCreateRequest` / `OrganizationUpdateRequest`。 */
interface OrgSaveRequest {
  parentId?: number | null
  orgName: string
  orgCode: string
  sortOrder?: number | null
  status?: number | null
}

/** 字典类型接口（`/api/dict-types`）。 */
@Controller('api/dict-types')
@JavaStatusOk()
export class DictTypeController {
  constructor(private readonly service: SystemService) {}

  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResult<DictTypeVO>>> {
    return R.ok(await this.service.listDictTypes(bindIntegerProperty(page, 1), bindIntegerProperty(size, 20)))
  }

  @Post()
  async create(
    @Body() body: { dictCode: string; dictName: string; remark?: string; status?: number },
  ): Promise<R<DictTypeVO>> {
    return R.ok(await this.service.createDictType(body))
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { dictName?: string; remark?: string; status?: number },
  ): Promise<R<DictTypeVO>> {
    return R.ok(await this.service.updateDictType(Number(id), body ?? {}))
  }

  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteDictType(Number(id))
    return R.ok()
  }
}

/**
 * 字典数据接口（`/api/dict-data`）。
 *
 * ⚠️ `GET /{dictCode}` 是**裸数组**，不是分页对象。
 * ⚠️ `DELETE` 是**软删除**：`list` 会过滤掉 `is_deleted = 1` 的行。
 */
@Controller('api/dict-data')
@JavaStatusOk()
export class DictDataController {
  constructor(private readonly service: SystemService) {}

  /** 按字典编码列出（`create` 之前需先有同 dictCode 的字典类型）。 */
  @Get(':dictCode')
  async list(@Param('dictCode') dictCode: string): Promise<R<DictDataVO[]>> {
    return R.ok(await this.service.listDictData(dictCode))
  }

  /** 新建字典数据。 */
  @Post()
  async create(@Body() body: DictDataSaveRequest): Promise<R<DictDataVO>> {
    return R.ok(
      await this.service.createDictData({
        dictCode: body.dictCode,
        label: body.label,
        value: body.value,
        sortOrder: body.sortOrder ?? null,
        status: body.status ?? null,
      }),
    )
  }

  /**
   * 修改字典数据。
   *
   * ⚠️ `dictCode` 是**可改的**（Java 改了会重新校验字典类型存在）。
   *    字段语义是「有文本才改」/「非 null 才改」。
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: Partial<DictDataSaveRequest>,
  ): Promise<R<DictDataVO>> {
    return R.ok(
      await this.service.updateDictData(Number(id), {
        dictCode: body.dictCode ?? null,
        label: body.label ?? null,
        value: body.value ?? null,
        sortOrder: body.sortOrder ?? null,
        status: body.status ?? null,
      }),
    )
  }

  /** 删除字典数据（软删除）。 */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteDictData(Number(id))
    return R.ok()
  }
}

/** 字典数据保存请求体，对齐 Java `DictDataCreateRequest` / `DictDataUpdateRequest`。 */
interface DictDataSaveRequest {
  dictCode: string
  label: string
  value: string
  sortOrder?: number | null
  status?: number | null
}
