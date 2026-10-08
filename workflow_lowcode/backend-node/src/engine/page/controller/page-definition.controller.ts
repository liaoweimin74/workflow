import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { PageResponse } from '../../../common/domain/page-response'
import type { BizDataPageVO } from '../../../common/domain/biz-data'
import { BusinessException } from '../../../common/exception/business-exception'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { bindIntProperty, blankToNull, intQueryParam } from '../../../framework/http/query-params'
import { CurrentUser } from '../../../framework/security/current-user.decorator'
import type { LoginUser } from '../../../framework/security/jwt-auth.guard'
import { PageAccessGuard } from '../page-access.guard'
import type { PageMenuRow } from '../repository/page-menu.repository'
import { PageMenuRepository } from '../repository/page-menu.repository'
import { DataSourceService } from '../../datasource/service/data-source.service'
import { BizDataService } from '../../form/bizdata/biz-data.service'
import {
  PageDefinitionService,
  type PageDefinitionDetailVO,
  type PageDefinitionEntityVO,
  type PageDefinitionVO,
} from '../service/page-definition.service'

/**
 * 页面定义（对齐 Java `PageDefinitionController` + `PageMenuController` +
 * `PageQueryController`，前缀都是 `/api/v1/pages`）。
 *
 * ⚠️ 路由声明顺序有语义：Nest 按声明顺序匹配。`/pages/{key}/definition` 这类
 *    「字面量段在中间」的模式与 `/pages/{id}` 不冲突（段数不同），
 *    但同层级的字面量段仍必须排在参数段前 —— 这一点在
 *    `SystemInternalController` 上已经踩过一次（`metadata` 被 `:id` 吃掉）。
 */
@Controller('api/v1/pages')
@JavaStatusOk()
export class PageDefinitionController {
  constructor(
    private readonly service: PageDefinitionService,
    private readonly accessGuard: PageAccessGuard,
    private readonly menuRepository: PageMenuRepository,
    private readonly dataSourceService: DataSourceService,
    private readonly bizDataService: BizDataService,
  ) {}

  /** 分页查询页面定义列表（status/name/type 可选过滤）。 */
  @Get()
  async list(
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('status') status?: string,
    @Query('name') name?: string,
    @Query('type') type?: string,
  ): Promise<R<PageResponse<PageDefinitionVO>>> {
    return R.ok(
      await this.service.list(
        intQueryParam(page, 'page', 1),
        intQueryParam(size, 'size', 20),
        status ?? null,
        name ?? null,
        type ?? null,
      ),
    )
  }

  /**
   * 按 key 取页面定义（渲染页加载）。
   *
   * `preview=true` 取最新定义（含动态编译），默认取**已发布**版本并经页面权限校验。
   * ⚠️ preview 分支需要视图编译器（P4 后续增量），当前**显式拒绝**而不是返回未编译的 schema。
   */
  @Get(':key/definition')
  async getByKey(
    @CurrentUser() user: LoginUser,
    @Param('key') key: string,
    @Query('preview') preview?: string,
  ): Promise<R<PageDefinitionDetailVO>> {
    if (preview === 'true') {
      // ⚠️ 预览**不做页面访问校验**：它正是给还没挂菜单的 DRAFT 页面用的
      //    （Java 的 `/definition` 端点同样把守卫放在非 preview 分支里）。
      // 只有严格的字符串 "true" 才算预览（与 Java 的 `@RequestParam boolean` 相比，
      // 这里按字面量判定：`?preview=TRUE` 在 Spring 里也会被转成 true，
      // 但契约场景只覆盖小写；差异记入规格 §9）。
      return R.ok(await this.service.getPreviewByKey(key))
    }
    await this.accessGuard.assertPageAccess(key, user)
    return R.ok(await this.service.getPublishedByKey(key))
  }

