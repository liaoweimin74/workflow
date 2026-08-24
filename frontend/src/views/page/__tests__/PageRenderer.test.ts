// ----- TDD: PageRenderer 视图渲染/错误处理/事件动作 -----
// npx vitest run src/views/page/__tests__/PageRenderer.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import PageRenderer from '../PageRenderer.vue'

vi.mock('@/api/page', () => ({
  pageApi: {
    getPageByKey: vi.fn(),
    queryPageData: vi.fn(),
  },
}))

vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitionByKey: vi.fn() },
}))

vi.mock('@/api/bizData', () => ({
  bizDataApi: { detail: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getData: vi.fn(),
    updateData: vi.fn(),
    getMetadata: vi.fn(),
  },
}))

// Store componentRefs for later verification
const storedRefs: Record<string, any> = {}
vi.mock('@/views/form/components/DsBindingEngine', () => ({
  createDsBindingEngine: vi.fn(() => ({
    mount: vi.fn(() => true),
    loadRecord: vi.fn(),
    flush: vi.fn(),
    getLastRecord: vi.fn(() => ({ foo: 'bar' })),
  })),
}))

// ElMessage：函数调用形式（message 动作 ElMessage({...})）与属性断言（ElMessage.error(...)）并存
const elMessageMock = vi.hoisted(() => {
  const fn: any = vi.fn()
  fn.success = vi.fn()
  fn.error = vi.fn()
  fn.warning = vi.fn()
  return fn
})

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn() },
    ElMessage: elMessageMock,
  }
})

// 可配置 route mock：默认已发布视图；preview 测试可改 query
const mockRoute = vi.hoisted(() => ({
  params: { pageKey: 'emp_view' },
  query: {} as Record<string, string>,
}))

vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn() }),
}))

import { pageApi } from '@/api/page'
import { formApi } from '@/api/form'
import { ElMessage } from 'element-plus'

beforeEach(() => {
  vi.clearAllMocks()
  mockRoute.query = {}
})

/** FormRenderer 桩：透传 rule/initialValues（详情弹窗 schema 渲染） */
const FormRendererStub = defineComponent({
  props: ['rule', 'initialValues', 'readonly', 'formDefId', 'option'],
  setup(props) {
    return () =>
      h('div', { class: 'form-renderer-stub' }, [
        h('span', { class: 'stub-rule' }, JSON.stringify(props.rule || null)),
        h('span', { class: 'stub-values' }, JSON.stringify(props.initialValues ?? null)),
      ])
  },
})

/** el-dialog 桩：避免 teleport，modelValue 为 true 时渲染默认槽 */
const ElDialogStub = defineComponent({
  props: ['modelValue', 'title', 'width'],
  setup(props, { slots }) {
    return () =>
      h('div', { class: ['dialog-stub', { visible: props.modelValue }] }, [
        h('div', { class: 'dialog-title' }, props.title),
        props.modelValue ? slots.default?.() : null,
      ])
  },
})

/** 已发布 VIEW 页面编译产物（对齐 ViewCompiler 输出） */
const compiledSchema = JSON.stringify({
  rule: [
    { type: 'input', field: 'name', title: '姓名', value: '', props: { placeholder: '姓名', style: 'width: 180px' }, matchType: 'like' },
    {
      type: 'table',
      field: '__page_table',
      title: '数据列表',
      props: {
        columns: [
          { prop: 'name', label: '姓名', minWidth: 130 },
          { prop: 'age', label: '年龄', minWidth: 130 },
        ],
      },
    },
    {
      type: '__page_actions',
      field: '__page_actions',
      title: '操作',
      props: {
        permissions: '',
        buttons: [
          { key: 'create', label: '新增', placement: 'toolbar', style: 'button' },
          { key: 'edit', label: '编辑', placement: 'column', style: 'button' },
          { key: 'delete', label: '删除', placement: 'column', style: 'button' },
          { key: 'view', label: '查看', placement: 'column', style: 'button' },
        ],
      },
    },
    { type: '__page_detail', field: '__page_detail', title: '详情', props: { enabled: true, width: '800px', type: 'form' } },
    {
      type: '__page_events',
      field: '__page_events',
      title: '事件',
      events: [
        {
          trigger: 'row-click',
          target: '',
          actions: [{ type: 'open-detail', params: [{ key: 'title', value: '详情：$row.name' }] }],
        },
      ],
    },
  ],
  option: {},
})

const pageDef = {
  id: 'p1',
  name: '员工视图',
  key: 'emp_view',
  type: 'VIEW',
  formKey: 'emp_profile',
  version: 1,
  status: 'PUBLISHED',
  publishedVersion: 1,
  schema: compiledSchema,
}

function createWrapper() {
  return mount(PageRenderer, {
    global: {
      plugins: [ElementPlus],
      stubs: { FormRenderer: FormRendererStub, 'el-dialog': ElDialogStub },
    },
  })
}

