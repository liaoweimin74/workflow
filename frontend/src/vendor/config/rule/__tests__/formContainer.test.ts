import { describe, it, expect } from 'vitest'
import formContainer from '../formContainer'

describe('formContainer rule', () => {
  it('rule() 生成容器骨架（subForm:object + 数据源 props + children）', () => {
    const rule = formContainer.rule({ t: (k: string) => k })
    expect(rule.type).toBe('fcRow')
    expect(rule.children).toEqual([])
    expect(rule.props.dataSourceId).toBe('')
    expect(rule.props.recordLocator).toEqual({ type: 'current-record' })
    expect(rule.field).toBeTruthy() // uniqueId 生成
  })

  it('loadRule 将 props.rule 还原为 children，parseRule 将 children 存回 props.rule（往返一致）', () => {
    const rule = formContainer.rule({ t: (k: string) => k })
    const child = { type: 'input', field: 'name', title: '名称' }
    rule.props.rule = [child]
    formContainer.loadRule(rule)
    expect(rule.children).toEqual([child])
    expect(rule.type).toBe('FcRow')
    expect(rule.props.rule).toBeUndefined()
    formContainer.parseRule(rule)
    expect(rule.props.rule).toEqual([child])
    expect(rule.type).toBe('formContainer')
    expect(rule.children).toBeUndefined()
  })

  it('props() 属性面板包含 dataSourceId 下拉与 recordLocator', () => {
    const props = formContainer.props({}, { t: (k: string) => k })
    const fields = props.map((p: any) => p.field)
    expect(fields).toContain('dataSourceId')
    expect(fields).toContain('recordLocator')
  })
})
