// ----- TDD: ColumnConfigDialog 列映射 —— dataPicker 隐藏列/多选组件必须避开 VARCHAR 255 上限 -----
// npx vitest run src/views/form/components/__tests__/ColumnConfigDialog.test.ts

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
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

  it('checkbox 多选组件映射为 TEXT 而非 VARCHAR(1024)', async () => {
    const wrapper = createWrapper()
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const tags = items.find(i => i.key === 'tags')
    expect(tags?.columnType).toBe('TEXT')
    expect(tags?.length).toBeNull()
    wrapper.unmount()
  })

  it('multiSelect 多选组件映射为 TEXT 而非 VARCHAR(1024)', async () => {
    const wrapper = createWrapper()
    await openAndBuild(wrapper)
    const items = confirmItems(wrapper)
    const depts = items.find(i => i.key === 'depts')
    expect(depts?.columnType).toBe('TEXT')
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
