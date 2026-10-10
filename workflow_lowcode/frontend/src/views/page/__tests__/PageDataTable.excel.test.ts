// ----- TDD: PageDataTable Excel 导入导出工具栏接线（Task 5-b） -----
// 覆盖：能力位显隐（缺省不出现 / excelExport+excelImport 开启出现 / designMode 隐藏）；
// 导出点击 → fetch（端点/请求体含搜索条件+排序）→ 成功消息 / R 错误消息 toast / 请求期间 loading；
// 导入点击 → 打开 ExcelImportDialog；导入 success 事件 → 触发既有刷新链路（fetchList 重新取数）。
// npx vitest run src/views/page/__tests__/PageDataTable.excel.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, onMounted } from 'vue'
import ElementPlus from 'element-plus'

// ElMessage 既有函数形态又有 .success/.error/.warning 方法 → 模拟同构对象（全部可观测）
// vi.hoisted：vi.mock 工厂被提升到文件顶部，模拟对象必须同层提升（TDZ）
const ElMessageMock = vi.hoisted(() =>
  Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  }),
)

vi.mock('element-plus', async (importOriginal) => {
  const actual: any = await importOriginal()
  return { ...actual, ElMessage: ElMessageMock }
})

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

// formDsBindingsStore 用真实模块（单例 ref）：dsRefId 已由 prop 注入，store 保持空数组即可，
// 避免 mock 成普通对象后 watch(activeDsBindings) 触发 Invalid watch source 告警

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    queryData: vi.fn(() => Promise.resolve({ data: { records: [], total: 0 } })),
    getMetadata: vi.fn(() => Promise.resolve({ data: { columns: [{ key: 'name', label: '姓名', columnType: 'VARCHAR', sortable: true }], writable: true } })),
  },
}))

vi.mock('@/api/form', () => ({
  formApi: {
    getFormDefinitionByKey: vi.fn(),
  },
}))

// SearchTable 行为桩：挂载即以「含搜索字段值 + 排序」的参数调用 fetchApi（对齐真实取数契约），渲染默认插槽（工具栏按钮挂载点）
vi.mock('@/components/business/SearchTable.vue', () => {
  const SearchTableStub = defineComponent({
    name: 'SearchTableStub',
    props: ['fetchApi', 'columns', 'toolbarButtons', 'actionButtons'],
    setup(props, { expose, slots }) {
      const run = () => {
        ;(props.fetchApi as ((p: unknown) => unknown) | undefined)?.({
          page: 1,
          size: 20,
          name: '张三',
          sort: 'name',
          order: 'asc',
        })
      }
      onMounted(run)
      expose({ fetchList: run })
      // 渲染默认插槽（批量操作条挂载点）+ toolbar-right 插槽（Task UI-fix：Excel 导入导出按钮挂载点）
      // 渲染函数中必须显式调用 slot 函数，<slot> DOM 元素不是出口
      return () =>
        h('div', { class: 'search-table-stub' }, [
          h('div', { class: 'stub-toolbar-slot' }, slots.default?.()),
          h('div', { class: 'stub-toolbar-right-slot' }, slots['toolbar-right']?.()),
        ])
    },
  })
  return { default: SearchTableStub }
})

import { dataSourceApi } from '@/api/data-source'
import PageDataTable from '../components/PageDataTable.vue'
import ExcelImportDialog from '../components/ExcelImportDialog.vue'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

