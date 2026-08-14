// ----- TDD: DataPicker 组件测试 -----
// npx vitest run src/views/form/components/__tests__/DataPicker.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import DataPicker from '../DataPicker.vue'

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushMock }),
}))

vi.mock('@/api/bizData', () => ({
  bizDataApi: {
    list: vi.fn().mockResolvedValue({
      data: {
        records: [{ id: 't1', data: { name: '张三', dept: '研发' } }, { id: 't2', data: { name: '李四', dept: '市场' } }],
        total: 2,
      },
    }),
    resolve: vi.fn().mockResolvedValue({ data: { t1: '张三', t2: '李四' } }),
    detail: vi.fn().mockResolvedValue({
      data: { id: 't1', data: { name: '张三', dept: '研发' }, version: 1, createdAt: '', updatedAt: '' },
    }),
  },
}))

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitionByKey: vi.fn().mockResolvedValue({
      data: {
        columnConfig: JSON.stringify([
          { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 255, scale: null, required: false, unique: false, indexed: false },
          { key: 'dept', label: '部门', columnType: 'VARCHAR', length: 255, scale: null, required: false, unique: false, indexed: false },
        ]),
      },
    }),
  },
}))

import { bizDataApi } from '@/api/bizData'
import { formApi } from '@/api/form'

/** DataPickerCreateDialog 桩：验证"新增"入口交互 */
const CreateDialogStub = defineComponent({
  props: ['visible', 'sourceFormKey'],
  emits: ['update:visible', 'success'],
  setup() {
    return () => h('div', { class: 'create-dialog-stub' })
  },
})

function createWrapper(props: any = {}, injectObj: any = {}) {
  return mount(DataPicker, {
    props: {
      modelValue: '',
      sourceFormKey: 'emp_profile',
      displayField: 'name',
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      provide: {
        formCreateInject: injectObj,
      },
      stubs: { DataPickerCreateDialog: CreateDialogStub },
    },
  })
}

/** 取当前渲染的 tag 文本列表（排除"选择"按钮等） */
function tagTexts(wrapper: any): string[] {
  return wrapper.findAll('.data-picker__tag').map(w => w.text().trim())
}

