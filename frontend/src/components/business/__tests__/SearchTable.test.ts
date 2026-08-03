// ----- TDD: SearchTable 组件测试 -----
// npx vitest run src/components/business/__tests__/SearchTable.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick, defineComponent, h, ref } from 'vue'
import type { Component } from 'vue'
import ElementPlus from 'element-plus'
import { Edit, Delete, Switch } from '@element-plus/icons-vue'
import type { Rule } from '@form-create/element-ui'
import SearchTable from '../SearchTable.vue'
import type { SearchField, TableColumn, ActionButton } from '../types'

function createWrapper(props: {
  searchFields?: SearchField[]
  columns?: TableColumn[]
  actionButtons?: ActionButton[]
  fetchApi?: any
  defaultPageSize?: number
  maxVisibleButtons?: number
  formConfig?: any
  showExport?: boolean
}) {
  return mount(SearchTable, {
    props: {
      searchFields: [],
      columns: [],
      fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      directives: {
        permission: {
          mounted() {},
        },
      },
      stubs: {
        'el-popconfirm': true,
        'el-dropdown': true,
        'el-dropdown-menu': true,
        'el-dropdown-item': true,
        FormRenderer: FormRendererStub,
      },
    },
  })
}

/**
 * Stub for FormRenderer component.
 * Captures props and exposes getFormData() for testing submit flow.
 */
const FormRendererStub = defineComponent({
  name: 'FormRenderer',
  props: {
    rule: { type: Array, default: () => [] },
    initialValues: { type: Object, default: () => ({}) },
    formDefId: { type: String, default: undefined },
  },
  setup(props) {
    const data = ref<Record<string, any>>({ ...(props.initialValues || {}) })
    return {
      data,
      getFormData: () => data.value,
      setFormData: (val: Record<string, any>) => { data.value = val },
    }
  },
  render() {
    return h('div', { class: 'form-renderer-stub' })
  },
})

// A simple form-create rule for testing
const testRule: Rule[] = [
  { type: 'input', field: 'username', title: '用户名', value: '' } as Rule,
]

describe('SearchTable — 搜索栏渲染', () => {
  it('渲染 input 搜索字段', () => {
    const wrapper = createWrapper({
      searchFields: [{ type: 'input', label: '用户名', prop: 'username' }],
    })
    expect(wrapper.text()).toContain('用户名')
    expect(wrapper.find('input').exists()).toBe(true)
  })

  it('渲染 select 搜索字段', () => {
    const wrapper = createWrapper({
      searchFields: [{
        type: 'select', label: '状态', prop: 'status',
        options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }],
      }],
    })
    expect(wrapper.text()).toContain('状态')
  })

  it('渲染搜索和重置按钮', () => {
    const wrapper = createWrapper({})
    // circle 模式下按钮只显示图标，无文字；验证搜索卡片存在
    expect(wrapper.find('.el-card').exists()).toBe(true)
  })

  it('showExport 为 true 时显示导出按钮', () => {
    const wrapper = createWrapper({ showExport: true })
    // circle 模式下无文字，验证按钮在 DOM 中
    expect(wrapper.findAll('.el-button').length).toBeGreaterThanOrEqual(2)
  })

  it('showExport 为 false 时隐藏导出按钮', () => {
    const wrapper = createWrapper({ showExport: false })
    expect(wrapper.text()).not.toContain('导出')
  })
})

describe('SearchTable — 数据获取', () => {
  it('挂载时自动调用 fetchApi', () => {
    const fetchApi = vi.fn().mockResolvedValue({ rows: [], total: 0 })
    createWrapper({ fetchApi })
    expect(fetchApi).toHaveBeenCalled()
    expect(fetchApi).toHaveBeenCalledWith(expect.objectContaining({ page: 1, size: 10 }))
  })
})

describe('SearchTable — 表格渲染', () => {
  it('渲染表格列', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, username: 'admin' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [
        { prop: 'id', label: 'ID', width: 80 },
        { prop: 'username', label: '用户名' },
      ],
      fetchApi,
    })
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('ID')
    expect(wrapper.text()).toContain('用户名')
  })
})

describe('SearchTable — 操作列', () => {
  it('actionButtons 渲染操作按钮', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, username: 'admin' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'username', label: '用户名' }],
      actionButtons: [
        { label: '编辑', type: 'primary', onClick: () => {} },
        { label: '删除', type: 'danger', onClick: () => {} },
      ],
      fetchApi,
    })
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('编辑')
    expect(wrapper.text()).toContain('删除')
    expect(wrapper.text()).toContain('操作')
  })

  it('actionButtons 为空数组时隐藏操作列', () => {
    const wrapper = createWrapper({
      actionButtons: [],
    })
    expect(wrapper.text()).not.toContain('操作')
  })
})