  /**
   * 页面挂接菜单列表（按 key 取已发布页面，再按 `/page/{key}` 反查未删除菜单）。
   *
   * ⚠️ 这里**不做** PageAccessGuard —— Java 的 `PageMenuController.getMenus`
   *    只校验「页面已发布」，没有权限判断。多校验一层会让管理端拿不到菜单。
   */
  @Get(':key/menus')
  async getMenus(@Param('key') key: string): Promise<R<PageMenuResponse>> {
    const page = await this.service.getPublishedByKey(key)
    const menus = await this.accessGuard.findMenusByPath(`/page/${page.key}`)
    return R.ok({
      items: menus.map((menu) => ({
        menuId: menu.id,
        menuName: menu.menu_name,
        path: menu.path,
        parentId: menu.parent_id,
        permission: menu.permission,
        status: menu.status,
      })),
    })
  }

  /**
   * 视图数据分页查询（对齐 Java `PageQueryController.query`）。
   *
   * 校验链顺序必须与 Java 一致，否则错误码会分叉：
   *   权限校验 → 取已发布页面 → 类型必须是 VIEW → 必须绑定数据源
   * → filter/sort 白名单 → 取数（dataSourceId 走数据源 SPI，否则走业务表单）。
   *
   * ⚠️ 白名单来源是**页面 schema 的声明**，不是数据源 metadata：
   *    `searchFields[].key` ∪ `filter.conditions[].column`（静态筛选列也要放行），
   *    而 `sort` 只有在 schema 声明了 `sortableFields` 时才受限（未声明 = 不限制）。
   */
  @Get(':pageKey/data')
  async pageData(
    @CurrentUser() user: LoginUser,
    @Param('pageKey') pageKey: string,
    @Query('filter') filter?: string,
    @Query('keyword') keyword?: string,
    @Query('keywordColumn') keywordColumn?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('params') params?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    await this.accessGuard.assertPageAccess(pageKey, user)
    const definition = await this.service.getPublishedByKey(pageKey)
    if (definition.type !== 'VIEW') {
      throw new BusinessException(400, `页面 ${pageKey} 不是视图类型，不支持数据查询`)
    }
    const hasDataSourceId =
      definition.dataSourceId !== null && definition.dataSourceId.trim() !== ''
    const hasFormKey = definition.formKey !== null && definition.formKey.trim() !== ''
    if (!hasDataSourceId && !hasFormKey) {
      throw new BusinessException(400, `页面 ${pageKey} 未绑定数据源`)
    }

    const sortValue = blankToNull(sort ?? null)
    const sortable = sortableFieldKeys(definition.schema)
    if (sortValue !== null && sortable.size > 0 && !sortable.has(sortValue)) {
      throw new BusinessException(400, `排序字段不在页面声明的可排序字段中: ${sortValue}`)
    }

    const request = {
      filter: whitelistFilter(filter, searchFieldKeys(definition.schema)),
      keyword: blankToNull(keyword),
      keywordColumn: blankToNull(keywordColumn),
      sort: sortValue,
      order: blankToNull(order),
      params: blankToNull(params),
      // 绑定对象字段（形态 B）：非法值 → HTTP 200 + body code 400
      page: bindIntProperty(page, 'page', 1),
      size: bindIntProperty(size, 'size', 20),
    }
    if (hasDataSourceId) {
      return R.ok(await this.dataSourceService.queryData(String(definition.dataSourceId), request))
    }
    return R.ok(await this.bizDataService.query(String(definition.formKey), request))
  }

  /** 按 id 取页面定义详情（含 schema）。 */
  @Get(':id')
  async getById(@Param('id') id: string): Promise<R<PageDefinitionDetailVO>> {
    return R.ok(await this.service.getById(id))
  }

  // ==================== 写路径 ====================

