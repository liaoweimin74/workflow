// ----- Task 4.3: group/subForm 块容器 + FormulaField 出码 golden -----
// golden 快照先行（plan Task 4.3）：期望模板即规格。口径：
//  · group（行数组）：uni-forms-item 包 lc-nested 块；行壳 v-for="(rowVar, i) in rows || []"，
//    card 型行壳 uni-card、其余 view；行头只在有真内容时出（title 配置了才出行标题、
//    配置了增删/排序才出行操作区——web 侧空钩子 span 恒出，uni 侧不出空视图）；
//    行内子节点由 emitFieldNode 递归渲染（v-model=rowVar.field 由 parse 的 planNested
//    按作用域算好，本模块不重算）；行操作 button :disabled 镜像 web el-button 语义
//    （min/max 条件读 config 常量，max 缺省 '0' → !0 恒真，condOf 与 web 同构）；
//    行函数 add/remove/move<Pascal(field)>Row 按 config 键出（button→add+remove、
//    sortBtn→move），新行形状 = rowKeys（子字段名: ''）——与 web emit 同一套语义；
//  · subForm（单对象）：lc-nested--sub 块 + 子节点递归（v-model=form.<容器>.<子>）；
//  · FormulaField：对位组件 LcFormula 落 @lc/runtime-uni（formulaEval 纯函数移植 +
//    form 数据后端）。不进 component-map——映射表键即画布件（@lc/ui-mobile）清单，
//    加映射会拖入画布渲染与包测试涟漪；emit 特判分支（同 select 先例），画布侧
//    FormulaField 渲染维持现状（后续任务补）。接线：v-model=vmodel（回写自身字段）、
//    :form=后端对象（vmodel 去末段——公式只引用同层字段，页级是 form、嵌套是行/子对象）、
//    expression/precision/prefix/suffix/placeholder/disabled 按 IR 白名单透传
//    （契约 default 面已在 parse 侧裁掉等值缺省）。
//  · 页面级嵌套容器 parse 侧整节点降级（无 form 后端），golden 一律放 formContainer 内。
// npx vitest run src/views/page/codegen/__tests__/uni/emit-field-nested.test.ts

import { describe, expect, it } from 'vitest'

import type { IrNode, IrPage } from '../../ir'
import { parseIr } from '../../parse'
import { emitFieldNode } from '../../uni/emit-field'
import { PROFILES } from '../../target-profile'

const profile = PROFILES.uniapp

function parseOf(schema: Record<string, unknown>): IrPage {
  return parseIr(
    { option: {}, rule: [schema], dataSources: [], actions: [] },
    { pageKey: 'golden', pageName: 'golden', exportedAt: 'emit-field-nested' },
  )
}

/** formContainer 包裹（页面级嵌套容器会被 parse 降级），取容器内第一个目标类型节点 */
function nestedNodeOf(inner: Record<string, unknown>, type: string): IrNode {
  const ir = parseOf({ type: 'formContainer', field: 'detail', title: '订单', props: { dataSourceId: 'ds_1', rule: [inner] } })
  const container = ir.nodes[0]
  expect(container, 'parse 应产出 formContainer 节点').toBeDefined()
  const found = container!.children.find((n) => n.artifact.type === type)
  expect(found, `容器内应有 ${type} 节点`).toBeDefined()
  return found!
}

function fieldNodeOf(rule: Record<string, unknown>): IrNode {
  const ir = parseOf(rule)
  const node = ir.nodes[0]
  expect(node, 'parse 应产出顶层节点').toBeDefined()
  return node!
}

