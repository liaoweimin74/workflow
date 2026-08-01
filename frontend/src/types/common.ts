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