  /**
   * 创建页面定义（对齐 Java `PageDefinitionController.create`）。
   *
   * ⚠️ 返回的是**实体**（含 `schema` 与 `tenantId`）；`type` 缺省 → VIEW。
   */
  @Post()
  async create(@Body() body: PageSaveRequest | null): Promise<R<PageDefinitionEntityVO>> {
    return R.ok(
      await this.service.create({
        name: body?.name ?? null,
        key: body?.key ?? null,
        type: body?.type ?? null,
        formKey: body?.formKey ?? null,
        dataSourceId: body?.dataSourceId ?? null,
      }),
    )
  }

  /** 原地更新（`null` 表示不更新该字段；不改状态、不加版本）。 */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: PageSaveRequest | null,
  ): Promise<R<PageDefinitionEntityVO>> {
    return R.ok(
      await this.service.update(id, {
        name: body?.name ?? null,
        key: body?.key ?? null,
        schema: body?.schema ?? null,
        formKey: body?.formKey ?? null,
        dataSourceId: body?.dataSourceId ?? null,
      }),
    )
  }

  /** 软删除（`status=ARCHIVED`；已发布页面拒绝）。 */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.remove(id)
    return R.ok()
  }

  /** 发布页面（PAGE 走基础校验；VIEW 需要视图编译器，见规格 U32）。 */
  @Post(':id/publish')
  async publish(@Param('id') id: string): Promise<R<PageDefinitionEntityVO>> {
    return R.ok(await this.service.publish(id))
  }

  // ==================== 菜单挂接（Java `PageMenuController`） ====================

  /**
   * 挂接菜单：每次调用建一条**新**菜单（不查重），仅 PUBLISHED 页面可挂。
   *
   * ⚠️ `menuId` 是自增主键，两侧必然不同 ⇒ 契约里对 `.menuId` 做了形态放宽
   *    （见场景注释）；`path` / `permission` / `menuName` 仍严格比对。
   * ⚠️ 当前用户是管理员时自动授权给 ROLE_ADMIN，保证挂接者立即可用。
   */
  @Post(':id/mount-menu')
  async mountMenu(
    @CurrentUser() user: LoginUser,
    @Param('id') id: string,
    @Body() body: MountMenuRequest | null,
  ): Promise<R<PageMenuResponse['items'][number]>> {
    const page = await this.service.getById(id)
    if (page.status !== 'PUBLISHED') {
      throw new BusinessException(400, '仅可挂接已发布的页面')
    }
    const { roles } = await this.accessGuard.loadRolesAndPermissions(user.userId)
    const menu = await this.menuRepository.insert({
      menuName: body?.name ?? page.name,
      path: `/page/${page.key}`,
      component: 'page/PageRenderer',
      permission: `page:read:${page.key}`,
      menuType: 1,
      parentId: body?.parentId ?? null,
      sortOrder: 0,
      status: 1,
      isDeleted: 0,
    })
    await this.menuRepository.grantAdminRole(
      menu.id,
      roles.some((role) => role === 'admin' || role === 'ROLE_ADMIN'),
    )
    return R.ok(toMenuItem(menu))
  }

  /** 解除挂接：软删指定菜单（`is_deleted=1`）；行不存在 → 404。 */
  @Delete('menus/:menuId')
  async unmountMenu(@Param('menuId') menuId: string): Promise<R<null>> {
    const id = Number(menuId)
    const menu = await this.menuRepository.requireById(id)
    await this.menuRepository.softDelete(menu.id)
    return R.ok()
  }

  // ==================== 页面取数（Java `PageQueryController`） ====================

  /**
   * 自定义页面（PAGE）数据源查询。
   *
   * 校验链与 Java 一致：页面访问权限 → 取已发布页面 → 类型必须是 PAGE
   * → 在 schema 的 `dataSources` 里按**页面内 id**解析 `refId`
   * → filter 只保留该条目声明的 `searchFields` → 委托数据源 SPI。
   *
   * ⚠️ 顺序不能换：`assertPageAccess` 要求页面**有未删除的菜单**，
   *    所以这个端点必须在 `mount-menu` 之后才可用（golden 里两条断言都钉住了）。
   */
  @Get(':pageKey/ds/:dataSourceId/data')
  async pageDataSourceData(
    @CurrentUser() user: LoginUser,
    @Param('pageKey') pageKey: string,
    @Param('dataSourceId') dataSourceId: string,
    @Query('filter') filter?: string,
    @Query('keyword') keyword?: string,
    @Query('keywordColumn') keywordColumn?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
    @Query('params') params?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<BizDataPageVO>> {
    await this.accessGuard.assertPageAccess(pageKey, user)
    const definition = await this.service.getPublishedByKey(pageKey)
    if (definition.type !== 'PAGE') {
      throw new BusinessException(400, `页面 ${pageKey} 不是自定义页面类型`)
    }
    const refId = resolveDataSourceRefId(definition.schema, dataSourceId)
    const whitelist = pageDataSourceSearchFields(definition.schema, dataSourceId)
    return R.ok(
      await this.dataSourceService.queryData(refId, {
        filter: whitelistFilter(filter, whitelist),
        keyword: blankToNull(keyword),
        keywordColumn: blankToNull(keywordColumn),
        sort: blankToNull(sort),
        order: blankToNull(order),
        params: blankToNull(params),
        // 同上：绑定对象字段（形态 B）
        page: bindIntProperty(page, 'page', 1),
        size: bindIntProperty(size, 'size', 20),
      }),
    )
  }
}

