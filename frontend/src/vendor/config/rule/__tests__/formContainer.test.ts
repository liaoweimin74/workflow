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

  it('rule() 默认显示模式为弹出窗口（dialog）', () => {
    const rule = formContainer.rule({ t: (k: string) => k })
    expect(rule.props.displayMode).toBe('dialog')
    expect(rule.props.dialogWidth).toBeTruthy()
    expect(rule.props.dialogHeight).toBeTruthy()
  })

  it('rule() 新开页签与内嵌配置默认值', () => {
    const rule = formContainer.rule({ t: (k: string) => k })
    expect(rule.props.tabTitle).toBeTruthy()
    expect(rule.props.inlineHeight).toBeTruthy()
  })

  it('props() 属性面板包含显示模式与尺寸配置', () => {
    const props = formContainer.props({}, { t: (k: string) => k })
    const fields = props.map((p: any) => p.field)
    expect(fields).toContain('displayMode')
    expect(fields).toContain('dialogWidth')
    expect(fields).toContain('dialogHeight')
    expect(fields).toContain('tabTitle')
    expect(fields).toContain('inlineHeight')
    // displayMode 为下拉选择，含三种模式
    const displayModeProp = props.find((p: any) => p.field === 'displayMode')
    const optionValues = (displayModeProp?.options || []).map((o: any) => o.value)
    expect(optionValues).toEqual(expect.arrayContaining(['dialog', 'newTab', 'inline']))
  })
})
