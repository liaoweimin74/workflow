// ----- Task 2.2: 设计器画布设备形态与按类型渲染（源码断言） -----
// 布局修正（2026-10 演示反馈）：工具栏/属性栏必须在画布之外，uniapp 只收窄画布列。
// 实现口径：vendor（@form-create/designer 3.5.0）原生 device 模式——
//   config.device 初始值（FcDesigner.vue line 624）+ ._fc-m-drag.mobile { width } 收窄画布列，
//   三栏（._fc-l 组件面板 | ._fc-m 画布 | ._fc-r 属性面板）天然在画布之外。
// DeviceFrame 整壳包裹方案废弃：它把三栏全部裹进 375px 壳，违背上述口径，已删除。
// npx vitest run src/views/page/__tests__/PageDesigner.device-frame.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const designerSource = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

describe('PageDesigner — 画布设备形态与按类型渲染（Task 2.2 布局修正）', () => {
  it('废弃 DeviceFrame 整壳包裹：三栏（组件面板/画布/属性面板）不允许被壳包住', () => {
    expect(designerSource).not.toContain('<DeviceFrame')
    expect(designerSource).not.toContain('components/DeviceFrame.vue')
  })

  it('设计器配置锁定设备切换：页面类型由 designType 单一来源决定，画布内不可再切', () => {
    // vendor 事实：_fc-m-tools 的 pc/pad/mobile 切换按钮 v-if="getConfig('showDevice') !== false"
    expect(designerSource).toContain('showDevice: false')
  })

  it('uniapp 页面画布走 vendor device=mobile：仅画布列收窄，面板不动', () => {
    // device 是 vendor setup 一次性读 config 的初始值，而 designType 在 loadDef 异步后
    // 才就绪，故接线走 vendor methods.setDevice（ref 可达，同 addComponent 通道）
    expect(designerSource).toContain('.setDevice(')
    expect(designerSource).toContain("=== 'uniapp' ? 'mobile' : 'pc'")
  })

  it('uniapp 画布列锁定 375 手机宽（vendor 默认 400px，与 375 壳口径不一致）', () => {
    expect(designerSource).toContain('._fc-m-drag.mobile')
    expect(designerSource).toMatch(/\._fc-m-drag\.mobile[^}]*width:\s*375px/s)
  })

  it('uniapp 画布皮肤挂 --ds-* 令牌（theme.ts 克隆的 uni-ui token）', () => {
    expect(designerSource).toContain('UNI_CSS_VARS')
    expect(designerSource).toContain('lc-canvas--uniapp')
  })

  it('designType=uniapp 时按 component-map 注册 @lc/ui-mobile 契约组件到画布', () => {
    expect(designerSource).toContain('resolveComponent')
    expect(designerSource).toContain('registerUniAppCanvasComponents')
  })
})
