// ----- TDD: ColumnConfigDialog 列映射 —— dataPicker 隐藏列/多选组件必须避开 VARCHAR 255 上限 -----
// npx vitest run src/views/form/components/__tests__/ColumnConfigDialog.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus, { ElSelect } from 'element-plus'
import ColumnConfigDialog from '../ColumnConfigDialog.vue'

const schema = [
  { type: 'input', field: 'reason', title: '请假原因' },
  {
    type: 'dataPicker',
    field: 'emp_ref',
    title: '员工',
    props: { sourceFormKey: 'emp_profile', displayField: 'name', maxCount: 1 },
  },
  { type: 'checkbox', field: 'tags', title: '标签' },
  { type: 'multiSelect', field: 'depts', title: '部门' },
]

/** LookupPicker（查找带回）schema：单选，发布时应能映射为数据列 */
const lookupSchema = [
  { type: 'input', field: 'reason', title: '请假原因' },
  {
    type: 'LookupPicker',
    field: 'emp_lookup',
    title: '员工查找',
    props: {
      sourceType: 'form',
      displayField: 'name',
      columns: [{ prop: 'name', label: '员工名称' }],
      idField: 'emp_lookup_id',
      fetch: { action: '/v1/biz-data/emp_profile' },
    },
  },
]

function createWrapper(overrides: Record<string, any> = {}) {
  return mount(ColumnConfigDialog, {
    props: {
      modelValue: false,
      schema,
      formName: '测试表单',
      ...overrides,
    },
    global: { plugins: [ElementPlus] },
  })
}

/** 打开弹窗触发 buildDraft（v-model 从 false → true） */
async function openAndBuild(wrapper: any) {
  await wrapper.setProps({ modelValue: true })
  await nextTick()
}

function confirmItems(wrapper: any): any[] {
  const btn = wrapper.findAll('button').find(b => b.text().includes('确认发布'))
  ;(btn as any)?.trigger('click')
  return wrapper.emitted('confirm')?.at(-1)?.[0] || []
}

/** dataPicker 多选 schema：主 id 列存 JSON id 数组（["u1","u2"]），长度无上限 */
const dataPickerMultipleSchema = [
  {
    type: 'dataPicker',
    field: 'emp_refs',
    title: '员工',
    props: { sourceFormKey: 'emp_profile', displayField: 'name', maxCount: 3 },
  },
]

describe('ColumnConfigDialog — 长文本列类型（VARCHAR 255 上限规避）', () => {
  it('dataPicker 的 _text 隐藏列映射为 TEXT（无长度上限）而非 VARCHAR(1024)', async () => {
    const wrapper = createWrapper()
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const textCol = items.find(i => i.key === 'emp_ref_text')
    expect(textCol).toBeDefined()
    expect(textCol.columnType).toBe('TEXT')
    expect(textCol.length).toBeNull()
    expect(textCol.hidden).toBe(true)
    wrapper.unmount()
  })

  it('dataPicker 主 id 列映射为 TEXT（JSON id 数组存储，长度不可控）', async () => {
    const wrapper = createWrapper()
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const idCol = items.find(i => i.key === 'emp_ref')
    expect(idCol?.columnType).toBe('TEXT')
    expect(idCol?.length).toBeNull()
    wrapper.unmount()
  })

  it('dataPicker 多选（maxCount>1）主 id 列同样为 TEXT', async () => {
    const wrapper = createWrapper({ schema: dataPickerMultipleSchema })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const idCol = items.find(i => i.key === 'emp_refs')
    expect(idCol).toBeDefined()
    expect(idCol.columnType).toBe('TEXT')
    expect(idCol.length).toBeNull()
    // 冗余显示列仍存在
    expect(items.find(i => i.key === 'emp_refs_text')).toBeDefined()
    wrapper.unmount()
  })

  it('checkbox 多选组件映射为 JSON（与后端 ColumnTypeMapper 对齐）', async () => {
    const wrapper = createWrapper()
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const tags = items.find(i => i.key === 'tags')
    expect(tags?.columnType).toBe('JSON')
    expect(tags?.length).toBeNull()
    wrapper.unmount()
  })

  it('multiSelect 多选组件映射为 JSON（与后端 ColumnTypeMapper 对齐）', async () => {
    const wrapper = createWrapper()
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const depts = items.find(i => i.key === 'depts')
    expect(depts?.columnType).toBe('JSON')
    expect(depts?.length).toBeNull()
    wrapper.unmount()
  })
})

