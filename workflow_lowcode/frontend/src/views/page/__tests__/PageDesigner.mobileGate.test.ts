// ----- 批C C3 发布拦截两宿主接线（源码锚定） -----
// npx vitest run src/views/page/__tests__/PageDesigner.mobileGate.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('C3 发布拦截两宿主接线（rule 下传 PagePublishDialog）', () => {
  const designer = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')
  const list = readFileSync(resolve(__dirname, '../PageListPage.vue'), 'utf8')
  const dialog = readFileSync(resolve(__dirname, '../components/PagePublishDialog.vue'), 'utf8')

  it('设计器：发布对话框吃画布当前 rule（未保存改动也在拦截面内）', () => {
    expect(designer).toContain(':rule="designerRule"')
  })

  it('列表页：发布点击拉定义回填 rule，失败退化为不拦截', () => {
    expect(list).toContain('const publishTargetRule = ref<unknown[] | undefined>(undefined)')
    expect(list).toContain('pageApi.getPage(row.id)')
    expect(list).toContain(':rule="publishTargetRule"')
  })

  it('对话框：两级清单消费 gate，块级阻断字段级提示', () => {
    expect(dialog).toContain('collectMobilePublishIssues')
    expect(dialog).toContain('hasMobileChannel')
    expect(dialog).toContain('publish-mobile-gate')
    // 块级=阻断分支必须先于 emit confirm（拦截不可绕）
    const blockGuard = dialog.indexOf('mobileIssues.value.blocks.length > 0')
    const emitConfirm = dialog.indexOf("emit('confirm'")
    expect(blockGuard).toBeGreaterThan(-1)
    expect(blockGuard).toBeLessThan(emitConfirm)
  })
})
