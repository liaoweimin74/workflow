// ----- Task 2.1: 设计器应用上下文与页面设计类型（源码断言，与 PageDesigner.card-mode.test.ts 同风格） -----
// PageDesigner 组件树重（FcDesigner vendor），接线点用源码断言覆盖；store 行为由 designerStore.test.ts 单测覆盖。
// npx vitest run src/views/page/__tests__/PageDesigner.app-context.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const designerSource = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')
const listSource = readFileSync(resolve(__dirname, '../PageListPage.vue'), 'utf8')

describe('PageDesigner — 应用上下文与设计类型（Task 2.1）', () => {
  it('保存 payload 携带页面归属应用与设计类型（原样回传，创建时定）', () => {
    expect(designerSource).toContain('appId: pageAppId.value')
    expect(designerSource).toContain('designType: pageDesignType.value')
  })

  it('加载页面后同步应用上下文到 designerStore（spec: 创建页面携带应用上下文）', () => {
    expect(designerSource).toContain('setAppContext')
  })

  it('顶部呈现应用下拉与设计类型徽标，设计类型无切换入口', () => {
    // 应用上下文下拉（App 切换，绑 designerStore.currentAppId）
    expect(designerSource).toContain('v-model="currentAppId"')
    // 设计类型徽标：uniapp 页面展示移动端标识
    expect(designerSource).toContain("pageDesignType === 'uniapp'")
  })
})

describe('PageListPage — 创建弹窗设计类型（Task 2.1）', () => {
  it('创建表单提供设计类型选择，默认 web', () => {
    expect(listSource).toContain("field: 'designType'")
    expect(listSource).toContain("value: 'web'")
  })

  it('创建 payload 携带 designType 与应用上下文（默认跟随设计器上下文）', () => {
    expect(listSource).toContain("designType: data.designType || 'web'")
    expect(listSource).toContain('currentAppId')
  })
})
