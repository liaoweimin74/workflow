import http from '@/utils/http'
import type { R } from '@/types/common'

/**
 * 发布链路 api（Task 8.3 前端首个消费方）。
 *
 * 路径口径对齐后端：
 *   GET  /api/v1/apps/{appId}/clients                          客户端实例列表（AppAdminController）
 *   GET  /api/v1/apps/{appId}/clients/{clientId}/pages         启用清单（AppClientPageResponse）
 *   POST /api/v1/apps/{appId}/clients/{clientId}/releases      建快照（AppReleaseController）
 *   POST .../releases/{releaseId}/build                        构建（请求体 files）
 *   POST .../releases/{releaseId}/upload                       体验版上传（凭证按 Client，前端不传）
 */

/** 客户端实例 DTO（对齐后端 AppClientResponse） */
export interface AppClientDTO {
  id: string
  appId: string
  /** 端类型 WEB / MP_WEIXIN / H5 / APP */
  clientType: string
  name: string
  renderMode?: string | null
  /** 构建配置 JSON 字符串（小程序 appid/privateKeyPath、H5 域名等） */
  buildConfigJson?: string | null
  navigationJson?: string | null
  status?: string | null
}

/** 客户端启用清单条目（对齐后端 AppClientPageResponse） */
export interface AppClientPageDTO {
  id: string
  pageId: string
  pageName: string
  /** 导航顺序（首项即首页） */
  sort: number
  /** 条目级导航配置 JSON 字符串 → pages.json 该页 style */
  navConfig?: string | null
}

/** 发布快照 DTO（对齐后端 AppReleaseResponse） */
export interface AppReleaseDTO {
  id: string
  appId: string
  clientId: string
  version: number
  snapshotJson?: string | null
  artifactUrl?: string | null
  /** 体验版上传后的预览二维码地址（Task 9.3） */
  uploadedQrUrl?: string | null
  /** CREATED / BUILDING / PUBLISHED / FAILED / UPLOADED */
  status: string
  error?: string | null
  createdAt?: string
}

export const releaseApi = {
  /** 应用下的客户端实例列表（二维码入口据此解析小程序客户端） */
  listClients(appId: string): Promise<R<AppClientDTO[]>> {
    return http.get(`/v1/apps/${appId}/clients`)
  },

  /** 客户端页面启用清单（按 sort 升序，附带页面名称） */
  listClientPages(appId: string, clientId: string): Promise<R<AppClientPageDTO[]>> {
    return http.get(`/v1/apps/${appId}/clients/${clientId}/pages`)
  },

  /** 建发布快照（后端按启用清单固化 published_version，无请求体） */
  createRelease(appId: string, clientId: string): Promise<R<AppReleaseDTO>> {
    return http.post(`/v1/apps/${appId}/clients/${clientId}/releases`)
  },

  /**
   * 触发构建（V1 同步：应答即终态 PUBLISHED/FAILED）。
   * files 为前端出码产物（键 src/ 相对路径）——后端契约是字符串，这里序列化后传。
   */
  buildRelease(
    appId: string,
    clientId: string,
    releaseId: string,
    files: Record<string, string>,
  ): Promise<R<AppReleaseDTO>> {
    return http.post(`/v1/apps/${appId}/clients/${clientId}/releases/${releaseId}/build`, {
      files: JSON.stringify(files),
    })
  },

  /** 上传体验版（miniprogram-ci，凭证取自快照内 Client 配置，前端不携带凭证） */
  uploadRelease(appId: string, clientId: string, releaseId: string): Promise<R<AppReleaseDTO>> {
    return http.post(`/v1/apps/${appId}/clients/${clientId}/releases/${releaseId}/upload`)
  },
}