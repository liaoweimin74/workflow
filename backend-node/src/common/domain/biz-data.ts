/**
 * 业务数据 DTO —— 契约类型，对齐 Java 侧
 * `com.workflow.api.dto.BizDataVO` 与 `com.workflow.api.dto.BizDataPageVO`。
 *
 * 放在 common 的原因同 column-config.ts：engine（业务数据/数据源 SPI）
 * 与 api（`/api/v1/internal/system/*` 内置数据源）都要产出它。
 */

/** 单条业务数据。 */
export interface BizDataVO {
  id: string
  data: Record<string, unknown>
  version: number | null
  createdAt: Date | null
  updatedAt: Date | null
}

/**
 * 业务数据分页。
 *
 * ⚠️ 这是**第四种**分页形状（`{records,total,page,size}`）：
 *    与 PageResponse（content/pageNumber/...）、PageResult（total/page/size/rows）、
 *    裸数组都不同。别顺手「统一」成其中任何一个。
 */
export interface BizDataPageVO {
  records: BizDataVO[]
  total: number
  page: number
  size: number
}

export function bizDataVO(
  id: string,
  data: Record<string, unknown>,
  version: number | null,
  createdAt: Date | null,
  updatedAt: Date | null,
): BizDataVO {
  return { id, data, version, createdAt, updatedAt }
}

export function bizDataPageVO(
  records: BizDataVO[],
  total: number,
  page: number,
  size: number,
): BizDataPageVO {
  return { records, total, page, size }
}
