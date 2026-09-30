import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { CategoryService, type CategoryVO } from '../category.service'

/**
 * 流程分类（前缀 `/api/v1/categories`，扁平结构）。
 *
 * ⚠️ 返回**裸数组**，不是分页对象 —— 这是本项目第四种响应形状。
 *    因为列表是严格逐值比对的（不是 `$.data.content` 那种 shape-only），
 *    契约场景里新建分类用了固定名字与固定 sortOrder，才能保证两侧顺序一致。
 *
 * Task 105：取消树形结构——`parentId` 字段与 `/tree` 端点移除；
 * `sortOrder` 缺省时服务端自动「排到最后」（max + 1）。
 */
@Controller('api/v1/categories')
@JavaStatusOk()
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  /** 分类列表（扁平，按 sort_order 升序）。 */
  @Get()
  async list(): Promise<R<CategoryVO[]>> {
    return R.ok(await this.service.listAll())
  }

  /** 新建分类。`sortOrder` 为空时自动排到最后（当前租户 max + 1）。 */
  @Post()
  async create(@Body() body: CategorySaveRequest | null): Promise<R<CategoryVO>> {
    return R.ok(
      await this.service.createCategory(String(body?.name ?? ''), toNumberOrNull(body?.sortOrder)),
    )
  }

  /**
   * 修改分类。
   *
   * ⚠️ 两个字段都是「**null 表示不改**」—— 传 `sortOrder: null` 不会清空排序。
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: CategorySaveRequest | null,
  ): Promise<R<CategoryVO>> {
    return R.ok(
      await this.service.updateCategory(id, body?.name ?? null, toNumberOrNull(body?.sortOrder)),
    )
  }

  /** 删除分类（分类下存在流程草稿时拒绝）。 */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteCategory(id)
    return R.ok()
  }
}

/** 分类保存请求体（Task 105 起无 parentId）。 */
interface CategorySaveRequest {
  name?: string | null
  sortOrder?: number | string | null
}

/**
 * `sortOrder` → number | null。
 *
 * 传非数字时退化为 null（「不改」/新建时自动排最后），属规格 U8 记录的已知分歧延续。
 */
function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
