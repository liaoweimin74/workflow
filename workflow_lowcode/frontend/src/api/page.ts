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

// ==================== Excel 导入导出（Task 5-b：③ 前端接线，端点见后端 PageDataExcelController） ====================

/** 页面数据 Excel 导出请求体（对齐后端 PageDataExportRequest；全部可选） */
export interface PageDataExportRequest {
  /** 结构化 filter JSON（与查询接口同白名单校验） */
  filter?: string
  keyword?: string
  keywordColumn?: string
  sort?: string
  order?: string
  params?: string
  /** 导出列子集（字段 key 列表；缺省=页面声明列，自定义计算列后端恒排除） */
  columns?: string[]
  /** 下载文件名（缺省=页面名称；后端清洗非法字符并强制 .xlsx 后缀） */
  filename?: string
}

/** Excel 导入行级错误（row=Excel 实际行号，1-based，表头=1） */
export interface PageDataImportError {
  row: number
  message: string
}

/** Excel 导入结果统计（对齐后端 ImportResultVO） */
export interface PageDataImportResult {
  total: number
  success: number
  failed: number
  skipped: number
  errors: PageDataImportError[]
}

/** Content-Disposition → 文件名：RFC 5987 filename*=UTF-8'' 优先（中文安全），回退 filename=（去引号） */
export function filenameFromDisposition(header: unknown): string {
  if (!header || typeof header !== 'string') return ''
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i.exec(header)
  if (star) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* 非法百分号编码 → 回退 filename= */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header)
  return plain ? plain[1].trim() : ''
}

/** 读取 blob 上拦截器附带（http.ts __headers）的响应头，键大小写不敏感 */
function blobHeader(blob: Blob, name: string): string | undefined {
  const headers = (blob as unknown as { __headers?: Record<string, unknown> }).__headers
  if (!headers) return undefined
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v == null ? undefined : String(v)
  }
  return undefined
}

/**
 * 导出视图数据为 Excel（POST + JSON body → xlsx blob）。
 * 拦截器对 blob 原样放行并把响应头挂在 blob.__headers：文件名取
 * Content-Disposition（filename*=UTF-8''，回退入参 filename）；
 * X-Export-Truncated:true 表示后端按上限截断（10000 行），由调用方提示。
 */
export async function exportPageData(
  pageKey: string,
  body: PageDataExportRequest = {},
): Promise<{ blob: Blob; filename: string; truncated: boolean }> {
  const blob = (await http.post(`/v1/pages/${pageKey}/data/export`, body, {
    responseType: 'blob',
    timeout: 120000,
  })) as unknown as Blob
  const filename =
    filenameFromDisposition(blobHeader(blob, 'Content-Disposition')) ||
    (body.filename ? `${body.filename}.xlsx` : `${pageKey}.xlsx`)
  const truncated = (blobHeader(blob, 'X-Export-Truncated') || '').toLowerCase() === 'true'
  return { blob, filename, truncated }
}

/**
 * 导入 Excel（multipart：file 必须 + mapping 可选 JSON 字符串 {"表头":"字段key"}）。
 * 仅 formKey 绑定的 VIEW 页面可用（纯数据源视图后端 400）；code≠200 由 http 拦截器
 * 统一 toast msg 并 reject，调用方只需 catch。
 */
export function importPageData(pageKey: string, formData: FormData): Promise<R<PageDataImportResult>> {
  return http.post(`/v1/pages/${pageKey}/data/import`, formData, { timeout: 120000 }) as unknown as Promise<
    R<PageDataImportResult>
  >
}
