import { describe, it, expect } from 'vitest'
import { resolveTemplate } from '../templateResolver'

const ctx = {
  node: { id: 'n1' },
  row: { id: 'r1', amount: 100 },
  field: { dept: 'IT' },
  record: { name: '张三' },
  param: { pageKey: 'p1' },
}

describe('resolveTemplate', () => {
  it('解析全部模板变量', () => {
    expect(resolveTemplate('{node.id}/{row.amount}/{field.dept}/{record.name}/{param.pageKey}', ctx))
      .toBe('n1/100/IT/张三/p1')
  })
  it('未知变量替换为空串', () => {
    expect(resolveTemplate('{node.ghost}', ctx)).toBe('')
  })
  it('无模板变量原样返回', () => {
    expect(resolveTemplate('plain text', ctx)).toBe('plain text')
  })
  it('缺失上下文段返回空串', () => {
    expect(resolveTemplate('{row.amount}', {})).toBe('')
  })
})
