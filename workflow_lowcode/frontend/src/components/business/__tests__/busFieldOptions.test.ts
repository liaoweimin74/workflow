// ----- 总线 set-filter 字段候选：按目标数据源取实际列 -----
// npx vitest run src/components/business/__tests__/busFieldOptions.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'

const getMetadata = vi.fn()
vi.mock('@/api/data-source', () => ({
  dataSourceApi: { getMetadata: (id: string) => getMetadata(id) },
}))

import { loadBusFieldOptions, resetBusFieldCache } from '../busFieldOptions'

function meta(columns: any[]) {
  return { data: { columns, writable: true } }
}

describe('loadBusFieldOptions', () => {
  beforeEach(() => {
    resetBusFieldCache()
    getMetadata.mockReset()
  })

  it('value 为物理列名（filter 按列生效），label 附中文名', async () => {
    getMetadata.mockResolvedValue(meta([
      { key: 'order_no', label: '订单号' },
      { key: 'amount', label: 'amount' },
    ]))
    const opts = await loadBusFieldOptions('ds_ref')
    expect(opts).toEqual([
      { value: 'order_no', label: 'order_no（订单号）' },
      { value: 'amount', label: 'amount' },
    ])
  })

  it('排除无实列的列（unsupported）与空 key，子表列不摊平', async () => {
    getMetadata.mockResolvedValue(meta([
      { key: 'status', label: '状态' },
      { key: 'items', unsupported: true },
      { key: '' },
    ]))
    const opts = await loadBusFieldOptions('ds_ref')
    expect(opts.map((o) => o.value)).toEqual(['status'])
  })

  it('同一数据源重复请求走缓存（两次展开只发一次请求）', async () => {
    getMetadata.mockResolvedValue(meta([{ key: 'status' }]))
    await loadBusFieldOptions('ds_ref')
    await loadBusFieldOptions('ds_ref')
    expect(getMetadata).toHaveBeenCalledTimes(1)
  })

  it('并发请求合流（同 refId 两个步骤同时展开只发一次）', async () => {
    let resolveIt: (v: any) => void = () => undefined
    getMetadata.mockImplementation(() => new Promise((r) => (resolveIt = r)))
    const p1 = loadBusFieldOptions('ds_ref')
    const p2 = loadBusFieldOptions('ds_ref')
    resolveIt(meta([{ key: 'status' }]))
    const [a, b] = await Promise.all([p1, p2])
    expect(getMetadata).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('失败返回空候选且不缓存（下次展开可重试，用户仍可手输字段名）', async () => {
    getMetadata.mockRejectedValueOnce(new Error('500'))
    expect(await loadBusFieldOptions('ds_ref')).toEqual([])
    getMetadata.mockResolvedValue(meta([{ key: 'status' }]))
    expect(await loadBusFieldOptions('ds_ref')).toHaveLength(1)
    expect(getMetadata).toHaveBeenCalledTimes(2)
  })

  it('不同数据源各自缓存', async () => {
    getMetadata.mockImplementation((id: string) => Promise.resolve(meta([{ key: `col_${id}` }])))
    expect((await loadBusFieldOptions('a'))[0].value).toBe('col_a')
    expect((await loadBusFieldOptions('b'))[0].value).toBe('col_b')
    expect(getMetadata).toHaveBeenCalledTimes(2)
  })
})
