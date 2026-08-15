// ----- TDD: formRuleWalk 穿透子表（props.rule / props.columns[].rule）内部字段的遍历/收集/写回 -----
// npx vitest run src/views/form/__tests__/formRuleWalk.test.ts

import { describe, it, expect } from 'vitest'
import { walkRules, collectFieldsOfType, collectFieldKeys, patchFieldProps, type RuleLike } from '../formRuleWalk'

/**
 * 主表单 schema：
 * - group 子表单：内部字段在 `props.rule`
 * - tableForm 子表：内部字段在 `props.columns[].rule`（每列一个 rule 数组，真实 form-create 结构）
 */
function buildSchema(): RuleLike[] {
  return [
    { type: 'input', field: 'remark', title: '备注' },
    {
      type: 'group',
      field: 'items',
      title: '明细',
      props: {
        rule: [
          { type: 'input', field: 'item_name', title: '名称' },
          { type: 'LookupPicker', field: 'lkp', title: '查找带回', props: { displayField: 'name' } },
        ],
      },
    },
    {
      type: 'tableForm',
      field: 'rows',
      title: '表格子表',
      props: {
        columns: [
          {
            label: '名称',
            rule: [{ type: 'input', field: 'row_name', title: '名称' }],
          },
          {
            label: '数据引用',
            rule: [{ type: 'dataPicker', field: 'dp', title: '数据引用', props: { sourceFormKey: 'x', placeholder: '请选择' } }],
          },
        ],
      },
    },
  ]
}

describe('formRuleWalk — 子表内部字段（props.rule / props.columns[].rule）', () => {
  it('walkRules 穿透 group 的 props.rule 访问子表内部字段', () => {
    const visited: string[] = []
    walkRules(buildSchema(), (r) => visited.push(r.field || r.type || ''))
    expect(visited).toContain('lkp')
    expect(visited).toContain('item_name')
    expect(visited).toContain('dp')
  })

  it('collectFieldsOfType 能收集子表内部的 LookupPicker', () => {
    const fields = collectFieldsOfType(buildSchema(), 'LookupPicker')
    expect(fields).toHaveLength(1)
    expect(fields[0].field).toBe('lkp')
    expect(fields[0].props.displayField).toBe('name')
  })

  it('collectFieldsOfType 能收集 tableForm columns 内部的 dataPicker', () => {
    const fields = collectFieldsOfType(buildSchema(), 'dataPicker')
    expect(fields).toHaveLength(1)
    expect(fields[0].field).toBe('dp')
    expect(fields[0].props.sourceFormKey).toBe('x')
  })

  it('collectFieldKeys 包含子表内部字段 key', () => {
    const keys = collectFieldKeys(buildSchema())
    expect(keys).toContain('lkp')
    expect(keys).toContain('dp')
    expect(keys).toContain('item_name')
    expect(keys).toContain('row_name')
    expect(keys).toContain('remark')
  })

  it('patchFieldProps 能把配置写回 group 子表内部 rule 的 props', () => {
    const rules = buildSchema()
    const ok = patchFieldProps(rules, 'LookupPicker', 'lkp', { sourceFormKey: 'target', fetch: { action: '/v1/biz-data/target' } })
    expect(ok).toBe(true)

    // 从子表 props.rule 中取出断言
    const group = rules.find(r => r.type === 'group')!
    const inner = (group.props!.rule as RuleLike[]).find(r => r.field === 'lkp')!
    expect(inner.props!.sourceFormKey).toBe('target')
    expect(inner.props!.fetch.action).toBe('/v1/biz-data/target')
    // 合并保留原有 props
    expect(inner.props!.displayField).toBe('name')
  })

  it('patchFieldProps 能把配置写回 tableForm columns 内部 rule 的 props', () => {
    const rules = buildSchema()
    const ok = patchFieldProps(rules, 'dataPicker', 'dp', { sourceFormKey: 'biz_target' })
    expect(ok).toBe(true)

    // 从 tableForm props.columns[].rule 中取出断言
    const table = rules.find(r => r.type === 'tableForm')!
    const cols = table.props!.columns as { rule: RuleLike[] }[]
    const inner = cols.flatMap(c => c.rule).find(r => r.field === 'dp')!
    expect(inner.props!.sourceFormKey).toBe('biz_target')
    // 合并保留原有 props
    expect(inner.props!.placeholder).toBe('请选择')
  })

  it('patchFieldProps 未命中时返回 false 且不改动', () => {
    const rules = buildSchema()
    expect(patchFieldProps(rules, 'LookupPicker', 'nonexistent', { a: 1 })).toBe(false)
  })
})