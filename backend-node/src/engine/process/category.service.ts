import { Injectable } from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { getTenantId } from '../../framework/tenant/tenant-context'
import { CategoryRepository, type CategoryRow } from './repository/category.repository'

/** 对齐 Java 的 ID 生成：UUID 去掉横线 → 32 位十六进制。 */
function newId(): string {
  return randomBytes(16).toString('hex')
}

/**
 * 流程分类 VO，逐字对齐 Java 实体 `com.workflow.engine.process.entity.Category`
 * 的 Jackson 序列化结果（6 个字段）。
 */
export interface CategoryVO {
  id: string
  tenantId: string
  name: string
  parentId: string | null
  sortOrder: number | null
  createdAt: Date | null
}

function toVO(row: CategoryRow): CategoryVO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    parentId: row.parent_id,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  }
}

/**
 * 流程分类服务（对齐 Java `CategoryService` 的**只读**部分）。
 *
 * ⚠️ Java 的 `getCategoryTree()` 名字叫树，但 `buildTree` 里只有一句
 *    `filter(parentId == null)` + 一个**空实现**的 peek（注释明说「children 由前端
 *    根据 parentId 构建，后端只返回扁平列表」）。
 *    也就是说它其实返回的是**根节点扁平列表**，不是树 —— 但语义确实不同于 listAll
 *    （listAll 含所有层级）。这里照实迁移，不擅自「修正」成真树。
 */
@Injectable()
export class CategoryService {
  constructor(private readonly repository: CategoryRepository) {}

  /** 全部分类（扁平，按 sort_order 升序）。 */
  async listAll(): Promise<CategoryVO[]> {
    const rows = await this.repository.findByTenantIdOrderBySortOrderAsc(getTenantId())
    return rows.map(toVO)
  }

  /**
   * 「分类树」：**只返回 parentId 为 null 的根分类**，不含子节点
   * （对齐 Java `buildTree(all, null)`）。
   */
  async getCategoryTree(): Promise<CategoryVO[]> {
    const rows = await this.repository.findByTenantIdOrderBySortOrderAsc(getTenantId())
    return rows.filter((row) => row.parent_id === null).map(toVO)
  }

  // ------------------------------------------------------------ 写路径

  /**
   * 新建分类（对齐 Java `createCategory`）。
   *
   * `sortOrder` 为空时落 0；id 用 32 位十六进制
   * （对齐 Java 的 `UUID.randomUUID().toString().replace("-", "")`）。
   */
  async createCategory(
    name: string,
    parentId: string | null,
    sortOrder: number | null,
  ): Promise<CategoryVO> {
    const row: CategoryRow = {
      id: newId(),
      tenant_id: getTenantId(),
      name,
      parent_id: parentId,
      sort_order: sortOrder ?? 0,
      created_at: new Date(),
    }
    await this.repository.insert(row)
    return toVO(row)
  }

  /**
   * 修改分类（对齐 Java `updateCategory`）。
   *
   * ⚠️ 三个字段都是「**null 表示不改**」—— 不能写成 `patch.parent_id = parentId`，
   *    那会把「没传父级」误当成「清空父级」。
   * ⚠️ 找不到（或租户不符）时 Java 抛 `RuntimeException("Category not found: " + id)`
   *    → HTTP **500**，不是业务 200。这里用普通 Error 保持同样的状态码。
   */
  async updateCategory(
    id: string,
    name: string | null,
    parentId: string | null,
    sortOrder: number | null,
  ): Promise<CategoryVO> {
    const existing = await this.requireOwned(id)
    const patch: Partial<CategoryRow> = {}
    if (name !== null) patch.name = name
    if (parentId !== null) patch.parent_id = parentId
    if (sortOrder !== null) patch.sort_order = sortOrder
    if (Object.keys(patch).length > 0) await this.repository.update(id, patch)
    return toVO({ ...existing, ...patch })
  }

  /**
   * 删除分类（对齐 Java `deleteCategory`）：**有子分类时拒绝**，
   * 抛普通 Error（Java 是 RuntimeException → HTTP 500）。
   */
  async deleteCategory(id: string): Promise<void> {
    await this.requireOwned(id)
    const children = await this.repository.findByParentId(id)
    if (children.length > 0) {
      throw new Error('请先删除子分类')
    }
    await this.repository.deleteById(id)
  }

  /** 取分类并校验属于当前租户；否则抛 500（对齐 Java 的 `findById(...).filter(tenant).orElseThrow`）。 */
  private async requireOwned(id: string): Promise<CategoryRow> {
    const row = await this.repository.findById(id)
    if (row === null || row.tenant_id !== getTenantId()) {
      throw new Error(`Category not found: ${id}`)
    }
    return row
  }
}
