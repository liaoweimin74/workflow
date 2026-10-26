/**
 * 页面块 → 渠道模板映射唯一口径（designs §5.1 组件集层的单点实现）。
 *
 * PAGE schema 是 form-create rule 树，数据块以自定义组件名表达（page-table 等，
 * 权威清单=PageRendererPage 的 formCreate.component 注册面）。移动端渲染按本表把
 * 块类型解析到移动模板键；「暂未实现」与「该端不支持」是两个语义——
 * 前者实现分批补齐（pending），后者是设计裁决（missing，§8.3 发布拦截的依据）。
 *
 * ⚠️ 新增页面块类型时必须在本表登记归属，完备性用例（channelTemplates.test）会红。
 */

/** 页面块语义类型（与 PageRendererPage 运行时注册清单一一对应） */
export const KNOWN_PAGE_BLOCKS: readonly string[] = [
  'page-table',
  'page-tree',
  'page-list-cards',
  'page-form',
  'page-detail',
  'page-chart',
  'page-tree-table',
  'page-data-container',
  'page-iframe',
  'page-notice-carousel',
  'page-calendar',
  'page-timeline',
  'page-steps',
  'dash-kpi',
  'dash-chart',
  'dash-kpi-trend',
]

/** 移动端模板键（渲染器注册表的实现单位；分批补齐） */
export type MobileBlockTemplate =
  | 'card-list' // 卡片列表（表格/卡片块的移动等价：搜索条+下拉刷新+滚动加载）
  | 'form' // 业务表单（@form-create/vant 渲染同一份 rule）
  | 'detail' // 全屏详情（桌面弹窗的移动等价）
  | 'container' // 表单容器（dialog/drawer 的移动等价：整屏/半屏叠层）
  | 'chart' // 图表（echarts canvas 移动端可用，尺寸自适应）
  | 'stat' // KPI 指标（van-grid + cell 降级呈现）
  | 'iframe' // 内嵌页（webview 原生能力）
  | 'carousel' // 通知轮播（van-swipe）
  | 'timeline' // 时间线（移动端简化条目流）
  | 'steps' // 步骤条（van-steps）
  | 'tree-drill' // 数据树（联系人式钻取页）

/** 块 → 移动模板归属（设计裁决；实现进度由渲染器注册表决定=pending） */
export const MOBILE_BLOCK_TEMPLATES: Readonly<Record<string, MobileBlockTemplate>> = {
  'page-table': 'card-list',
  'page-list-cards': 'card-list',
  'page-form': 'form',
  'page-detail': 'detail',
  'page-data-container': 'container',
  'page-chart': 'chart',
  'dash-chart': 'chart',
  'dash-kpi': 'stat',
  'dash-kpi-trend': 'stat',
  'page-iframe': 'iframe',
  'page-notice-carousel': 'carousel',
  'page-timeline': 'timeline',
  'page-steps': 'steps',
  'page-tree': 'tree-drill',
}

/** 确定无移动等价的块（理由=发布拦截文案输入，§5.1「无移动等价」行 + §8.3） */
export const MOBILE_MISSING_BLOCKS: Readonly<Record<string, string>> = {
  'page-tree-table': '复杂树形表格无移动等价（小屏无法承载多级列展开）',
  'page-calendar': '日历视图无移动等价（可后续降级为日程列表，另行设计）',
}

export type MobileBlockResolution =
  | { kind: 'render'; template: MobileBlockTemplate }
  | { kind: 'pending' }
  | { kind: 'unsupported'; reason: string }

/**
 * 三态解析：模板已实现=render；模板已归属未实现=pending（渲染「暂未支持」占位）；
 * 无移动等价=unsupported（渲染「该端不支持」占位）。未知块按 pending 安全兜底。
 */
export function resolveMobileBlock(
  blockType: string,
  implemented: readonly string[],
): MobileBlockResolution {
  const missingReason = MOBILE_MISSING_BLOCKS[blockType]
  if (missingReason) {
    return { kind: 'unsupported', reason: missingReason }
  }
  const template = MOBILE_BLOCK_TEMPLATES[blockType]
  if (template && implemented.includes(template)) {
    return { kind: 'render', template }
  }
  return { kind: 'pending' }
}

/** 发布拦截清单（A5 对话框/服务端复查共用口径）：用到的块里哪些无移动等价。 */
export function listPublishBlockedBlocks(
  usedBlocks: readonly string[],
): Array<{ block: string; reason: string }> {
  return usedBlocks
    .filter((block) => Object.prototype.hasOwnProperty.call(MOBILE_MISSING_BLOCKS, block))
    .map((block) => ({ block, reason: MOBILE_MISSING_BLOCKS[block] }))
}
