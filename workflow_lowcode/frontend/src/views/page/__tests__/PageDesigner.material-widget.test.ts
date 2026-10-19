// ----- PageDesigner 组件物料接线（remote-materials 二期 5.2/5.4）-----
// 接线点很难单测（PageDesigner 依赖整棵设计器），按本仓惯例做源码断言：
// 只钉住两条最容易写错的顺序与传参——注册必须先于 setRule、registry 用 FcDesigner 静态面。
// npx vitest run src/views/page/__tests__/PageDesigner.material-widget.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

describe('PageDesigner 组件物料接线', () => {
  it('画布组件注册先于 setRule，否则已保存的 material:<key> 节点渲染为空壳', () => {
    expect(source).toContain("import { registerMaterialWidgetsToDesigner } from '@/platform/designerMaterialWidgets'")
    expect(source).toContain('await registerMaterialWidgets(parsedRule)')

    const registerAt = source.indexOf('await registerMaterialWidgets(parsedRule)')
    const setRuleAt = source.indexOf('designerRef.value.setRule(')
    expect(registerAt).toBeGreaterThan(-1)
    expect(setRuleAt).toBeGreaterThan(registerAt)
  })

  it('注册走 FcDesigner 静态面并传入设计器实例与当前 schema rule', () => {
    expect(source).toContain('import { listEnabledWidgets }')
    expect(source).toContain('designer: designerRef.value')
    expect(source).toContain('registry: FcDesigner')
    expect(source).toContain('schemaRules,')
  })

  it('物料接口或单个物料失败都静默降级，不影响平台组件设计', () => {
    const fnStart = source.indexOf('async function registerMaterialWidgets')
    const fnBody = source.slice(fnStart, source.indexOf('\n}', fnStart))
    expect(fnStart).toBeGreaterThan(-1)
    expect(fnBody).toContain('try {')
    expect(fnBody).toContain('catch {')
    expect(fnBody).not.toContain('ElMessage')
  })
})