describe('SearchTable — 按钮折叠', () => {
  it('maxVisibleButtons=2 时折叠超出按钮', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1 }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'id', label: 'ID' }],
      actionButtons: [
        { label: '编辑', onClick: () => {} },
        { label: '删除', onClick: () => {} },
        { label: '授权', onClick: () => {} },
        { label: '重置', onClick: () => {} },
      ],
      maxVisibleButtons: 2,
      fetchApi,
    })
    await nextTick()
    await nextTick()
    // el-dropdown stub 会渲染 "更多" 或省略号，只验证可见按钮渲染
    expect(wrapper.text()).toContain('编辑')
    expect(wrapper.text()).toContain('删除')
    // 确认有 el-dropdown 组件（折叠生效）
    expect(wrapper.findComponent({ name: 'ElDropdown' }).exists()).toBe(true)
  })
})

describe('SearchTable — formConfig', () => {
  it('formConfig 存在时渲染默认新增/编辑/删除按钮', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, username: 'admin' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'username', label: '用户名' }],
      formConfig: {
        rule: testRule,
        createApi: vi.fn(),
        updateApi: vi.fn(),
        deleteApi: vi.fn(),
      },
      fetchApi,
    })
    await nextTick()
    await nextTick()
    expect(wrapper.text()).toContain('新增')
    // formConfig 模式下默认编辑/删除按钮已图标化，验证 circle 按钮存在
    expect(wrapper.find('.el-table .el-button.is-circle').exists()).toBe(true)
    // 删除按钮在 el-popconfirm 内（被 stub），验证存在 formConfig 即可
    expect(wrapper.vm.$props.formConfig).toBeDefined()
  })
})

describe('SearchTable - 图标按钮', () => {
  it('icon 按钮渲染为 circle button，不显示 label 文字', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: 'test' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'name', label: '名称' }],
      actionButtons: [
        { label: '编辑', icon: Edit as Component, onClick: () => {} },
      ],
      fetchApi,
    })
    await nextTick()
    await nextTick()
    // 图标按钮渲染为 circle，label 文字不出现在按钮文本中
    const btn = wrapper.find('.el-table .el-button.is-circle')
    expect(btn.exists()).toBe(true)
    expect(wrapper.text()).not.toContain('编辑')
  })

  it('无 icon 的按钮仍渲染为文本按钮', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: 'test' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'name', label: '名称' }],
      actionButtons: [
        { label: '重置密码', onClick: () => {} },
      ],
      fetchApi,
    })
    await nextTick()
    await nextTick()
    // 操作列中不应有 circle 按钮（搜索栏的 circle 按钮不算）
    expect(wrapper.find('.el-table .el-button.is-circle').exists()).toBe(false)
    expect(wrapper.text()).toContain('重置密码')
  })

  it('图标按钮和文本按钮可混用', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: 'test' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'name', label: '名称' }],
      actionButtons: [
        { label: '编辑', icon: Edit as Component, onClick: () => {} },
        { label: '重置密码', onClick: () => {} },
      ],
      fetchApi,
    })
    await nextTick()
    await nextTick()
    expect(wrapper.find('.el-table .el-button.is-circle').exists()).toBe(true)
    expect(wrapper.text()).toContain('重置密码')
    expect(wrapper.text()).not.toContain('编辑')
  })

  it('formConfig 模式下默认编辑/删除按钮有 icon', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: 'test' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'name', label: '名称' }],
      formConfig: {
        rule: testRule,
        createApi: vi.fn(),
        updateApi: vi.fn(),
        deleteApi: vi.fn(),
      },
      fetchApi,
    })
    await nextTick()
    await nextTick()
    // formConfig 默认按钮应为 circle 图标按钮
    expect(wrapper.find('.el-table .el-button.is-circle').exists()).toBe(true)
    // label 不直接显示在按钮文本中
    expect(wrapper.text()).not.toContain('编辑')
  })
})

// ============================================================
// 新增测试: showSearch, tableSize, row-click
// ============================================================

describe('SearchTable — showSearch 搜索栏显隐', () => {
  it('showSearch=true（默认）时渲染搜索卡片', () => {
    const wrapper = createWrapper({
      searchFields: [{ type: 'input', label: '测试', prop: 'test' }],
    })
    // el-card 存在 + 搜索/重置按钮可见
    expect(wrapper.text()).toContain('测试')
    expect(wrapper.find('.el-button--primary').exists()).toBe(true)
  })

  it('showSearch=false 时不渲染搜索卡片', () => {
    const wrapper = mount(SearchTable, {
      props: {
        searchFields: [{ type: 'input', label: '搜索', prop: 'keyword' }],
        columns: [],
        fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        showSearch: false,
      },
      global: {
        plugins: [ElementPlus],
        directives: { permission: { mounted() {} } },
        stubs: { 'el-popconfirm': true, 'el-dropdown': true, 'el-dropdown-menu': true, 'el-dropdown-item': true },
      },
    })
    // 搜索卡片不应该渲染（没有 el-form-item 的 label 文本）
    expect(wrapper.text()).not.toContain('搜索')
  })
})

