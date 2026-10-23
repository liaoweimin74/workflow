// ----- Task 2.3: 三区能力矩阵（capabilityZone / supports / PROFILES）-----
// 矩阵依据 docs/superpowers/specs/2026-10-23-mobile-target-capability-matrix.md §2：
// web-only = PageIframe / PageDataTree / PageTreeTable / Excel 导入导出（机制预留）；
// MOBILE_ONLY_TYPES V1 空集（机制预留）；未知类型默认 universal（不因漏登记误杀）。
// plan RED 断言原文用 'PageIframe'（能力矩阵文档的组件名拼法），schema 实际类型名为
// kebab-case（page-iframe），target-profile 两者都登记，故两种拼法都断言。
// npx vitest run src/views/page/codegen/__tests__/target-profile.test.ts

import { describe, expect, it } from 'vitest'
import {
  KNOWN_TYPES,
  MOBILE_ONLY_TYPES,
  PROFILES,
  WEB_ONLY_TYPES,
  capabilityZone,
  supports,
} from '../target-profile'
import { UNIAPP_COMPONENT_MAP } from '../component-map'

describe('capabilityZone — 三区判定（硬清单法）', () => {
  it('Web 专属：iframe 与树/树表族（spec 场景原文；schema 类型名 + 文档别名双登记）', () => {
    expect(capabilityZone('page-iframe')).toBe('web-only')
    expect(capabilityZone('PageIframe')).toBe('web-only')
    expect(capabilityZone('page-tree')).toBe('web-only')
    expect(capabilityZone('PageDataTree')).toBe('web-only')
    expect(capabilityZone('page-tree-table')).toBe('web-only')
    expect(capabilityZone('PageTreeTable')).toBe('web-only')
  })

  it('Web 专属：Excel 导入导出（机制预留，无独立 schema 类型）', () => {
    expect(capabilityZone('ExcelActions')).toBe('web-only')
  })

  it('双端共享：字段族与数据组件；未知类型默认 universal（不因漏登记误杀）', () => {
    expect(capabilityZone('input')).toBe('universal')
    expect(capabilityZone('page-list-cards')).toBe('universal')
    expect(capabilityZone('page-chart')).toBe('universal')
    expect(capabilityZone('未来新增的未登记类型')).toBe('universal')
  })

  it('移动专属：V1 空集，仅机制预留', () => {
    expect(MOBILE_ONLY_TYPES.size).toBe(0)
  })

  it('Web 专属硬清单 = 3 个 schema 类型 + 3 个文档别名 + ExcelActions', () => {
    expect(WEB_ONLY_TYPES.size).toBe(7)
  })
})

describe('supports(profile, type) — 按 zone 判定，不依赖 capabilities', () => {
  it('uniapp 不支持 Web 专属组件（plan RED 断言）', () => {
    expect(supports(PROFILES.uniapp, 'PageIframe')).toBe(false)
    expect(supports(PROFILES.uniapp, 'page-iframe')).toBe(false)
    expect(supports(PROFILES.uniapp, 'PageDataTree')).toBe(false)
    expect(supports(PROFILES.uniapp, 'PageTreeTable')).toBe(false)
    expect(supports(PROFILES.uniapp, 'ExcelActions')).toBe(false)
  })

  it('web 端支持全部已知组件（含 Web 专属）', () => {
    expect(supports(PROFILES.web, 'PageIframe')).toBe(true)
    expect(supports(PROFILES.web, 'page-iframe')).toBe(true)
    expect(supports(PROFILES.web, 'input')).toBe(true)
  })

  it('uniapp 支持双端共享组件（字段族 + 数据组件）', () => {
    expect(supports(PROFILES.uniapp, 'input')).toBe(true)
    expect(supports(PROFILES.uniapp, 'page-list-cards')).toBe(true)
    expect(supports(PROFILES.uniapp, 'page-chart')).toBe(true)
  })
})

describe('PROFILES — TargetProfile', () => {
  it('平台与 componentMap：uniapp 直接引用 component-map 单一事实源（toBe），web 无映射表', () => {
    expect(PROFILES.web.platform).toBe('web')
    expect(PROFILES.uniapp.platform).toBe('uniapp')
    expect(PROFILES.uniapp.componentMap).toBe(UNIAPP_COMPONENT_MAP)
    expect(PROFILES.web.componentMap).toBeNull()
  })

  it('uniapp 骨架占位：375 画布基准 / uni.request + token + 租户头 / uni.navigateTo（Task 3.2/3.4 消费）', () => {
    expect(PROFILES.uniapp.styleRules.designWidth).toBe(375)
    expect(PROFILES.uniapp.apiAdapter.request).toBe('uni.request')
    expect(PROFILES.uniapp.apiAdapter.authHeader).toBe('Authorization')
    expect(PROFILES.uniapp.apiAdapter.tenantHeader).toBe('X-Tenant-Id')
    expect(PROFILES.uniapp.routerAdapter.navigate).toBe('uni.navigateTo')
  })

  it('capabilities 派生：uniapp = 已知全集减 Web 专属；web = 已知全集', () => {
    expect(PROFILES.uniapp.capabilities.has('page-iframe')).toBe(false)
    expect(PROFILES.uniapp.capabilities.has('page-tree')).toBe(false)
    expect(PROFILES.uniapp.capabilities.has('page-tree-table')).toBe(false)
    expect(PROFILES.uniapp.capabilities.has('input')).toBe(true)
    expect(PROFILES.uniapp.capabilities.has('page-list-cards')).toBe(true)

    const webOnlyKnown = [...KNOWN_TYPES].filter((t) => capabilityZone(t) === 'web-only')
    expect(webOnlyKnown.length).toBe(3)
    expect(new Set(webOnlyKnown)).toEqual(new Set(['page-iframe', 'page-tree', 'page-tree-table']))
    expect(PROFILES.uniapp.capabilities.size).toBe(KNOWN_TYPES.length - webOnlyKnown.length)

    for (const t of KNOWN_TYPES) {
      expect(PROFILES.web.capabilities.has(t)).toBe(true)
    }
    expect(PROFILES.web.capabilities.size).toBe(KNOWN_TYPES.length)
  })

  it('KNOWN_TYPES 覆盖：component-map 全键 + 画布自定义拖拽类型 + dash + textarea', () => {
    for (const key of Object.keys(UNIAPP_COMPONENT_MAP)) {
      expect(KNOWN_TYPES).toContain(key)
    }
    // 画布自定义拖拽类型（PageDesigner.registerPageComponents 全名单）
    for (const t of [
      'dataPicker', 'LookupPicker',
      'page-table', 'page-list-cards', 'page-tree', 'page-form', 'page-detail',
      'page-tree-table', 'page-chart', 'page-iframe', 'page-notice-carousel',
      'page-calendar', 'page-timeline', 'page-steps',
      'FormulaField', 'SystemUserPicker', 'SystemDeptPicker', 'SystemAttachment', 'SystemImage',
    ]) {
      expect(KNOWN_TYPES).toContain(t)
    }
    expect(KNOWN_TYPES).toContain('dash-kpi-trend')
    expect(KNOWN_TYPES).toContain('textarea')
  })
})
