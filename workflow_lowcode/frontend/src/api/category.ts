import http from '@/utils/http'
import type { R } from '@/types/common'

/** 流程分类（Task 105 起为扁平结构，无 parentId）。 */
export interface Category {
  id: string
  tenantId: string
  name: string
  sortOrder: number
  createdAt: string
}

export interface CategorySaveRequest {
  name: string
  sortOrder?: number
}

export const categoryApi = {
  list(): Promise<R<Category[]>> {
    return http.get('/v1/categories')
  },

  create(data: CategorySaveRequest): Promise<R<Category>> {
    return http.post('/v1/categories', data)
  },

  update(id: string, data: CategorySaveRequest): Promise<R<Category>> {
    return http.put(`/v1/categories/${id}`, data)
  },

  delete(id: string): Promise<R<void>> {
    return http.delete(`/v1/categories/${id}`)
  }
}
