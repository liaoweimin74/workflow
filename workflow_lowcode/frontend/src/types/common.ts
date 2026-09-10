export interface R<T = any> {
  code: number
  data: T
  msg: string
}

export interface PageResult<T> {
  total: number
  page: number
  size: number
  rows: T[]
}

/**
 * 后端 PageResponse 形状（Spring Data Page 包装）。
 * 用于 /api/v1/tasks、/api/v1/process-instances 等分页接口。
 */
export interface PageResponse<T> {
  content: T[]
  pageNumber: number
  pageSize: number
  totalElements: number
  totalPages: number
}