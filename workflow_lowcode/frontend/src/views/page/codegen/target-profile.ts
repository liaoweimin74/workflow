/**
 * target-profile：三区能力矩阵与目标端画像（Task 2.3）。
 *
 * spec: openspec/changes/multi-client-uniapp-codegen/specs/custom-page-designer/spec.md
 *   「组件面板 SHALL 按当前页面类型的三区能力矩阵（Web 专属 / 双端共享 / 移动专属）过滤：
 *    当前类型不支持的组件 SHALL 置灰并提示原因，MUST NOT 允许拖入后出码时静默丢弃」
 * 矩阵依据: docs/superpowers/specs/2026-10-23-mobile-target-capability-matrix.md §2
 *   web-only 四件套 = PageIframe / PageDataTree / PageTreeTable / Excel 导入导出。
 *
 * 建模（硬清单法）：
 *   - capabilityZone 用显式清单判定，未知类型默认 universal——supports 的正确性不依赖
 *     清单完备性（漏登记只会进 capabilities 派生，不会误杀组件）；
 *   - schema 类型名为 kebab-case（page-iframe），能力矩阵文档用组件名（PageIframe），两者都登记；
 *   - TargetProfile.capabilities 由 KNOWN_TYPES 派生（uniapp = 已知全集减 web-only），
 *     供 Task 2.4 出码报告显式分桶（不静默丢弃）；supports 判定不读它。
 */

import { UNIAPP_COMPONENT_MAP, type UniAppComponentMapping } from './component-map'

/** 能力三区：web-only（仅 Web 端可设计）/ universal（双端共享）/ mobile-only（仅移动端） */
export type CapabilityZone = 'web-only' | 'universal' | 'mobile-only'

/**
 * Web 专属类型硬清单（能力矩阵 §2「排除」行）：
 * - page-iframe/PageIframe 内嵌网页、page-tree/PageDataTree 树形数据、page-tree-table/PageTreeTable 树形表格；
 * - ExcelActions 机制预留：Excel 导入导出是 page-table 的特性级能力（工具栏组件，无独立
 *   schema 类型），V1 移动端不交付，先占位登记（后续动作层若出现该标记同按 web-only 分桶）。
 */
export const WEB_ONLY_TYPES: ReadonlySet<string> = new Set([
  'page-iframe', 'PageIframe',
  'page-tree', 'PageDataTree',
  'page-tree-table', 'PageTreeTable',
  'ExcelActions',
])

/** 移动专属类型硬清单：V1 空集，仅机制预留（后续移动端新组件在此登记） */
export const MOBILE_ONLY_TYPES: ReadonlySet<string> = new Set<string>([])

/**
 * 已知组件类型全集（capabilities 派生输入）：component-map 18 键（字段/布局族）
 * + 画布自定义拖拽类型（PageDesigner.registerPageComponents 全名单）
 * + dash-kpi-trend（仅 component 注册，无拖拽规则）+ textarea（form-create 内建字段，
 * 矩阵 §2.1：uni-easyinput type=textarea）。
 */
export const KNOWN_TYPES: readonly string[] = [
  ...Object.keys(UNIAPP_COMPONENT_MAP),
  // 画布自定义拖拽类型
  'dataPicker', 'LookupPicker',
  'page-table', 'page-list-cards', 'page-tree', 'page-form', 'page-detail',
  'page-tree-table', 'page-chart', 'page-iframe', 'page-notice-carousel',
  'page-calendar', 'page-timeline', 'page-steps',
  'FormulaField', 'SystemUserPicker', 'SystemDeptPicker', 'SystemAttachment', 'SystemImage',
  'dash-kpi-trend',
  'textarea',
]

/** 三区判定：硬清单命中即对应分区，其余（含未知类型）一律 universal */
export function capabilityZone(type: string): CapabilityZone {
  if (WEB_ONLY_TYPES.has(type)) return 'web-only'
  if (MOBILE_ONLY_TYPES.has(type)) return 'mobile-only'
  return 'universal'
}

/** 目标端画像：画布与出码按端消费的适配参数（design D5：与出码共用 component-map） */
export interface TargetProfile {
  platform: 'web' | 'uniapp'
  /** 组件映射表：uniapp 直接引用 component-map 单一事实源；web 走宿主组件包无映射表 */
  componentMap: Record<string, UniAppComponentMapping> | null
  /** 样式规则：web 直接出 px；uniapp 带 toRpx 做 px→rpx 换算（Task 3.4，375 设计稿基准） */
  styleRules: { designWidth: number; toRpx?: (px: number | string) => string }
  /** API 适配：请求器与鉴权/租户头（Task 3.2 runtime-uni 消费） */
  apiAdapter: { request: string; authHeader: string; tenantHeader: string }
  /** 路由适配（Task 3.2 消费） */
  routerAdapter: { navigate: string }
  /** 能力集合：该端支持的已知类型全集（出码报告分桶用；supports 判定不读它） */
  capabilities: Set<string>
}

function deriveCapabilities(platform: 'web' | 'uniapp'): Set<string> {
  return new Set(
    KNOWN_TYPES.filter((t) => {
      const zone = capabilityZone(t)
      if (zone === 'web-only') return platform === 'web'
      if (zone === 'mobile-only') return platform === 'uniapp'
      return true
    }),
  )
}

/** uniapp 画布设计稿宽：375 基准（750rpx 满幅，px ×2 出 rpx） */
const UNIAPP_DESIGN_WIDTH = 375

export const PROFILES: Record<'web' | 'uniapp', TargetProfile> = {
  web: {
    platform: 'web',
    componentMap: null,
    styleRules: { designWidth: 1920 },
    apiAdapter: { request: 'axios', authHeader: 'Authorization', tenantHeader: 'X-Tenant-Id' },
    routerAdapter: { navigate: 'vue-router' },
    capabilities: deriveCapabilities('web'),
  },
  uniapp: {
    platform: 'uniapp',
    componentMap: UNIAPP_COMPONENT_MAP,
    styleRules: {
      designWidth: UNIAPP_DESIGN_WIDTH,
      // px→rpx（Task 3.4）：750rpx 满幅 ÷ 375 设计稿宽 → 数值 ×2；0 出无单位零；
      // 字符串视为设计者显式给定的带单位值，原样透传不改写
      toRpx: (px) => {
        if (typeof px === 'number') return px === 0 ? '0' : `${(px * 750) / UNIAPP_DESIGN_WIDTH}rpx`
        return px
      },
    },
    apiAdapter: { request: 'uni.request', authHeader: 'Authorization', tenantHeader: 'X-Tenant-Id' },
    routerAdapter: { navigate: 'uni.navigateTo' },
    capabilities: deriveCapabilities('uniapp'),
  },
}

/** 该目标端是否支持该组件类型（按 zone 判定；未知类型恒 true——不因清单遗漏误杀） */
export function supports(profile: TargetProfile, type: string): boolean {
  const zone = capabilityZone(type)
  if (zone === 'web-only') return profile.platform === 'web'
  if (zone === 'mobile-only') return profile.platform === 'uniapp'
  return true
}
