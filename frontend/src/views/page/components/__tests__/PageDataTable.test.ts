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

describe('PageDataTable — 元数据列数组值格式化（对齐 BizDataListPage）', () => {
  it('透传 componentType，数组值组件列 formatter 逗号拼接且优先显示 <key>_text', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({
      data: {
        writable: false,
        columns: [
          { key: 'name', label: '姓名', columnType: 'VARCHAR', componentType: 'input' },
          { key: 'tags', label: '标签', columnType: 'JSON', componentType: 'multiSelect' },
          { key: 'dept', label: '部门', columnType: 'JSON', componentType: 'select' },
          { key: 'users', label: '穿梭', columnType: 'JSON', componentType: 'elTransfer' },
          { key: 'tree', label: '树', columnType: 'JSON', componentType: 'elTreeSelect' },
          { key: 'region', label: '级联', columnType: 'JSON', componentType: 'cascader' },
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
    const cols = st.props('columns') as any[]
    // 数组值组件列：formatter 优先读 <key>_text（数据平铺在行顶层），缺失回退数组 join
    const tags = cols.find((c: any) => c.prop === 'tags')
    expect(tags?.formatter?.({ tags_text: '标签1, 标签2' }, null, ['a', 'b'], 0)).toBe('标签1, 标签2')
    expect(tags?.formatter?.({}, null, ['a', 'b'], 0)).toBe('a, b')
    expect(cols.find((c: any) => c.prop === 'users')?.formatter?.({ users_text: '前端组, 后端组' }, null, ['u1', 'u2'], 0)).toBe('前端组, 后端组')
    expect(cols.find((c: any) => c.prop === 'tree')?.formatter?.({}, null, ['x', 'y'], 0)).toBe('x, y')
    expect(cols.find((c: any) => c.prop === 'region')?.formatter?.({ region_text: '/省级/市级/叶子区' }, null, ['cn'], 0)).toBe('叶子区')
    // select（多选存数组）也走数组格式化；有 text 优先显示
    expect(cols.find((c: any) => c.prop === 'dept')?.formatter?.({ dept_text: '研发部' }, null, ['r'], 0)).toBe('研发部')
    expect(cols.find((c: any) => c.prop === 'dept')?.formatter?.({}, null, ['r', 'm'], 0)).toBe('r, m')
    // 非数组组件：无 formatter（原样显示）
    expect(cols.find((c: any) => c.prop === 'name')?.formatter).toBeUndefined()
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
    expect(stV.props.style).toEqual({ color: 'red' })
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

describe('PageDataTable — 数据源切换后重新取数', () => {
  it('resolvedRefId 变化时重新发起 queryData（用新 refId）', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: { writable: false, columns: [] } })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [{ id: '1', name: '订单' }], total: 1 } })

    const wrapper = createWrapper({ dsRefId: 'ds-emp', designMode: true })
    await nextTick()
    await flushPromises()
    ;(dataSourceApi.queryData as any).mockClear()

    // 模拟设计态配置确定/切换数据源：dsRefId 变化
    await wrapper.setProps({ dsRefId: 'ds-customers' })
    await nextTick()
    await flushPromises()

    // 重新取数（不仅取元数据）
    expect(dataSourceApi.queryData).toHaveBeenCalledWith(
      'ds-customers',
      expect.objectContaining({ page: expect.any(Number), size: expect.any(Number) }),
    )
    wrapper.unmount()
  })
})

describe('PageDataTable — 设计态取数钳制', () => {
  it('designMode 下分页取数 size 钳制到 ≤10', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: { writable: false, columns: [] } })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper({ dsRefId: 'ds-emp', designMode: true, pagination: true })
    await nextTick()
    await flushPromises()

    const st = wrapper.findComponent(SearchTable)
    expect(st.exists()).toBe(true)
    // 首次取数应钳制 size（pageSize 默认 20 但设计态最多 10）
    expect(dataSourceApi.queryData).toHaveBeenCalledWith(
      'ds-emp',
      expect.objectContaining({ page: 1, size: 10 }),
    )
    wrapper.unmount()
  })

  it('designMode 下不分页也钳制到 10 条（不请求全量 size=-1）', async () => {
    ;(dataSourceApi.getMetadata as any).mockResolvedValue({ data: { writable: false, columns: [] } })
    ;(dataSourceApi.queryData as any).mockResolvedValue({ data: { records: [], total: 0 } })

    const wrapper = createWrapper({ dsRefId: 'ds-emp', designMode: true, pagination: false })
    await nextTick()
    await flushPromises()

    expect(dataSourceApi.queryData).toHaveBeenCalledWith('ds-emp', expect.objectContaining({ page: 1, size: 10 }))
    wrapper.unmount()
  })
})
