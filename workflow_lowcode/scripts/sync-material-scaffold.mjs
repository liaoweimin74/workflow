#!/usr/bin/env node
/**
 * 物料工程模板同步：material-scaffold/ → backend/src/main/resources/material-scaffold/
 *
 * 物料工程的真源是 material-scaffold/（可本地 pnpm build 验证），后端下载的工程模板
 * 必须与它逐字节一致，否则用户下载到的骨架会和平台契约脱节。
 * 改动 material-scaffold/ 后执行：node scripts/sync-material-scaffold.mjs
 * 清单与后端 MaterialScaffoldService.TEMPLATE_FILES 一一对应，两处需同时增删。
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const srcDir = join(root, 'material-scaffold')
const outDir = join(root, 'backend', 'src', 'main', 'resources', 'material-scaffold')
const serviceFile = join(root, 'backend', 'src', 'main', 'java', 'com', 'workflow',
  'system', 'service', 'MaterialScaffoldService.java')

const FILES = [
  'package.json',
  'pnpm-lock.yaml',
  'vite.config.js',
  'vite.config.widget.js',
  'scripts/gen-manifest.mjs',
  'src/index.js',
  'src/DemoBoard.vue',
  'src/widget.js',
  'src/StatCardWidget.vue',
  'material.json',
  'material-widget.json',
  'types/platform-sdk.d.ts',
  '.gitignore',
  'README.md',
]

// 防漂移：后端清单与本脚本清单必须完全一致
const declared = (await readFile(serviceFile, 'utf8'))
  .match(/RESOURCE_PREFIX \+ "([^"]+)"/g)
  ?.map((s) => s.match(/"([^"]+)"/)[1]) ?? []
const missing = FILES.filter((f) => !declared.includes(f))
const extra = declared.filter((f) => !FILES.includes(f))
if (missing.length || extra.length) {
  console.error(`清单与 MaterialScaffoldService 不一致: 缺 ${missing.join(', ') || '-'} / 多 ${extra.join(', ') || '-'}`)
  process.exit(1)
}

for (const file of FILES) {
  const target = join(outDir, file)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(join(srcDir, file), target)
}
console.log(`已同步 ${FILES.length} 个模板文件 → ${outDir}`)
