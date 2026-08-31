import http from '@/utils/http'
import type { R, PageResponse } from '@/types/common'

/** 页面定义 DTO（对齐后端 PageDefinitionDTO） */
export interface PageDefinitionDTO {
  id: string
  name: string
  key: string
  type: string
  formKey: string | null
  dataSourceId: string | null
  version: number
  status: string
  publishedVersion: number | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** 页面定义详情 DTO（含编译 schema） */
export interface PageDefinitionDetailDTO extends PageDefinitionDTO {
  schema: string
}

/** 页面保存请求 */
export interface PageDefinitionSaveRequest {
  name: string
  key: string
  type: string
  formKey?: string | null
  dataSourceId?: string | null
  schema?: string
}

/** 视图数据查询参数（对齐后端 BizDataQueryRequest） */
export interface PageQueryParams {
  filter?: string
  keyword?: string
  keywordColumn?: string
  sort?: string
  order?: string
  page?: number
  size?: number
}

/** 视图数据分页结果（对齐后端 BizDataPageVO：records/total/page/size） */
export interface BizDataPageVO {
  records: Record<string, any>[]
  total: number
  page: number
  size: number
}

/** 页面挂接的菜单项（对齐后端 PageMenuResponse.MenuItem） */
export interface PageMenuItem {
  menuId: number
  menuName: string
  path: string
  parentId: number | null
  permission: string | null
  status: number | null
}

/** 页面挂接菜单列表响应（对齐后端 PageMenuResponse） */
export interface PageMenuListResponse {
  items: PageMenuItem[]
}

/** 挂接菜单请求（对齐后端 MountMenuRequest） */
export interface MountMenuRequest {
  name?: string
  parentId?: number | null
}

export const pageApi = {
  /** 分页查询页面列表 */
  getPages(params: {
    page?: number
    size?: number
    status?: string
    name?: string
    type?: string
  }): Promise<R<PageResponse<PageDefinitionDTO>>> {
    return http.get('/v1/pages', { params })
  },

  /** 创建页面定义 */
  createPage(data: PageDefinitionSaveRequest): Promise<R<PageDefinitionDTO>> {
    return http.post('/v1/pages', data)
  },

  /** 获取页面详情（含 schema） */
  getPage(id: string): Promise<R<PageDefinitionDetailDTO>> {
    return http.get(`/v1/pages/${id}`)
  },

  /** 按 key 获取页面定义（渲染默认取已发布；preview=true 取最新 DRAFT 定义。已发布定义启用 30s 缓存） */
  getPageByKey(key: string, preview: boolean = false): Promise<R<PageDefinitionDetailDTO>> {
    return http.get(`/v1/pages/${key}/definition`, { params: { preview }, cache: !preview })
  },

  /** 更新页面定义 */
  updatePage(id: string, data: PageDefinitionSaveRequest): Promise<R<PageDefinitionDTO>> {
    return http.put(`/v1/pages/${id}`, data)
  },

  /** 删除页面定义 */
  deletePage(id: string): Promise<R<void>> {
    return http.delete(`/v1/pages/${id}`)
  },

  /** 发布页面定义（编译视图配置，不建表） */
  publishPage(id: string): Promise<R<PageDefinitionDTO>> {
    return http.post(`/v1/pages/${id}/publish`)
  },

  /** 视图数据分页查询（filter 仅保留页面声明白名单字段） */
  queryPageData(pageKey: string, params: PageQueryParams): Promise<R<BizDataPageVO>> {
    return http.get(`/v1/pages/${pageKey}/data`, { params })
  },

  /** 挂接菜单（每次调用为已发布页面创建一条新菜单，支持多挂接） */
  mountMenu(id: string, data: MountMenuRequest): Promise<R<PageMenuItem>> {
    return http.post(`/v1/pages/${id}/mount-menu`, data)
  },

  /** 查询页面全部关联菜单 */
  getMenusByKey(key: string): Promise<R<PageMenuListResponse>> {
    return http.get(`/v1/pages/${key}/menus`)
  },

  /** 解除挂接（软删指定菜单） */
  unmountMenu(menuId: number): Promise<R<void>> {
    return http.delete(`/v1/pages/menus/${menuId}`)
  },
}