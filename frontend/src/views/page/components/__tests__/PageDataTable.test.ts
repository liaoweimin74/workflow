// ----- TDD: PageDataTable 排序能力（数据源 metadata 驱动） -----
// npx vitest run src/views/page/components/__tests__/PageDataTable.test.ts

import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import ElementPlus from 'element-plus'
import PageDataTable from '../PageDataTable.vue'
import SearchTable from '@/components/business/SearchTable.vue'

// mock element-plus：保留 ElementPlus 安装器与其余导出，仅将 ElMessage 替换为可观测 vi.fn()
vi.mock('element-plus', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, ElMessage: vi.fn() }
})

const ElMessageMock = (await import('element-plus')).ElMessage as ReturnType<typeof vi.fn>

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/utils/formDsBindingsStore', () => ({
  activeDsBindings: { value: [] },
}))

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getMetadata: vi.fn(),
    queryData: vi.fn(),
  },
}))

import { dataSourceApi } from '@/api/data-source'

const FormRendererStub = {
  name: 'FormRenderer',
  props: ['rule', 'initialValues', 'readonly'],
  template: '<div class="form-renderer-stub" />',
}

const ElDialogStub = {
  name: 'ElDialog',
  props: ['modelValue'],
  template: '<div class="dialog-stub"><slot v-if="modelValue" /></div>',
}

function createWrapper(props: any = {}) {
  return mount(PageDataTable, {
    props: {
      pageKey: 'emp-page',
      dsRefId: 'ds-emp',
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      provide: {
        pageActionBus: { dispatch: vi.fn(() => false) },
      },
      stubs: {
        'el-dialog': ElDialogStub,
        FormRenderer: FormRendererStub,
      },
    },
  })
}

describe('PageDataTable — 排序能力（数据源 metadata 驱动）', () => {
  it('列 sortable 来自 metadata 声明的排序能力', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: {
        writable: false,
        columns: [
          { key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true },
          { key: 'bio', label: '简介', columnType: 'TEXT', sortable: false },
        ],
      },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [], total: 0 },
    })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    expect(st.exists()).toBe(true)
    const cols = st.props('columns') as any[]
    expect(cols.length).toBeGreaterThan(0)
    // 数据源声明可排（VARCHAR）→ 渲染排序入口
    expect(cols.find((c) => c.prop === 'name').sortable).toBe(true)
    // 数据源声明不可排（TEXT）→ 无排序入口
    expect(cols.find((c) => c.prop === 'bio').sortable).toBe(false)
    wrapper.unmount()
  })

  it('sortableFields 收窄：未声明字段即使数据源可排也不显示排序入口', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: {
        writable: false,
        columns: [
          { key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true },
          { key: 'age', label: '年龄', columnType: 'INT', sortable: true },
        ],
      },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [], total: 0 },
    })

    const wrapper = createWrapper({
      sortableFields: ['name'], // 组件级收窄：仅 name 可排序
    })
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    const cols = st.props('columns') as any[]
    // 视图声明 + 数据源可排 → 可排
    expect(cols.find((c) => c.prop === 'name').sortable).toBe(true)
    // 数据源可排但未在 sortableFields 中 → 不可排
    expect(cols.find((c) => c.prop === 'age').sortable).toBe(false)
    wrapper.unmount()
  })

  it('sortableFields 未声明时跟随数据源全部可排字段', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: {
        writable: false,
        columns: [
          { key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true },
          { key: 'age', label: '年龄', columnType: 'INT', sortable: true },
        ],
      },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({
      data: { records: [], total: 0 },
    })

    const wrapper = createWrapper() // 无 sortableFields
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    const cols = st.props('columns') as any[]
    expect(cols.find((c) => c.prop === 'name').sortable).toBe(true)
    expect(cols.find((c) => c.prop === 'age').sortable).toBe(true)
    wrapper.unmount()
  })
})

describe('PageDataTable — 分页配置透传', () => {
  it('pageSize/pageSizes/pagination 透传到 SearchTable', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: { writable: false, columns: [{ key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true }] },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper({
      pagination: true,
      pageSize: 50,
      pageSizes: [10, 50, 100],
    })
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    expect(st.props('showPagination')).toBe(true)
    expect(st.props('defaultPageSize')).toBe(50)
    expect(st.props('pageSizes')).toEqual([10, 50, 100])
    wrapper.unmount()
  })

  it('pageSize/pageSizes 未传时回退默认（20 / [10,20,50]）', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: { writable: false, columns: [{ key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true }] },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper()
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    expect(st.props('defaultPageSize')).toBe(20)
    expect(st.props('pageSizes')).toEqual([10, 20, 50])
    expect(st.props('showPagination')).toBe(true)
    wrapper.unmount()
  })
})

describe('PageDataTable — 列级定制（template/expression/formatter/className 经公共模块）', () => {
  it('用户配置列：render 经 buildCellRender 组装，template/formatter/styleExpr 生效', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: { writable: false, columns: [] },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper({
      columns: [
        { key: 'name', label: '姓名', template: '员工：${name}' },
        { key: 'amount', label: '金额', formatter: 'currency' },
        { key: 'status', label: '状态', styleExpr: '$row.status === "PENDING" ? "color:red" : ""' },
      ],
    })
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    const cols = st.props('columns') as any[]
    expect(cols).toHaveLength(3)
    // template 经 render 插值
    const nameV = (cols[0].render as Function)({ name: '张三' } as any)
    expect(nameV.children).toContain('员工：张三')
    // formatter 经 render 应用
    const amountV = (cols[1].render as Function)({ amount: 1234.56 } as any)
    expect(amountV.children).toBe('¥1,234.56')
    // styleExpr 经 render 应用
    const stV = (cols[2].render as Function)({ status: 'PENDING' } as any)
    expect(stV.props.style).toContain('color:red')
    wrapper.unmount()
  })

  it('列级 onCellClick 短路整表级 cell-click（只触发列级链，不触发 viewEvents）', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: { writable: false, columns: [] },
    })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [{ id: '1', name: '张三' }], total: 1 } })
    ElMessageMock.mockClear()

    const wrapper = createWrapper({
      columns: [
        { key: 'name', label: '姓名', onCellClick: { actions: [{ type: 'message', params: [{ key: 'text', value: '列级点击' }] }] } },
      ],
      viewEvents: [
        { trigger: 'cell-click', target: 'table', actions: [{ type: 'message', params: [{ key: 'text', value: '整表级' }] }] },
      ],
    })
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    st.vm.$emit('cell-click', { id: '1', name: '张三' }, { property: 'name' })
    await flushPromises()
    // 列级事件链被执行
    expect(ElMessageMock).toHaveBeenCalledWith(expect.objectContaining({ message: '列级点击' }))
    // 整表级未触发（短路）
    expect(ElMessageMock).not.toHaveBeenCalledWith(expect.objectContaining({ message: '整表级' }))
    wrapper.unmount()
  })
})
