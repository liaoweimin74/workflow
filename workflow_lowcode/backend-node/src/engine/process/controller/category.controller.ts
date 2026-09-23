import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { CategoryService, type CategoryVO } from '../category.service'

/**
 * 流程分类（对齐 Java `CategoryController`，前缀 `/api/v1/categories`）。
 *
 * ⚠️ 返回**裸数组**，不是分页对象 —— 这是本项目第四种响应形状。
 *    因为列表是严格逐值比对的（不是 `$.data.content` 那种 shape-only），
 *    契约场景里新建分类用了固定名字与固定 sortOrder，才能保证两侧顺序一致。
 */
@Controller('api/v1/categories')
@JavaStatusOk()
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  /** 分类列表（扁平，全部层级）。 */
  @Get()
  async list(): Promise<R<CategoryVO[]>> {
    return R.ok(await this.service.listAll())
  }

  /** 「分类树」：实际只返回根分类（对齐 Java 的空实现 buildTree）。 */
  @Get('tree')
  async tree(): Promise<R<CategoryVO[]>> {
    return R.ok(await this.service.getCategoryTree())
  }

  /** 新建分类。`sortOrder` 为空时落 0（对齐 Java）。 */
  @Post()
  async create(@Body() body: CategorySaveRequest | null): Promise<R<CategoryVO>> {
    return R.ok(
      await this.service.createCategory(
        String(body?.name ?? ''),
        body?.parentId ?? null,
        toNumberOrNull(body?.sortOrder),
      ),
    )
  }

  /**
   * 修改分类。
   *
   * ⚠️ 三个字段都是「**null 表示不改**」—— 传 `parentId: null` 不会清空父级。
   *    这与直觉相反，但是 Java 的行为，也是唯一的契约。
   */
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() body: CategorySaveRequest | null,
  ): Promise<R<CategoryVO>> {
    return R.ok(
      await this.service.updateCategory(
        id,
        body?.name ?? null,
        body?.parentId ?? null,
        toNumberOrNull(body?.sortOrder),
      ),
    )
  }

  /** 删除分类（有子分类时拒绝）。 */
  @Delete(':id')
  async remove(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteCategory(id)
    return R.ok()
  }
}

/** 分类保存请求体：Java 侧是 `Map<String, Object>`，`sortOrder` 按 Number 转换。 */
interface CategorySaveRequest {
  name?: string | null
  parentId?: string | null
  sortOrder?: number | string | null
}

/**
 * `sortOrder` → number | null。
 *
 * Java 是 `body.get("sortOrder") != null ? ((Number) ...).intValue() : null`：
 * 传非数字时会 `ClassCastException` → HTTP 500。这里退化为 null（「不改」），
 * 属于规格 U8 记录的已知分歧 —— 无 golden 覆盖，不擅自"修好"。
 */
function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}
