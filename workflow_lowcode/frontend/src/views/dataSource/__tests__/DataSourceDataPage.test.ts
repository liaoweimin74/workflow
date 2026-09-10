import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('@/api/data-source', () => ({
  dataSourceApi: {
    getDataSource: vi.fn(async () => ({ data: { id: 'ds-1', name: '员工查询', type: 'SQL', status: 'ENABLED' } })),
    getMetadata: vi.fn(async () => ({
      data: { writable: true, formKey: 'emp_profile', columns: [
        { key: 'id', label: 'ID', columnType: 'BIGINT' },
        { key: 'name', label: '姓名', columnType: 'VARCHAR', required: true },
      ] },
    })),
    queryData: vi.fn(async () => ({ data: { records: [{ id: 'r1', data: { id: 1, name: '张三' }, version: 1 }], total: 1 } })),
  },
}))
vi.mock('@/api/form', () => ({
  formApi: { getFormDefinitionByKey: vi.fn(async () => ({ data: { schema: '[]' } })) },
}))
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'ds-1' } }),
  useRouter: () => ({ back: vi.fn() }),
}))

// SearchTable stub：断言传入的 columns/fetchApi/formConfig
const SearchTableStub = {
  name: 'SearchTable',
  template: '<div><slot /></div>',
  props: ['columns', 'fetchApi', 'formConfig', 'searchFields', 'defaultPageSize', 'pageSizes'],
}

import DataSourceDataPage from '../DataSourceDataPage.vue'

describe('DataSourceDataPage', () => {
  let wrapper: any
  beforeEach(async () => {
    wrapper = mount(DataSourceDataPage, { global: { stubs: { SearchTable: SearchTableStub } } })
    await flushPromises()
  })

  it('页头显示数据源名称/类型/状态', () => {
    expect(wrapper.text()).toContain('员工查询')
    expect(wrapper.text()).toContain('SQL')
    expect(wrapper.text()).toContain('已启用')
  })

  it('可写数据源透传 formConfig 给 SearchTable（CRUD 弹窗）', async () => {
    const stub = wrapper.findComponent(SearchTableStub) as any
    expect(stub.props('formConfig')).toBeTruthy()
    expect(stub.props('formConfig').createApi).toBeTypeOf('function')
    expect(stub.props('formConfig').updateApi).toBeTypeOf('function')
    expect(stub.props('formConfig').deleteApi).toBeTypeOf('function')
    // 数据管理页列 = 用户配置字段（id + name），不含内置更新时间尾列
    expect(stub.props('columns')).toHaveLength(2)
    expect(stub.props('columns').map((c: any) => c.prop)).not.toContain('updatedAt')
  })

  it('按元数据列推导 searchFields（VARCHAR 可筛 → input）', async () => {
    const stub = wrapper.findComponent(SearchTableStub) as any
    const fields = stub.props('searchFields') as any[]
    expect(fields.some((f: any) => f.prop === 'name' && f.type === 'input')).toBe(true)
    // JSON/BIGINT 非筛列不入 searchFields
    expect(fields.some((f: any) => f.prop === 'id')).toBe(false)
  })

  it('fetchApi 委托 dataSourceApi.queryData 且保持 records 原结构（row.data[key] 契约）', async () => {
    const stub = wrapper.findComponent(SearchTableStub) as any
    const res = await stub.props('fetchApi')({ page: 1, size: 20 })
    expect(res.rows).toHaveLength(1)
    expect(res.total).toBe(1)
    expect(res.rows[0].data?.name).toBe('张三')
    // 不解构：业务字段在 row.data 内层（列 render 契约）
    expect(res.rows[0].name).toBeUndefined()
  })

  it('只读数据源（writable=false）formConfig 为 undefined（纯列表）', async () => {
    const { dataSourceApi } = await import('@/api/data-source')
    ;(dataSourceApi.getMetadata as any).mockResolvedValueOnce({
      data: { writable: false, formKey: '', columns: [{ key: 'id', label: 'ID', columnType: 'BIGINT' }] },
    })
    wrapper = mount(DataSourceDataPage, { global: { stubs: { SearchTable: SearchTableStub } } })
    await flushPromises()
    expect((wrapper.findComponent(SearchTableStub) as any).props('formConfig')).toBeUndefined()
  })
})