describe('ColumnConfigDialog — LookupPicker（查找带回）列映射', () => {
  it('LookupPicker 单选映射为 VARCHAR(255)，不被标记 unsupported', async () => {
    const wrapper = createWrapper({ schema: lookupSchema })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const col = items.find(i => i.key === 'emp_lookup')
    expect(col).toBeDefined()
    expect(col.columnType).toBe('VARCHAR')
    expect(col.length).toBe(255)
    expect(col.unsupported).toBeFalsy()
    wrapper.unmount()
  })

  it('LookupPicker 列携带 pickerConfig（mode/displayField），供列表展示解析', async () => {
    const wrapper = createWrapper({ schema: lookupSchema })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const col = items.find(i => i.key === 'emp_lookup')
    expect(col).toBeDefined()
    expect(col.pickerConfig).toBeTruthy()
    const pc = JSON.parse(col.pickerConfig as string)
    expect(pc.mode).toBe('single')
    expect(pc.displayField).toBe('name')
    expect(pc.sourceFormKey).toBe('emp_profile')
    expect(pc.pickerType).toBe('lookupPicker')
    wrapper.unmount()
  })

  it('dataPicker 列 pickerConfig 携带 pickerType=dataPicker 与 maxCount（后端据此生成 _text 冗余文本）', async () => {
    const wrapper = createWrapper()
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const col = items.find(i => i.key === 'emp_ref')
    expect(col).toBeDefined()
    const pc = JSON.parse(col.pickerConfig as string)
    expect(pc.pickerType).toBe('dataPicker')
    expect(pc.maxCount).toBe(1)
    wrapper.unmount()
  })

  it('LookupPicker 不产生 unsupportedFields（确认发布按钮可用）', async () => {
    const wrapper = createWrapper({ schema: lookupSchema })
    await openAndBuild(wrapper)
    const btn = wrapper.findAll('button').find(b => b.text().includes('确认发布'))
    expect((btn as any)?.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('不支持映射为数据列的字段')
    wrapper.unmount()
  })
})

describe('ColumnConfigDialog — mapComponentToColumn 扩展组件映射（与后端 ColumnTypeMapper 逐 case 对齐）', () => {
  const extSchema = (type: string, props: Record<string, any> = {}) => [
    { type, field: 'f1', title: '字段', props },
  ]

  it('rate → INT', async () => {
    const wrapper = createWrapper({ schema: extSchema('rate') })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('INT')
    expect(col?.length).toBeNull()
    wrapper.unmount()
  })

  it('colorPicker → VARCHAR(16)', async () => {
    const wrapper = createWrapper({ schema: extSchema('colorPicker') })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('VARCHAR')
    expect(col?.length).toBe(16)
    wrapper.unmount()
  })

  it('tree 单选（showCheckbox=false）→ VARCHAR(255)', async () => {
    const wrapper = createWrapper({ schema: extSchema('tree', { showCheckbox: false }) })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('VARCHAR')
    expect(col?.length).toBe(255)
    wrapper.unmount()
  })

  it('tree 多选（showCheckbox=true）→ JSON', async () => {
    const wrapper = createWrapper({ schema: extSchema('tree', { showCheckbox: true }) })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('JSON')
    expect(col?.length).toBeNull()
    wrapper.unmount()
  })

  it('tree 多选（multiple=true）→ JSON', async () => {
    const wrapper = createWrapper({ schema: extSchema('tree', { multiple: true }) })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('JSON')
    expect(col?.length).toBeNull()
    wrapper.unmount()
  })

  it('elTreeSelect 单选（multiple=false）→ VARCHAR(255)', async () => {
    const wrapper = createWrapper({ schema: extSchema('elTreeSelect', { multiple: false }) })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('VARCHAR')
    expect(col?.length).toBe(255)
    wrapper.unmount()
  })

  it('elTreeSelect 多选（multiple=true）→ JSON', async () => {
    const wrapper = createWrapper({ schema: extSchema('elTreeSelect', { multiple: true }) })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('JSON')
    expect(col?.length).toBeNull()
    wrapper.unmount()
  })

  it('elTransfer → JSON', async () => {
    const wrapper = createWrapper({ schema: extSchema('elTransfer') })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('JSON')
    expect(col?.length).toBeNull()
    wrapper.unmount()
  })

  it('fcEditor → TEXT', async () => {
    const wrapper = createWrapper({ schema: extSchema('fcEditor') })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('TEXT')
    expect(col?.length).toBeNull()
    wrapper.unmount()
  })

  it('signaturePad → TEXT', async () => {
    const wrapper = createWrapper({ schema: extSchema('signaturePad') })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('TEXT')
    expect(col?.length).toBeNull()
    wrapper.unmount()
  })

  it('subForm → JSON 且 hidden=true（不进列表，仅参与 CRUD 写入）', async () => {
    const wrapper = createWrapper({ schema: extSchema('subForm') })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const col = items.find(i => i.key === 'f1')
    expect(col).toBeDefined()
    expect(col?.columnType).toBe('JSON')
    expect(col?.hidden).toBe(true)
    wrapper.unmount()
  })

  it('隐藏组件（elTransfer/tree/elTreeSelect/fcEditor/cascader/signaturePad）均标记 hidden', async () => {
    for (const type of ['elTransfer', 'tree', 'elTreeSelect', 'fcEditor', 'cascader', 'signaturePad']) {
      const wrapper = createWrapper({ schema: extSchema(type) })
      await openAndBuild(wrapper)
      const items = confirmItems(wrapper)
      const col = items.find(i => i.key === 'f1')
      expect(col?.hidden).toBe(true)
      wrapper.unmount()
    }
  })

  it('草案携带 componentType（= rule.type）', async () => {
    const wrapper = createWrapper({ schema: extSchema('elTransfer') })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const col = items.find(i => i.key === 'f1')
    expect(col?.componentType).toBe('elTransfer')
    wrapper.unmount()
  })

  it('dataPicker 双列携带 componentType（id=dataPicker、_text=dataPickerText）', async () => {
    const wrapper = createWrapper({ schema: [{ type: 'dataPicker', field: 'emp', title: '引用', props: { sourceFormKey: 'x', displayField: 'name' } }] as any })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const idCol = items.find(i => i.key === 'emp')
    const textCol = items.find(i => i.key === 'emp_text')
    expect(idCol?.componentType).toBe('dataPicker')
    expect(textCol?.componentType).toBe('dataPickerText')
    wrapper.unmount()
  })

  it('subForm 不产生 unsupportedFields（确认发布按钮可用）', async () => {
    const wrapper = createWrapper({ schema: extSchema('subForm') })
    await openAndBuild(wrapper)
    const btn = wrapper.findAll('button').find(b => b.text().includes('确认发布'))
    expect((btn as any)?.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('不支持映射为数据列的字段')
    wrapper.unmount()
  })

  it('multiSelectPro → JSON', async () => {
    const wrapper = createWrapper({ schema: extSchema('multiSelectPro') })
    await openAndBuild(wrapper)
    const col = confirmItems(wrapper).find(i => i.key === 'f1')
    expect(col?.columnType).toBe('JSON')
    expect(col?.length).toBeNull()
    wrapper.unmount()
  })

  it('TEXT/LONGTEXT 与 VARCHAR 同属字符串类，不触发跨类锁定（与后端 categoryOf 对齐）', async () => {
    const wrapper = createWrapper({
      schema: extSchema('fcEditor'),
      existingColumns: [{ key: 'f1', columnType: 'TEXT', length: null, scale: null, required: false, unique: false, indexed: false }],
    })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const col = items.find(i => i.key === 'f1')
    // 隐藏组件不渲染列类型选择器，但草案保留 columnType 且不标记 unsupported
    expect(col).toBeDefined()
    expect(col?.unsupported).toBeUndefined()
    wrapper.unmount()
  })
})

// ----- 真实场景（ref_test 表单）：group 子表内部字段存放在 props.rule（fcRow/col 布局嵌套） -----
// 子表组件（group/tableForm）内部字段在 props.rule / props.columns[].rule，而不是 children。
// 发布列映射必须穿透这些结构提取子列，否则子列为空 → 被标记 unsupported 阻止发布。
const groupSubtableSchema = [
  { type: 'input', field: 'dept_name', title: '部门名称' },
  {
    type: 'group',
    field: 'sub_form1',
    title: '子表单',
    props: {
      rule: [
        {
          type: 'fcRow',
          children: [
            {
              type: 'col',
              props: { span: 12 },
              children: [
                { type: 'LookupPicker', field: 'sub_lookup', title: '子表查找带回', props: {} },
              ],
            },
            {
              type: 'col',
              props: { span: 12 },
              children: [
                { type: 'dataPicker', field: 'sub_dataPicker', title: '子表数据引用', props: {} },
              ],
            },
          ],
        },
      ],
    },
  },
]

const tableFormSubtableSchema = [
  {
    type: 'tableForm',
    field: 'table_items',
    title: '费用明细表',
    props: {
      columns: [
        {
          label: '项目名称',
          required: false,
          hidden: false,
          style: {},
          rule: [{ type: 'input', field: 'item_name', title: '项目名称' }],
        },
        {
          label: '金额',
          required: false,
          hidden: false,
          style: {},
          rule: [{ type: 'inputNumber', field: 'amount', title: '金额', props: { precision: 2 } }],
        },
      ],
    },
  },
]

describe('ColumnConfigDialog — 子表组件（group/tableForm）子列穿透', () => {
  it('group 子表内部字段存放于 props.rule（fcRow/col 布局）：提取子列且不标记 unsupported', async () => {
    const wrapper = createWrapper({ schema: groupSubtableSchema })
    await openAndBuild(wrapper)
    // 子表字段应生成 subColumns，而非 unsupported
    const items = confirmItems(wrapper)
    const sub = items.find(i => i.key === 'sub_form1')
    expect(sub).toBeDefined()
    expect(sub.unsupported).toBeFalsy()
    // LookupPicker → VARCHAR(255) 单列；dataPicker → TEXT id 列 + 隐藏 _text 列（与顶层一致）
    const lookup = sub.subColumns?.find((c: any) => c.key === 'sub_lookup')
    expect(lookup).toBeDefined()
    expect(lookup.columnType).toBe('VARCHAR')
    expect(lookup.length).toBe(255)
    expect(lookup.unsupported).toBeFalsy()
    const dp = sub.subColumns?.find((c: any) => c.key === 'sub_dataPicker')
    expect(dp).toBeDefined()
    expect(dp.columnType).toBe('TEXT')
    expect(dp.unsupported).toBeFalsy()
    const dpText = sub.subColumns?.find((c: any) => c.key === 'sub_dataPicker_text')
    expect(dpText).toBeDefined()
    expect(dpText.hidden).toBe(true)
    // 弹窗不应提示"不支持映射为数据列的字段"
    expect(wrapper.text()).not.toContain('不支持映射为数据列的字段')
    // 子表区域不应提示"没有可映射子列"
    expect(wrapper.text()).not.toContain('子表没有可映射子列')
    wrapper.unmount()
  })

  it('tableForm 子表内部字段存放于 props.columns[].rule：提取子列且不标记 unsupported', async () => {
    const wrapper = createWrapper({ schema: tableFormSubtableSchema })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const sub = items.find(i => i.key === 'table_items')
    expect(sub).toBeDefined()
    expect(sub.unsupported).toBeFalsy()
    expect(sub.subColumns?.length).toBe(2)
    const keys = sub.subColumns?.map((c: any) => c.key)
    expect(keys).toContain('item_name')
    expect(keys).toContain('amount')
    expect(wrapper.text()).not.toContain('不支持映射为数据列的字段')
    wrapper.unmount()
  })

  it('确认发布按钮可用（汇总 unsupportedFields 不应包含子表字段）', async () => {
    const wrapper = createWrapper({ schema: groupSubtableSchema })
    await openAndBuild(wrapper)
    const btn = wrapper.findAll('button').find(b => b.text().includes('确认发布'))
    expect((btn as any)?.attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})

describe('ColumnConfigDialog — 数据表格组件发布忽略', () => {
  const dataTableSchema = [
    { type: 'input', field: 'reason', title: '请假原因' },
    {
      type: 'page-table',
      field: 'table_data',
      title: '数据表格',
      props: { dataSourceId: 'ds_1', columns: [] },
    },
  ]

  it('page-table 不生成数据列，且不阻止发布', async () => {
    const wrapper = createWrapper({ schema: dataTableSchema })
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    // 数据表格字段被整体忽略，不进入列映射
    expect(items.find(i => i.key === 'table_data')).toBeUndefined()
    // 其余普通字段正常映射
    expect(items.find(i => i.key === 'reason')).toBeDefined()
    // 不作为"不支持映射"字段拦截发布
    expect(wrapper.text()).not.toContain('不支持映射为数据列的字段')
    wrapper.unmount()
  })
})
