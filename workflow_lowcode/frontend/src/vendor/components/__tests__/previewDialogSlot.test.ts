// ----- TDD: vendor FcDesigner 预览弹窗的页签扩展点 -----
// npx vitest run src/vendor/components/__tests__/previewDialogSlot.test.ts
//
// 出码页签住在宿主应用（PageDesigner），弹窗住在 vendor，两边靠一个具名插槽接上。
// 插槽在、页签内容区不再无条件渲染，是这个接线唯一不能被静默改坏的两件事——
// 升级 @form-create 或有人重排这段模板时，这里先炸。

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SOURCE = readFileSync(resolve(__dirname, '../FcDesigner.vue'), 'utf8')

/** 取预览弹窗那一段（从 el-dialog 起，到它的闭合止） */
function previewDialog(source: string): string {
  const start = source.indexOf('<el-dialog v-model="preview.state"')
  expect(start, '预览弹窗结构变了，找不到起点').toBeGreaterThanOrEqual(0)
  const end = source.indexOf('</el-dialog>', start)
  return source.slice(start, end)
}

describe('FcDesigner 预览弹窗页签扩展点', () => {
  const dialog = previewDialog(SOURCE)

  it('el-tabs 内提供 previewTabs 插槽，排在三个内置页签之后', () => {
    const tabs = dialog.slice(dialog.indexOf('<el-tabs'), dialog.indexOf('</el-tabs>'))
    expect(tabs).toContain('name="previewTabs"')
    // 扩展页签排在 html 之后：内置三页签的顺序是产品口径，不许被外来页签插到中间
    expect(tabs.indexOf("name=\"html\"")).toBeLessThan(tabs.indexOf('name="previewTabs"'))
  })

  it('插槽带出当前页签名，宿主才知道自己那张页签被点亮了（出码要在点亮时才跑）', () => {
    expect(dialog).toMatch(/name="previewTabs"[^>]*:status="previewStatus"/)
  })

  it('代码区按页签名逐个判定，html 不许再用裸 v-else', () => {
    // 裸 v-else 会把「出码」页签也当成 html 模式：切过去同时渲染出一大段 form-create 模板，
    // 人以为那就是出码产物。
    expect(dialog).toContain('v-else-if="previewStatus === \'html\'"')
    expect(dialog).not.toMatch(/<pre[^>]*\sv-else\s/)
  })

  it('弹窗关闭仍把页签复位到 form：否则下次打开停在出码页签上读旧源码', () => {
    expect(SOURCE).toMatch(/data\.previewStatus = 'form'/)
  })
})
