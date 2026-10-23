// ----- Task 3.4: px→rpx 换算与样式基线 -----
// 口径（plan Task 3.4 / tasks.md 3.4）：数值按 750/designWidth（375 基准 → ×2）
// 换算出 rpx；0 出无单位零；字符串视为设计者显式给定的带单位值，原样透传不改写；
// 产物样式产出统一走 PROFILES.uniapp.styleRules（单一事实源）。
// npx vitest run src/views/page/codegen/__tests__/uni/style.test.ts

import { describe, expect, it } from 'vitest'

import { PROFILES } from '../../target-profile'

const { toRpx } = PROFILES.uniapp.styleRules

describe('toRpx — px→rpx 换算（Task 3.4，375 画布基准）', () => {
  it('数值按 750/375（×2）出 rpx', () => {
    expect(toRpx(16)).toBe('32rpx')
    expect(toRpx(24)).toBe('48rpx')
    expect(toRpx(0.5)).toBe('1rpx')
  })

  it('0 → 无单位零', () => {
    expect(toRpx(0)).toBe('0')
  })

  it('字符串带单位原样（设计者显式值不改写）', () => {
    expect(toRpx('12px')).toBe('12px')
    expect(toRpx('50%')).toBe('50%')
    expect(toRpx('auto')).toBe('auto')
  })

  it('styleRules 基线：uniapp designWidth 375 且带 toRpx；web 画像无 toRpx（web 出 px）', () => {
    expect(PROFILES.uniapp.styleRules.designWidth).toBe(375)
    expect(PROFILES.uniapp.styleRules.toRpx).toBeTypeOf('function')
    expect(PROFILES.web.styleRules.toRpx).toBeUndefined()
  })
})
