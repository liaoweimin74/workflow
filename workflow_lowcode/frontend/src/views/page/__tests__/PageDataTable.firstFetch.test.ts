// ----- TDD: page-table 首次 data 请求单次触发（page-data-table） -----
// 场景：挂载时绑定已就绪 → data 请求恰 1 次（原为 2 次：SearchTable 挂载请求 + watch 补发叠加）
//       挂载时未就绪 → 绑定就绪后补发恰 1 次；无绑定不发起请求
// npx vitest run src/views/page/__tests__/PageDataTable.firstFetch.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, onMounted } from 'vue'
import ElementPlus from 'element-plus'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    queryData: vi.fn(() => Promise.resolve({ data: { rows: [{ id: 'R1', name: '张三' }], total: 1 } })),
    getMetadata: vi.fn(() => Promise.resolve({ data: { columns: [], writable: true } })),
    getData: vi.fn(() => Promise.resolve({ data: { id: 'R1', version: 1, data: {} } })),
  },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: {}, query: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/utils/scriptSandbox', () => ({
  executeScript: vi.fn(),
  isScriptEventEnabled: () => false,
}))

// SearchTable 行为桩：模拟真实组件契约——挂载即调用 fetchApi（首次数据请求），fetchList() 手动触发再次请求
vi.mock('@/components/business/SearchTable.vue', () => {
  const SearchTableStub = defineComponent({
    name: 'SearchTableStub',
    props: ['fetchApi', 'columns', 'actionButtons'],
    setup(props, { expose }) {
      const run = () => { (props.fetchApi as ((p: unknown) => unknown) | undefined)?.({ page: 1, size: 20 }) }
      onMounted(run)
      expose({ fetchList: run })
      return () => h('div', { class: 'search-table-stub' })
    },
  })
  return { default: SearchTableStub }
})

import { dataSourceApi } from '@/api/data-source'
import { activeDsBindings, setActiveDsBindings } from '@/utils/formDsBindingsStore'
import PageDataTable from '../components/PageDataTable.vue'

async function mountTable() {
  const wrapper = mount(PageDataTable, {
    props: { pageKey: 'emp_page', dataSourceId: 'ds1', columns: [{ prop: 'name', label: '姓名' }] },
    global: { plugins: [ElementPlus] },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  activeDsBindings.value = [] // 直接重置 ref（setActiveDsBindings 空数组不覆盖非空）
})

describe('page-table 首次 data 请求单次触发', () => {
  it('挂载时绑定已就绪 → data 请求恰 1 次', async () => {
    setActiveDsBindings([{ id: 'ds1', refId: 'global1' }])
    await mountTable()
    expect(dataSourceApi.queryData).toHaveBeenCalledTimes(1)
  })

  it('挂载时绑定未就绪 → 绑定就绪后补发恰 1 次，且后续绑定变化不再补发', async () => {
    await mountTable()
    expect(dataSourceApi.queryData).not.toHaveBeenCalled()
    setActiveDsBindings([{ id: 'ds1', refId: 'global1' }])
    await flushPromises()
    expect(dataSourceApi.queryData).toHaveBeenCalledTimes(1)
    // 标志已消费：再次更换绑定不重复补发
    setActiveDsBindings([{ id: 'ds1', refId: 'global2' }])
    await flushPromises()
    expect(dataSourceApi.queryData).toHaveBeenCalledTimes(1)
  })

  it('数据源绑定恒为空 → 不发起任何 data 请求', async () => {
    await mountTable()
    expect(dataSourceApi.queryData).not.toHaveBeenCalled()
  })
})
