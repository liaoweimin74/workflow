import { describe, expect, it } from 'vitest'
import { parseProcessPolicy } from '../../../src/engine/process/compiler/process-policy'

/**
 * 流程级策略「可发起人员范围 + 审批管理员」解析（Task 76）。
 *
 * 口径对齐设计器 ProcessConfigData.starterScope / adminUserIds：
 * - starterScope.mode 非 SPECIFIED 一律 ALL（宽松，缺省安全）
 * - 名单仅保留非空字符串（trim），超限截断（userIds≤200 / roleIds≤50 / admin≤50）
 * - adminUserIds 缺省空数组（引擎回落全局 admin）
 */
describe('parseProcessPolicy starterScope / adminUserIds', () => {
  it('configJson 为 null → 缺省 ALL + 空名单', () => {
    const p = parseProcessPolicy(null)
    expect(p.starterScope.mode).toBe('ALL')
    expect(p.starterScope.userIds).toEqual([])
    expect(p.starterScope.roleIds).toEqual([])
    expect(p.adminUserIds).toEqual([])
  })

  it('SPECIFIED + 用户/角色名单解析', () => {
    const p = parseProcessPolicy(
      JSON.stringify({
        starterScope: {
          mode: 'SPECIFIED',
          userIds: ['1', ' 2 ', ''],
          roleIds: ['dept_manager'],
        },
        adminUserIds: ['7', '8'],
      }),
    )
    expect(p.starterScope.mode).toBe('SPECIFIED')
    expect(p.starterScope.userIds).toEqual(['1', '2'])
    expect(p.starterScope.roleIds).toEqual(['dept_manager'])
    expect(p.adminUserIds).toEqual(['7', '8'])
  })

  it('mode 非 SPECIFIED（含脏值）→ 一律 ALL', () => {
    for (const mode of ['ALL', 'specified', '', null]) {
      const p = parseProcessPolicy(JSON.stringify({ starterScope: { mode, userIds: ['1'] } }))
      expect(p.starterScope.mode).toBe('ALL')
      expect(p.starterScope.userIds).toEqual([])
    }
  })

  it('starterScope 非对象（数组/字符串）→ 忽略', () => {
    const p = parseProcessPolicy(JSON.stringify({ starterScope: ['SPECIFIED'] }))
    expect(p.starterScope.mode).toBe('ALL')
    expect(p.adminUserIds).toEqual([])
  })

  it('名单内非字符串项被过滤；超限截断（userIds 200 / roleIds 50 / admin 50）', () => {
    // 混入非字符串脏数据（42/null）验证过滤：显式 unknown[] 规避 string[] concat 重载限制
    const rawUserIds: unknown[] = [...Array(210).keys()].map(String)
    rawUserIds.push(42, null)
    const cfg = {
      starterScope: {
        mode: 'SPECIFIED',
        userIds: rawUserIds,
        roleIds: [...Array(55).keys()].map((i) => `r${i}`),
      },
      adminUserIds: [...Array(60).keys()].map(String),
    }
    const p = parseProcessPolicy(JSON.stringify(cfg))
    expect(p.starterScope.userIds).toHaveLength(200)
    expect(p.starterScope.userIds.every((v) => typeof v === 'string')).toBe(true)
    expect(p.starterScope.roleIds).toHaveLength(50)
    expect(p.starterScope.roleIds[49]).toBe('r49')
    expect(p.adminUserIds).toHaveLength(50)
  })

  it('纯脏数据名单 → 过滤后为空', () => {
    const p = parseProcessPolicy(
      JSON.stringify({
        starterScope: { mode: 'SPECIFIED', userIds: [42, null, {}, '  '] },
        adminUserIds: [1, null, ' '],
      }),
    )
    expect(p.starterScope.userIds).toEqual([])
    expect(p.adminUserIds).toEqual([])
  })

  it('非法 JSON → 缺省策略', () => {
    const p = parseProcessPolicy('{not-json')
    expect(p.starterScope.mode).toBe('ALL')
    expect(p.adminUserIds).toEqual([])
  })

  it('既有字段不受影响（timeoutRules/summaryFields 同轮解析）', () => {
    const p = parseProcessPolicy(
      JSON.stringify({
        timeoutRules: [{ id: 'a', action: 'remind', duration: 3, unit: 'hour' }],
        summaryRule: { enabled: true, fields: ['amount'] },
        adminUserIds: ['7'],
      }),
    )
    expect(p.timeoutRules).toHaveLength(1)
    expect(p.timeoutRules[0]?.action).toBe('remind')
    expect(p.summaryFields).toEqual(['amount'])
    expect(p.adminUserIds).toEqual(['7'])
  })
})
