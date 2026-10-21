// ----- 嵌套容器（group / tableForm / subForm）出码骨架 -----
// 语料事实（__tests__/fixtures/corpus/cardlist_test.json，现网卡片页）：容器 rule[1].props.rule 里
// 挂着三个子表节点 —— group items（4 子字段，行对象数组）、tableForm delivery_plan
// （4 列，子规则在 props.columns[].rule）、subForm invoice_info（空容器，值形态是对象）。
//
// 运行期依据（不是猜的）：
//  · group = @form-create/component-elm-group/src/component.jsx：props 面 button(:18)/max(:22)/
//    min(:26)/sortBtn(:35)/title(:47)/type(:51)；行值 = 数组，每行是行对象（_value :134、formData :152），
//    标题走 title.replace('{index}', index+1)（:313），按钮语义 makeIcon（:276-299）。
//  · tableForm = src/vendor/components/tableForm/TableForm.vue（由 src/vendor/form/index.js:12 注册成
//    TableForm）：props 面 columns(:32)/filterEmptyColumn(:37)/deletable(:41)/addable(:45)/max(:57)/
//    min(:58)/showIndex(:60)；添加按钮条件 :13；列元数据消费者只在 :263-271（label/hidden/required/style/rule），
//    formatter 与 fixed 运行期无人读 —— 登记成 no-consumer，不许跟着列对象一起透传进产物。
//  · subForm = @form-create/component-subform/src/component.jsx：modelValue 是对象（:17-21），
//    子字段写进这个对象，所以产物的 v-model 前缀是 form.<容器字段>。
//
// 产物取向（与 spike 7F-2/8 同一原则：不用组件的隐式兜底，也不搬第二套真相）：
//  · 行增删配置提到一个 script 常量（<字段>Config），模板与 handler 都读它 —— 回读核对的是
//    产物里真存在的那份值，不是锚点注释里的抄本；
//  · 列标题落 el-table-column 的 label（真载体），其余列元数据按丢弃登记；
//  · 行内字段的 v-model 用行别名（itemsRow.qty / deliveryPlanRow.stage），寻址唯一且是人写的样式。
//
// npx vitest run src/views/page/codegen/__tests__/nested-containers.test.ts

import { describe, expect, it } from 'vitest'

import { TABLE_COLUMN_CONTRACT, TYPE_CONTRACTS } from '../contract'
import { generatePage } from '../generate'
import { reverseToSchema } from '../reverse'

import cardlist from './fixtures/corpus/cardlist_test.json'

const schema = JSON.parse(
  JSON.stringify({
    rule: [
      {
        type: 'formContainer',
        field: 'detail',
        title: '订单',
        props: {
          dataSourceId: 'ds_1',
          tabTitle: '编辑',
          dialogWidth: '900px',
          displayMode: 'popup',
          rule: [
            { type: 'input', field: 'order_no', title: '单号', props: {} },
            {
              type: 'group',
              field: 'items',
              title: '订单明细',
              props: {
                type: 'card',
                title: '明细{index}',
                min: 1,
                max: 5,
                button: true,
                sortBtn: true,
                rule: [
                  { type: 'inputNumber', field: 'qty', title: '数量', props: {} },
                  { type: 'inputNumber', field: 'price', title: '单价', props: {} },
                ],
              },
            },
            {
              type: 'tableForm',
              field: 'delivery_plan',
              title: '交付计划',
              props: {
                addable: true,
                deletable: true,
                showIndex: true,
                filterEmptyColumn: true,
                min: 1,
                max: 10,
                columns: [
                  {
                    label: '阶段',
                    required: false,
                    hidden: false,
                    style: {},
                    formatter: '',
                    fixed: '',
                    rule: [
                      {
                        type: 'select',
                        field: 'stage',
                        title: '阶段',
                        options: [{ label: '开发', value: 'dev' }],
                        props: {},
                      },
                    ],
                  },
                  {
                    label: '备注',
                    required: false,
                    hidden: false,
                    style: {},
                    formatter: '',
                    fixed: '',
                    rule: [{ type: 'input', field: 'remark', title: '备注', props: {} }],
                  },
                ],
              },
            },
            { type: 'subForm', field: 'invoice_info', title: '发票信息', props: { rule: [{ type: 'input', field: 'tax_no', title: '税号', props: {} }] } },
          ],
        },
      },
    ],
    option: {},
    dataSources: [{ id: 'ds_1', refId: 'ref-1', name: '订单数据源' }],
    actions: [],
  }),
) as Record<string, any>

