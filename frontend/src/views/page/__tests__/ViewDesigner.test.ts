// ----- TDD: ViewDesigner 视图设计器（清单勾选式） -----
// npx vitest run src/views/page/__tests__/ViewDesigner.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import ViewDesigner from '../ViewDesigner.vue'

vi.mock('@/api/page', () => ({
  pageApi: {
    getPage: vi.fn(),
    getPageByKey: vi.fn(),
    updatePage: vi.fn(),
    publishPage: vi.fn(),
  },
}))

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitions: vi.fn(),
    getFormDefinitionByKey: vi.fn(),
  },
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    ElMessageBox: { confirm: vi.fn() },
    ElMessage: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  }
})

const mockRouter = vi.hoisted(() => ({ push: vi.fn(), back: vi.fn() }))
const mockOpen = vi.hoisted(() => vi.fn())

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: { id: 'p1' } }),
  useRouter: () => mockRouter,
}))

beforeEach(() => {
  mockOpen.mockClear()
  window.open = mockOpen as any
})

import { pageApi } from '@/api/page'
import { formApi } from '@/api/form'

/** 配置区子组件桩：透传 candidates/modelValue；点击 .stub-emit 发出固定载荷（模拟 v-model 勾选） */
function configStub(name: string, emitPayload: any = null) {
  return defineComponent({
    name,
    props: ['candidates', 'modelValue', 'searchFields', 'columns', 'filterableKeys'],
    emits: ['update:modelValue', 'update:searchFields', 'update:columns'],
    setup(props, { emit }) {
      return () =>
        h('div', { class: `stub-${name}` }, [
          h('span', { class: 'stub-candidates' }, JSON.stringify(props.candidates || [])),
          h('span', { class: 'stub-model' }, JSON.stringify(props.modelValue ?? null)),
          h('span', { class: 'stub-search' }, JSON.stringify(props.searchFields ?? null)),
          h('span', { class: 'stub-columns' }, JSON.stringify(props.columns ?? null)),
          h('button', {
            class: 'stub-emit',
            onClick: () => {
              if (emitPayload?.searchFields) emit('update:searchFields', emitPayload.searchFields)
              if (emitPayload?.columns) emit('update:columns', emitPayload.columns)
              else emit('update:modelValue', emitPayload ?? props.modelValue)
            },
          }, 'emit'),
        ])
    },
  })
}

const QueryColumnsStub = configStub('QueryColumnsConfig', {
  searchFields: [{ key: 'name', label: '姓名', matchType: 'like' }],
  columns: [{ key: 'name', label: '姓名', width: 120, align: 'left', sortable: true }],
})
const ActionsStub = configStub('ActionsConfig')
const EventsStub = configStub('EventsConfig')

const componentStubs = {
  QueryColumnsConfig: QueryColumnsStub,
  ActionsConfig: ActionsStub,
  EventsConfig: EventsStub,
}

const columnConfigJson = JSON.stringify([
  { key: 'name', label: '姓名', columnType: 'VARCHAR', length: 50, indexed: true, hidden: false },
  { key: 'age', label: '年龄', columnType: 'INT', length: null, indexed: true, hidden: false },
  { key: 'content', label: '内容', columnType: 'TEXT', length: null, indexed: false, hidden: false },
  { key: 'remark_hidden', label: '隐藏备注', columnType: 'VARCHAR', length: 50, indexed: false, hidden: true },
  { key: 'color', label: '颜色', columnType: 'VARCHAR', length: 20, indexed: false, hidden: false, componentType: 'colorPicker' },
])

function createWrapper() {
  return mount(ViewDesigner, {
    global: {
      plugins: [ElementPlus],
      stubs: componentStubs,
    },
  })
}

