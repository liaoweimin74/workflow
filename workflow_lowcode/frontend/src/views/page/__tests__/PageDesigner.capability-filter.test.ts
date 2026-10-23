// ----- Task 2.3: 面板能力过滤（CSS 置灰方案，源码断言，与 PageDesigner.app-context.test.ts 同风格）-----
// vendor 事实（@form-create/designer 3.5.0，package.json 版本锁定）：
//   DragRule 无 disabled 字段（types/index.d.ts L264-328），面板项渲染为
//   ._fc-l-item + element.icon 图标类（src/components/FcDesigner.vue L75-90），
//   vendor 原生只有 hiddenItem（隐藏，非置灰）。故选定 CSS 叠层方案：
//   以 icon 类 hook 置灰 + pointer-events:none 阻断拖拽/点击添加 + ::after 提示
//   「仅 Web 端可设计」（spec 场景原文）。
// icon 占用约定：page-tree/page-tree-table 共用 icon-tree（两者均为 web-only，
//   合并选择器无误伤）；page-iframe 用 icon-application；vendor 内置组件不占用这两类。
// CSS 失效兜底：Task 2.4 出码报告按 target-profile.supports 显式分桶，不存在静默丢弃。
// npx vitest run src/views/page/__tests__/PageDesigner.capability-filter.test.ts

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const designerSource = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')

describe('PageDesigner — 面板能力过滤（Task 2.3）', () => {
  it('uniapp 画布容器下按 icon hook 置灰 Web 专属面板项并阻断拖拽/点击添加', () => {
    expect(designerSource).toContain('.lc-canvas--uniapp :deep(._fc-l-item:has(.icon-tree))')
    expect(designerSource).toContain('.lc-canvas--uniapp :deep(._fc-l-item:has(.icon-application))')
    expect(designerSource).toContain('pointer-events: none')
  })

  it('置灰项提示原因「仅 Web 端可设计」（spec 场景原文）', () => {
    expect(designerSource).toContain('仅 Web 端可设计')
  })

  it('按页面类型过滤：置灰容器类仅挂在 uniapp 页面（web 页面设计器不受影响）', () => {
    expect(designerSource).toContain("pageDesignType === 'uniapp' ? 'lc-canvas--uniapp' : ''")
  })

  it('注册时机：面板注册在页面类型确定之后（修 Task 2.2 race——原在 onMounted 顶部调用，uniapp 判定必为初始值）', () => {
    expect(designerSource).toMatch(/pageDesignType\.value = def\.designType[^]*?registerPageComponents\(\)/)
    expect(designerSource).toMatch(/registerPageComponents\(\)[^]*?registerUniAppCanvasComponents\(\)/)
  })

  it('契约组件注册 await 完成后再 setRule（画布节点解析到契约组件而非宿主包）', () => {
    expect(designerSource).toMatch(/await registerUniAppCanvasComponents\(\)[^]*?setRule\(/)
  })
})
