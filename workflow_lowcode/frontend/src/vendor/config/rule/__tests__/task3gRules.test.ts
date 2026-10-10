// ----- Task 3-g: vendor rule 物料测试（RelationCard / StepsForm / DrawerContainer / LocationPicker）-----
// npx vitest run src/vendor/config/rule/__tests__/task3gRules.test.ts
//
// 覆盖：menu 归属、name/type 一致性、字段组件 vs 布局容器的骨架差异、
// 默认 props、属性面板字段清单。

import { describe, it, expect } from 'vitest'
import relationCard from '../relationCard'
import stepsForm from '../stepsForm'
import drawerContainer from '../drawerContainer'
import locationPicker from '../locationPicker'

const t = (k: string) => k

describe('relationCard rule（基础组件）', () => {
  it('menu:main + input 字段骨架（type/name 一致、field/$required）', () => {
    expect(relationCard.menu).toBe('main')
    expect(relationCard.name).toBe('RelationCard')
    const rule = relationCard.rule({ t })
    expect(rule.type).toBe('RelationCard')
    expect(rule.field).toBeTruthy()
    expect(rule.$required).toBe(false)
    expect(relationCard.input).toBe(true)
    expect(relationCard.mask).toBe(true)
  })

  it('默认 props：clickable 开启、标题/说明/显示字段留空', () => {
    const rule = relationCard.rule({ t })
    expect(rule.props).toEqual({ title: '', description: '', displayField: '', clickable: true })
  })

  it('props 面板含 title/description/displayField/clickable', () => {
    const fields = relationCard.props({}, { t }).map((p: any) => p.field)
    expect(fields).toEqual(expect.arrayContaining(['title', 'description', 'displayField', 'clickable']))
  })
})

describe('stepsForm rule（布局容器）', () => {
  it('menu:layout + drag 容器骨架（children 空数组、无 field、mask 关闭）', () => {
    expect(stepsForm.menu).toBe('layout')
    expect(stepsForm.name).toBe('StepsForm')
    expect(stepsForm.drag).toBe(true)
    expect(stepsForm.inside).toBe(false)
    expect(stepsForm.mask).toBe(false)
    const rule = stepsForm.rule({ t })
    expect(rule.type).toBe('StepsForm')
    expect(rule.field).toBeUndefined()
    expect(rule.children).toEqual([])
    expect(rule.style.width).toBe('100%')
  })

  it('默认 props：active=0、水平方向、steps 空', () => {
    const rule = stepsForm.rule({ t })
    expect(rule.props).toEqual({ steps: [], active: 0, direction: 'horizontal' })
  })

  it('props 面板含 steps/active/direction', () => {
    const fields = stepsForm.props({}, { t }).map((p: any) => p.field)
    expect(fields).toEqual(expect.arrayContaining(['steps', 'active', 'direction']))
  })
})

describe('drawerContainer rule（布局容器）', () => {
  it('menu:layout + drag 容器骨架（children 空数组、无 field、mask 关闭）', () => {
    expect(drawerContainer.menu).toBe('layout')
    expect(drawerContainer.name).toBe('DrawerContainer')
    expect(drawerContainer.drag).toBe(true)
    expect(drawerContainer.mask).toBe(false)
    const rule = drawerContainer.rule({ t })
    expect(rule.type).toBe('DrawerContainer')
    expect(rule.field).toBeUndefined()
    expect(rule.children).toEqual([])
  })

  it('默认 props：按钮与抽屉缺省值（plain 开启、size 50%）', () => {
    const rule = drawerContainer.rule({ t })
    expect(rule.props).toEqual({
      buttonText: '展开详情',
      buttonType: 'primary',
      plain: true,
      title: '详情',
      size: '50%',
    })
  })

  it('props 面板含 buttonText/buttonType/plain/title/size', () => {
    const fields = drawerContainer.props({}, { t }).map((p: any) => p.field)
    expect(fields).toEqual(expect.arrayContaining(['buttonText', 'buttonType', 'plain', 'title', 'size']))
  })
})

describe('locationPicker rule（基础组件）', () => {
  it('menu:main + input 字段骨架（type/name 一致、field/$required、change 事件）', () => {
    expect(locationPicker.menu).toBe('main')
    expect(locationPicker.name).toBe('LocationPicker')
    expect(locationPicker.input).toBe(true)
    expect(locationPicker.event).toContain('change')
    const rule = locationPicker.rule({ t })
    expect(rule.type).toBe('LocationPicker')
    expect(rule.field).toBeTruthy()
    expect(rule.$required).toBe(false)
  })

  it('默认 props：clearable 开启、disabled 关闭', () => {
    const rule = locationPicker.rule({ t })
    expect(rule.props).toEqual({ disabled: false, clearable: true })
  })

  it('props 面板含 disabled/clearable', () => {
    const fields = locationPicker.props({}, { t }).map((p: any) => p.field)
    expect(fields).toEqual(expect.arrayContaining(['disabled', 'clearable']))
  })
})
