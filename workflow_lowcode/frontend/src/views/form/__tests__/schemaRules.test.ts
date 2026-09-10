// ----- TDD: schemaRules 遍历兼容 subForm 的 props.rule 保存结构 -----
// npx vitest run src/views/form/__tests__/schemaRules.test.ts

import { describe, it, expect } from 'vitest'
import { walkRules, collectFieldsByType, collectFieldKeys, updateFieldProps, normalizeForRender } from '../schemaRules'

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

describe('normalizeForRender（formContainer → FcRow 渲染转换）', () => {
  it('字符串子节点原样透传，不被展开为字符索引对象（text/button 文字内容）', () => {
    const schema = [
      { type: 'div', native: true, children: ['文字内容', '第二段'] },
      { type: 'elButton', props: {}, children: ['按钮'] },
    ]
    const out = normalizeForRender(schema)
    expect(out[0].children).toEqual(['文字内容', '第二段'])
    expect(out[1].children).toEqual(['按钮'])
  })

  it('formContainer 转换为 FcRow（props.rule → children），子字段保留', () => {
    const schema = [
      {
        type: 'formContainer',
        field: 'fc1',
        props: {
          dataSourceId: 'ds_1',
          rule: [{ type: 'input', field: 'name', title: '名称' }],
        },
      },
    ]
    const out = normalizeForRender(schema)
    expect(out[0].type).toBe('FcRow')
    expect(out[0].props.dataSourceId).toBe('ds_1')
    expect(out[0].props.rule).toBeUndefined()
    expect(out[0].children).toEqual([{ type: 'input', field: 'name', title: '名称' }])
  })

  it('formContainer 内嵌字符串子节点（文字组件）同样透传', () => {
    const schema = [
      {
        type: 'formContainer',
        field: 'fc1',
        props: { rule: [{ type: 'div', native: true, children: ['容器内文字'] }] },
      },
    ]
    const out = normalizeForRender(schema)
    expect(out[0].type).toBe('FcRow')
    expect(out[0].children[0].children).toEqual(['容器内文字'])
  })

  it('不修改原始 rule 对象', () => {
    const schema = [
      {
        type: 'formContainer',
        field: 'fc1',
        props: { rule: [{ type: 'input', field: 'name' }] },
      },
    ]
    const original = JSON.stringify(schema)
    normalizeForRender(schema)
    expect(JSON.stringify(schema)).toBe(original)
  })
})