const META = { pageKey: 'nested_container_case', pageName: '嵌套容器', exportedAt: 'spike9' }

function run(src: Record<string, any> = schema) {
  const gen = generatePage(src as any, META)
  const vue = Object.keys(gen.files).find((f) => f.endsWith('.vue'))!
  return { gen, source: gen.files[vue], rev: reverseToSchema(src as any, gen.files[vue], gen.manifest) }
}

const nodeOf = (gen: ReturnType<typeof run>['gen'], type: string, field?: string) =>
  gen.manifest.nodes.find((n) => n.type === type && (!field || n.field === field))!

/** 容器内层的字段子节点（schema 里的相对位置，测试用它定位登记表条目） */
const CONTAINER = 'rule[0]'

describe('嵌套容器契约登记', () => {
  it('三类容器登记了子规则载体与值形态，group/tableForm 是行数组、subForm 是对象', () => {
    expect(TYPE_CONTRACTS.group!.nested).toMatchObject({ carrier: 'props.rule', shape: 'array' })
    expect(TYPE_CONTRACTS.tableForm!.nested).toMatchObject({ carrier: 'props.columns[].rule', shape: 'array' })
    expect(TYPE_CONTRACTS.subForm!.nested).toMatchObject({ carrier: 'props.rule', shape: 'object' })
    // 载体键必须是 children：登记成 prop 透传就是「子树既出模板又整块带走」的双份真相
    expect(TYPE_CONTRACTS.group!.props.rule).toEqual({ emit: 'children' })
    expect(TYPE_CONTRACTS.tableForm!.props.columns).toEqual({ emit: 'children' })
  })

  it('行容器配置键全部有落点，载体之外的键不许静默丢', () => {
    for (const k of ['type', 'title', 'min', 'max', 'button', 'sortBtn']) {
      expect(TYPE_CONTRACTS.group!.props[k]?.emit, `group.${k}`).toBe('config')
    }
    for (const k of ['addable', 'deletable', 'showIndex', 'filterEmptyColumn', 'min', 'max']) {
      expect(TYPE_CONTRACTS.tableForm!.props[k]?.emit, `tableForm.${k}`).toBe('config')
    }
    // 列对象不是 rule 节点，但 label 有真载体，其余按键登记
    expect(TABLE_COLUMN_CONTRACT.label).toEqual({ emit: 'attr', as: 'label', on: 'el-table-column' })
    expect(TABLE_COLUMN_CONTRACT.rule).toEqual({ emit: 'children' })
    expect(TABLE_COLUMN_CONTRACT.formatter!.kind, '运行期 TableForm 不读 formatter').toBe('no-consumer')
    expect(TABLE_COLUMN_CONTRACT.fixed!.kind).toBe('no-consumer')
    expect(TABLE_COLUMN_CONTRACT.required!.kind).toBe('not-in-artifact')
  })

  it('select 有契约了：tableForm 的列里它就是那个 stage 字段', () => {
    const c = TYPE_CONTRACTS.select!
    expect(c.tag).toBe('el-select')
    expect(c.field).toBe(true)
    // form-create 的 select 把 options 挂在 rule 顶层，不在 props 里
    expect(c.self!.options).toEqual({ emit: 'config' })
  })
})

