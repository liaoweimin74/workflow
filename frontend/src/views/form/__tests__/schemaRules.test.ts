// ----- TDD: schemaRules 遍历兼容 subForm 的 props.rule 保存结构 -----
// npx vitest run src/views/form/__tests__/schemaRules.test.ts

import { describe, it, expect } from 'vitest'
import { walkRules, collectFieldsByType, collectFieldKeys, updateFieldProps } from '../schemaRules'

/** subForm 保存结构：getRule() 经 parseRule 后子字段在 props.rule，无 children */
const subFormSchema = [
  { type: 'input', field: 'name', title: '姓名' },
  {
    type: 'subForm',
    field: 'items',
    props: {
      rule: [
        { type: 'LookupPicker', field: 'emp', title: '引用', props: { sourceFormKey: 'emp_profile' } },
        { type: 'dataPicker', field: 'dept', title: '部门', props: { sourceFormKey: 'dept_list' } },
      ],
    },
  },
  { type: 'fcRow', field: 'row1', children: [{ type: 'input', field: 'remark' }] },
]

describe('schemaRules 遍历（兼容 subForm props.rule 结构）', () => {
  it('walkRules 递归 subForm 的 props.rule 中的字段', () => {
    const visited: string[] = []
    walkRules(subFormSchema, (r) => visited.push(r.field || r.type))
    expect(visited).toContain('emp')
    expect(visited).toContain('dept')
    expect(visited).toContain('items')
  })

  it('collectFieldsByType 能收集子表内的 LookupPicker/dataPicker', () => {
    const pickers = collectFieldsByType(subFormSchema, 'LookupPicker')
    expect(pickers).toHaveLength(1)
    expect(pickers[0].field).toBe('emp')
    expect(pickers[0].props.sourceFormKey).toBe('emp_profile')

    const dataPickers = collectFieldsByType(subFormSchema, 'dataPicker')
    expect(dataPickers).toHaveLength(1)
    expect(dataPickers[0].field).toBe('dept')
  })

  it('collectFieldKeys 收集子表内字段 key', () => {
    const keys = collectFieldKeys(subFormSchema)
    expect(keys).toContain('name')
    expect(keys).toContain('items')
    expect(keys).toContain('emp')
    expect(keys).toContain('dept')
    expect(keys).toContain('remark')
  })

  it('updateFieldProps 能写入子表内字段的配置（合并保留已有 props）', () => {
    const schema = structuredClone(subFormSchema)
    updateFieldProps(schema, 'emp', 'LookupPicker', { fetch: { action: '/v1/biz-data/emp_profile' } })

    const sub = schema.find(r => r.field === 'items')
    const emp = sub.props.rule.find((r: any) => r.field === 'emp')
    expect(emp.props.fetch.action).toBe('/v1/biz-data/emp_profile')
    // 已有 sourceFormKey 保留
    expect(emp.props.sourceFormKey).toBe('emp_profile')
  })

  it('updateFieldProps 对非子表字段同样生效', () => {
    const schema = structuredClone(subFormSchema)
    updateFieldProps(schema, 'name', 'input', { placeholder: '请输入姓名' })
    expect(schema[0].props.placeholder).toBe('请输入姓名')
  })
})
