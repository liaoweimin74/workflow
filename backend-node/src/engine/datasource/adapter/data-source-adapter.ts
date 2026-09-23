import type { ColumnConfig, DataSourceMetadata } from '../../../common/domain/column-config'
import type { BizDataPageVO, BizDataVO } from '../../../common/domain/biz-data'
import type { BizDataQueryRequest } from '../../form/bizdata/biz-data-support'

/**
 * 数据源定义的精简视图 —— 适配器只需要这几个字段。
 *
 * 刻意**不**直接复用 `DataSourceVO`：适配器是 SPI，不该知道 API 层的 DTO 形状
 * （比如 `createdBy`/`updatedAt` 对它毫无意义）。这样也让适配器能被单测直接构造。
 */
export interface DataSourceRef {
  id: string
  tenantId: string
  name: string
  type: string
  formKey: string | null
  sourceKey: string | null
  /** `type=API` 时的动态参数 JSON；FORM/SYSTEM 也可能带 `queryMode` 配置。 */
  params: string | null
  status: string
}

/**
 * 数据源适配器 SPI（对齐 Java `com.workflow.engine.datasource.DataSourceAdapter`）。
 *
 * 读侧三个方法（`metadata` / `query` / `get`）与写侧三个方法（`create` / `update` /
 * `delete`）**都已迁移**，且 5 种类型（FORM / SYSTEM / API / WORKFLOW / SQL）的读路径
 * 全部在契约网内（见 `2026-09-16-next-batch-readwrite.md` §5.1）。
 *
 * ⚠️ 实现方仍可能返回 `Promise<never>`（抛错）—— 那是**该类型不支持这个操作**的语义
 *    （例如 WORKFLOW 只读、SYSTEM 的 `delete` 走「先过路由审计再拒绝」），
 *    由实现方抛**与 Java 同文案**的业务异常，而不是伪装成「尚未迁移」。
 */
export interface DataSourceAdapter {
  /** 是否声明支持某数据源类型（决定 `adapterOf` 的选路，必须与 Java 完全一致）。 */
  supports(type: string): boolean
  metadata(dataSource: DataSourceRef): Promise<DataSourceMetadata>
  query(dataSource: DataSourceRef, req: BizDataQueryRequest): Promise<BizDataPageVO>
  get(dataSource: DataSourceRef, id: string): Promise<BizDataVO>
  /** 新增一行，返回新行 id（Java `create` 返回 `String`）。 */
  create(dataSource: DataSourceRef, data: Record<string, unknown> | null): Promise<string>
  /** 更新一行（`version` 为乐观锁版本，来自 **query 参数**，可空）。 */
  update(
    dataSource: DataSourceRef,
    id: string,
    data: Record<string, unknown> | null,
    version: number | null,
  ): Promise<void>
  /** 删除一行。 */
  delete(dataSource: DataSourceRef, id: string): Promise<void>
}

/** 表单数据源查询配置（对齐 Java `FormQueryConfig` 中本次需要的部分）。 */
export interface FormQueryConfig {
  queryMode: string | null
}

/**
 * 解析 FORM 数据源的 `params` JSON。
 *
 * null/空白 → 默认配置（三个模式全不生效）；非法 JSON → 400（对齐 Java）。
 */
export function parseFormQueryConfig(
  paramsJson: string | null,
  fail: (message: string) => Error,
): FormQueryConfig {
  if (paramsJson === null || paramsJson.trim() === '') return { queryMode: null }
  try {
    const parsed: unknown = JSON.parse(paramsJson)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { queryMode: null }
    }
    const mode = (parsed as Record<string, unknown>).queryMode
    return { queryMode: mode === null || mode === undefined ? null : String(mode) }
  } catch (error) {
    throw fail(
      `数据源参数格式非法: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** 列定义的浅拷贝（适配器会就地补 `sortable`，不能污染调用方的数组）。 */
export function cloneColumns(columns: ColumnConfig[]): ColumnConfig[] {
  return columns.map((column) => ({ ...column }))
}