/** 页面保存请求体，对齐 Java `PageDefinitionSaveRequest`。 */
interface PageSaveRequest {
  name?: string | null
  key?: string | null
  type?: string | null
  formKey?: string | null
  dataSourceId?: string | null
  schema?: string | null
}

/** 挂接菜单请求体，对齐 Java `MountMenuRequest`。 */
interface MountMenuRequest {
  name?: string | null
  parentId?: number | null
}

/** 菜单项 → 响应（对齐 Java `PageMenuController.toItem`）。 */
function toMenuItem(menu: PageMenuRow): PageMenuResponse['items'][number] {
  return {
    menuId: menu.id,
    menuName: menu.menu_name,
    path: menu.path,
    parentId: menu.parent_id,
    permission: menu.permission,
    status: menu.status,
  }
}

/** 在 PAGE schema 的 `dataSources` 中按页面内 id 解析 refId（找不到 → 400）。 */
function resolveDataSourceRefId(schema: string | null, dataSourceId: string): string {
  for (const entry of pageDataSources(schema)) {
    if (dataSourceId === textOf(entry.id)) {
      const refId = textOf(entry.refId)
      if (refId.trim() !== '') return refId
    }
  }
  throw new BusinessException(400, `页面未声明数据源: ${dataSourceId}`)
}

/** 该数据源条目声明的 searchFields key 集合（未声明 → 空 = 不限制）。 */
function pageDataSourceSearchFields(schema: string | null, dataSourceId: string): Set<string> {
  const keys = new Set<string>()
  for (const entry of pageDataSources(schema)) {
    if (dataSourceId !== textOf(entry.id)) continue
    if (Array.isArray(entry.searchFields)) {
      for (const field of entry.searchFields) {
        const key = String(field)
        if (key.trim() !== '') keys.add(key)
      }
    }
    break
  }
  return keys
}

/**
 * VIEW 页面的 filter 白名单来源（对齐 Java `searchFieldKeys`）。
 *
 * ⚠️ 两个来源**都要**收：`searchFields[].key` 与 `filter.conditions[].column` ——
 *    后者是"静态筛选列"，页面自己声明并按它过滤，必须放行，否则静态筛选会被
 *    自己的白名单拒掉（Java 注释里写明的原因）。
 */
function searchFieldKeys(schema: string | null): Set<string> {
  const keys = new Set<string>()
  const root = parseSchemaObject(schema)
  const searchFields = root.searchFields
  if (Array.isArray(searchFields)) {
    for (const field of searchFields) keys.add(textOf(pathOf(field, 'key')))
  }
  const filter = root.filter
  if (filter !== null && typeof filter === 'object' && !Array.isArray(filter)) {
    const conditions = (filter as Record<string, unknown>).conditions
    if (Array.isArray(conditions)) {
      for (const condition of conditions) {
        const column = textOf(pathOf(condition, 'column'))
        if (column.trim() !== '') keys.add(column)
      }
    }
  }
  return keys
}

