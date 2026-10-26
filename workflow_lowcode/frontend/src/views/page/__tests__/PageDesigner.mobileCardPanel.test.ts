// ----- 批C C1b PageDesigner 移动卡片配置面板接线（源码锚定） -----
// npx vitest run src/views/page/__tests__/PageDesigner.mobileCardPanel.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('PageDesigner 移动卡片配置面板接线', () => {
  const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

  it('schema 顶层持有 channelProfiles：加载回填 + 序列化落盘', () => {
    expect(source).toContain('channelProfiles: schema.channelProfiles')
    expect(source).toContain('schema.channelProfiles = parsed.channelProfiles || {}')
  })

  it('保存复用 canvasSchema 单点序列化（channelProfiles 不再有两处漂移）', () => {
    expect(source).toContain('schema: currentSchemaJson()')
  })

  it('卡片类块（page-table/page-list-cards）属性面板注入「移动卡片」按钮', () => {
    expect(source).toContain('const mobileCardButton = ()')
    expect(source).toContain('...mobileCardButton()')
    expect(source).toContain('setComponentRuleConfig(\'page-table\', () => [...dataSourceProps(), ...mobileCardButton()]')
    expect(source).toContain('openMobileCardConfig()')
  })

  it('对话框挂载：初值=当前块列配置与 H5 覆盖，确认写回渠道键', () => {
    expect(source).toContain('<MobileCardProfileDialog')
    expect(source).toContain(':columns="mobileCardColumns"')
    expect(source).toContain(':override="mobileCardOverride"')
    expect(source).toContain("writeChannelCardProfile(schema.channelProfiles, 'H5'")
  })
})
