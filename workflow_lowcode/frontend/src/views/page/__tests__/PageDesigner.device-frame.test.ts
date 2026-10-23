// ----- Task 2.2: 设计器画布设备框与 uniapp 契约渲染接线（源码断言） -----
// npx vitest run src/views/page/__tests__/PageDesigner.device-frame.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const designerSource = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

describe('PageDesigner — 设备框与按类型渲染（Task 2.2）', () => {
  it('画布容器按页面设计类型包设备框（web=桌面宽，uniapp=375×667 手机壳）', () => {
    expect(designerSource).toContain('<DeviceFrame')
    expect(designerSource).toContain(':design-type="pageDesignType"')
  })

  it('designType=uniapp 时按 component-map 注册 @lc/ui-mobile 契约组件到画布', () => {
    expect(designerSource).toContain('resolveComponent')
    expect(designerSource).toContain("registerUniAppCanvasComponents")
  })

  it('uniapp 画布皮肤挂 --ds-* 令牌（theme.ts 克隆的 uni-ui token）', () => {
    expect(designerSource).toContain('UNI_CSS_VARS')
    expect(designerSource).toContain('lc-canvas--uniapp')
  })
})