describe('emitFieldNode group — 行数组块容器（Task 4.3）', () => {
  it('golden 全量：card 行壳 + 行标题 + 排序/增删 + 子节点递归 + 行函数 script', () => {
    const node = nestedNodeOf(
      {
        type: 'group',
        field: 'contacts',
        title: '联系人',
        props: {
          type: 'card',
          title: '联系人{index}',
          min: 1,
          max: 5,
          button: true,
          sortBtn: true,
          rule: [
            { type: 'input', field: 'name', title: '姓名', props: { placeholder: '请输入姓名' } },
            { type: 'input', field: 'phone', title: '电话', props: {} },
          ],
        },
      },
      'group',
    )
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1.f1 type=group field=contacts -->`,
        `<uni-forms-item label="联系人">`,
        `  <view class="lc-nested lc-nested--group">`,
        `    <uni-card class="lc-nested-row" v-for="(contactsRow, i) in form.contacts || []" :key="i">`,
        `      <view class="lc-nested-row-head">`,
        `        <text>{{ contactsConfig.title.replace('{index}', String(i + 1)) }}</text>`,
        `        <view class="lc-nested-row-ops">`,
        `          <button size="mini" :disabled="i === 0" @click="moveContactsRow(i, -1)">上移</button>`,
        `          <button size="mini" :disabled="i === (form.contacts || []).length - 1" @click="moveContactsRow(i, 1)">下移</button>`,
        `          <button size="mini" :disabled="(form.contacts || []).length <= contactsConfig.min" @click="removeContactsRow(i)">删除</button>`,
        `        </view>`,
        `      </view>`,
        `      <!-- lc:node=n1.f1.f1 type=input field=name -->`,
        `      <uni-forms-item label="姓名">`,
        `        <uni-easyinput v-model="contactsRow.name" placeholder="请输入姓名" />`,
        `      </uni-forms-item>`,
        `      <!-- lc:node=n1.f1.f2 type=input field=phone -->`,
        `      <uni-forms-item label="电话">`,
        `        <uni-easyinput v-model="contactsRow.phone" />`,
        `      </uni-forms-item>`,
        `    </uni-card>`,
        `    <button v-if="contactsConfig.button && (!contactsConfig.max || (form.contacts || []).length < contactsConfig.max)" @click="addContactsRow">添加</button>`,
        `  </view>`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
    expect(out.script).toEqual([
      `/** lc:node=n1.f1 type=group field=contacts 行增删（新行形状 = 子字段） */`,
      `function addContactsRow() { form.contacts.push({ name: '', phone: '' }) }`,
      `function removeContactsRow(i: number) { form.contacts.splice(i, 1) }`,
      `function moveContactsRow(i: number, d: number) {`,
      `  const rows = form.contacts`,
      `  const j = i + d`,
      `  if (j < 0 || j >= rows.length) return`,
      `  rows.splice(j, 0, rows.splice(i, 1)[0])`,
      `}`,
    ])
  })

  it('非 card 普通块：行壳 view；只配 button → 仅出删除/添加，script 无 move', () => {
    const node = nestedNodeOf(
      {
        type: 'group',
        field: 'addrs',
        title: '地址',
        props: {
          button: true,
          rule: [{ type: 'input', field: 'city', title: '城市', props: {} }],
        },
      },
      'group',
    )
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1.f1 type=group field=addrs -->`,
        `<uni-forms-item label="地址">`,
        `  <view class="lc-nested lc-nested--group">`,
        `    <view class="lc-nested-row" v-for="(addrsRow, i) in form.addrs || []" :key="i">`,
        `      <view class="lc-nested-row-head">`,
        `        <view class="lc-nested-row-ops">`,
        `          <button size="mini" :disabled="(form.addrs || []).length <= 0" @click="removeAddrsRow(i)">删除</button>`,
        `        </view>`,
        `      </view>`,
        `      <!-- lc:node=n1.f1.f1 type=input field=city -->`,
        `      <uni-forms-item label="城市">`,
        `        <uni-easyinput v-model="addrsRow.city" />`,
        `      </uni-forms-item>`,
        `    </view>`,
        `    <button v-if="addrsConfig.button && (!0 || (form.addrs || []).length < 0)" @click="addAddrsRow">添加</button>`,
        `  </view>`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
    expect(out.script).toEqual([
      `/** lc:node=n1.f1 type=group field=addrs 行增删（新行形状 = 子字段） */`,
      `function addAddrsRow() { form.addrs.push({ city: '' }) }`,
      `function removeAddrsRow(i: number) { form.addrs.splice(i, 1) }`,
    ])
  })

  it('无增删/排序/标题配置：无行头、无添加键、无 script（config 常量都不建）', () => {
    const node = nestedNodeOf(
      {
        type: 'group',
        field: 'logs',
        title: '日志',
        props: { rule: [{ type: 'input', field: 'note', title: '备注', props: {} }] },
      },
      'group',
    )
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1.f1 type=group field=logs -->`,
        `<uni-forms-item label="日志">`,
        `  <view class="lc-nested lc-nested--group">`,
        `    <view class="lc-nested-row" v-for="(logsRow, i) in form.logs || []" :key="i">`,
        `      <!-- lc:node=n1.f1.f1 type=input field=note -->`,
        `      <uni-forms-item label="备注">`,
        `        <uni-easyinput v-model="logsRow.note" />`,
        `      </uni-forms-item>`,
        `    </view>`,
        `  </view>`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
    expect(out.script).toBeUndefined()
  })
})

describe('emitFieldNode subForm — 单对象块容器（Task 4.3）', () => {
  it('golden：lc-nested--sub 块 + 子节点递归（v-model=form.<容器>.<子>），无 script', () => {
    const node = nestedNodeOf(
      {
        type: 'subForm',
        field: 'payee',
        title: '收款信息',
        props: {
          rule: [
            { type: 'input', field: 'account', title: '账号', props: {} },
            { type: 'inputNumber', field: 'amount', title: '金额', props: {} },
          ],
        },
      },
      'subForm',
    )
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1.f1 type=subForm field=payee -->`,
        `<uni-forms-item label="收款信息">`,
        `  <view class="lc-nested lc-nested--sub">`,
        `    <!-- lc:node=n1.f1.f1 type=input field=account -->`,
        `    <uni-forms-item label="账号">`,
        `      <uni-easyinput v-model="form.payee.account" />`,
        `    </uni-forms-item>`,
        `    <!-- lc:node=n1.f1.f2 type=inputNumber field=amount -->`,
        `    <uni-forms-item label="金额">`,
        `      <uni-number-box v-model="form.payee.amount" />`,
        `    </uni-forms-item>`,
        `  </view>`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
    expect(out.script).toBeUndefined()
  })
})

