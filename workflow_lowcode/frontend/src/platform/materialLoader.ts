import { defineAsyncComponent, type Component } from 'vue'
import http from '@/utils/http'
import type { R } from '@/types/common'

/**
 * 物料运行时加载器（change: remote-materials 一期，design D2/D6/D7）。
 *
 * 流程：按 key 取 manifest/下载地址 → 状态与 SDK 主版本校验 → 原生 import() 加载
 * 单文件 ESM bundle → 默认导出作为 Vue 组件。
 *
 * bundle 里的裸模块名（vue / element-plus / @platform/sdk）由 index.html 的
 * import map 解析到宿主自身的 chunk，因此物料与宿主共用同一 Vue 实例。
 */

export type MaterialLoadReason =
  | 'NOT_FOUND'
  | 'DISABLED'
  | 'SDK_INCOMPATIBLE'
  | 'WIDGET_NOT_PAGE'
  | 'NOT_WIDGET'
  | 'INVALID_MODULE'
  | 'NETWORK'

export class MaterialLoadError extends Error {
  readonly reason: MaterialLoadReason

  constructor(reason: MaterialLoadReason, message: string) {
    super(message)
    this.name = 'MaterialLoadError'
    this.reason = reason
  }
}

export interface MaterialDetail {
  id: number
  materialKey: string
  name: string
  type: string
  version: number
  sdkVersion: string
  status: number
  manifest: Record<string, unknown>
  downloadUrl: string
  hostSdkVersion: string
}

/**
 * SDK 主版本协商：主版本号必须相等，次版本宿主 ≥ 物料要求即可（design D7）。
 */
export function isSdkVersionCompatible(hostVersion: string, requiredVersion: string): boolean {
  const [hostMajor, hostMinor] = String(hostVersion ?? '').split('.')
  const [reqMajor, reqMinor] = String(requiredVersion ?? '').split('.')
  if (!hostMajor || !reqMajor) return false
  if (hostMajor !== reqMajor) return false
  if (!hostMinor || !reqMinor) return true
  return Number(hostMinor) >= Number(reqMinor)
}

type ModuleImporter = (url: string) => Promise<{ default?: unknown }>

const nativeImport: ModuleImporter = (url) => import(/* @vite-ignore */ url)

/** 物料使用方式：整页挂载（菜单 component=material:<key>）或作为组件嵌入页面 schema */
export type MaterialUsage = 'PAGE' | 'WIDGET'

interface CachedMaterial {
  /** 记录加载时的实际类型：缓存命中也要校验，避免页面型包被当作组件复用 */
  type: string
  component: Component
}

/** 已加载物料缓存：同 key 复用同一组件定义，避免重复 import 与重复样式注入。 */
const componentCache = new Map<string, CachedMaterial>()

async function fetchDetail(key: string): Promise<MaterialDetail> {
  // X-Skip-Error-Toast：物料加载失败由 MaterialRenderer 渲染专属错误态，不再叠加全局 toast
  const res: R<MaterialDetail> = await http.get(`/materials/by-key/${key}`, {
    headers: { 'X-Skip-Error-Toast': '1' },
  })
  return res.data
}

function typeMismatch(usage: MaterialUsage, name: string): MaterialLoadError {
  return usage === 'PAGE'
    ? new MaterialLoadError('WIDGET_NOT_PAGE', `物料「${name}」是组件型（WIDGET），不能作为整页挂载`)
    : new MaterialLoadError('NOT_WIDGET', `物料「${name}」是页面型（PAGE），不能作为组件嵌入`)
}

/**
 * 按 key 加载物料组件，校验启用状态、SDK 主版本（design D7）与类型是否匹配使用方式。
 * `importer` 参数仅为可测试性注入点，生产走原生 import()。
 */
async function loadMaterial(
  key: string,
  usage: MaterialUsage,
  importer: ModuleImporter = nativeImport
): Promise<Component> {
  const cached = componentCache.get(key)
  if (cached) {
    if (cached.type !== usage) throw typeMismatch(usage, key)
    return cached.component
  }

  let detail: MaterialDetail
  try {
    detail = await fetchDetail(key)
  } catch (e) {
    // R 约定业务码在 body.code（拦截器透传到 error.code），HTTP 层 404 也一并识别
    const bizCode = (e as { code?: number })?.code
    const httpStatus = (e as { response?: { status?: number } })?.response?.status
    if (bizCode === 404 || httpStatus === 404) {
      throw new MaterialLoadError('NOT_FOUND', `物料不存在：${key}`)
    }
    throw new MaterialLoadError('NETWORK', `物料信息获取失败：${(e as Error)?.message ?? '网络错误'}`)
  }

  if (detail.status !== 1) {
    throw new MaterialLoadError('DISABLED', `物料「${detail.name}」已停用`)
  }
  if (!isSdkVersionCompatible(detail.hostSdkVersion, detail.sdkVersion)) {
    throw new MaterialLoadError(
      'SDK_INCOMPATIBLE',
      `物料要求 SDK ${detail.sdkVersion}，平台为 ${detail.hostSdkVersion}，请用匹配版本的脚手架重新构建`
    )
  }
  if (detail.type !== usage) {
    throw typeMismatch(usage, detail.name)
  }

  const url = new URL(detail.downloadUrl, window.location.origin).href
  let mod: { default?: unknown }
  try {
    mod = await importer(url)
  } catch (e) {
    throw new MaterialLoadError('NETWORK', `物料 bundle 加载失败：${(e as Error)?.message ?? url}`)
  }

  const exported = mod?.default
  if (!exported || (typeof exported !== 'object' && typeof exported !== 'function')) {
    throw new MaterialLoadError('INVALID_MODULE', `物料 bundle 未默认导出 Vue 组件：${key}`)
  }

  // 物料组件本身是外部模块产物，交给 async wrapper 统一承载加载期错误（import 失败可重试）
  const component = defineAsyncComponent(() => Promise.resolve(exported as Component))
  componentCache.set(key, { type: detail.type, component })
  return component
}

/** 加载页面型物料组件（整页挂载，design D6）。 */
export function loadMaterialComponent(
  key: string,
  importer: ModuleImporter = nativeImport
): Promise<Component> {
  return loadMaterial(key, 'PAGE', importer)
}

/** 加载组件型物料（二期 5.1：注册进 form-create 渲染与设计器画布，同一注册通道）。 */
export function loadWidgetComponent(
  key: string,
  importer: ModuleImporter = nativeImport
): Promise<Component> {
  return loadMaterial(key, 'WIDGET', importer)
}

/** 测试/热更新用：清空物料组件缓存。 */
export function clearMaterialCache(key?: string) {
  if (key) componentCache.delete(key)
  else componentCache.clear()
}
