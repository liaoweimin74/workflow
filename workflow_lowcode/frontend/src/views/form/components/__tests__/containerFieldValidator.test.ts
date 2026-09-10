import { describe, it, expect } from 'vitest'
import { containerFieldValidator } from '../containerFieldValidator'
import type { Rule } from '@form-create/element-ui'
import type { ColumnConfigItem } from '@/api/bizData'

function makeColumns(keys: string[]): ColumnConfigItem[] {
  return keys.map((key) => ({
    key,
    label: key,
    columnType: 'VARCHAR',
    length: 255,
    scale: null,
    required: false,
    unique: false,
    indexed: false,
  }))
}

function leaf(field: string, type = 'input'): Rule {
  return { type, field } as unknown as Rule
}

function group(field: string, children: Rule[]): Rule {
  return { type: 'group', field, props: { rule: children } } as unknown as Rule
}

function subForm(field: string, children: Rule[]): Rule {
  return { type: 'subForm', field, props: { rule: children } } as unknown as Rule
}

describe('containerFieldValidator', () => {
  it('空容器 → 无字段', () => {
    const result = containerFieldValidator([], makeColumns(['name']))
    expect(result.validFields).toEqual([])
    expect(result.invalidFields).toEqual([])
  })

  it('所有字段命中 → validFields 全部返回', () => {
    const children = [leaf('name'), leaf('age')]
    const result = containerFieldValidator(children, makeColumns(['name', 'age', 'email']))
    expect(result.validFields).toEqual(['name', 'age'])
    expect(result.invalidFields).toEqual([])
  })

  it('字段不在 columns 中 → invalidFields 收集', () => {
    const children = [leaf('name'), leaf('nonexistent')]
    const result = containerFieldValidator(children, makeColumns(['name', 'email']))
    expect(result.validFields).toEqual(['name'])
    expect(result.invalidFields).toEqual(['nonexistent'])
  })

  it('group/subForm 容器自身 field 不作为叶子字段校验', () => {
    const children = [
      leaf('name'),
      group('items', [leaf('product'), leaf('qty')]),
    ]
    const result = containerFieldValidator(children, makeColumns(['name', 'product', 'qty']))
    // group 自身 field 'items' 不应出现在 validFields 或 invalidFields 中
    expect(result.validFields).toEqual(['name', 'product', 'qty'])
    expect(result.invalidFields).toEqual([])
  })

  it('subForm 内部字段正常校验', () => {
    const children = [
      subForm('detail', [leaf('title'), leaf('missing')]),
    ]
    const result = containerFieldValidator(children, makeColumns(['title']))
    expect(result.validFields).toEqual(['title'])
    expect(result.invalidFields).toEqual(['missing'])
  })

  it('嵌套 children（非 props.rule）也收集', () => {
    const children: Rule[] = [
      { type: 'fcRow', children: [leaf('a'), leaf('b')] } as unknown as Rule,
    ]
    const result = containerFieldValidator(children, makeColumns(['a']))
    expect(result.validFields).toEqual(['a'])
    expect(result.invalidFields).toEqual(['b'])
  })

  it('columns 为空 → 所有字段均为 invalid', () => {
    const children = [leaf('name')]
    const result = containerFieldValidator(children, [])
    expect(result.validFields).toEqual([])
    expect(result.invalidFields).toEqual(['name'])
  })
})
