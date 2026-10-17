import http from '@/utils/http'
import type { R, PageResponse } from '@/types/common'

/** 页面模板 DTO（列表项，对齐后端 PageTemplateDTO） */
export interface PageTemplateDTO {
  id: string
  name: string
  key: string
  schemaVersion: number
  /** 模板形态：full（全量快照）/ skeleton（骨架，数据源槽位化） */
  kind?: 'full' | 'skeleton' | string
  /** schema 数据源条目总数与 refId 非空数（绑定状态列用） */
  dsCount?: number
  dsBound?: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

/** 页面模板详情（含 schema 快照原文） */
export interface PageTemplateDetailDTO extends PageTemplateDTO {
  schema: string
}

/** 模板保存请求（save 端点按 key upsert） */
export interface PageTemplateSaveRequest {
  name: string
  key: string
  schema: string
  /** 模板形态：full（缺省）/skeleton（骨架） */
  kind?: string
}

/** bundle 文件条目（导出/导入同构） */
export interface PageTemplateBundleItem {
  key: string
  name: string
  kind?: string
  schema: Record<string, unknown>
}

/** 模板 bundle 文件结构（与后端 PageTemplateController.BUNDLE_KIND 对齐） */
export interface PageTemplateBundle {
  kind: 'page-template-bundle'
  schemaVersion: number
  templates: PageTemplateBundleItem[]
}

/** 导入结果统计 */
export interface PageTemplateImportResult {
  created: number
  updated: number
}

export const pageTemplateApi = {
  /** 分页查询模板列表 */
  listTemplates(params: {
    page?: number
    size?: number
    name?: string
  }): Promise<R<PageResponse<PageTemplateDTO>>> {
    return http.get('/v1/page-templates', { params })
  },

  /** 模板详情（含 schema） */
  getTemplate(id: string): Promise<R<PageTemplateDetailDTO>> {
    return http.get(`/v1/page-templates/${id}`)
  },

  /** 创建模板 */
  createTemplate(data: PageTemplateSaveRequest): Promise<R<PageTemplateDTO>> {
    return http.post('/v1/page-templates', data)
  },

  /** 按 key upsert 保存（另存为模板 / 覆盖更新） */
  saveTemplate(data: PageTemplateSaveRequest): Promise<R<PageTemplateDTO>> {
    return http.post('/v1/page-templates/save', data)
  },

  /** 更新模板（重命名/改 key） */
  updateTemplate(id: string, data: Partial<PageTemplateSaveRequest>): Promise<R<PageTemplateDTO>> {
    return http.put(`/v1/page-templates/${id}`, data)
  },

  /** 删除模板 */
  deleteTemplate(id: string): Promise<R<void>> {
    return http.delete(`/v1/page-templates/${id}`)
  },

  /** 批量导出 bundle（ids 为空 → 全部模板）；后端返回 JSON，文件下载由调用方组装 Blob */
  exportBundle(ids?: string[]): Promise<R<PageTemplateBundle>> {
    return http.post('/v1/page-templates/export', ids ?? [])
  },

  /** 导入 bundle（按 key upsert） */
  importBundle(bundle: PageTemplateBundle): Promise<R<PageTemplateImportResult>> {
    return http.post('/v1/page-templates/import', bundle)
  },
}
