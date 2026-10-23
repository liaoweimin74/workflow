// ----- Task 2.2: @lc/ui-mobile 契约渲染包测试 -----
// 覆盖：按 component-map uniapp 侧清单导出全部契约组件；theme.ts 锁定 uni-ui 版本并
// 克隆主题 token（--ds-* 令牌单一来源）；包独立编译（对位 P2 runtime-package-build Gate）。
// npx vitest run src/views/page/codegen/__tests__/ui-mobile-package.test.ts

import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import * as uiMobile from '../../../../../packages/ui-mobile/src/index'
import {
  UNI_UI_VERSION,
  UNI_THEME_TOKENS,
  UNI_CSS_VARS,
} from '../../../../../packages/ui-mobile/src/theme'
import { UNIAPP_COMPONENT_MAP } from '../component-map'

const ROOT = process.cwd()
const PKG_DIR = resolve(ROOT, 'packages/ui-mobile')
const DIST = join(PKG_DIR, 'dist')
const vitePkgPath = createRequire(import.meta.url).resolve('vite/package.json')
const vitePkg = JSON.parse(readFileSync(vitePkgPath, 'utf8'))
const viteBin = resolve(vitePkgPath, '..', vitePkg.bin.vite)

describe('@lc/ui-mobile — 契约组件清单', () => {
  it('component-map uniapp 侧每个映射的渲染组件都由包导出（props/事件/插槽契约对齐 uni-ui）', () => {
    const types = Object.keys(UNIAPP_COMPONENT_MAP)
    expect(types.length).toBeGreaterThanOrEqual(15)
    for (const [type, mapping] of Object.entries(UNIAPP_COMPONENT_MAP)) {
      const comp = (uiMobile as Record<string, unknown>)[mapping.render]
      expect(comp, `component-map[${type}].render=${mapping.render} 应由 @lc/ui-mobile 导出`).toBeDefined()
    }
  })

  it('每个映射携带 uni-ui 目标标签（emit 产物中的标签）', () => {
    for (const mapping of Object.values(UNIAPP_COMPONENT_MAP)) {
      expect(mapping.tag).toMatch(/^uni-[a-z-]+$|^view$|^editor$/)
    }
  })
})

describe('@lc/ui-mobile — theme 令牌与版本锁定', () => {
  it('锁定 uni-ui 版本（semver；皮肤克隆的漂移防线）', () => {
    expect(UNI_UI_VERSION).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('克隆 uni-ui 官方主题 token 并派生 --ds-* CSS 变量', () => {
    expect(UNI_THEME_TOKENS.primary).toBe('#007aff')
    expect(UNI_CSS_VARS['--ds-primary']).toBe('#007aff')
    expect(UNI_CSS_VARS['--ds-success']).toBeDefined()
    expect(UNI_CSS_VARS['--ds-warning']).toBeDefined()
    expect(UNI_CSS_VARS['--ds-error']).toBeDefined()
  })
})

describe('@lc/ui-mobile — 独立编译 Gate', () => {
  it('library 构建产出 index/theme 入口，element-plus 保持 external 不被内联', () => {
    execFileSync(process.execPath, [viteBin, 'build', '--logLevel', 'silent'], {
      cwd: PKG_DIR,
      stdio: 'pipe',
      timeout: 120_000,
    })

    const files = readdirSync(DIST).filter((f) => f.endsWith('.js'))
    expect(files).toContain('index.js')
    expect(files).toContain('theme.js')
    // 契约组件以外部 element-plus 内核实现：任一产物文件里 element-plus 都是 import 来源
    //（external），而非被复制进包的源码
    const all = files.map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n')
    expect(all).toMatch(/from\s+"element-plus"/)
    const index = readFileSync(join(DIST, 'index.js'), 'utf8')
    expect(index).toMatch(/LcInput/)
  })
})
