#!/usr/bin/env node
/**
 * CLI 预览构建入口（plan Task 8.1–8.3 Files：scripts/build-preview.mjs）。
 *
 * 与 vite 中间件（vite.uni-preview.ts）共用同一套函数（planUniPreviewWrite /
 * writeUniPreviewFiles / runUniBuild / startUniPreviewServer）：
 *   node scripts/build-preview.mjs <pageKey> <schemaJsonPath> [--client <key>] [--no-serve]
 *
 * schema 从 JSON 文件读（语料 fixture 或设计器导出的画布 JSON），
 * generatePageUni 经 programmatic vite `createServer().ssrLoadModule` 加载——
 * 出码链里有 .ts 别名与 import.meta 依赖，直接 node 里 import 解析不了。
 *
 * 中间件服务于「设计器里点一下就构建」；本脚本服务于「CI / 命令行复现同一构建」，
 * 两条通道产物逐字节一致（同一份 plan/write/build 代码）。
 */
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PREVIEW_PORT,
  planUniPreviewWrite,
  writeUniPreviewFiles,
  runUniBuild,
  startUniPreviewServer,
} from '../vite.uni-preview.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '..')

function usage() {
  console.error('用法：node scripts/build-preview.mjs <pageKey> <schemaJsonPath> [--client <key>] [--no-serve]')
  process.exit(2)
}

const args = process.argv.slice(2)
const pageKey = args[0]
const schemaPath = args[1]
if (!pageKey || !schemaPath) usage()

const clientKeyIdx = args.indexOf('--client')
const clientKey = clientKeyIdx >= 0 ? String(args[clientKeyIdx + 1] || 'member') : 'member'
const noServe = args.includes('--no-serve')

const raw = JSON.parse(readFileSync(path.resolve(schemaPath), 'utf8'))
// 画布 JSON 允许两种形态：裸 schema 或设计器导出的 { schema: {...} } 包一层
const schema = raw?.schema && raw.schema.rule ? raw.schema : raw

const vite = await createServer({
  root: frontendRoot,
  logLevel: 'error',
  server: { middlewareMode: true },
  // 浏览器出码与设计器页签同一条链（预览 client：单页清单）
  optimizeDeps: { noDiscovery: true },
})

try {
  const { generatePageUni } = await vite.ssrLoadModule('/src/views/page/codegen/uni/emit-uni.ts')
  const pageName = typeof schema?.option?.pageName === 'string' ? schema.option.pageName : pageKey
  const gen = generatePageUni(schema, {
    pageKey,
    pageName,
    client: { key: clientKey, pages: [{ key: pageKey, title: pageName }] },
  })

  const plan = planUniPreviewWrite({ pageKey, pageName, client: gen.client ?? null, files: gen.files })
  if (!plan.ok) {
    console.error(`[build-preview] 产物计划被拒绝：${plan.error}`)
    process.exit(1)
  }
  writeUniPreviewFiles(frontendRoot, plan.writes)
  console.log(`[build-preview] 已落盘 ${plan.writes.length} 个文件到 uni-shell/src/`)

  console.log('[build-preview] 开始 uni build（h5）…')
  const out = await runUniBuild(frontendRoot)
  const tail = out.trim().split(/\r?\n/).slice(-3).join('\n')
  console.log(`[build-preview] 构建完成${tail ? `：\n${tail}` : ''}`)

  if (!noServe) {
    startUniPreviewServer(frontendRoot, PREVIEW_PORT)
    console.log(`[build-preview] 预览服务：http://localhost:${PREVIEW_PORT}/#/pages/gen/${pageKey}`)
    console.log('[build-preview] Ctrl+C 退出')
    // 保持进程挂着 serve（stdin 消费掉避免某些终端立即退出）
    process.stdin.resume()
  }
} catch (e) {
  console.error(`[build-preview] 失败：${e?.message || e}`)
  process.exit(1)
} finally {
  await vite.close().catch(() => {})
}