/** VIEW 页面的排序白名单（对齐 Java `sortableFieldKeys`；未声明 → 空 = 不限制）。 */
function sortableFieldKeys(schema: string | null): Set<string> {
  const keys = new Set<string>()
  const root = parseSchemaObject(schema)
  const fields = root.sortableFields
  if (Array.isArray(fields)) {
    for (const field of fields) keys.add(textOf(field))
  }
  return keys
}

/** 解析 schema 为对象（非法 JSON → 400「页面 schema 解析失败」，对齐 Java）。 */
function parseSchemaObject(schema: string | null): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(schema === null || schema.trim() === '' ? '{}' : schema)
  } catch {
    throw new BusinessException(400, '页面 schema 解析失败')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  return parsed as Record<string, unknown>
}

/** 取属性（非对象 → undefined）。 */
function pathOf(node: unknown, field: string): unknown {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return undefined
  return (node as Record<string, unknown>)[field]
}

/** 解析 PAGE schema 的 `dataSources` 数组（schema 非法 → 400，对齐 Java）。 */
function pageDataSources(schema: string | null): Array<Record<string, unknown>> {
  const root = parseSchemaObject(schema)
  const dataSources = root.dataSources
  if (!Array.isArray(dataSources)) return []
  return dataSources.map((entry) =>
    entry !== null && typeof entry === 'object' && !Array.isArray(entry)
      ? (entry as Record<string, unknown>)
      : {},
  )
}

/** 取属性并转字符串（对齐 Jackson `path(x).asText()`）。 */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

/**
 * filter 只保留白名单内的字段（对齐 Java `PageQueryController.whitelistFilter`）。
 *
 * 两种格式都要支持：
 *   - 扁平 `{col: value}` → 按顶层 key 校验
 *   - 结构化 `{logic, conditions:[{column,...}]}` → 按 `conditions[].column` 校验
 *
 * ⚠️ 白名单为空（数据源未声明 searchFields）= **不限制**，原样返回。
 * ⚠️ 命中非法字段时抛 400；非法 JSON 也抛 400（两条消息不同，别合并）。
 */
export function whitelistFilter(
  filterJson: string | null | undefined,
  whitelist: Set<string>,
): string | null {
  const blank = blankToNull(filterJson ?? null)
  if (blank === null) return null
  if (whitelist.size === 0) return blank

  let parsed: unknown
  try {
    parsed = JSON.parse(blank)
  } catch {
    throw new BusinessException(400, '筛选参数 filter 格式非法，应为 JSON 对象')
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new BusinessException(400, '筛选参数 filter 格式非法，应为 JSON 对象')
  }
  const record = parsed as Record<string, unknown>
  if (Object.keys(record).length === 0) return null

  if (Array.isArray(record.conditions)) {
    for (const condition of record.conditions) {
      const column =
        condition !== null && typeof condition === 'object' && !Array.isArray(condition)
          ? textOf((condition as Record<string, unknown>).column)
          : 'undefined'
      if (!whitelist.has(column)) {
        throw new BusinessException(400, `筛选字段不在页面声明白名单: ${column}`)
      }
    }
  } else {
    for (const key of Object.keys(record)) {
      if (!whitelist.has(key)) {
        throw new BusinessException(400, `筛选字段不在页面声明白名单: ${key}`)
      }
    }
  }
  return JSON.stringify(record)
}

/** 页面挂接菜单响应，对齐 Java `PageMenuResponse`。 */
export interface PageMenuResponse {
  items: Array<{
    menuId: number
    menuName: string
    path: string | null
    parentId: number | null
    permission: string | null
    status: number
  }>
}