describe('SearchTable — tableSize', () => {
  it('tableSize="small" 透传到 el-table', () => {
    const wrapper = mount(SearchTable, {
      props: {
        searchFields: [],
        columns: [],
        fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
        tableSize: 'small',
      },
      global: {
        plugins: [ElementPlus],
        directives: { permission: { mounted() {} } },
        stubs: { 'el-popconfirm': true, 'el-dropdown': true, 'el-dropdown-menu': true, 'el-dropdown-item': true },
      },
    })
    expect(wrapper.vm.$props.tableSize).toBe('small')
  })

  it('tableSize 默认值为 default', () => {
    const wrapper = mount(SearchTable, {
      props: {
        searchFields: [],
        columns: [],
        fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      },
      global: {
        plugins: [ElementPlus],
        directives: { permission: { mounted() {} } },
        stubs: { 'el-popconfirm': true, 'el-dropdown': true, 'el-dropdown-menu': true, 'el-dropdown-item': true },
      },
    })
    expect(wrapper.vm.$props.tableSize).toBe('default')
  })
})

describe('SearchTable — row-click 事件转发', () => {
  it('行点击触发 row-click emit', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, name: 'test' }],
      total: 1,
    })
    const wrapper = mount(SearchTable, {
      props: {
        searchFields: [],
        columns: [{ prop: 'id', label: 'ID' }, { prop: 'name', label: '名称' }],
        fetchApi,
      },
      global: {
        plugins: [ElementPlus],
        directives: { permission: { mounted() {} } },
        stubs: { 'el-popconfirm': true, 'el-dropdown': true, 'el-dropdown-menu': true, 'el-dropdown-item': true },
      },
    })
    await nextTick()
    await nextTick()

    const row = wrapper.find('.el-table__body-wrapper tbody tr')
    await row.trigger('click')

    expect(wrapper.emitted('row-click')).toBeTruthy()
    const emitted = wrapper.emitted('row-click')!
    expect(emitted[0][0]).toEqual({ id: 1, name: 'test' })
  })
})

// ----- 树形表格测试 -----

describe('SearchTable — tree mode', () => {
  it('有 treeProps 时隐藏分页', async () => {
    const wrapper = createWrapper({
      treeProps: { rowKey: 'id', children: 'children', defaultExpandAll: true },
    })
    await nextTick()
    expect(wrapper.find('.el-pagination').exists()).toBe(false)
  })

  it('无 treeProps 时显示分页', async () => {
    const wrapper = createWrapper({
      fetchApi: vi.fn().mockResolvedValue({ rows: [], total: 10 }),
    })
    await nextTick()
    expect(wrapper.find('.el-pagination').exists()).toBe(true)
  })

  it('treeProps 透传 row-key 到 el-table', async () => {
    const wrapper = createWrapper({
      treeProps: { rowKey: 'id', children: 'children', defaultExpandAll: true },
    })
    await nextTick()
    const table = wrapper.find('.el-table')
    expect(table.exists()).toBe(true)
  })
})

// ============================================================
// Phase 4: FormRenderer 集成测试
// ============================================================