describe('ViewDesigner — 清单勾选式视图配置', () => {
  it('绑定表单加载后：候选列按可筛选/可展示规则过滤；勾选配置 → schema 组装正确', async () => {
    ;(pageApi.getPage as any).mockResolvedValue({
      data: {
        id: 'p1',
        name: '员工视图',
        key: 'emp_view',
        type: 'VIEW',
        formKey: 'emp_profile',
        status: 'DRAFT',
        version: 1,
        schema: JSON.stringify({
          searchFields: [],
          columns: [],
          actions: {
            buttons: [
              { key: 'create', label: '新增', placement: 'toolbar', style: 'button' },
              { key: 'edit', label: '编辑', placement: 'column', style: 'button' },
              { key: 'delete', label: '删除', placement: 'column', style: 'button' },
              { key: 'view', label: '查看', placement: 'column', style: 'button' },
            ],
            permissions: '',
          },
          detail: { width: '800px', type: 'form' },
          events: [],
        }),
      },
    })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({
      data: { content: [{ id: 'f1', name: '员工档案', key: 'emp_profile', type: 'BUSINESS', status: 'PUBLISHED' }] },
    })
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: { key: 'emp_profile', name: '员工档案', columnConfig: columnConfigJson },
    })
    ;(pageApi.updatePage as any).mockResolvedValue({ data: { status: 'DRAFT' } })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 单表配置：候选列为全部可展示列（非隐藏）
    const queryStub = wrapper.findComponent(QueryColumnsStub)
    const candidates = JSON.parse(queryStub.find('.stub-candidates').text()) as any[]
    expect(candidates.map((c) => c.key)).toEqual(['name', 'age', 'content', 'color'])
    // 传入 filterableKeys（查询勾选禁用依据）
    const filterableKeys = queryStub.props('filterableKeys') as Set<string>
    expect(filterableKeys.has('name')).toBe(true)
    expect(filterableKeys.has('content')).toBe(false)

    // 勾选查询条件（文本列 like）+ 展示列（width/align/sortable）
    // 驱动方式：点击桩的 emit 按钮，桩发出预置载荷（模拟 v-model 双向勾选）
    await queryStub.find('.stub-emit').trigger('click')
    await nextTick()

    // 点击保存 → updatePage 收到组装好的 schema
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('保存'))!
    await saveBtn.trigger('click')
    await flushPromises()

    expect(pageApi.updatePage).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({
        name: '员工视图',
        key: 'emp_view',
        type: 'VIEW',
        formKey: 'emp_profile',
      }),
    )
    const schemaArg = (pageApi.updatePage as any).mock.calls[0][1].schema
    const parsed = JSON.parse(schemaArg) as any
    expect(parsed.searchFields).toEqual([{ key: 'name', label: '姓名', matchType: 'like' }])
    expect(parsed.columns).toEqual([{ key: 'name', label: '姓名', width: 120, align: 'left', sortable: true }])
    expect(parsed.actions.buttons.map((b: any) => b.key)).toEqual(['create', 'edit', 'delete', 'view'])
    expect(parsed.actions.permissions).toBe('')
    expect(parsed.detail).toEqual({ width: '800px', type: 'form' })
    expect(parsed.events).toEqual([])
    wrapper.unmount()
  })

  it('绑定表单未加载时发布被禁用', async () => {
    ;(pageApi.getPage as any).mockResolvedValue({
      data: {
        id: 'p1',
        name: '员工视图',
        key: 'emp_view',
        type: 'VIEW',
        formKey: null,
        status: 'DRAFT',
        version: 1,
        schema: '{}',
      },
    })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const publishBtn = wrapper.findAll('button').find((b) => b.text().includes('发布'))!
    expect(publishBtn.attributes('disabled')).toBeDefined()
    wrapper.unmount()
  })

  it('预览按钮：打开视图渲染页（/page/{key}?preview=true）而非弹 JSON', async () => {
    ;(pageApi.getPage as any).mockResolvedValue({
      data: {
        id: 'p1',
        name: '员工视图',
        key: 'emp_view',
        type: 'VIEW',
        formKey: 'emp_profile',
        status: 'DRAFT',
        version: 1,
        schema: '{}',
      },
    })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: { key: 'emp_profile', name: '员工档案', columnConfig: columnConfigJson },
    })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const previewBtn = wrapper.findAll('button').find((b) => b.text().includes('预览'))!
    await previewBtn.trigger('click')

    // 预览应打开渲染页（新标签），带 preview=true 取最新 DRAFT 定义
    expect(mockOpen).toHaveBeenCalledWith('/page/emp_view?preview=true', '_blank')
    wrapper.unmount()
  })

  it('JSON 配置按钮：弹出当前 schema JSON 弹窗', async () => {
    ;(pageApi.getPage as any).mockResolvedValue({
      data: {
        id: 'p1',
        name: '员工视图',
        key: 'emp_view',
        type: 'VIEW',
        formKey: 'emp_profile',
        status: 'DRAFT',
        version: 1,
        schema: '{}',
      },
    })
    ;(formApi.getFormDefinitions as any).mockResolvedValue({ data: { content: [] } })
    ;(formApi.getFormDefinitionByKey as any).mockResolvedValue({
      data: { key: 'emp_profile', name: '员工档案', columnConfig: columnConfigJson },
    })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const jsonBtn = wrapper.findAll('button').find((b) => b.text().includes('JSON'))!
    await jsonBtn.trigger('click')
    await nextTick()

    // JSON 弹窗显示当前 schema 序列化内容
    expect(wrapper.find('.preview-json').exists()).toBe(true)
    const jsonText = wrapper.find('.preview-json').text()
    const parsed = JSON.parse(jsonText) as any
    expect(parsed.actions.buttons.map((b: any) => b.key)).toEqual(['create', 'edit', 'delete', 'view'])
    expect(parsed.actions.buttons[0]).toMatchObject({ key: 'create', placement: 'toolbar', style: 'button' })
    expect(parsed.actions.buttons[1]).toMatchObject({ key: 'edit', placement: 'column', style: 'button' })
    wrapper.unmount()
  })
})