describe('group 出码', () => {
  it('出行容器：v-for 行 + 行别名 v-model，行内字段不再写页面级 form 字段', () => {
    const { source } = run()
    expect(source).toContain('<!-- lc:node=n1.f2 type=group field=items -->')
    expect(source).toMatch(/<div lc:node="n1\.f2" class="lc-nested lc-nested--group">/)
    expect(source).toContain('v-for="(itemsRow, i) in form.items || []"')
    expect(source).toMatch(/<el-input-number v-model="itemsRow\.qty"/)
    expect(source).toMatch(/<el-input-number v-model="itemsRow\.price"/)
    // 行标题的 {index} 由配置常量展开，产物里没有抄第二份标题
    expect(source).toContain('itemsConfig.title.replace(\'{index}\', String(i + 1))')
  })

  it('card 与非 card 两种行壳：type 决定 el-card 还是普通块', () => {
    const { source } = run()
    expect(source).toContain('<el-card')
    const plain = JSON.parse(JSON.stringify(schema))
    plain.rule[0].props.rule[1].props.type = 'simple'
    const p = run(plain)
    expect(p.source).not.toContain('<el-card')
    expect(p.source).toContain('<div class="lc-nested-row"')
  })

  it('行增删与排序按组件语义出 handler：addable 受 max 限、删除受 min 限、排序两端禁用', () => {
    const { gen, source } = run()
    expect(source).toContain('function addItemsRow() { form.items.push({ qty: \'\', price: \'\' }) }')
    expect(source).toContain('function removeItemsRow(i: number) { form.items.splice(i, 1) }')
    expect(source).toContain('function moveItemsRow(i: number, d: number)')
    expect(source).toContain('v-if="itemsConfig.button && (!itemsConfig.max || (form.items || []).length < itemsConfig.max)"')
    expect(source).toContain(':disabled="(form.items || []).length <= itemsConfig.min"')
    expect(source).toContain(':disabled="i === 0"')
    expect(gen.manifest.unsupported.filter((u) => u.type === 'group')).toEqual([])
  })

  it('行配置提到常量并逐键登记重命名：核对的是产物里真在用的那份值', () => {
    const { gen, rev } = run()
    expect(rev.consts).toContain('itemsConfig')
    const node = nodeOf(gen, 'group', 'items')
    // 身份/label 走锚点与 el-form-item（另有三条登记），配置键要求逐键对应到常量成员
    expect(node.renames.filter((r) => r.to.startsWith('const:')).map((r) => [r.from, r.to])).toEqual([
      ['props.type', 'const:itemsConfig.type'],
      ['props.title', 'const:itemsConfig.title'],
      ['props.min', 'const:itemsConfig.min'],
      ['props.max', 'const:itemsConfig.max'],
      ['props.button', 'const:itemsConfig.button'],
      ['props.sortBtn', 'const:itemsConfig.sortBtn'],
    ])
    expect(rev.renameChecks.filter((c) => c.path.startsWith(`${CONTAINER}.props.rule[1].props`)).every((c) => c.ok)).toBe(true)
  })
})

describe('tableForm 出码', () => {
  it('出行编辑表格：el-table 吃容器字段，每列一个 el-table-column 带 label', () => {
    const { source } = run()
    expect(source).toContain('<el-table :data="form.delivery_plan || []"')
    expect(source).toContain('<el-table-column lc:node="n1.f3.c0" label="阶段"')
    expect(source).toContain('<el-table-column lc:node="n1.f3.c1" label="备注"')
    expect(source).toMatch(/<el-table-column v-if="deliveryPlanConfig\.showIndex" type="index"/)
    // 单元格控件绑行别名（现网列头来自 column.label，格内 label 由 CSS 收起）
    expect(source).toMatch(/<el-select v-model="deliveryPlanRow\.stage"/)
    expect(source).toMatch(/<el-input v-model="deliveryPlanRow\.remark"/)
    expect(source).toContain('v-for="opt in stageConfig.options"')
  })

  it('列元数据逐键登记：label 有真载体，其余按丢弃说明', () => {
    const { gen } = run()
    const col = nodeOf(gen, 'tableForm-column')
    expect(col.rulePath).toBe('rule[0].props.rule[2].props.columns[0]')
    expect(col.renames).toEqual([{ from: 'label', to: 'el-table-column@label' }])
    expect(col.warnings.map((w) => [w.path, w.kind])).toEqual([
      ['required', 'not-in-artifact'],
      ['hidden', 'not-in-artifact'],
      ['style', 'not-in-artifact'],
      ['formatter', 'no-consumer'],
      ['fixed', 'no-consumer'],
    ])
    // 列对象没有设计器身份键，别把父节点的丢弃清单套上来
    expect(col.dropped).toEqual([])
  })

  it('添加/删除行按组件条件出，删除列只在 deletable 时存在', () => {
    const { source } = run()
    expect(source).toContain('function addDeliveryPlanRow() { form.delivery_plan.push({ stage: \'\', remark: \'\' }) }')
    expect(source).toContain('function removeDeliveryPlanRow(i: number) { form.delivery_plan.splice(i, 1) }')
    expect(source).toContain('v-if="deliveryPlanConfig.addable && (!deliveryPlanConfig.max || (form.delivery_plan || []).length < deliveryPlanConfig.max)"')
    expect(source).toContain('v-if="deliveryPlanConfig.deletable"')
    expect(source).toContain(':disabled="(form.delivery_plan || []).length <= deliveryPlanConfig.min"')
  })
})

