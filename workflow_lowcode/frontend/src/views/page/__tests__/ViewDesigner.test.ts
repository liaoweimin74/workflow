// ----- TDD: ViewDesigner 视图设计器（清单勾选式） -----
// npx vitest run src/views/page/__tests__/ViewDesigner.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick, defineComponent, h } from 'vue'
import ElementPlus from 'element-plus'
import { createPinia } from 'pinia'
import ViewDesigner from '../ViewDesigner.vue'

vi.mock('@/api/page', () => ({
  pageApi: {
    getPage: vi.fn(),
    getPageByKey: vi.fn(),
    updatePage: vi.fn(),
    publishPage: vi.fn(),
  },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getEnabledDataSources: vi.fn(),
    getMetadata: vi.fn(),
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
import { dataSourceApi } from '@/api/data-source'

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
  { key: 'dept', label: '部门', columnType: 'JSON', length: null, indexed: false, hidden: false },
  { key: 'dept_text', label: '部门（显示）', columnType: 'VARCHAR', length: null, indexed: false, hidden: true },
  { key: 'content', label: '内容', columnType: 'TEXT', length: null, indexed: false, hidden: false },
  { key: 'remark_hidden', label: '隐藏备注', columnType: 'VARCHAR', length: 50, indexed: false, hidden: true },
  { key: 'color', label: '颜色', columnType: 'VARCHAR', length: 20, indexed: false, hidden: false },
])

/** 启用数据源桩：FORM/WORKFLOW 各一个 */
const enabledDs = [
  { id: 'ds_wf_1', name: '员工工作流数据源', type: 'WORKFLOW', formKey: 'emp_wf', status: 'ENABLED' },
  { id: 'ds_form_1', name: '员工业务数据源', type: 'FORM', formKey: 'emp_profile', status: 'ENABLED' },
]

/** 数据源 metadata 桩：返回列定义（对齐后端 DataSourceMetadataDTO） */
function mockMetadata() {
  ;(dataSourceApi.getMetadata as any).mockResolvedValue({
    data: { columns: JSON.parse(columnConfigJson), writable: false },
  })
}

function createWrapper() {
  return mount(ViewDesigner, {
    global: {
      plugins: [ElementPlus, createPinia()],
      stubs: componentStubs,
    },
  })
}

describe('ViewDesigner — 清单勾选式视图配置', () => {
  it('绑定数据源加载后：候选列按可筛选/可展示规则过滤；勾选配置 → schema 组装正确', async () => {
    ;(pageApi.getPage as any).mockResolvedValue({
      data: {
        id: 'p1',
        name: '员工视图',
        key: 'emp_view',
        type: 'VIEW',
        formKey: null,
        dataSourceId: 'ds_wf_1',
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
    ;(dataSourceApi.getEnabledDataSources as any).mockResolvedValue({ data: enabledDs })
    mockMetadata()
    ;(pageApi.updatePage as any).mockResolvedValue({ data: { status: 'DRAFT' } })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    // 单表配置：候选列为全部可展示列（非隐藏）
    const queryStub = wrapper.findComponent(QueryColumnsStub)
    const candidates = JSON.parse(queryStub.find('.stub-candidates').text()) as any[]
    expect(candidates.map((c) => c.key)).toEqual(['name', 'age', 'dept', 'content', 'color'])
    // 传入 filterableKeys（查询勾选禁用依据）
    const filterableKeys = queryStub.props('filterableKeys') as Set<string>
    expect(filterableKeys.has('name')).toBe(true)
    expect(filterableKeys.has('content')).toBe(false)
    // 选项类组件主列（JSON，componentType=select）也可筛（查询走 <key>_text 显示列）
    expect(filterableKeys.has('dept')).toBe(true)

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
        dataSourceId: 'ds_wf_1',
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

  it('绑定数据源未加载时发布被禁用', async () => {
    ;(pageApi.getPage as any).mockResolvedValue({
      data: {
        id: 'p1',
        name: '员工视图',
        key: 'emp_view',
        type: 'VIEW',
        formKey: null,
        dataSourceId: null,
        status: 'DRAFT',
        version: 1,
        schema: '{}',
      },
    })
    ;(dataSourceApi.getEnabledDataSources as any).mockResolvedValue({ data: [] })

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
        formKey: null,
        dataSourceId: 'ds_wf_1',
        status: 'DRAFT',
        version: 1,
        schema: '{}',
      },
    })
    ;(dataSourceApi.getEnabledDataSources as any).mockResolvedValue({ data: enabledDs })
    mockMetadata()

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
        formKey: null,
        dataSourceId: 'ds_wf_1',
        status: 'DRAFT',
        version: 1,
        schema: '{}',
      },
    })
    ;(dataSourceApi.getEnabledDataSources as any).mockResolvedValue({ data: enabledDs })
    mockMetadata()

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

describe('ViewDesigner — 图表视图形态（Task ④）', () => {
  async function mountWithSchema(schemaObj: any) {
    ;(pageApi.getPage as any).mockResolvedValue({
      data: {
        id: 'p1',
        name: '员工视图',
        key: 'emp_view',
        type: 'VIEW',
        formKey: null,
        dataSourceId: 'ds_wf_1',
        status: 'DRAFT',
        version: 1,
        schema: JSON.stringify(schemaObj),
      },
    })
    ;(dataSourceApi.getEnabledDataSources as any).mockResolvedValue({ data: enabledDs })
    mockMetadata()
    ;(pageApi.updatePage as any).mockResolvedValue({ data: { status: 'DRAFT' } })
    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()
    return wrapper
  }

  async function saveAndParseSchema(wrapper: any) {
    const saveBtn = wrapper.findAll('button').find((b: any) => b.text().includes('保存'))!
    await saveBtn.trigger('click')
    await flushPromises()
    const calls = (pageApi.updatePage as any).mock.calls
    return JSON.parse(calls[calls.length - 1][1].schema) as any
  }

  it('显示方式含「图表」选项；新切换 → 初始化缺省配置（维度列预选首列），保存写入 display=chart + chart', async () => {
    const wrapper = await mountWithSchema({ searchFields: [], columns: [], events: [] })

    const chartRadio = wrapper.findAll('.el-radio-button').find((b) => b.text() === '图表')
    expect(chartRadio).toBeTruthy()
    await chartRadio!.find('input').setValue()
    await nextTick()

    // 图表配置区出现（图表类型/维度列/指标列/取前 N 条）
    expect(wrapper.text()).toContain('图表配置')
    expect(wrapper.text()).toContain('维度列')
    expect(wrapper.text()).toContain('指标列')
    expect(wrapper.text()).toContain('取前 N 条')

    // 保存 → display=chart + 缺省 chart 配置（type=bar、limit=20、yFields=[]、xField 预选首个配置列 name）
    const parsed = await saveAndParseSchema(wrapper)
    expect(parsed.display).toBe('chart')
    expect(parsed.chart).toEqual({ type: 'bar', xField: 'name', yFields: [], limit: 20 })
    wrapper.unmount()
  })

  it('已配置图表回显：display 缺失时以 chart 存在性恢复图表形态，畸形 type 归一并保留合法配置', async () => {
    const wrapper = await mountWithSchema({
      searchFields: [],
      columns: [{ key: 'dept', label: '部门' }, { key: 'amount', label: '金额' }],
      // display 缺省（模拟发布编译把 display 归一为 table 后 mergeCompiled 保留 chart 的产物）
      chart: { type: 'pie', xField: 'dept', yFields: [{ key: 'amount', agg: 'avg' }], limit: 50 },
      events: [],
    })

    const jsonBtn = wrapper.findAll('button').find((b) => b.text().includes('JSON'))!
    await jsonBtn.trigger('click')
    await nextTick()
    const parsed = JSON.parse(wrapper.find('.preview-json').text()) as any
    expect(parsed.display).toBe('chart')
    expect(parsed.chart).toEqual({ type: 'pie', xField: 'dept', yFields: [{ key: 'amount', agg: 'avg' }], limit: 50 })

    // 保存 roundtrip：配置不丢
    const saved = await saveAndParseSchema(wrapper)
    expect(saved.display).toBe('chart')
    expect(saved.chart).toEqual({ type: 'pie', xField: 'dept', yFields: [{ key: 'amount', agg: 'avg' }], limit: 50 })
    wrapper.unmount()
  })

  it('切离图表形态 → 移除 schema.chart（保持 chart 存在 ⇔ chart 形态不变量）；display 残留非法值回落 table', async () => {
    const wrapper = await mountWithSchema({
      searchFields: [],
      columns: [{ key: 'dept', label: '部门' }],
      display: 'chart',
      chart: { type: 'area', xField: 'dept', yFields: [{ key: 'dept', agg: 'count' }], limit: 10 },
      events: [],
    })

    // 畸形 type 归一为 bar（合法配置保留）
    const jsonBtn = wrapper.findAll('button').find((b) => b.text().includes('JSON'))!
    await jsonBtn.trigger('click')
    await nextTick()
    const parsed = JSON.parse(wrapper.find('.preview-json').text()) as any
    expect(parsed.chart.type).toBe('bar')
    expect(parsed.chart.yFields).toEqual([{ key: 'dept', agg: 'count' }])

    // 切回表格 → chart 键移除
    const tableRadio = wrapper.findAll('.el-radio-button').find((b) => b.text() === '表格')!
    await tableRadio.find('input').setValue()
    await nextTick()
    const saved = await saveAndParseSchema(wrapper)
    expect(saved.display).toBe('table')
    expect(saved.chart).toBeUndefined()
    wrapper.unmount()

    // display 非法残留（无 chart 配置）→ 回落表格
    const wrapper2 = await mountWithSchema({ searchFields: [], columns: [], display: 'grid', events: [] })
    const jsonBtn2 = wrapper2.findAll('button').find((b) => b.text().includes('JSON'))!
    await jsonBtn2.trigger('click')
    await nextTick()
    const parsed2 = JSON.parse(wrapper2.find('.preview-json').text()) as any
    expect(parsed2.display).toBe('table')
    expect(parsed2.chart).toBeUndefined()
    wrapper2.unmount()
  })

  it('指标列聚合选项对齐汇总行口径：已配置 agg 保留；新选数值列（INT）缺省 sum、非数值列（JSON/VARCHAR）缺省 count', async () => {
    const wrapper = await mountWithSchema({
      searchFields: [],
      columns: [{ key: 'age', label: '年龄' }, { key: 'dept', label: '部门' }, { key: 'name', label: '姓名' }],
      display: 'chart',
      chart: { type: 'bar', xField: 'dept', yFields: [{ key: 'age', agg: 'avg' }], limit: 20 },
      events: [],
    })

    // 指标列多选为 teleport 下拉，DOM 驱动成本高：直接驱动 computed setter（等效用户勾选）
    ;(wrapper.vm as any).$.setupState.chartYKeys = ['age', 'dept', 'name']
    await nextTick()
    const saved = await saveAndParseSchema(wrapper)
    expect(saved.chart.yFields).toEqual([
      { key: 'age', agg: 'avg' }, // 已配置 agg 保留（INT 数值列）
      { key: 'dept', agg: 'count' }, // 新选 JSON 列 → 仅计数
      { key: 'name', agg: 'count' }, // 新选 VARCHAR 列 → 仅计数
    ])
    wrapper.unmount()
  })
})