function xlsxResponse(headers: Record<string, string> = {}) {
  return new Response(new Uint8Array([1, 2, 3]), {
    status: 200,
    headers: {
      'Content-Type': XLSX_TYPE,
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('员工视图.xlsx')}`,
      ...headers,
    },
  })
}

async function mountTable(props: any = {}) {
  const wrapper = mount(PageDataTable, {
    props: {
      pageKey: 'emp_view',
      dsRefId: 'ds-emp',
      columns: [
        { key: 'name', label: '姓名' },
        { key: 'calc_total', label: '合计', custom: true },
      ],
      searchFields: [{ key: 'name', label: '姓名', matchType: 'like' }],
      ...props,
    },
    global: {
      plugins: [ElementPlus],
      provide: { pageActionBus: { dispatch: vi.fn(() => false) } },
    },
  })
  await flushPromises()
  return wrapper
}

function findButton(wrapper: ReturnType<typeof mount>, text: string) {
  return wrapper.findAll('button').find((b) => b.text().includes(text))
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.removeItem('access_token')
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), configurable: true, writable: true })
  Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('PageDataTable — Excel 工具栏显隐（能力位，缺省不出现）', () => {
  it('未配置 excelExport/excelImport：两个按钮都不出现（零回归）', async () => {
    const wrapper = await mountTable()
    expect(findButton(wrapper, '导出 Excel')).toBeUndefined()
    expect(findButton(wrapper, '导入 Excel')).toBeUndefined()
    wrapper.unmount()
  })

  it('excelExport/excelImport 开启：按钮出现；designMode 下隐藏', async () => {
    const on = { excelExport: true, excelImport: true }
    const wrapper = await mountTable(on)
    expect(findButton(wrapper, '导出 Excel')).toBeTruthy()
    expect(findButton(wrapper, '导入 Excel')).toBeTruthy()
    wrapper.unmount()

    const designing = await mountTable({ ...on, designMode: true })
    expect(findButton(designing, '导出 Excel')).toBeUndefined()
    expect(findButton(designing, '导入 Excel')).toBeUndefined()
    designing.unmount()
  })
})

describe('PageDataTable — 导出 Excel', () => {
  it('点击导出：POST 页面级端点，请求体含搜索条件（like）/排序/列子集（剔除 custom 列）→ 成功提示', async () => {
    const fetchMock = vi.fn(async () => xlsxResponse())
    vi.stubGlobal('fetch', fetchMock)

    const wrapper = await mountTable({ excelExport: true })
    await findButton(wrapper, '导出 Excel')!.trigger('click')
    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/pages/emp_view/data/export')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body)
    expect(body.filter).toBe(
      JSON.stringify({ logic: 'AND', conditions: [{ column: 'name', op: 'like', value: '张三' }] }),
    )
    expect(body.sort).toBe('name')
    expect(body.order).toBe('asc')
    expect(body.columns).toEqual(['name']) // custom 计算列剔除
    expect(ElMessageMock.success).toHaveBeenCalledTimes(1)
    expect(ElMessageMock.success.mock.calls[0][0]).toContain('导出成功')
    // 请求结束 loading 复位
    expect((wrapper.vm as any).excelExporting).toBe(false)
    wrapper.unmount()
  })

  it('截断响应头（X-Export-Truncated: true）→ 提示已截断', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => xlsxResponse({ 'X-Export-Truncated': 'true' })))
    const wrapper = await mountTable({ excelExport: true })
    await findButton(wrapper, '导出 Excel')!.trigger('click')
    await flushPromises()
    expect(ElMessageMock.warning).toHaveBeenCalledTimes(1)
    expect(ElMessageMock.warning.mock.calls[0][0]).toContain('已截断至前 10000 行')
    wrapper.unmount()
  })

  it('R 业务错误 → ElMessage.error 提示 R.msg，不弹成功', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 400, msg: '页面 emp_view 未绑定数据源' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    )
    const wrapper = await mountTable({ excelExport: true })
    await findButton(wrapper, '导出 Excel')!.trigger('click')
    await flushPromises()
    expect(ElMessageMock.error).toHaveBeenCalledWith('页面 emp_view 未绑定数据源')
    expect(ElMessageMock.success).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})

describe('PageDataTable — 导入 Excel 与刷新链路', () => {
  it('点击导入 → 打开 ExcelImportDialog；dialog success 事件 → fetchList 重新取数（刷新链路）', async () => {
    const wrapper = await mountTable({ excelImport: true })
    const before = (dataSourceApi.queryData as ReturnType<typeof vi.fn>).mock.calls.length
    expect(wrapper.findComponent(ExcelImportDialog).exists()).toBe(true)

    // 打开弹窗（点击工具栏按钮 → v-model 置 true）
    await findButton(wrapper, '导入 Excel')!.trigger('click')
    await flushPromises()
    const dialog = wrapper.findComponent(ExcelImportDialog)
    expect(dialog.props('modelValue')).toBe(true)
    expect(dialog.props('pageKey')).toBe('emp_view')

    // 导入成功事件 → 既有刷新链路 refresh() → SearchTable.fetchList → fetchApi → queryData
    dialog.vm.$emit('success', { total: 1, success: 1, failed: 0, skipped: 0, errors: [] })
    await flushPromises()
    const after = (dataSourceApi.queryData as ReturnType<typeof vi.fn>).mock.calls.length
    expect(after).toBeGreaterThan(before)
    wrapper.unmount()
  })

  it('能力位关闭：不渲染 ExcelImportDialog 实例', async () => {
    const wrapper = await mountTable({ excelExport: true }) // 仅导出
    expect(wrapper.findComponent(ExcelImportDialog).exists()).toBe(false)
    wrapper.unmount()
  })
})
