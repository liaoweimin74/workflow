import http from '@/utils/http'
import type { R } from '@/types/common'

/** 应用 DTO（对齐后端 AppResponse，Task 1.2） */
export interface AppDTO {
  id: string
  /** 应用编码（租户内唯一；默认应用为 default） */
  code: string
  name: string
  themeJson?: string | null
  status?: string | null
  createdAt?: string
  updatedAt?: string
}

export const appsApi = {
  /** 租户下应用列表（设计器应用上下文下拉数据源） */
  getApps(): Promise<R<AppDTO[]>> {
    return http.get('/v1/apps')
  },
}
