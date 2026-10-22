/**
 * @lc/runtime 包边界（P2 阶段 3）。
 *
 * 产物只能认包名：生成器写出的每个 `@lc/runtime/*` 都必须是包 exports 里的子路径，
 * 且产物自身不出现宿主别名（@/…）。包内实现以相对路径指回现网组件 —— 宿主与产物
 * 共用同一份实现，而不是复制一份。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import DashChart from '@lc/runtime/dash-chart'
import PageTable from '@lc/runtime/page-table'
import HostDashChart from '@/views/dashboard/components/DashChart.vue'
import HostPageTable from '@/views/page/components/PageDataTable.vue'

import { generatePage } from '../generate'

const ROOT = process.cwd()
const PKG_DIR = resolve(ROOT, 'packages/lc-runtime')

/** 与阶段 3 前的 16 个 shim 一一对应；产物与测试都按这些子路径寻址 */
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

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'))

describe('@lc/runtime 包的子路径导出', () => {
  it('package.json 以 @lc/runtime 为名，16 个子路径全部指向真实文件', () => {
    const pkg = readJson(join(PKG_DIR, 'package.json'))
    expect(pkg.name).toBe('@lc/runtime')
    expect(pkg.private).toBe(true)
    for (const sub of SUBPATHS) {
      const target = pkg.exports?.[`./${sub}`]
      expect(target, `缺少 exports["./${sub}"]`).toBeTruthy()
      const file = typeof target === 'string' ? target : target?.default
      expect(existsSync(resolve(PKG_DIR, file)), `./${sub} 指向的文件不存在：${file}`).toBe(true)
    }
  })

  it('包内模块用相对路径指回现网实现，不再依赖宿主 @/ 别名', () => {
    const pkg = readJson(join(PKG_DIR, 'package.json'))
    for (const sub of SUBPATHS) {
      const target = pkg.exports[`./${sub}`]
      const file = typeof target === 'string' ? target : target.default
      const source = readFileSync(resolve(PKG_DIR, file), 'utf8')
      expect(source, `./${sub} 仍引用宿主别名`).not.toContain("from '@/")
      expect(source, `./${sub} 没有指回现网实现`).toContain("from '../../../src/")
    }
  })

  it('旧的 src/lc-runtime shim 目录已删除', () => {
    expect(existsSync(resolve(ROOT, 'src/lc-runtime'))).toBe(false)
  })

  it('宿主以 file: 依赖声明同一个包', () => {
    const pkg = readJson(resolve(ROOT, 'package.json'))
    expect(pkg.dependencies?.['@lc/runtime']).toBe('file:packages/lc-runtime')
  })

  it('vite / vitest / tsconfig 三处 @lc/runtime alias 均已移除', () => {
    expect(readFileSync(resolve(ROOT, 'vite.config.ts'), 'utf8')).not.toContain("'@lc/runtime':")
    expect(readFileSync(resolve(ROOT, 'vitest.config.ts'), 'utf8')).not.toContain("'@lc/runtime':")
    expect(readFileSync(resolve(ROOT, 'tsconfig.json'), 'utf8')).not.toContain('"@lc/runtime/*"')
  })
  it('宿主与产物拿到的是同一个组件实现，不是两份复制', () => {
    expect(PageTable).toBe(HostPageTable)
    expect(DashChart).toBe(HostDashChart)
  })
  it('产物工程位置无需任何 alias 也能解析全部子路径', () => {
    // 模拟产物工程里的文件：解析只走 node_modules + package exports，不经过宿主配置
    const artifactRequire = createRequire(resolve(ROOT, 'packages/artifact-smoke/Entry.vue'))
    for (const sub of SUBPATHS) {
      const file = artifactRequire.resolve(`@lc/runtime/${sub}`).replace(/\\/g, '/')
      expect(file, `./${sub} 没解析到包内`).toContain('/packages/lc-runtime/src/')
    }
  })
})

describe('产物只依赖包名', () => {
  it('语料生成的 @lc/runtime/* 全部落在包 exports 内，且产物不出现宿主别名', () => {
    const pkg = readJson(join(PKG_DIR, 'package.json'))
    const corpusDir = resolve(ROOT, 'src/views/page/codegen/__tests__/fixtures/corpus')
    const used = new Set<string>()
    for (const name of readdirSync(corpusDir).filter((n) => n.endsWith('.json'))) {
      const schema = readJson(join(corpusDir, name))
      const key = name.replace(/\.json$/, '')
      const res = generatePage(schema, { pageKey: key, pageName: key, exportedAt: 'runtime-package' })
      for (const text of Object.values(res.files)) {
        for (const m of text.matchAll(/['"]@lc\/runtime\/([^'"]+)['"]/g)) used.add(m[1])
        expect(text, `${key} 的产物仍引用宿主别名`).not.toMatch(/from\s+['"]@\//)
      }
    }
    expect(used.size).toBeGreaterThan(0)
    for (const sub of used) expect(pkg.exports?.[`./${sub}`], `产物引用了未导出的 ./${sub}`).toBeTruthy()
  })
})

describe('library 构建边界', () => {
  it('vue / element-plus / @form-create/* 在包构建里保持 external', () => {
    const config = readFileSync(join(PKG_DIR, 'vite.config.ts'), 'utf8')
    expect(config).toContain("'vue'")
    expect(config).toContain("'element-plus'")
    expect(config).toContain('@form-create/')
  })
})
