import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import type { BizDataPageVO, BizDataVO } from '../../../common/domain/biz-data'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { bindIntProperty, blankToNull } from '../../../framework/http/query-params'
import { BizDataService } from '../bizdata/biz-data.service'
import type { BizDataQueryRequest, ReferencedByEntry } from '../bizdata/biz-data-support'

/**
 * 业务数据（对齐 Java `BizDataController`，前缀 `/api/v1/biz-data`）。
 *
 * ## ⚠️ 路由声明顺序是硬约束
 * Nest 按**声明顺序**匹配，而 Java 的 Spring 用「字面量优先于路径变量」的规则。
 * 两者不同，所以声明顺序必须手工对齐 Java 的解析结果：
 *   - `referenced-count` 必须排在 `:formKey` **之前**（否则被当成 formKey）
 *   - `:formKey/resolve` 必须排在 `:formKey/:id` **之前**
 *     （Java 里 `getById` 虽然声明在前，但 `/person/resolve` 仍解析到 `resolve` ——
 *      Spring 的字面量优先规则赢了声明顺序）
 * 这一条已经在这类端点上踩过两次（`/internal/system/users/metadata`、表单定义 `by-key`）。
 */
@Controller('api/v1/biz-data')
@JavaStatusOk()
export class BizDataController {
  constructor(private readonly service: BizDataService) {}

  /** 各业务表单的被引用计数。 */
  @Get('referenced-count')
  async referencedCount(): Promise<R<Record<string, ReferencedByEntry>>> {
    return R.ok(await this.service.countReferencedBy())
  }

  /**
   * 批量解析显示文本。
   *
   * ⚠️ Java 侧参数是 `@RequestParam List<String> ids`：单个值绑定成长度 1 的列表，
   *    重复参数（`ids=a&ids=b`）绑定成多元素列表。Node 侧必须两种都认。
   */
  @Get(':formKey/resolve')
  async resolve(
    @Param('formKey') formKey: string,
    @Query('ids') ids?: string | string[],
    @Query('displayField') displayField?: string,
  ): Promise<R<Record<string, string>>> {
    return R.ok(
      await this.service.resolveByFormKey(formKey, toIdList(ids), blankToNull(displayField)),
    )
  }

  /** 分页查询业务数据。 */
  @Get(':formKey')
  async query(
    @Param('formKey') formKey: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('filter') filter?: string,
    @Query('keyword') keyword?: string,
    @Query('keywordColumn') keywordColumn?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ): Promise<R<BizDataPageVO>> {
    const req: BizDataQueryRequest = {
      filter: blankToNull(filter),
      keyword: blankToNull(keyword),
      keywordColumn: blankToNull(keywordColumn),
      sort: blankToNull(sort),
      order: blankToNull(order),
      params: null,
      // 绑定对象（`BizDataQueryRequest`）的 `int` 字段：非法值 → HTTP 200 + body code 400
      page: bindIntProperty(page, 'page', 1),
      size: bindIntProperty(size, 'size', 20),
    }
    return R.ok(await this.service.query(formKey, req))
  }

  /** 查询单条业务数据。 */
  @Get(':formKey/:id')
  async getById(
    @Param('formKey') formKey: string,
    @Param('id') id: string,
  ): Promise<R<BizDataVO>> {
    return R.ok(await this.service.getById(formKey, id))
  }

  /**
   * 分页查询独立子表行（`sort_no` 升序）。
   *
   * ⚠️ 必须声明在 `:formKey/:id` **之后**：两者都是 2 段路由，
   *    如果把 `:formKey/:id/sub/:field`（4 段）放前面倒也无妨，
   *    但 `:formKey/:id` 与它段数不同 —— 真正的风险在于
   *    别把 `:formKey/:id/sub/:field` 写成 3 段，那才会被 `:formKey/resolve` 类路由抢走。
   */
  @Get(':formKey/:id/sub/:field')
  async listSubRows(
    @Param('formKey') formKey: string,
    @Param('id') id: string,
    @Param('field') field: string,
  ): Promise<R<Array<Record<string, unknown>>>> {
    return R.ok(await this.service.listSubRows(formKey, id, field))
  }

  // ==================== 写路径 ====================

  /**
   * 新增业务数据。
   *
   * ⚠️ body 里的 `id`/`tenant_id`/`version` 会被**静默忽略**（`filterData` 白名单）；
   *    不在 `column_config` 里的键同样忽略 —— 都不报错。
   */
  @Post(':formKey')
  async create(
    @Param('formKey') formKey: string,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<R<BizDataVO>> {
    return R.ok(await this.service.create(formKey, body ?? null))
  }

  /**
   * 更新业务数据（乐观锁）。
   *
   * ⚠️ `version` 取自**请求体**（Java `data.get("version")`），缺省按 1 处理；
   *    版本不符 → 业务 409，记录不存在 → 业务 404。
   */
  @Put(':formKey/:id')
  async update(
    @Param('formKey') formKey: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<R<BizDataVO>> {
    return R.ok(await this.service.update(formKey, id, body ?? null, versionOf(body)))
  }

  /** 删除业务数据（**级联删除子表行**）。 */
  @Delete(':formKey/:id')
  async remove(
    @Param('formKey') formKey: string,
    @Param('id') id: string,
  ): Promise<R<null>> {
    await this.service.remove(formKey, id)
    return R.ok()
  }

  /** 新增独立子表行（`sort_no` 续接末尾；超 100 行 → 400）。 */
  @Post(':formKey/:id/sub/:field')
  async addSubRow(
    @Param('formKey') formKey: string,
    @Param('id') id: string,
    @Param('field') field: string,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<R<Record<string, unknown>>> {
    return R.ok(await this.service.addSubRow(formKey, id, field, body ?? null))
  }

  /** 更新独立子表行（乐观锁；`version` 取自请求体）。 */
  @Put(':formKey/:id/sub/:field/:rowId')
  async updateSubRow(
    @Param('formKey') formKey: string,
    @Param('id') id: string,
    @Param('field') field: string,
    @Param('rowId') rowId: string,
    @Body() body: Record<string, unknown> | undefined,
  ): Promise<R<Record<string, unknown>>> {
    return R.ok(await this.service.updateSubRow(formKey, id, field, rowId, body ?? null, versionOf(body)))
  }

  /** 删除独立子表行（删不存在的行也返回成功 —— 与 Java 一致）。 */
  @Delete(':formKey/:id/sub/:field/:rowId')
  async deleteSubRow(
    @Param('formKey') formKey: string,
    @Param('id') id: string,
    @Param('field') field: string,
    @Param('rowId') rowId: string,
  ): Promise<R<null>> {
    await this.service.deleteSubRow(formKey, id, field, rowId)
    return R.ok()
  }
}

/**
 * 从请求体取 `version`（对齐 Java `data.get("version") instanceof Number ? intValue() : null`）。
 *
 * ⚠️ **只有数字类型才算**：字符串 `"1"` 在 Java 里 `instanceof Number` 为假 ⇒ null ⇒ 按 1 处理。
 *    所以这里不能用 `Number(...)` 宽松转换，否则「传字符串版本号」的行为会分叉。
 */
function versionOf(body: Record<string, unknown> | undefined): number | null {
  const value = body?.version
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

/** `ids` 查询参数 → 字符串数组（兼容单值与重复参数两种形态）。 */
function toIdList(value: string | string[] | undefined): string[] {
  if (value === undefined) return []
  return Array.isArray(value) ? value : [value]
}
