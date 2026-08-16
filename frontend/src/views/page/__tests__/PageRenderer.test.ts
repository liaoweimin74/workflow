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

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn() },
    ElMessage: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
  }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { pageKey: 'emp_view' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

import { pageApi } from '@/api/page'
import { formApi } from '@/api/form'
import { ElMessage } from 'element-plus'

beforeEach(() => {
  vi.clearAllMocks()
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
    { type: '__page_actions', field: '__page_actions', title: '操作', props: { create: true, edit: true, delete: true, view: true } },
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

    expect(pageApi.getPageByKey).toHaveBeenCalledWith('emp_view')
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
    const queryBtn = wrapper.findAll('button').find((b) => b.text().includes('查询'))!
    await queryBtn.trigger('click')
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
})