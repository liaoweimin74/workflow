// ----- Task 4.1: uni 字段族出码 golden（input/textarea/inputNumber/datePicker）-----
// golden 快照先行（plan Task 4.1）：期望模板即规格。口径：
//  · 与 web fieldBlock 对位：锚点注释 + uni-forms-item(label+name+错误通道，4.4 统一开标签) + 控件；首行无缩进，
//    页面装配时统一加缩进；
//  · v-model 读 artifact.host.vmodel（parse 已按作用域算好前缀：页面级 form.<field>）；
//  · 属性白名单来自 component-map（单一事实源）：未登记的 IR prop 不上模板
//    （textarea 的 rows、datePicker 的 valueFormat 即被白名单丢弃的例证）；
//  · inputNumber 的 precision 在 uni-number-box 无原生对位 → :step 派生（10^-precision）
//    + @change 取整 handler（script 追加行）。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-field.test.ts

import { describe, expect, it } from 'vitest'

import { emitFieldNode } from '../../uni/emit-field'
import { parseIr } from '../../parse'
import { PROFILES } from '../../target-profile'

const profile = PROFILES.uniapp

function fieldNodeOf(rule: Record<string, unknown>) {
  const ir = parseIr(
    { option: {}, rule: [rule], dataSources: [], actions: [] },
    { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-field' },
  )
  const node = ir.nodes[0]
  expect(node, 'parse 应产出顶层节点').toBeDefined()
  return node!
}

describe('emitFieldNode — 字段族 golden（Task 4.1）', () => {
  it('input → uni-easyinput：白名单 prop 透传，锚点注释 + uni-forms-item', () => {
    const node = fieldNodeOf({
      type: 'input',
      field: 'name',
      title: '姓名',
      props: { placeholder: '请输入姓名' },
    })
    expect(emitFieldNode(node, profile).template).toBe(
      [
        `<!-- lc:node=n1 type=input field=name -->`,
        `<uni-forms-item label="姓名" name="name" :error-message="errors.name">`,
        `  <uni-easyinput v-model="form.name" placeholder="请输入姓名" />`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
  })

  it('textarea → uni-easyinput type=textarea（staticProps），rows 无对位不上模板', () => {
    const node = fieldNodeOf({
      type: 'textarea',
      field: 'remark',
      title: '备注',
      props: { placeholder: '请填写备注', rows: 4 },
    })
    expect(emitFieldNode(node, profile).template).toBe(
      [
        `<!-- lc:node=n1 type=textarea field=remark -->`,
        `<uni-forms-item label="备注" name="remark" :error-message="errors.remark">`,
        `  <uni-easyinput v-model="form.remark" type="textarea" placeholder="请填写备注" />`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
  })

  it('inputNumber → uni-number-box：min/max 透传；precision 封装出 :step 派生 + @change 取整 script', () => {
    const node = fieldNodeOf({
      type: 'inputNumber',
      field: 'qty',
      title: '数量',
      props: { min: 1, max: 99, precision: 1 },
    })
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1 type=inputNumber field=qty -->`,
        `<uni-forms-item label="数量" name="qty" :error-message="errors.qty">`,
        `  <uni-number-box v-model="form.qty" :min="1" :max="99" :step="0.1" @change="onQtyChange" />`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
    expect(out.script).toEqual(['const onQtyChange = (v: number) => {', '  form.qty = Number(Number(v).toFixed(1))', '}'])
  })

  it('inputNumber 无 precision：仅 min/max，无 :step/@change/script', () => {
    const node = fieldNodeOf({
      type: 'inputNumber',
      field: 'count',
      title: '个数',
      props: { min: 0, max: 10 },
    })
    const out = emitFieldNode(node, profile)
    expect(out.template).toContain('<uni-number-box v-model="form.count" :min="0" :max="10" />')
    expect(out.script).toBeUndefined()
  })

  it('datePicker → uni-datetime-picker：type/placeholder 透传，valueFormat 无对位不上模板', () => {
    const node = fieldNodeOf({
      type: 'datePicker',
      field: 'birthday',
      title: '生日',
      props: { type: 'date', valueFormat: 'yyyy-MM-dd', placeholder: '请选择日期' },
    })
    expect(emitFieldNode(node, profile).template).toBe(
      [
        `<!-- lc:node=n1 type=datePicker field=birthday -->`,
        `<uni-forms-item label="生日" name="birthday" :error-message="errors.birthday">`,
        `  <uni-datetime-picker v-model="form.birthday" type="date" placeholder="请选择日期" />`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
  })

  it('无 uniapp 映射的字段类型：lc:todo 挂点注释 + unsupported 登记（不出空标签，与 web 同纪律）', () => {
    const node = fieldNodeOf({
      type: 'SystemUserPicker',
      field: 'owner',
      title: '负责人',
      props: {},
    })
    expect(emitFieldNode(node, profile)).toEqual({
      template: `<!-- lc:todo node=n1 type=SystemUserPicker field=owner 组件类型无 uniapp 出码契约，整字段未出码 -->`,
      unsupported: [
        {
          path: 'rule[0]',
          type: 'SystemUserPicker',
          key: 'field-component',
          message: '字段 owner 的组件 SystemUserPicker 无 uniapp 映射，模板以 lc:todo 占位',
        },
      ],
    })
  })

  it('component-map 登记：textarea 进映射（KNOW_TYPES 派生不再手工列），三类型带 props 白名单', async () => {
    const { UNIAPP_COMPONENT_MAP } = await import('../../component-map')
    expect(UNIAPP_COMPONENT_MAP.textarea).toMatchObject({ tag: 'uni-easyinput', render: 'LcTextarea' })
    expect(UNIAPP_COMPONENT_MAP.input.props).toMatchObject({ placeholder: true })
    expect(UNIAPP_COMPONENT_MAP.inputNumber.props).toMatchObject({ min: true, max: true })
    expect(UNIAPP_COMPONENT_MAP.datePicker.props).toMatchObject({ type: true, placeholder: true })
    const { KNOWN_TYPES } = await import('../../target-profile')
    expect(KNOWN_TYPES).toContain('textarea')
  })
})
