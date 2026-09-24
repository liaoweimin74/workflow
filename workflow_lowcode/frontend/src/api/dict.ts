import http from '@/utils/http'
import type { R } from '@/types/common'
import type { DictTypeVO, DictTypeCreateForm, DictTypeUpdateForm, DictTypeQueryParams } from '@/types/dict'

export function getDictTypeList(params: DictTypeQueryParams) {
  return http.get<any, R<{ rows: DictTypeVO[]; total: number; pages: number }>>('/dict-types', { params })
}

export function createDictType(data: DictTypeCreateForm) {
  return http.post<any, R<DictTypeVO>>('/dict-types', data)
}

export function updateDictType(id: number, data: DictTypeUpdateForm) {
  return http.put<any, R<DictTypeVO>>(`/dict-types/${id}`, data)
}

export function deleteDictType(id: number) {
  return http.delete<any, R<null>>(`/dict-types/${id}`)
}

import type { DictDataVO, DictDataCreateForm, DictDataUpdateForm } from '@/types/dict'

export function getDictDataList(dictCode: string) {
  return http.get<any, R<DictDataVO[]>>(`/dict-data/${dictCode}`)
}

export function createDictData(data: DictDataCreateForm) {
  return http.post<any, R<DictDataVO>>('/dict-data', data)
}

export function updateDictData(id: number, data: DictDataUpdateForm) {
  return http.put<any, R<DictDataVO>>(`/dict-data/${id}`, data)
}

export function deleteDictData(id: number) {
  return http.delete<any, R<null>>(`/dict-data/${id}`)
}