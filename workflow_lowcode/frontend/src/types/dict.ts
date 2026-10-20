export interface DictTypeVO {
  id: number
  dictName: string
  dictCode: string
  status: number
  remark: string
  createTime: string
}

export interface DictTypeQueryParams {
  page?: number
  size?: number
  dictName?: string
  dictCode?: string
}

export interface DictTypeCreateForm {
  dictName: string
  dictCode: string
  remark?: string
}

export interface DictTypeUpdateForm {
  dictName?: string
  remark?: string
  status?: number
}

export interface DictDataVO {
  id: number
  dictCode: string
  label: string
  value: string
  sortOrder: number
  status: number
  createdAt: string
}

export interface DictDataCreateForm {
  dictCode: string
  label: string
  value: string
  sortOrder?: number
}

export interface DictDataUpdateForm {
  dictCode?: string
  label?: string
  value?: string
  sortOrder?: number
  status?: number
}

/** 字典项排序请求：ids 为该字典类型下完整的 id 顺序（未软删的全部项，一个都不能少） */
export interface DictDataSortForm {
  dictCode: string
  ids: number[]
}