describe('DataPicker — 基础渲染', () => {
  it('空值时渲染可点击输入框', () => {
    const wrapper = createWrapper()
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('readonly 时不打开弹窗', async () => {
    const wrapper = createWrapper({ readonly: true })
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog')).toBeFalsy()
  })
})

describe('DataPicker — 选择交互', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('点击输入框打开弹窗并查询（page 0 起）', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    expect(document.body.querySelector('.el-dialog')).toBeTruthy()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({ page: 0, size: 10 }),
    )
  })

  it('弹窗列头显示目标表单列的中文 label（非英文 key）', async () => {
    const wrapper = createWrapper({ columns: ['name', 'dept'] })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('emp_profile')
    const headers = Array.from(document.body.querySelectorAll('.el-table__header th'))
      .map(th => (th as HTMLElement).textContent?.trim())
    expect(headers).toContain('姓名')
    expect(headers).toContain('部门')
    expect(headers).not.toContain('name')
    wrapper.unmount()
  })

  it('列表单元格取值兼容 BizDataVO 内层（row.data[key]）并显示文本', async () => {
    const wrapper = createWrapper({ columns: ['name', 'dept'] })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    const cells = Array.from(document.body.querySelectorAll('.el-table__body tbody tr:first-child td'))
      .map(td => (td as HTMLElement).textContent?.trim())
    expect(cells).toContain('张三')
    expect(cells).toContain('研发')
    wrapper.unmount()
  })

  it('搜索框 placeholder 显示目标显示字段的中文 label', async () => {
    const wrapper = createWrapper({ displayField: 'name' })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    const searchInput = document.body.querySelector('.el-dialog .el-input__inner') as HTMLInputElement
    expect(searchInput?.placeholder).toBe('搜索姓名')
    wrapper.unmount()
  })

  it('单选选中行后回显为 Tag 并显示"选择"按钮', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    const row = document.body.querySelector('.el-table__body tbody tr')
    ;(row as HTMLElement)?.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['t1'])
    // 父级回写 modelValue 后回显 Tag
    await wrapper.setProps({ modelValue: 't1' })
    await nextTick()
    expect(tagTexts(wrapper)).toEqual(['张三'])
    expect(wrapper.find('.data-picker__select-btn').exists()).toBe(true)
    // 有值时不再显示输入框
    expect(wrapper.find('input').exists()).toBe(false)
    wrapper.unmount()
  })

  it('多选确认后回显多个 Tag', async () => {
    const wrapper = createWrapper({ mode: 'multiple' })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    // 勾选两行
    const checkboxes = Array.from(document.body.querySelectorAll('.el-table__body tbody tr .el-checkbox'))
    ;(checkboxes[0] as HTMLElement).click()
    await nextTick()
    ;(checkboxes[1] as HTMLElement).click()
    await nextTick()
    const confirmBtn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === '确定')
    ;(confirmBtn as HTMLButtonElement)?.click()
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['t1,t2'])
    await wrapper.setProps({ modelValue: 't1,t2' })
    await nextTick()
    expect(tagTexts(wrapper)).toEqual(['张三', '李四'])
    wrapper.unmount()
  })

  it('多选点 x 移除单个 Tag：剔除该 id 保留其余', async () => {
    const wrapper = createWrapper({
      modelValue: 't1,t2',
      displayText: '张三,李四',
      mode: 'multiple',
    })
    await flushPromises()
    const tags = wrapper.findAll('.data-picker__tag')
    expect(tags.length).toBe(2)
    // 点击第一个 tag 的 close 角标
    await tags[0].find('.el-tag__close').trigger('click')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['t2'])
    expect(wrapper.emitted('update:displayText')?.at(-1)).toEqual(['李四'])
    wrapper.unmount()
  })

  it('单选点 x 移除后清空并回到输入框形态', async () => {
    const wrapper = createWrapper({ modelValue: 't1', displayText: '张三' })
    await flushPromises()
    const tag = wrapper.find('.data-picker__tag')
    await tag.find('.el-tag__close').trigger('click')
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    // 父级回写空值后回到输入框形态
    await wrapper.setProps({ modelValue: '' })
    await nextTick()
    expect(wrapper.find('input').exists()).toBe(true)
    wrapper.unmount()
  })

  it('点击 Tag 主体弹出记录详情表单', async () => {
    const wrapper = createWrapper({ modelValue: 't1', displayText: '张三' })
    await flushPromises()
    const tag = wrapper.find('.data-picker__tag')
    expect(tag.exists()).toBe(true)
    await tag.trigger('click')
    await nextTick()
    await flushPromises()
    // 点击 Tag 打开详情弹窗并加载记录（不再跳转页面）
    expect(bizDataApi.detail).toHaveBeenCalledWith('emp_profile', 't1')
    const dialog = document.body.querySelector('.el-dialog')
    const dialogText = dialog ? (dialog as HTMLElement).textContent || '' : ''
    expect(dialogText).toContain('姓名')
    expect(dialogText).toContain('张三')
    wrapper.unmount()
  })

  it('只读态 Tag 无 x 角标（不可移除）', async () => {
    const wrapper = createWrapper({ modelValue: 't1', displayText: '张三', readonly: true })
    await flushPromises()
    const tags = wrapper.findAll('.data-picker__tag')
    expect(tags.length).toBe(1)
    expect(tags[0].find('.el-tag__close').exists()).toBe(false)
    // 只读态无"选择"按钮
    expect(wrapper.find('.data-picker__select-btn').exists()).toBe(false)
    wrapper.unmount()
  })

  it('不再支持 returnFields 回填（传入该 prop 也不写入其他字段）', async () => {
    const setValue = vi.fn()
    const wrapper = createWrapper(
      {
        returnFields: { name: 'emp_name' },
      },
      { api: { setValue } },
    )
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    const row = document.body.querySelector('.el-table__body tbody tr')
    ;(row as HTMLElement)?.click()
    await nextTick()
    expect(setValue).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('DataPicker — filters 结构化与级联保留', () => {
  it('filters static 条件参与查询（结构化）', async () => {
    const wrapper = createWrapper({
      filters: {
        logic: 'AND',
        conditions: [{ column: 'status', op: 'eq', value: 'active' }],
      },
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({
        filter: {
          logic: 'AND',
          conditions: [{ column: 'status', op: 'eq', value: 'active' }],
        },
      }),
    )
    wrapper.unmount()
  })

  it('filters field 条件取当前表单字段值参与查询', async () => {
    const wrapper = createWrapper(
      {
        filters: {
          logic: 'AND',
          conditions: [{ column: 'dept', op: 'eq', field: 'dept_field' }],
        },
      },
      { api: { getValue: () => 'rd', setValue: vi.fn() } },
    )
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({
        filter: {
          logic: 'AND',
          conditions: [{ column: 'dept', op: 'eq', value: 'rd' }],
        },
      }),
    )
    wrapper.unmount()
  })

  it('filters 支持 ne/like/isEmpty 等 op 透传', async () => {
    const wrapper = createWrapper({
      filters: {
        logic: 'OR',
        conditions: [
          { column: 'status', op: 'ne', value: 'closed' },
          { column: 'name', op: 'like', value: '张' },
          { column: 'dept', op: 'isEmpty' },
        ],
      },
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({
        filter: {
          logic: 'OR',
          conditions: [
            { column: 'status', op: 'ne', value: 'closed' },
            { column: 'name', op: 'like', value: '张' },
            { column: 'dept', op: 'isEmpty' },
          ],
        },
      }),
    )
    wrapper.unmount()
  })

  it('dependOn 兼容：归一化为 field 型 filter', async () => {
    const wrapper = createWrapper(
      { dependOn: { field: 'dept_field', sourceColumn: 'dept' } },
      { api: { getValue: () => 'rd', setValue: vi.fn() } },
    )
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({
        filter: {
          logic: 'AND',
          conditions: [{ column: 'dept', op: 'eq', value: 'rd' }],
        },
      }),
    )
    wrapper.unmount()
  })

  it('依赖字段变化时默认保留已选值（不清空）', async () => {
    const wrapper = createWrapper(
      {
        modelValue: 't1',
        displayText: '张三',
        dependOn: { field: 'dept_field', sourceColumn: 'dept' },
        dependOnValue: 'rd',
      },
      { api: { getValue: () => 'mk', setValue: vi.fn() } },
    )
    await wrapper.setProps({ dependOnValue: 'mk' })
    await nextTick()
    // 默认 clearOnCascadeChange=false：保留已选值，不清空
    expect(wrapper.emitted('update:modelValue')).toBeFalsy()
    expect(tagTexts(wrapper)).toEqual(['张三'])
    wrapper.unmount()
  })

  it('clearOnCascadeChange=true 时依赖字段变化清空选择值', async () => {
    const wrapper = createWrapper({
      modelValue: 't1',
      displayText: '张三',
      clearOnCascadeChange: true,
      dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      dependOnValue: 'rd',
    })
    await wrapper.setProps({ dependOnValue: 'mk' })
    await nextTick()
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([''])
    wrapper.unmount()
  })
})

describe('DataPicker — 悬空降级', () => {
  it('resolve 缺失 id 时编辑态 Tag 显示删除提示', async () => {
    ;(bizDataApi.resolve as any).mockResolvedValueOnce({ data: {} })
    const wrapper = createWrapper({ modelValue: 't1' })
    await flushPromises()
    expect(tagTexts(wrapper)).toEqual(['引用数据已删除'])
    wrapper.unmount()
  })

  it('resolve 缺失 id 时只读态 Tag 显示原始 id', async () => {
    ;(bizDataApi.resolve as any).mockResolvedValueOnce({ data: {} })
    const wrapper = createWrapper({ modelValue: 't1', readonly: true })
    await flushPromises()
    expect(tagTexts(wrapper)).toEqual(['t1'])
    wrapper.unmount()
  })
})

describe('DataPicker — 允许新增', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('allowCreate=true 时选择弹窗显示"新增"按钮', async () => {
    const wrapper = createWrapper({ allowCreate: true })
    await wrapper.find('input').trigger('click')
    await nextTick()
    const btn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === '新增')
    expect(btn).toBeTruthy()
    wrapper.unmount()
  })

  it('allowCreate=false（默认）时不显示"新增"按钮', async () => {
    const wrapper = createWrapper()
    await wrapper.find('input').trigger('click')
    await nextTick()
    const btn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === '新增')
    expect(btn).toBeFalsy()
    wrapper.unmount()
  })
})

