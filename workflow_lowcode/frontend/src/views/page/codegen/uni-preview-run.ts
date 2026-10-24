/**
 * 「产物预览」的客户端执行体：一份定义 → generatePageUni → POST 给 dev 中间件 →
 * 落盘 uni-shell/src/ + uni build（H5）→ 返回版本令牌与预览 URL（Task 8.1）。
 *
 * 与 codegen-run.ts（web 出码按钮）同构：只被 dev-only 的入口用到
 * （设计器预览弹窗的「产物预览」页签），生产包里中间件不存在，这条链发出去就是 404/405，
 * 由下面的响应校验如实报错。
 *
 * 预览用简化 client（设计 LOCK）：单页清单足够让 pages.json/manifest.json 成形；
 * 完整多页清单与 Client API 属 Task 9.x，接入时换 client 来源即可，通道不变。
 */
import { generatePageUni } from './uni/emit-uni'
import type { UniClientConfig } from './uni/project-files'
import type { GenerateReport } from './ir'

/** 与 dev 中间件 `vite.uni-preview.ts` 的挂载路径必须一致，有用例钉着 */
export const PREVIEW_BUILD_PATH = '/__lc-codegen/uni-preview'

export interface UniPreviewRunInput {
  pageKey: string
  pageName: string
  schema: { rule: any[]; option: any; dataSources: any[]; actions: any[] }
}

export interface UniPreviewRunOutput {
  /** 产物文件名清单（generatePageUni 的 files 键） */
  files: Record<string, string>
  report: GenerateReport
  /** 版本令牌：随本次构建递增，iframe 用它强制重挂 */
  version: number
  builtAt: string
  /** 产物 H5 页面地址：同源相对路径 /__lc-codegen/uni-static/#/pages/gen/<key>?v=<version>
   * （iframe 与宿主同源 → 宿主的 /api 代理与登录态可用，产物取到活数据） */
  previewUrl: string
}

/** 预览形态的简化 client：单页清单（页面即清单首项，title 用页名） */
function previewClientOf(pageKey: string, pageName: string): UniClientConfig {
  return { key: 'member', pages: [{ key: pageKey, title: pageName || pageKey }] }
}

/** 一步到位：生成 + 构建通道。生成阶段炸了就不发请求，免得把半成品写进磁盘 */
export async function runUniArtifactPreview(input: UniPreviewRunInput): Promise<UniPreviewRunOutput> {
  const pageKey = String(input.pageKey || '').trim()
  if (!pageKey) throw new Error('页面标识为空，无法构建产物预览')

  const gen = generatePageUni(input.schema, {
    pageKey,
    pageName: input.pageName || pageKey,
    client: previewClientOf(pageKey, input.pageName || pageKey),
  })

  const res = await fetch(PREVIEW_BUILD_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      pageKey,
      pageName: input.pageName || pageKey,
      client: previewClientOf(pageKey, input.pageName || pageKey),
      files: gen.files,
    }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = String((await res.json())?.error || '')
    } catch {
      // 非 JSON 响应（比如打到了没装中间件的服务）：按状态码说话
    }
    throw new Error(`产物构建失败（HTTP ${res.status}）${detail ? '：' + detail : ''}`)
  }
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error('产物构建失败：响应不是 JSON，这个 dev server 没装 uni 预览中间件')
  }
  if (!data?.ok || typeof data?.version !== 'number' || !data?.previewUrl) {
    throw new Error('产物构建失败：响应里没有 version/previewUrl，无法确认产物真的构建过了')
  }
  return {
    files: gen.files,
    report: gen.report,
    version: data.version,
    builtAt: String(data.builtAt || ''),
    previewUrl: String(data.previewUrl),
  }
}