describe('emitFieldNode FormulaField — LcFormula 接线（Task 4.3）', () => {
  it('golden：v-model 回写 + :form 同层后端 + expression/precision/prefix 透传', () => {
    const node = fieldNodeOf({
      type: 'FormulaField',
      field: 'total',
      title: '合计',
      props: { expression: '${price} * ${count}', precision: 3, prefix: '￥' },
    })
    const out = emitFieldNode(node, profile)
    expect(out.template).toBe(
      [
        `<!-- lc:node=n1 type=FormulaField field=total -->`,
        `<uni-forms-item label="合计">`,
        `  <LcFormula v-model="form.total" :form="form" expression="${'${price}'} * ${'${count}'}" :precision="3" prefix="￥" />`,
        `</uni-forms-item>`,
      ].join('\n'),
    )
    expect(out.script).toBeUndefined()
  })

  it('嵌套于 subForm：后端是子对象（vmodel 去末段），公式引用同层字段', () => {
    const node = nestedNodeOf(
      {
        type: 'subForm',
        field: 'payee',
        title: '收款信息',
        props: {
          rule: [
            { type: 'inputNumber', field: 'amount', title: '金额', props: {} },
            { type: 'FormulaField', field: 'sum', title: '小计', props: { expression: '${amount} * 2' } },
          ],
        },
      },
      'subForm',
    )
    const out = emitFieldNode(node, profile)
    expect(out.template).toContain(
      [
        `    <!-- lc:node=n1.f1.f2 type=FormulaField field=sum -->`,
        `    <uni-forms-item label="小计">`,
        `      <LcFormula v-model="form.payee.sum" :form="form.payee" expression="${'${amount}'} * 2" />`,
        `    </uni-forms-item>`,
      ].join('\n'),
    )
  })
})
