// 条件行模型：行 ↔ API 条件转换与保存前校验
// npx vitest run src/views/system/row-permission/__tests__/conditionModel.test.ts

import { describe, it, expect } from 'vitest'
import {
  VARIABLE_NAMES,
  conditionSummary,
  emptyConditionRow,
  fromApiCondition,
  fromApiConditions,
  toApiCondition,
  toApiConditions,
  validateConditionRows,
  type ConditionEditorRow,
} from '../conditionModel'

function row(overrides: Partial<ConditionEditorRow> = {}): ConditionEditorRow {
  return { ...emptyConditionRow(), column: 'owner_id', ...overrides }
}

describe('conditionModel', () => {
  it('固定值 eq 转成标量条件', () => {
    expect(toApiCondition(row({ value: 'open' }))).toEqual({ column: 'owner_id', op: 'eq', value: 'open' })
  })

  it('变量与字面量拼串原样传给后端', () => {
    expect(toApiCondition(row({ value: '{userId}' }))).toEqual({
      column: 'owner_id',
      op: 'eq',
      value: '{userId}',
    })
    expect(toApiCondition(row({ op: 'like', value: '{orgId}/%' }))).toEqual({
      column: 'owner_id',
      op: 'like',
      value: '{orgId}/%',
    })
  })

  it('IN 的取值按中英文逗号拆成非空列表', () => {
    expect(toApiCondition(row({ op: 'in', value: '1, 2，3 , ' }))).toEqual({
      column: 'owner_id',
      op: 'in',
      value: ['1', '2', '3'],
    })
  })

  it('IN 里集合变量与其他值混写：仍是一项，展开由后端完成', () => {
    expect(toApiCondition(row({ op: 'in', value: '3, {orgIdSubtree}' }))).toEqual({
      column: 'owner_id',
      op: 'in',
      value: ['3', '{orgIdSubtree}'],
    })
  })

  it('range 转成两个端点', () => {
    expect(toApiCondition(row({ op: 'range', value: '2026-01-01', rangeEnd: '2026-12-31' }))).toEqual({
      column: 'owner_id',
      op: 'range',
      value: ['2026-01-01', '2026-12-31'],
    })
  })

  it('为空 / 非空不携带取值', () => {
    const condition = toApiCondition(row({ op: 'isempty' }))
    expect(condition).toEqual({ column: 'owner_id', op: 'isempty' })
    expect('value' in condition).toBe(false)
  })

  it('缺列、列名非法、空 IN、缺端点、空取值分别报错', () => {
    // v3：空条件是合法的「全部行」对象，不再报错
    expect(validateConditionRows([])).toBeNull()
    expect(validateConditionRows([row({ column: '' })])).toContain('缺少列名')
    expect(validateConditionRows([row({ column: 'bad column' })])).toContain('列名非法')
    expect(validateConditionRows([row({ op: 'in', value: ' , ' })])).toContain('非空列表')
    expect(validateConditionRows([row({ op: 'range', value: 'a', rangeEnd: '' })])).toContain('两个非空端点')
    expect(validateConditionRows([row({ value: '  ' })])).toContain('缺少取值')
  })

  it('未知变量拒绝，标量变量可以拼进字面量', () => {
    expect(validateConditionRows([row({ value: '{unknown}' })])).toContain('未知变量')
    expect(validateConditionRows([row({ value: 'prefix-{userId}' })])).toBeNull()
  })

  it('集合变量独占整个取值且只能配 IN', () => {
    expect(validateConditionRows([row({ op: 'in', value: '{orgIdSubtree}' })])).toBeNull()
    expect(validateConditionRows([row({ op: 'in', value: '3, {orgIdSubtree}' })])).toBeNull()
    expect(validateConditionRows([row({ value: '{orgIdSubtree}' })])).toContain('只能配合 IN')
    expect(validateConditionRows([row({ op: 'like', value: 'x{orgIdSubtree}' })])).toContain('不能与其他文字拼接')
    expect(validateConditionRows([row({ op: 'range', value: '{orgIdSubtree}', rangeEnd: '9' })])).toContain(
      '只能配合 IN',
    )
  })

  it('合法行整体通过校验并转成 API 条件', () => {
    const rows = [
      row({ column: 'owner_id', value: '{userId}' }),
      row({ column: 'status', op: 'in', value: 'open,closed' }),
      row({ column: 'deleted_at', op: 'isempty' }),
    ]
    expect(validateConditionRows(rows)).toBeNull()
    expect(toApiConditions(rows)).toEqual([
      { column: 'owner_id', op: 'eq', value: '{userId}' },
      { column: 'status', op: 'in', value: ['open', 'closed'] },
      { column: 'deleted_at', op: 'isempty' },
    ])
  })

  it('API 条件还原成编辑行：变量、列表、区间、为空', () => {
    expect(fromApiCondition({ column: 'a', op: 'eq', value: '{userId}' })).toMatchObject({ value: '{userId}' })
    expect(fromApiCondition({ column: 'a', op: 'in', value: ['1', '2'] })).toMatchObject({ op: 'in', value: '1, 2' })
    expect(fromApiCondition({ column: 'a', op: 'in', value: '{orgIdSubtree}' })).toMatchObject({
      op: 'in',
      value: '{orgIdSubtree}',
    })
    expect(fromApiCondition({ column: 'a', op: 'range', value: ['1', '9'] })).toMatchObject({
      value: '1',
      rangeEnd: '9',
    })
    expect(fromApiCondition({ column: 'a', op: 'isempty' })).toMatchObject({ op: 'isempty', value: '' })
  })

  it('编辑行往返后提交形状不变', () => {
    const conditions = [
      { column: 'created_by', op: 'eq', value: '{userId}' },
      { column: 'dept_id', op: 'in', value: ['3', '{orgIdSubtree}'] },
      { column: 'amount', op: 'range', value: ['1', '100'] },
    ]
    expect(toApiConditions(fromApiConditions(conditions))).toEqual(conditions)
  })

  it('历史条件里的单串 IN 读得回来，再保存归一成列表', () => {
    const rows = fromApiConditions([{ column: 'dept_id', op: 'in', value: 'fn:currentUserOrgSubtree()' }])
    expect(rows[0].value).toBe('fn:currentUserOrgSubtree()')
    expect(toApiCondition(rows[0])).toEqual({ column: 'dept_id', op: 'in', value: ['fn:currentUserOrgSubtree()'] })
  })

  it('条件摘要与权限管理列表展示一致', () => {
    expect(conditionSummary(null)).toContain('未设条件')
    expect(
      conditionSummary([
        { column: 'owner_id', op: 'eq', value: '{userId}' },
        { column: 'dept_id', op: 'in', value: ['3', '{orgIdSubtree}'] },
      ]),
    ).toBe('owner_id = {userId} AND dept_id 属于 [3, {orgIdSubtree}]')
  })

  it('变量白名单与后端 DataScopeVariables 同一份', () => {
    expect(VARIABLE_NAMES).toEqual(['userId', 'username', 'orgId', 'orgIdSubtree'])
  })
})
