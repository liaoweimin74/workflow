import { Injectable } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { CategoryRepository, type CategoryRow } from './repository/category.repository'

/** 对齐 Java 的 ID 生成：UUID 去掉横线 → 32 位十六进制。 */
function newId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 流程分类 VO（Task 105 起为**扁平结构**，无 parentId——分类不再支持树形层级）。
 */
export interface CategoryVO {
  id: string
  tenantId: string
  name: string
  sortOrder: number | null
  createdAt: Date | null
}

function toVO(row: CategoryRow): CategoryVO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

/**
 * 流程分类服务（扁平结构：无父子层级、无「分类树」概念）。
 *
 * Task 105 起：`sortOrder` 缺省时自动取当前租户最大值 + 1（新分类排到最后），
 * 支撑前端胶囊内联新建（无排序输入框）。
 */
@Injectable()
export class CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  /** 全部分类（扁平，按 sort_order 升序）。 */
  async listAll(): Promise<CategoryVO[]> {
    const rows = await this.repository.findByTenantIdOrderBySortOrderAsc(getTenantId())
    return rows.map(toVO)
  }

  // ------------------------------------------------------------ 写路径

  /**
   * 新建分类。`sortOrder` 为空时落「当前租户最大 sort_order + 1」（排到最后）。
   */
  async createCategory(name: string, sortOrder: number | null): Promise<CategoryVO> {
    const tenantId = getTenantId()
    const finalSortOrder = sortOrder ?? (await this.repository.maxSortOrder(tenantId)) + 1
    const row: CategoryRow = {
      id: newId(),
      tenant_id: tenantId,
      name,
      sort_order: finalSortOrder,
      created_at: new Date(),
    }
    await this.repository.insert(row)
    return toVO(row)
  }

  /**
   * 修改分类。
   *
   * ⚠️ 两个字段都是「**null 表示不改**」—— 不能写成 `patch.sort_order = sortOrder`，
   *    那会把「没传排序」误当成清空。
   * ⚠️ 找不到（或租户不符）时抛普通 Error → HTTP 500（历史行为保持）。
   */
  async updateCategory(id: string, name: string | null, sortOrder: number | null): Promise<CategoryVO> {
    const existing = await this.requireOwned(id)
    const patch: Partial<CategoryRow> = {}
    if (name !== null) patch.name = name
    if (sortOrder !== null) patch.sort_order = sortOrder
    if (Object.keys(patch).length > 0) await this.repository.update(id, patch)
    return toVO({ ...existing, ...patch })
  }

  /**
   * 删除分类（**有流程草稿引用时拒绝**）。
   *
   * Task 105 前的「有子分类则拒绝」随树形结构一并取消；改为引用保护：
   * 分类下还有流程草稿时不允许删除，避免草稿的 category_id 变成孤儿引用。
   */
  async deleteCategory(id: string): Promise<void> {
    await this.requireOwned(id)
    const refs = await this.repository.countDraftsByCategoryId(id)
    if (refs > 0) {
      throw new Error('该分类下存在流程，请先移除或转移后再删除')
    }
    await this.repository.deleteById(id)
  }

  /** 取分类并校验属于当前租户；否则抛 500（历史行为保持）。 */
  private async requireOwned(id: string): Promise<CategoryRow> {
    const row = await this.repository.findById(id)
    if (row === null || row.tenant_id !== getTenantId()) {
      throw new Error(`Category not found: ${id}`)
    }
    return row
  }
}
