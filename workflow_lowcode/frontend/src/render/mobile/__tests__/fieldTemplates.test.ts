import { describe, expect, it } from 'vitest'

import { MOBILE_MISSING_FIELDS, isMobileSupportedFieldType, rewriteFieldTypesForMobile } from '../fieldTemplates'

/**
 * 字段级移动映射（rule.type 维度，与块级 channelTemplates 同族单点）：
 * @form-create/vant 内置组件直通（input/select/datePicker/group/subForm…），
 * EP 侧注册的自定义字段组件（main.ts FcDesigner.component 面）无移动等价=显式登记缺失。
 * 存量 form-create 资产实测以 input/textarea 为主（分拣台账 §2），自定义字段出现即占位提示，
 * 并剥离该字段 validate——占位不填值，required 挂上会让整表永远提交不了。
 */
describe('fieldTemplates（字段类型→移动支持面）', () => {
  it('passes vant built-in field types through untouched', () => {
    const rules = [
      { type: 'input', field: 'a', title: 'A' },
      { type: 'select', field: 'b', options: [] },
      { type: 'datePicker', field: 'c' },
      { type: 'group', field: 'd', children: [{ type: 'input', field: 'e' }] },
    ]
    expect(rewriteFieldTypesForMobile(rules)).toEqual(rules)
  })

  it('replaces an EP-only custom field with a placeholder and strips its validate', () => {
    const [node] = rewriteFieldTypesForMobile([
      { type: 'LookupPicker', field: 'user', title: '负责人', validate: [{ required: true, message: '必选' }] },
    ])
    expect(node.type).toBe('mobile-field-placeholder')
    expect(node.props).toEqual({ field: 'LookupPicker', reason: MOBILE_MISSING_FIELDS['LookupPicker'] })
    // 占位不产输入值：validate 必须剥离，否则 required 永假整表不可提交
    expect(node.validate).toBeUndefined()
    expect(node.field).toBe('user')
  })

  it('flags missing fields for the publish gate (unsupported field types actually used)', () => {
    const used = ['input', 'LookupPicker', 'DictSelect']
    expect(isMobileSupportedFieldType('input')).toBe(true)
    expect(isMobileSupportedFieldType('LookupPicker')).toBe(false)
    expect(used.filter((t) => !isMobileSupportedFieldType(t))).toEqual(['LookupPicker', 'DictSelect'])
  })

  it('every EP-registered custom field component is explicitly registered as missing', () => {
    // main.ts 注册面（运行时可出现在 rule 的自定义字段类型）——新增时必须同步登记处置
    const EP_ONLY_FIELDS = [
      'LookupPicker',
      'dataPicker',
      'SystemUserPicker',
      'SystemDeptPicker',
      'SystemAttachment',
      'SystemImage',
      'FormulaField',
      'areaPicker',
      'dictSelect',
      'AutoNumber',
      'RelationCard',
      'LocationPicker',
      'StepsForm',
      'DrawerContainer',
    ]
    for (const type of EP_ONLY_FIELDS) {
      expect(isMobileSupportedFieldType(type), `${type} 应为移动缺失且已登记`).toBe(false)
      expect(MOBILE_MISSING_FIELDS[type], `${type} 缺失登记必须有理由`).toBeTruthy()
    }
  })

  it('does not mutate the input rules', () => {
    const rules = [{ type: 'LookupPicker', field: 'u', validate: [{ required: true }] }]
    rewriteFieldTypesForMobile(rules)
    expect(rules[0].type).toBe('LookupPicker')
    expect(rules[0].validate).toHaveLength(1)
  })
})