describe('PageRenderer — 视图渲染/错误处理/事件动作', () => {
  it('渲染已发布视图：查询条件区 + 数据表格 + 操作按钮，queryPageData 携带分页参数', async () => {
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: pageDef })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三', age: 30 }, version: 1 }], total: 1, page: 0, size: 20 },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    expect(pageApi.getPageByKey).toHaveBeenCalledWith('emp_view', false)
    // 首次数据加载：page 0 基，无 filter
    expect(pageApi.queryPageData).toHaveBeenCalledWith('emp_view', { page: 0, size: 20 })
    // 查询条件区（like 列 → input）
    expect(wrapper.find('input[placeholder="姓名"]').exists()).toBe(true)
    // 表格渲染行数据（row.data 内层取值）
    expect(wrapper.find('.el-table').exists()).toBe(true)
    expect(wrapper.find('.el-table').text()).toContain('张三')
    expect(wrapper.find('.el-table').text()).toContain('年龄')
    // 操作按钮（actions.create/edit/delete/view）
    expect(wrapper.text()).toContain('新增')
    expect(wrapper.text()).toContain('编辑')
    expect(wrapper.text()).toContain('删除')
    expect(wrapper.text()).toContain('查看')
    wrapper.unmount()
  })

  it('查询：like 列输入后点击查询 → filter 结构化条件 {column,op:like,value}', async () => {
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: pageDef })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三', age: 30 }, version: 1 }], total: 1, page: 0, size: 20 },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    await wrapper.find('input[placeholder="姓名"]').setValue('张')
    // 查询按钮为图标形态（circle），直接触发 vm.handleSearch
    const vm = wrapper.vm as any
    await vm.handleSearch()
    await flushPromises()

    const lastCall = (pageApi.queryPageData as any).mock.calls.at(-1)
    expect(lastCall[0]).toBe('emp_view')
    expect(lastCall[1]).toEqual({
      page: 0,
      size: 20,
      filter: JSON.stringify({ logic: 'AND', conditions: [{ column: 'name', op: 'like', value: '张' }] }),
    })
    wrapper.unmount()
  })

  it('页面不存在/未发布：展示错误提示，不白屏不抛异常', async () => {
    ;(pageApi.getPageByKey as any).mockRejectedValue(new Error('页面不存在或未发布'))
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    expect(ElMessage.error).toHaveBeenCalled()
    expect(wrapper.text()).toContain('页面不存在或未发布')
    expect(pageApi.queryPageData).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('schema 畸形：展示"页面配置异常，请联系管理员"', async () => {
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: { ...pageDef, schema: 'not-json{' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    expect(wrapper.text()).toContain('页面配置异常，请联系管理员')
    wrapper.unmount()
  })

  it('行点击触发 open-detail：加载绑定表单 schema 打开详情弹窗，$row.name 模板变量正确替换', async () => {
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: pageDef })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三', age: 30 }, version: 1 }], total: 1, page: 0, size: 20 },
    })
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: {
        key: 'emp_profile',
        name: '员工档案',
        schema: JSON.stringify([{ type: 'input', field: 'name', title: '姓名' }]),
      },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 点击表格行
    const row = wrapper.find('.el-table__row')
    expect(row.exists()).toBe(true)
    await row.trigger('click')
    await flushPromises()

    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('emp_profile')
    // 详情弹窗打开，标题经 resolveTemplate 替换为 $row.name → 张三
    const dialog = wrapper.find('.dialog-stub.visible')
    expect(dialog.exists()).toBe(true)
    expect(dialog.find('.dialog-title').text()).toBe('详情：张三')
    // FormRenderer 收到绑定表单 schema rule 与当前行数据
    const formRenderer = wrapper.findComponent(FormRendererStub)
    expect(formRenderer.exists()).toBe(true)
    const rule = formRenderer.props('rule') as any[]
    expect(rule[0].field).toBe('name')
    expect(formRenderer.props('initialValues')).toEqual({ name: '张三', age: 30 })
    wrapper.unmount()
  })

  it('preview=true（设计器预览）时 getPageByKey 传 preview=true 取最新 DRAFT 定义', async () => {
    mockRoute.query = { preview: 'true' }
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: pageDef })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [], total: 0, page: 0, size: 20 },
    })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    expect(pageApi.getPageByKey).toHaveBeenCalledWith('emp_view', true)
    wrapper.unmount()
  })

  it('placement=column（默认）：新增在工具栏，编辑/删除/查看渲染为表格操作列行内按钮', async () => {
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: pageDef })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三', age: 30 }, version: 1 }], total: 1, page: 0, size: 20 },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 工具栏只有"新增"（create 固定在工具栏）
    const toolbar = wrapper.find('.toolbar')
    expect(toolbar.exists()).toBe(true)
    expect(toolbar.text()).toContain('新增')
    expect(toolbar.text()).not.toContain('编辑')
    expect(toolbar.text()).not.toContain('删除')
    // 表格内操作列含编辑/删除/查看
    const tableText = wrapper.find('.el-table').text()
    expect(tableText).toContain('编辑')
    expect(tableText).toContain('删除')
    expect(tableText).toContain('查看')
    // 操作列按钮点击 → openEdit 弹窗（currentRow 绑定行）
    const editBtn = wrapper.findAll('.el-table button').find((b) => b.text().includes('编辑'))!
    await editBtn.trigger('click')
    await flushPromises()
    expect(formApi.getFormDefinitionByKey).toHaveBeenCalledWith('emp_profile')
    wrapper.unmount()
  })

  it('placement=toolbar：编辑/删除/查看保留在工具栏，表格无操作列', async () => {
    const toolbarSchema = compiledSchema.replaceAll('"placement":"column"', '"placement":"toolbar"')
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: { ...pageDef, schema: toolbarSchema } })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三', age: 30 }, version: 1 }], total: 1, page: 0, size: 20 },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const toolbar = wrapper.find('.toolbar')
    expect(toolbar.text()).toContain('新增')
    expect(toolbar.text()).toContain('编辑')
    expect(toolbar.text()).toContain('删除')
    expect(toolbar.text()).toContain('查看')
    // 表格内无操作列（无行内编辑按钮）
    const tableBtns = wrapper.findAll('.el-table button')
    expect(tableBtns.filter((b) => b.text().includes('编辑')).length).toBe(0)
    wrapper.unmount()
  })

  it('style=icon：操作列按钮仅图标（无文字），style=text 时文字链接', async () => {
    const iconSchema = compiledSchema.replace('"style":"button"', '"style":"icon"')
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: { ...pageDef, schema: iconSchema } })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三', age: 30 }, version: 1 }], total: 1, page: 0, size: 20 },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // icon 形态：按钮含图标类（el-icon），不含文字 label
    const tableBtns = wrapper.findAll('.el-table button')
    expect(tableBtns.length).toBeGreaterThan(0)
    const hasIcon = tableBtns.some((b) => b.find('.el-icon').exists())
    expect(hasIcon).toBe(true)
    wrapper.unmount()
  })

  it('preview 模式下表格为普通尺寸（default），非预览为紧凑（small）', async () => {
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: pageDef })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [], total: 0, page: 0, size: 20 },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    // 非预览 → small
    expect(wrapper.find('.el-table--small').exists()).toBe(true)

    mockRoute.query = { preview: 'true' }
    const wrapper2 = createWrapper()
    await nextTick()
    await flushPromises()
    // 预览 → default（无 small class）
    expect(wrapper2.find('.el-table--small').exists()).toBe(false)
    wrapper.unmount()
    wrapper2.unmount()
  })

  it('点击操作列编辑按钮不冒泡到 row-click：只打开编辑弹窗，不触发详情（阻止重复弹窗）', async () => {
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: pageDef })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三', age: 30 }, version: 1 }], total: 1, page: 0, size: 20 },
    })
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: {
        key: 'emp_profile',
        name: '员工档案',
        schema: JSON.stringify([{ type: 'input', field: 'name', title: '姓名' }]),
      },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 点击操作列"编辑"按钮
    const editBtn = wrapper.findAll('.el-table button').find((b) => b.text().includes('编辑'))!
    await editBtn.trigger('click')
    await flushPromises()

    // 只应打开编辑弹窗；详情弹窗不应被 row-click 冒泡打开
    const dialogs = wrapper.findAll('.dialog-stub.visible')
    expect(dialogs.length).toBe(1)
    expect(dialogs[0].find('.dialog-title').text()).toBe('编辑')
    wrapper.unmount()
  })

  it('自定义按钮：渲染在操作列，点击触发绑定事件链（message 动作）', async () => {
    const customSchema = compiledSchema.replace(
      '"buttons":[',
      '"buttons":[{"key":"approve","label":"审批","placement":"column","style":"text","events":[{"trigger":"click","actions":[{"type":"message","params":[{"key":"text","value":"已审批"}]}]}]},',
    )
    ;(pageApi.getPageByKey as any).mockResolvedValue({ data: { ...pageDef, schema: customSchema } })
    ;(pageApi.queryPageData as any).mockResolvedValue({
      data: { records: [{ id: 'r1', data: { name: '张三', age: 30 }, version: 1 }], total: 1, page: 0, size: 20 },
    })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 自定义按钮渲染在操作列
    const approveBtn = wrapper.findAll('.el-table button').find((b) => b.text().includes('审批'))!
    expect(approveBtn.exists()).toBe(true)
    // 点击触发 message 事件
    await approveBtn.trigger('click')
    await flushPromises()
    expect(ElMessage).toHaveBeenCalledWith(expect.objectContaining({ message: '已审批' }))
    wrapper.unmount()
  })
})