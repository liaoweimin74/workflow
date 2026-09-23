import { Inject, Injectable } from '@nestjs/common'
import { type ColumnInfo, type DataSourceMetadata } from '../../../common/domain/column-config'
import type { BizDataPageVO, BizDataVO } from '../../../common/domain/biz-data'
import { PageResponse } from '../../../common/domain/page-response'
import { BusinessException } from '../../../common/exception/business-exception'
import { assertPageSize } from '../../../framework/http/query-params'
import { getTenantId } from '../../../framework/tenant/tenant-context'
import type { BizDataQueryRequest } from '../../form/bizdata/biz-data-support'
import type { DataSourceAdapter, DataSourceRef } from '../adapter/data-source-adapter'
import { DataSourceRepository, type DataSourceRow } from '../repository/data-source.repository'

/**
 * 已注册数据源适配器的注入令牌。
 *
 * 用**数组**而不是单个适配器，形状与 Java 注入 `List<DataSourceAdapter>` 一致：
 * 新增适配器只是往数组里加一项，选路逻辑不必改。
 */
export const DATA_SOURCE_ADAPTERS = Symbol('DATA_SOURCE_ADAPTERS')

/** 已启用状态字面量，对齐 Java `DataSourceDefinitionService.STATUS_ENABLED`。 */
const STATUS_ENABLED = 'ENABLED'

/** SYSTEM 类型：系统结构数据源，对所有租户可见（由 SQL 的 OR 条件体现）。 */
export const TYPE_SYSTEM = 'SYSTEM'

/**
 * Flyway 迁移历史表 —— 建表框架自动创建，不属于业务表，`/db/tables` 列表排除。
 * 对齐 Java `DbSchemaController.FLYWAY_HISTORY_TABLE`。
 */
const FLYWAY_HISTORY_TABLE = 'flyway_schema_history'

/** 数据源 DTO，逐字对齐 Java `com.workflow.api.dto.DataSourceDTO`（11 个字段，不含 formId）。 */
export interface DataSourceVO {
  id: string
  tenantId: string
  name: string
  type: string
  formKey: string | null
  sourceKey: string | null
  params: string | null
  status: string
  createdBy: string | null
  createdAt: Date | null
  updatedAt: Date | null
}