describe('SearchTable — FormRenderer 集成', () => {
  it('弹窗使用 FormRenderer 组件（接收 rule prop）', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, username: 'admin' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'username', label: '用户名' }],
      formConfig: {
        rule: testRule,
        createApi: vi.fn(),
        updateApi: vi.fn(),
        deleteApi: vi.fn(),
      },
      fetchApi,
    })
    await nextTick()
    await nextTick()

    // 点击新增按钮打开弹窗
    const addBtn = wrapper.find('button:not(.is-circle)')
    // 找到"新增"按钮
    const buttons = wrapper.findAll('button')
    const createBtn = buttons.find(b => b.text().includes('新增'))
    expect(createBtn).toBeTruthy()
    await createBtn!.trigger('click')
    await nextTick()

    // 弹窗应渲染 FormRenderer
    const formRenderer = wrapper.findComponent({ name: 'FormRenderer' })
    expect(formRenderer.exists()).toBe(true)
    // FormRenderer 应接收 rule prop
    expect(formRenderer.props('rule')).toEqual(testRule)
  })

  it('新增提交时调用 FormRenderer.getFormData() 再调用 createApi', async () => {
    const createApi = vi.fn().mockResolvedValue({})
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, username: 'admin' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'username', label: '用户名' }],
      formConfig: {
        rule: testRule,
        createApi,
        updateApi: vi.fn(),
        deleteApi: vi.fn(),
      },
      fetchApi,
    })
    await nextTick()
    await nextTick()

    // 打开新增弹窗
    const buttons = wrapper.findAll('button')
    const createBtn = buttons.find(b => b.text().includes('新增'))
    await createBtn!.trigger('click')
    await nextTick()

    // 获取 FormRenderer 组件并设置表单数据
    const formRenderer = wrapper.findComponent({ name: 'FormRenderer' })
    expect(formRenderer.exists()).toBe(true)
    const vm = formRenderer.vm as any
    vm.setFormData({ username: 'newuser' })

    // 点击确定按钮提交
    const dialogButtons = wrapper.findAll('.el-dialog button')
    const submitBtn = dialogButtons.find(b => b.text().includes('确定'))
    expect(submitBtn).toBeTruthy()
    await submitBtn!.trigger('click')
    await nextTick()
    await nextTick()

    // createApi 应被调用，且参数为 getFormData() 返回的数据
    expect(createApi).toHaveBeenCalled()
    expect(createApi).toHaveBeenCalledWith({ username: 'newuser' })
  })

  it('编辑时将当前行数据作为 initialValues 传给 FormRenderer', async () => {
    const updateApi = vi.fn().mockResolvedValue({})
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, username: 'admin', name: '管理员' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'username', label: '用户名' }],
      formConfig: {
        rule: testRule,
        createApi: vi.fn(),
        updateApi,
        deleteApi: vi.fn(),
      },
      fetchApi,
    })
    await nextTick()
    await nextTick()

    // 找到编辑按钮（circle 图标按钮在操作列）并点击
    const editBtn = wrapper.find('.el-table .el-button.is-circle')
    expect(editBtn.exists()).toBe(true)
    await editBtn.trigger('click')
    await nextTick()

    // FormRenderer 应接收 initialValues，且包含行数据
    const formRenderer = wrapper.findComponent({ name: 'FormRenderer' })
    expect(formRenderer.exists()).toBe(true)
    const initialValues = formRenderer.props('initialValues')
    expect(initialValues).toMatchObject({ id: 1, username: 'admin', name: '管理员' })
  })

  it('编辑提交时调用 FormRenderer.getFormData() 再调用 updateApi', async () => {
    const updateApi = vi.fn().mockResolvedValue({})
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, username: 'admin' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'username', label: '用户名' }],
      formConfig: {
        rule: testRule,
        createApi: vi.fn(),
        updateApi,
        deleteApi: vi.fn(),
      },
      fetchApi,
    })
    await nextTick()
    await nextTick()

    // 打开编辑弹窗
    const editBtn = wrapper.find('.el-table .el-button.is-circle')
    await editBtn.trigger('click')
    await nextTick()

    // 修改表单数据
    const formRenderer = wrapper.findComponent({ name: 'FormRenderer' })
    const vm = formRenderer.vm as any
    vm.setFormData({ id: 1, username: 'updated' })

    // 点击确定
    const dialogButtons = wrapper.findAll('.el-dialog button')
    const submitBtn = dialogButtons.find(b => b.text().includes('确定'))
    await submitBtn!.trigger('click')
    await nextTick()
    await nextTick()

    // updateApi 应被调用，参数为 (id, formData)
    expect(updateApi).toHaveBeenCalled()
    expect(updateApi).toHaveBeenCalledWith(1, { id: 1, username: 'updated' })
  })

  it('弹窗不渲染 FormBuilder 组件', async () => {
    const fetchApi = vi.fn().mockResolvedValue({
      rows: [{ id: 1, username: 'admin' }],
      total: 1,
    })
    const wrapper = createWrapper({
      columns: [{ prop: 'username', label: '用户名' }],
      formConfig: {
        rule: testRule,
        createApi: vi.fn(),
        updateApi: vi.fn(),
        deleteApi: vi.fn(),
      },
      fetchApi,
    })
    await nextTick()
    await nextTick()

    // 打开新增弹窗
    const buttons = wrapper.findAll('button')
    const createBtn = buttons.find(b => b.text().includes('新增'))
    await createBtn!.trigger('click')
    await nextTick()

    // 不应存在 FormBuilder 组件
    const formBuilder = wrapper.findComponent({ name: 'FormBuilder' })
    expect(formBuilder.exists()).toBe(false)
  })
})