/**
 * 出码按钮的执行体：一份定义 → generatePage → 交给 dev 中间件落盘 → 给出产物全屏路由。
 *
 * 只被 dev-only 的入口用到（设计器工具栏的「出码」按钮、验证台的「落盘产物」按钮），
 * 生产包里中间件不存在，这条链发出去就是 404/405，由下面的 written 校验如实报错。
 *
 * `exportedAt` 只进 manifest、不进 files（阶段 5 的口径），所以浏览器生成的内容与
 * 磁盘上那份可以逐字节比，落盘前后不必担心时间戳把产物刷成"不一致"。
 */

import { generatePage } from './generate'
import type { GenerateReport, GenerateResult } from './ir'

/** 与 dev 中间件 `vite.codegen-probe-writer.ts` 的挂载路径必须一致，有用例钉着 */
export const PROBE_WRITE_URL = '/__lc-codegen/probe'

export interface CodegenRunInput {
  pageKey: string
  pageName: string
  schema: { rule: any[]; option: any; dataSources: any[]; actions: any[] }
}

export interface CodegenRunOutput {
  files: Record<string, string>
  report: GenerateReport
  written: string[]
  probeHref: string
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

/** 产物全屏路由：/codegen-probe/<页名>，CodegenProbeShell 按归一化页名挑文件 */
export function probeHrefOf(pageKey: string): string {
  return `${base}/codegen-probe/${pageKey}`
}

/** 把 generatePage 的 files 原样写进 codegen/probe/，回落盘的文件名清单 */
export async function writeProbeFiles(pageKey: string, files: Record<string, string>): Promise<string[]> {
  const res = await fetch(PROBE_WRITE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pageKey, files }),
  })
  if (!res.ok) {
    let detail = ''
    try {
      detail = String((await res.json())?.error || '')
    } catch {
      // 非 JSON 响应（比如打到了没装中间件的服务）：按状态码说话
    }
    throw new Error(`出码落盘失败（HTTP ${res.status}）${detail ? '：' + detail : ''}`)
  }
  let data: any
  try {
    data = await res.json()
  } catch {
    throw new Error('出码落盘失败：响应不是 JSON，这个 dev server 没装出码中间件（written 清单无从核对）')
  }
  if (!Array.isArray(data?.written)) {
    throw new Error('出码落盘失败：响应里没有 written 清单，无法确认产物真写进了 codegen/probe/')
  }
  return data.written as string[]
}

/** 一步到位：生成 + 落盘。生成阶段炸了就不发请求，免得把半成品写进磁盘 */
export async function runCodegenAndWrite(input: CodegenRunInput): Promise<CodegenRunOutput> {
  const pageKey = String(input.pageKey || '').trim()
  if (!pageKey) throw new Error('页面标识为空，无法出码')

  const gen: GenerateResult = generatePage(input.schema, {
    pageKey,
    pageName: input.pageName || pageKey,
    exportedAt: `ui@${new Date().toISOString()}`,
  })
  const written = await writeProbeFiles(pageKey, gen.files)
  return { files: gen.files, report: gen.report, written, probeHref: probeHrefOf(pageKey) }
}
