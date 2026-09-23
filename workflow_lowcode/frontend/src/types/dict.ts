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