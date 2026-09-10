// ----- TDD: formRuleWalk 穿透子表（props.rule / props.columns[].rule）内部字段的遍历/收集/写回 -----
// npx vitest run src/views/form/__tests__/formRuleWalk.test.ts

import { describe, it, expect } from 'vitest'
import { walkRules, collectFieldsOfType, collectFieldKeys, patchFieldProps, resolveActiveField, ensureRuleProps, type RuleLike } from '../formRuleWalk'

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

describe('formRuleWalk — resolveActiveField（配置弹窗按设计器当前选中定位字段）', () => {
  const fields = [
    { field: 'lookup', props: {} },
    { field: 'sub_lookup', props: {} },
  ]

  it('activeRule 类型与字段都匹配时返回该字段（子表内字段）', () => {
    expect(resolveActiveField(fields, 'LookupPicker', { type: 'LookupPicker', field: 'sub_lookup' })).toBe('sub_lookup')
  })

  it('activeRule 类型不匹配时回退第一个字段', () => {
    expect(resolveActiveField(fields, 'LookupPicker', { type: 'input', field: 'remark' })).toBe('lookup')
  })

  it('activeRule 字段不在列表中时回退第一个字段', () => {
    expect(resolveActiveField(fields, 'LookupPicker', { type: 'LookupPicker', field: 'ghost' })).toBe('lookup')
  })

  it('activeRule 为空时回退第一个字段', () => {
    expect(resolveActiveField(fields, 'LookupPicker', null)).toBe('lookup')
    expect(resolveActiveField(fields, 'LookupPicker', undefined)).toBe('lookup')
  })

  it('字段列表为空时返回空串', () => {
    expect(resolveActiveField([], 'LookupPicker', { type: 'LookupPicker', field: 'x' })).toBe('')
  })
})

describe('formRuleWalk — ensureRuleProps（setRule 前递归补齐 rule.props，修复 fc-designer 属性面板回显崩溃）', () => {
  /**
   * 模拟 fc-designer parseRule 保存后删除了空 props 的 schema：
   * - 顶层 input 无 props（parseRule 删除了空的 props:{}）
   * - formContainer 容器：自身有 props.dataSourceId，但 props.rule 内子 input 无 props
   * - row 布局容器 children 内 textarea 无 props
   * - tableForm columns[].rule 内 select 无 props
   */
  function buildSparseSchema(): RuleLike[] {
    return [
      { type: 'input', field: 'name', title: '商品名称' },
      {
        type: 'formContainer',
        field: 'Fo1mmtmo9h7lahc',
        name: 'ref_Fuaamtmo9h7lajc',
        props: {
          dataSourceId: 'ds_mtmnv41b',
          rule: [{ type: 'input', field: 'inner_name', title: '容器内名称' }],
        },
      },
      {
        type: 'row',
        children: [
          { type: 'textarea', field: 'desc', title: '描述' },
        ],
      },
      {
        type: 'tableForm',
        field: 'rows',
        props: {
          columns: [
            { label: '列1', rule: [{ type: 'select', field: 'col_sel', title: '选择' }] },
          ],
        },
      },
    ]
  }

  it('顶层无 props 的 rule 被补齐为空对象', () => {
    const rules = buildSparseSchema()
    ensureRuleProps(rules)
    expect(rules[0].props).toEqual({})
  })

  it('props 为 null 的 rule 被补齐为空对象', () => {
    const rules: RuleLike[] = [{ type: 'input', field: 'x', props: null as unknown as Record<string, any> }]
    ensureRuleProps(rules)
    expect(rules[0].props).toEqual({})
  })

  it('已有 props 的 rule 保持不变（不覆盖既有值）', () => {
    const rules: RuleLike[] = [{ type: 'formContainer', field: 'c', props: { dataSourceId: 'ds_x' } }]
    ensureRuleProps(rules)
    expect(rules[0].props).toEqual({ dataSourceId: 'ds_x' })
  })

  it('formContainer props.rule 内子字段被递归补齐', () => {
    const rules = buildSparseSchema()
    ensureRuleProps(rules)
    const container = rules.find(r => r.type === 'formContainer')!
    const inner = (container.props!.rule as RuleLike[])[0]
    expect(inner.props).toEqual({})
  })

  it('row children 内子字段被递归补齐', () => {
    const rules = buildSparseSchema()
    ensureRuleProps(rules)
    const row = rules.find(r => r.type === 'row')!
    expect(row.children![0].props).toEqual({})
  })

  it('tableForm columns[].rule 内子字段被递归补齐', () => {
    const rules = buildSparseSchema()
    ensureRuleProps(rules)
    const table = rules.find(r => r.type === 'tableForm')!
    const col = (table.props!.columns as { rule: RuleLike[] }[])[0]
    expect(col.rule[0].props).toEqual({})
  })

  it('原地修改并返回原数组', () => {
    const rules = buildSparseSchema()
    const ret = ensureRuleProps(rules)
    expect(ret).toBe(rules)
    expect(rules[0].props).toEqual({})
  })

  it('非对象 rule（如标题字符串）跳过不报错', () => {
    const rules: any[] = ['divider-text', { type: 'input', field: 'a', children: ['plain-text'] as any }]
    expect(() => ensureRuleProps(rules)).not.toThrow()
    expect(rules[1].children[0]).toBe('plain-text')
    expect(rules[1].props).toEqual({})
  })

  it('undefined 输入返回空数组', () => {
    expect(ensureRuleProps(undefined)).toEqual([])
  })
})