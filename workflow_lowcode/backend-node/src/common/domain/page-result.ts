/**
 * 分页响应封装，逐字对齐 Java 侧 com.workflow.common.domain.PageResult。
 *
 * 字段名 total / page / size / rows 与 Java 完全一致，
 * 不可改成 pageSize / records / list 等 —— 前端直接消费这些字段。
 */
export class PageResult<T> {
  total: number
  page: number
  size: number
  rows: T[]

  constructor(total: number, page: number, size: number, rows: T[]) {
    this.total = total
    this.page = page
    this.size = size
    this.rows = rows
  }
}

export function pageResult<T>(total: number, page: number, size: number, rows: T[]): PageResult<T> {
  return new PageResult<T>(total, page, size, rows)
}
