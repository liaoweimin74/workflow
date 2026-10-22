/**
 * 远程物料管理 API（change: remote-materials 6.3）。
 *
 * 对应后端 MaterialController（/api/materials）：
 * - POST   /materials                 multipart(bundle, manifest) 上传（同 key 版本+1 覆盖）
 * - GET    /materials                 分页列表（keyword 命中名称/标识，type 过滤）
 * - GET    /materials/{id}            详情（含 manifest 原文、下载地址、引用菜单）
 * - GET    /materials/by-key/{key}    运行时加载器入口（MaterialRenderer 用）
 * - GET    /materials/widgets         启用的 WIDGET 物料（设计器面板用，登录即可）
 * - PUT    /materials/{id}/status     启停（status 为 query 参数）
 * - PUT    /materials/{id}/mount-menu/{menuId} 覆盖已有菜单指向当前物料
 * - DELETE /materials/{id}?force=     删除（被菜单引用且非 force → 业务码 409）
 * - GET    /materials/{key}/bundle    bundle 公开读（前端不消费，浏览器 import() 直取）
 * - POST   /materials/export          导出物料包（zip 流）
 * - POST   /materials/inspect         导入预检（不落库）
 * - POST   /materials/import          导入执行（actions 为 JSON 串）
 * - GET    /materials/scaffold-template 物料工程模板（zip 流）
 *
 * 管理动作要求 material:manage；列表/详情仅要求登录。
 */
import http from '@/utils/http'
import type { R } from '@/types/common'

/** 列表项（后端 MaterialDTO） */
export interface MaterialItem {
  id: number
  materialKey: string
  name: string
  /** PAGE 页面型 / WIDGET 组件型 */
  type: string
  version: number
  sdkVersion: string
  /** 1 启用 / 0 停用 */
  status: number
  fileSize: number
  createdAt: string | null
}

/** 分页响应（后端 PageResponse） */
export interface MaterialPage {
  content: MaterialItem[]
  pageNumber: number
  pageSize: number
  totalElements: number
}

export interface MaterialListParams {
  page: number
  size: number
  keyword?: string
  type?: string
}

/** 详情（后端 toDetail 的 Map，manifest 为原文对象） */
export interface MaterialDetail extends MaterialItem {
  manifest: Record<string, unknown>
  downloadUrl: string
  hostSdkVersion: string
  referencedMenus: { menuId: number; menuName: string; path: string | null }[]
}

/** 设计器面板项（后端 toWidgetItem）：只带 meta，不带 bundle 地址 */
export interface MaterialWidgetItem {
  id: number
  materialKey: string
  name: string
  version: number
  sdkVersion: string
  /**
   * 属性面板配置项：`[{field,label,type,default,options}]`，数组顺序即面板顺序
   * （对象键序在 MySQL 的 JSON 列里会被重排，所以协议用数组）。
   */
  meta: MaterialMetaSource
}

export type MaterialMetaSource = Record<string, unknown> | Record<string, unknown>[]

export function listMaterials(params: MaterialListParams) {
  return http.get('/materials', { params }) as unknown as Promise<R<MaterialPage>>
}

export function getMaterialDetail(id: number) {
  return http.get(`/materials/${id}`) as unknown as Promise<R<MaterialDetail>>
}

/**
 * 设计器组件面板数据源：全部启用的 WIDGET 型物料。
 * 仅需登录权限（不要求 material:manage），设计器打开即调用。
 */
export function listEnabledWidgets() {
  return http.get('/materials/widgets') as unknown as Promise<R<MaterialWidgetItem[]>>
}

/** 上传物料：bundle 为脚手架产出的单文件 ESM，manifest 为 material.json 原文。 */
export function uploadMaterial(bundle: File, manifest: File) {
  const fd = new FormData()
  fd.append('bundle', bundle)
  fd.append('manifest', manifest)
  return http.post('/materials', fd, { timeout: 120000 }) as unknown as Promise<R<MaterialItem>>
}

export function setMaterialStatus(id: number, status: 0 | 1) {
  return http.put(`/materials/${id}/status`, null, { params: { status } }) as unknown as Promise<R<MaterialItem>>
}

/** 覆盖已有菜单指向当前物料：保留名称/目录/排序/角色授权，只把入口切过来。 */
export function overwriteMaterialMenu(id: number, menuId: number) {
  return http.put(`/materials/${id}/mount-menu/${menuId}`) as unknown as Promise<R<null>>
}

/**
 * 删除物料。force=true 用于「被菜单引用」409 后的强制删除（调用方需二次确认）。
 */
export function deleteMaterial(id: number, force = false) {
  return http.delete(`/materials/${id}`, { params: { force } }) as unknown as Promise<R<null>>
}

// ================= 导出 / 预检 / 导入（三期 6.1/6.2） =================

/** 预检单条：conflict 表示目标系统已有同 key，importable=false 时 reason 说明为什么导不了。 */
export interface MaterialInspectItem {
  key: string
  name: string
  type: string
  sdkVersion: string
  version: number | null
  conflict: boolean
  existingVersion: number | null
  importable: boolean
  reason: string | null
}

export interface MaterialInspectResult {
  exportedAt: string
  hostSdkVersion: string
  items: MaterialInspectItem[]
}

export interface MaterialImportItemResult {
  key: string
  name: string
  /** IMPORTED / OVERWRITTEN / SKIPPED / FAILED */
  status: string
  version: number | null
  message: string
}

export interface MaterialImportResult {
  results: MaterialImportItemResult[]
  messages: string[]
}

/**
 * 导出物料包（zip Blob，调用方触发下载）。
 * http 拦截器对 blob 响应整体放行，返回值即 Blob；失败时后端回 R JSON，需显式识别。
 */
export async function exportMaterials(ids: number[]): Promise<Blob> {
  const resp = (await http.post('/materials/export', { ids }, {
    responseType: 'blob',
    timeout: 120000
  })) as unknown as Blob
  if (resp.type === 'application/json') {
    const body = JSON.parse(await resp.text())
    throw new Error(body?.msg || '导出失败')
  }
  return resp
}

/** 物料工程模板（骨架 + 两类示例源码 + 开发教程 README），zip Blob。 */
export async function downloadScaffoldTemplate(): Promise<Blob> {
  const resp = (await http.get('/materials/scaffold-template', {
    responseType: 'blob'
  })) as unknown as Blob
  if (resp.type === 'application/json') {
    const body = JSON.parse(await resp.text())
    throw new Error(body?.msg || '模板下载失败')
  }
  return resp
}

export function inspectMaterialPackage(file: File) {
  const form = new FormData()
  form.append('file', file)
  return http.post('/materials/inspect', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }) as unknown as Promise<R<MaterialInspectResult>>
}

/** 导入执行：actions 走 JSON 串（multipart 带不了对象数组），冲突条目缺省按 SKIP 处理。 */
export function importMaterialPackage(file: File, actions: { key: string; strategy: string }[]) {
  const form = new FormData()
  form.append('file', file)
  form.append('actions', JSON.stringify(actions))
  return http.post('/materials/import', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000
  }) as unknown as Promise<R<MaterialImportResult>>
}