describe('subForm 出码', () => {
  it('对象形态：子字段绑 form.<容器字段>.<子字段>，容器字段初值是对象不是空串', () => {
    const { gen, source } = run()
    expect(source).toMatch(/<div lc:node="n1\.f4" class="lc-nested lc-nested--sub">/)
    expect(source).toMatch(/<el-input v-model="form\.invoice_info\.tax_no"/)
    const form = source.match(/const form = reactive<Record<string, any>>\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    expect(form).toContain('invoice_info: {}')
    expect(form).toContain('items: []')
    expect(form).toContain('delivery_plan: []')
    expect(gen.manifest.unsupported.filter((u) => u.type === 'subForm')).toEqual([])
  })

  it('打开容器时按形态重置：行容器回到空数组，子表单回到空对象', () => {
    const { source } = run()
    expect(source).toContain('form.items = []')
    expect(source).toContain('form.delivery_plan = []')
    expect(source).toContain('form.invoice_info = {}')
  })
})

describe('回读与登记表', () => {
  it('合成页零空洞、零重命名失败：嵌套容器子树都真能回读', () => {
    const { gen, rev } = run()
    expect(rev.holes, JSON.stringify(rev.holes)).toEqual([])
    expect(rev.renameChecks.filter((c) => !c.ok), JSON.stringify(rev.renameChecks.filter((c) => !c.ok))).toEqual([])
    const back = (rev.rebuilt as any).rule[0].props.rule
    expect(back[1].props.type).toBe('card')
    expect(back[1].props.title).toBe('明细{index}')
    expect(back[1].props.max).toBe(5)
    expect(back[2].props.columns[0].label).toBe('阶段')
    expect(back[2].props.columns[0].rule[0].field).toBe('stage')
    // formatter 是被登记丢弃的（运行期无消费者），回读不补回 —— 它由清单的 warnings 解释，不是产物真相
    expect(back[2].props.columns[0].formatter).toBeUndefined()
    expect(
      gen.manifest.nodes.find((n) => n.type === 'tableForm-column')!.warnings.map((w) => w.path),
    ).toContain('formatter')
  })

  it('语料卡片页的三个嵌套容器出码后仍零 C 桶：整页回读零空洞', () => {
    const { rev } = run(cardlist as Record<string, any>)
    expect(rev.holes, JSON.stringify(rev.holes.slice(0, 8))).toEqual([])
  })

  it('嵌套容器的子字段不再被当成页面级 form 字段（form 里只有容器自己的字段）', () => {
    const { source } = run()
    const form = source.match(/const form = reactive<Record<string, any>>\(\{([\s\S]*?)\}\)/)?.[1] ?? ''
    expect(form).toContain('order_no: ')
    expect(form).not.toContain('qty: ')
    expect(form).not.toContain('tax_no: ')
  })

  it('行内字段的带回与注入首版不接：没有 form.<字段> 可写，记语义债而不是假接线', () => {
    const withRowPicker = JSON.parse(JSON.stringify(schema)) as Record<string, any>
    withRowPicker.rule[0].props.rule[1].props.rule.push({
      type: 'LookupPicker',
      field: 'customer',
      title: '客户',
      props: { dataSourceId: 'ds_1', idField: 'customer_id', returnFields: { contact: 'contact_name' } },
    })
    const withRowFormula = JSON.parse(JSON.stringify(schema)) as Record<string, any>
    withRowFormula.rule[0].props.rule[3].props.rule.push({
      type: 'FormulaField',
      field: 'tax_calc',
      title: '税额',
      props: { expression: '${tax_no} * 0.06' },
    })
    const g1 = run(withRowPicker)
    expect(g1.gen.manifest.unsupported.some((u) => u.key === 'writes' && /嵌套容器/.test(u.message)), JSON.stringify(g1.gen.manifest.unsupported)).toBe(true)
    expect(g1.source).not.toMatch(/<LookupPicker[^>]*@select=/)
    const g2 = run(withRowFormula)
    expect(g2.gen.manifest.unsupported.some((u) => u.key === 'formCreateInject' && /嵌套容器/.test(u.message))).toBe(true)
    expect(g2.source).not.toMatch(/tax_calc[^>]*:form-create-inject=/)
  })

  it('页面级（容器外）的嵌套容器：没有 form 后端，整节点降级记债，props 逐键登记丢弃', () => {
    const orphan = JSON.parse(JSON.stringify(schema)) as Record<string, any>
    const g = orphan.rule[0].props.rule[1]
    orphan.rule[0].props.rule.splice(1, 1)
    orphan.rule.push(g)
    const { gen, source, rev } = run(orphan)
    expect(gen.manifest.unsupported.some((u) => u.type === 'group' && u.key === 'nested'), JSON.stringify(gen.manifest.unsupported)).toBe(true)
    expect(source).toContain('lc:todo node=n2 type=group field=items')
    expect(rev.holes, JSON.stringify(rev.holes)).toEqual([])
  })
})
