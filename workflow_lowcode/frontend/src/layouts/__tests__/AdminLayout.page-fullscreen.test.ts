import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 页签页面全屏回归防护（Task 122：用户需求「每个菜单对应的页签页面都可以全屏显示」）。
 *
 * 语义澄清：不是仪表盘组件级全屏（Task 120 已做），而是布局级——
 * 页签栏右侧提供全屏开关，作用于当前页签的内容舞台（page-stage），
 * 隐藏顶栏/侧边菜单/页签栏，原生 Fullscreen API 优先 + CSS fixed 回退。
 */

const layout = readFileSync(resolve(__dirname, '../AdminLayout.vue'), 'utf8')
const composablePath = resolve(__dirname, '../../composables/useFullscreen.ts')

describe('AdminLayout 页签页面全屏（Task 122）', () => {
  it('复用平台级共享 composable（不再依赖 dashboard 私有副本）', () => {
    expect(layout).toContain("import { useFullscreen } from '@/composables/useFullscreen'")
    // dashboard 私有副本已删除，全部组件迁移到共享实现
    expect(
      existsSync(resolve(__dirname, '../../views/dashboard/components/useFullscreen.ts')),
      'dashboard 私有 useFullscreen.ts 应已删除（统一走 @/composables/useFullscreen）',
    ).toBe(false)
  })

  it('内容舞台挂载 pageStageRef，并按回退态切换 fixed 覆盖层类', () => {
    // 舞台包住 router-view（keep-alive 页签页），是全屏的作用目标
    expect(layout).toContain('ref="pageStageRef"')
    expect(layout).toContain('class="page-stage relative flex-1 flex flex-col min-h-0"')
    expect(layout).toContain(
      ":class=\"{ 'is-fallback-fullscreen': pageFullscreen && pageFullscreenFallback }\"",
    )
    // router-view 必须在舞台之内（先见舞台 div，后见 </router-view>）
    const stageIdx = layout.indexOf('ref="pageStageRef"')
    const viewIdx = layout.indexOf('</router-view>')
    expect(stageIdx).toBeGreaterThan(-1)
    expect(viewIdx).toBeGreaterThan(stageIdx)
  })

  it('页签栏右侧有全屏开关（动态标题 + FullScreen 图标 + 激活色）', () => {
    expect(layout).toContain('@click="togglePageFullscreen"')
    expect(layout).toContain(":title=\"pageFullscreen ? '退出全屏（Esc）' : '页面全屏显示'\"")
    expect(layout).toContain('<FullScreen />')
    // 开关不随页签横向滚动而不可见（固定在滚动区之外）
    expect(layout).toContain('class="flex-1 min-w-0 flex items-center overflow-x-auto"')
  })

  it('全屏态有常驻浮动退出按钮（原生/回退两态通用）', () => {
    expect(layout).toContain('v-if="pageFullscreen"')
    expect(layout).toContain('退出全屏（Esc）')
  })

  it('全屏态按主题补底色（布局根透明，脱离文档流后否则白屏）', () => {
    // 原生 :fullscreen 与 CSS 回退两态都要有背景
    expect(layout).toContain('.page-stage:fullscreen')
    expect(layout).toContain('.page-stage.is-fallback-fullscreen')
    // 四种主题组合（verdant/classic × 亮/暗）底色齐全
    expect(layout).toContain('linear-gradient(180deg, #f7f8f6 0%, #f1f3f0 100%)')
    expect(layout).toContain('linear-gradient(180deg, #141917 0%, #111513 100%)')
    expect(layout).toContain('linear-gradient(#f4f6fe, #eef1fc)')
    expect(layout).toContain('background: #12162b')
    // 回退覆盖层定位
    expect(layout).toMatch(/\.page-stage\.is-fallback-fullscreen\s*\{[^}]*position:\s*fixed/)
  })
})
