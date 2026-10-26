// ----- A5 PageDesigner 发布目标端接线（源码锚定） -----
// npx vitest run src/views/page/__tests__/PageDesigner.publishClients.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('PageDesigner A5 发布目标端接线', () => {
  const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

  it('发布走 PagePublishDialog 对话框，确认结果携带 clientIds 下发', () => {
    expect(source).toContain("import PagePublishDialog from './components/PagePublishDialog.vue'")
    expect(source).toContain('<PagePublishDialog')
    expect(source).toContain('publishPage(pageId.value, clientIds)')
  })

  it('MessageBox 一键发布下线：发布必经目标端选择', () => {
    expect(source).not.toContain('确定要发布此页面吗')
    expect(source).not.toContain('确定要重新发布此页面吗')
  })
})
