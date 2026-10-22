/**
 * @lc/runtime library 构建冒烟。
 *
 * 包内实现全部 external，dist 只能剩「指向宿主源码的 re-export」。若哪天有人在包里
 * 直接 import element-plus / @form-create，或把宿主实现打进包，这里会先红。
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = process.cwd()
const PKG_DIR = resolve(ROOT, 'packages/lc-runtime')
const DIST = join(PKG_DIR, 'dist')
const vitePkgPath = createRequire(import.meta.url).resolve('vite/package.json')
const vitePkg = JSON.parse(readFileSync(vitePkgPath, 'utf8'))
const viteBin = resolve(vitePkgPath, '..', vitePkg.bin.vite)

const SUBPATHS = [
  'FormulaField',
  'LookupPicker',
  'dash-chart',
  'dash-filter',
  'dash-kpi',
  'dash-notice',
  'dash-todo',
  'dataPicker',
  'http',
  'lookupFetch',
  'page-chart',
  'page-data-container',
  'page-detail',
  'page-list-cards',
  'page-steps',
  'page-table',
]

describe('@lc/runtime library 构建', () => {
  it(
    '16 个入口全部产出，且 chunk 只有指向宿主源码的 re-export',
    () => {
      execFileSync(process.execPath, [viteBin, 'build', '--logLevel', 'silent'], {
        cwd: PKG_DIR,
        stdio: 'pipe',
        timeout: 120_000,
      })

      const files = readdirSync(DIST).filter((f) => f.endsWith('.js'))
      expect(files.sort()).toEqual(SUBPATHS.map((s) => `${s}.js`).sort())

      for (const file of files) {
        const full = join(DIST, file)
        expect(statSync(full).size).toBeLessThan(1024)
        const text = readFileSync(full, 'utf8')
        const specifiers = [...text.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)].map((m) => m[1])
        expect(specifiers.length, `${file} 没有 import/export`).toBeGreaterThan(0)
        for (const spec of specifiers) {
          // 宿主实现按相对路径 external；任何裸模块（vue/element-plus）都说明边界破了
          expect(spec, `${file} 出现非边界依赖 ${spec}`).toMatch(/^\.\.\/\.\.\/\.\.\/src\//)
        }
        expect(text, `${file} 打进了实现代码`).not.toMatch(/\bfunction\b|=>|\bclass\s/)
      }
    },
    120_000,
  )
})