describe('DataPicker — 搜索列', () => {
  it('searchColumns 参与 keywordColumn 请求', async () => {
    const wrapper = createWrapper({ searchColumns: ['name', 'dept'] })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    // 输入关键字后查询带 keywordColumn=搜索列逗号串
    const searchInput = document.body.querySelector('.el-dialog .el-input__inner') as HTMLInputElement
    await wrapper.setData?.({}) // noop 保持类型
    searchInput.value = '张'
    searchInput.dispatchEvent(new Event('input'))
    await nextTick()
    const btn = Array.from(document.body.querySelectorAll('button')).find(b => b.textContent === '搜索')
    ;(btn as HTMLButtonElement)?.click()
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenLastCalledWith(
      'emp_profile',
      expect.objectContaining({ keyword: '张', keywordColumn: 'name,dept' }),
    )
    wrapper.unmount()
  })

  it('搜索框 placeholder 按搜索列中文 label 拼接', async () => {
    const wrapper = createWrapper({ searchColumns: ['name', 'dept'] })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    const searchInput = document.body.querySelector('.el-dialog .el-input__inner') as HTMLInputElement
    expect(searchInput?.placeholder).toBe('搜索姓名/部门')
    wrapper.unmount()
  })

  it('未配置搜索列时默认按显示字段搜索', async () => {
    const wrapper = createWrapper({ displayField: 'name' })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    const searchInput = document.body.querySelector('.el-dialog .el-input__inner') as HTMLInputElement
    expect(searchInput?.placeholder).toBe('搜索姓名')
    wrapper.unmount()
  })
})

describe('DataPicker — 级联与回显', () => {
  it('dependOnValue 存在时列表查询带 filter', async () => {
    const wrapper = createWrapper({
      dependOn: { field: 'dept_field', sourceColumn: 'dept' },
      dependOnValue: 'rd',
    })
    await wrapper.find('input').trigger('click')
    await nextTick()
    await flushPromises()
    expect(bizDataApi.list).toHaveBeenCalledWith(
      'emp_profile',
      expect.objectContaining({
        filter: {
          logic: 'AND',
          conditions: [{ column: 'dept', op: 'eq', value: 'rd' }],
        },
      }),
    )
    wrapper.unmount()
  })

  it('modelValue 有值时 resolve 补全显示文本并以 Tag 展示', async () => {
    const wrapper = createWrapper({ modelValue: 't1' })
    await flushPromises()
    expect(bizDataApi.resolve).toHaveBeenCalledWith('emp_profile', ['t1'], 'name')
    expect(tagTexts(wrapper)).toEqual(['张三'])
    wrapper.unmount()
  })
})