function toVO(row: DataSourceRow): DataSourceVO {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    type: row.type,
    formKey: row.form_key,
    sourceKey: row.source_key,
    params: row.params,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * 数据源服务（对齐 Java `DataSourceDefinitionService` 的**只读**部分）。
 *
 * 目前只迁移契约场景已覆盖的读端点：`list` / `getEnabled` / `listTableNames`。
 * 写端点（create/update/enable/disable/delete）与统一数据访问端点
 * （metadata / queryData / createData …）按「补场景 → 录 golden → 按 golden 实现」
 * 的顺序在后续增量里补齐 —— 没有 golden 的实现等于没验证过。
 */
@Injectable()
export class DataSourceService {
  constructor(
    private readonly repository: DataSourceRepository,
    @Inject(DATA_SOURCE_ADAPTERS) private readonly adapters: DataSourceAdapter[],
  ) {}

  /**
   * 分页查询数据源（type/status 可选过滤）。
   *
   * ⚠️ `pageSize` 直接透传请求值，不做下限兜底：Java 侧 `PageRequest.of(page, size)`
   *    在 `size < 1` 时抛 IllegalArgumentException → HTTP 500。若这里改成
   *    `Math.max(size, 1)`，就会把 Java 的 500 悄悄变成 200 —— 属于契约分叉。
   *    `page` 则按 Java 用 `Math.max(page, 1)` 归一（1 基）。
   */
  async list(
    page: number,
    size: number,
    type: string | null,
    status: string | null,
  ): Promise<PageResponse<DataSourceVO>> {
    // Java 侧 `PageRequest.of(normalizedPage - 1, size)` ⇒ size < 1 → HTTP 400
    // + `Page size must not be less than one`（契约场景 qiListSizeZero / qiListSizeNeg 钉住）
    assertPageSize(size)
    const tenantId = getTenantId()
    const normalizedPage = Math.max(page, 1)
    const { rows, total } = await this.repository.findByAccessibleTenant(
      tenantId,
      normalizeFilter(type),
      normalizeFilter(status),
      (normalizedPage - 1) * size,
      size,
    )
    return new PageResponse<DataSourceVO>(rows.map(toVO), normalizedPage, size, total)
  }

  /** 仅已启用数据源（页面设计器下拉用）。 */
  async getEnabled(): Promise<DataSourceVO[]> {
    const tenantId = getTenantId()
    const rows = await this.repository.findByStatusAndAccessibleTenant(STATUS_ENABLED, tenantId)
    return rows.map(toVO)
  }

  /** 当前库全部基础表名（排除 Flyway 迁移历史表，忽略大小写）。 */
  async listTableNames(): Promise<string[]> {
    const names = await this.repository.listTableNames()
    return names.filter((name) => name.toLowerCase() !== FLYWAY_HISTORY_TABLE.toLowerCase())
  }

  /**
   * 按 id 取数据源详情（SYSTEM 类型跨租户可见）；不存在 → 404。
   *
   * ⚠️ 消息文本必须与 Java **逐字一致**（含 `: ` 与 id）——
   *    契约冻结包含错误信息，不是只有成功响应才算契约。
   */
  async getById(id: string): Promise<DataSourceVO> {
    const row = await this.repository.findByIdAccessible(id, getTenantId())
    if (row === null) {
      throw new BusinessException(404, `数据源不存在: ${id}`)
    }
    return toVO(row)
  }

  /** 物理表列定义（表不存在时返回空数组，不报错）。 */
  async listTableColumns(table: string): Promise<ColumnInfo[]> {
    return this.repository.findTableColumns(table)
  }

  /**
   * 数据源元数据（列定义 + 可写标记 + 绑定表单）。
   *
   * ⚠️ 顺序与 Java 一致：**先按 id 取数据源（可 404）**，再在 `adapterOf` 里校验
   *    「已启用」与「类型有适配器」。顺序颠倒会让「未启用」盖住「不存在」。
   */
  async metadata(id: string): Promise<DataSourceMetadata> {
    const { ref, adapter } = await this.adapterOf(id)
    return adapter.metadata(ref)
  }

  /** 数据源分页取数（经适配器 SPI）。 */
  async queryData(id: string, req: BizDataQueryRequest): Promise<BizDataPageVO> {
    const { ref, adapter } = await this.adapterOf(id)
    return adapter.query(ref, req)
  }

  /** 数据源单行取数（经适配器 SPI）。 */
  async getData(id: string, rowId: string): Promise<BizDataVO> {
    const { ref, adapter } = await this.adapterOf(id)
    return adapter.get(ref, rowId)
  }

  /**
   * 数据源新增分发（对齐 Java `createData`，返回新行 id）。
   *
   * ⚠️ `version` 不是这个端点的事：Java 的 `PUT /{id}/data/{rowId}` 把版本放在
   *    **`@RequestParam`**（query 参数）里，而 `/api/v1/biz-data/{formKey}/{id}`
   *    那条路是从 **body** 取 `version`。两条路入口不同，别互相「统一」。
   */
  async createData(id: string, data: Record<string, unknown> | null): Promise<string> {
    const { ref, adapter } = await this.adapterOf(id)
    return adapter.create(ref, data)
  }

  /** 数据源修改分发（经适配器 SPI；只读数据源由适配器抛 400）。 */
  async updateData(
    id: string,
    rowId: string,
    data: Record<string, unknown> | null,
    version: number | null,
  ): Promise<void> {
    const { ref, adapter } = await this.adapterOf(id)
    await adapter.update(ref, rowId, data, version)
  }

  /** 数据源删除分发（经适配器 SPI）。 */
  async deleteData(id: string, rowId: string): Promise<void> {
    const { ref, adapter } = await this.adapterOf(id)
    await adapter.delete(ref, rowId)
  }

  /**
   * 选路（对齐 Java `DataSourceDefinitionService.adapterOf`）。
   *
   * 三步顺序不可换：取数据源（404）→ 校验已启用（400）→ 逐个适配器问 `supports`
   * （都不支持则 400 `数据源类型未启用: <type>`）。
   * 用**数组 + 遍历**而不是「一个适配器工厂」，是为了让后续新增适配器
   * （WORKFLOW / API / SQL）只是往数组里加一项，不必改这里的逻辑 ——
   * 与 Java 注入 `List<DataSourceAdapter>` 的形状一致。
   */
  private async adapterOf(id: string): Promise<{ ref: DataSourceRef; adapter: DataSourceAdapter }> {
    const detail = await this.getById(id)
    if (detail.status !== STATUS_ENABLED) {
      throw new BusinessException(400, `数据源未启用，无法访问: ${detail.name}`)
    }
    const ref: DataSourceRef = {
      id: detail.id,
      tenantId: detail.tenantId,
      name: detail.name,
      type: detail.type,
      formKey: detail.formKey,
      sourceKey: detail.sourceKey,
      params: detail.params,
      status: detail.status,
    }
    for (const adapter of this.adapters) {
      if (adapter.supports(ref.type)) return { ref, adapter }
    }
    throw new BusinessException(400, `数据源类型未启用: ${ref.type}`)
  }
}

/** Java 侧 `type != null && !type.isBlank()` 的等价判定：空串按「未传」处理。 */
function normalizeFilter(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value.trim() === '') return null
  return value
}
