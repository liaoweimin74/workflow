import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 组件面板图标回归防护（用户反馈「有些组件没有图标」）。
 *
 * 根因：FcDesigner 面板图标按 `fc-icon + icon: 'icon-xxx'` 类名渲染，类名必须存在于
 * @form-create/designer 内置 iconfont（dist 里的 `.icon-xxx:before{content:"\e..."}` CSS）。
 * 自造类名（icon-count/icon-filter/icon-circle-check/icon-medal 等）不在字体里 → 渲染为空白。
 *
 * 本测试把「设计器源码里用到的 icon 类名」与「字体实际定义的类名」做交集校验，
 * 今后任何人在 addComponent 里写了不存在的类名都会在这里失败。
 */

/** 从 @form-create/designer 产物中提取 iconfont 实际定义的类名集合 */
function collectFontIconClasses(): Set<string> {
  const distPath = resolve(
    __dirname,
    '../../../../node_modules/@form-create/designer/dist/index.es.js',
  )
  const dist = readFileSync(distPath, 'utf8')
  // 匹配 CSS 选择器 `.icon-xxx:before`（字体字形定义的唯一可靠特征）
  const matches = dist.matchAll(/\.((?:icon-[a-z0-9-]+))\\?:before/g)
  return new Set(Array.from(matches, (m) => m[1]))
}

/** 从设计器源码提取所有 addComponent 使用的 icon 类名 */
function collectUsedIcons(source: string): Map<string, string> {
  // 形如 `icon: 'icon-xxx',`（设计器面板图标类名）
  const matches = source.matchAll(/icon:\s*'((?:icon-[a-z0-9-]+))'/g)
  return new Map(Array.from(matches, (m) => [m[1], m[1]]))
}

const FONT_CLASSES = collectFontIconClasses()

describe('designer palette icons must exist in the FcDesigner iconfont', () => {
  it('iconfont fixture sanity: core glyphs are defined', () => {
    // 防护测试自身失真：若字体提取逻辑/路径失效，先用已知存在的类名兜底报警
    for (const known of ['icon-input', 'icon-table', 'icon-stack', 'icon-search']) {
      expect(FONT_CLASSES.has(known), `iconfont 缺少已知字形 ${known}，检查 dist 提取逻辑`).toBe(true)
    }
    // 字体规模 sanity（当前 248 个真实字形，过低说明提取不完整；注意这是 CSS `.icon-x:before` 定义数，
    // 宽松 grep 字符串会混入 wangEditor 的 w-e-icon-* 假阳性）
    expect(FONT_CLASSES.size).toBeGreaterThan(200)
  })

  it('every icon used by PageDesigner addComponent exists in the iconfont', () => {
    const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')
    const used = collectUsedIcons(source)
    expect(used.size).toBeGreaterThan(0)

    const missing = Array.from(used.keys()).filter((name) => !FONT_CLASSES.has(name))
    expect(
      missing,
      `以下图标类名不在 FcDesigner iconfont 中（面板将渲染为空白）：${missing.join(', ')}`,
    ).toEqual([])
  })

  it('every icon used by FormDesigner addComponent exists in the iconfont', () => {
    const source = readFileSync(resolve(__dirname, '../../form/FormDesigner.vue'), 'utf8')
    const used = collectUsedIcons(source)
    const missing = Array.from(used.keys()).filter((name) => !FONT_CLASSES.has(name))
    expect(
      missing,
      `FormDesigner 以下图标类名不在 iconfont 中：${missing.join(', ')}`,
    ).toEqual([])
  })

  it('dashboard components keep their fixed icon mappings (Task 119/120)', () => {
    const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')
    // KPI 指标卡 / 统计图 / 筛选器 / 目标进度 / 排行榜 / 告警标记 的图标锚点
    expect(source).toContain("icon: 'icon-statistic'")
    expect(source).toContain("icon: 'icon-stack'")
    expect(source).toContain("icon: 'icon-data-select'")
    expect(source).toContain("icon: 'icon-yes'")
    expect(source).toContain("icon: 'icon-statistics'")
    expect(source).toContain("icon: 'icon-warning'")
    // 曾经导致空白的坏类名不得回归：
    // - icon-count/icon-filter/icon-circle-check/icon-medal：FcDesigner 字体里不存在
    // - icon-table2/icon-list-numbered：是 wangEditor 的 w-e-icon-*，非 FcDesigner 字体
    const bad = [
      "icon: 'icon-count'",
      "icon: 'icon-filter'",
      "icon: 'icon-circle-check'",
      "icon: 'icon-medal'",
      "icon: 'icon-table2'",
      "icon: 'icon-list-numbered'",
    ]
    for (const b of bad) {
      expect(source).not.toContain(b)
    }
  })

  it('数据表格 / 卡片列表 图标不再共用（icon-grid 双占用治理）', () => {
    const source = readFileSync(resolve(__dirname, '../PageDesigner.vue'), 'utf8')
    expect(source).toContain("name: 'page-table',\n    icon: 'icon-table'")
    expect(source).toContain("name: 'page-list-cards',\n    icon: 'icon-card'")
  })
})
