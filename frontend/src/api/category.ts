import http from '@/utils/http'
import type { R } from '@/types/common'

export interface Category {
  id: string
  tenantId: string
  name: string
  parentId: string | null
  sortOrder: number
  createdAt: string
}

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[]
}

export interface CategorySaveRequest {
  name: string
  parentId: string | null
  sortOrder?: number
}

export const categoryApi = {
  list(): Promise<R<Category[]>> {
    return http.get('/v1/categories')
  },

  tree(): Promise<R<Category[]>> {
    return http.get('/v1/categories/tree')
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
