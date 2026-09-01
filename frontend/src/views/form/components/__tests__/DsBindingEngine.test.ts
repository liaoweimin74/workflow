import { describe, it, expect, vi } from 'vitest'
import { createDsBindingEngine } from '../DsBindingEngine'
import { activeDsBindings } from '@/utils/formDsBindingsStore'
import type { Rule } from '@form-create/element-ui'

function containerRule(props: Record<string, unknown>, children: Rule[]): Rule {
  return { type: 'formContainer', field: 'fc_a', props, children } as unknown as Rule
}

describe('createDsBindingEngine', () => {
  const dsApi = {
    // 真实后端返回 R<BizDataVO>：res.data = { id, version, data: { 字段... } }
    getData: vi.fn(async () => ({
      data: { id: 'rec_1', version: 3, data: { name: '张三', items: [{ product: 'A', qty: 2 }] } },
    })),
    updateData: vi.fn(async () => ({ data: null })),
    getMetadata: vi.fn(async () => ({ data: { columns: [], writable: true } })),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    activeDsBindings.value = [
      'ds_1', 'ds_ro', 'ds_test', 'ds_v', 'ds_g',
    ].map((id) => ({ id, refId: id }))
  })

  function makeDeps(overrides: Record<string, unknown> = {}) {
    return {
      api: {
        getValue: vi.fn((field: string) => (field === 'name' ? '新值' : undefined)),
        setValue: vi.fn(),
      },
      recordId: () => 'rec_1',
      onRecordChange: vi.fn(),
      onFieldChange: vi.fn(),
      onConflict: vi.fn(),
      ...overrides,
    }
  }

  it('mount 含容器返回 true，无容器返回 false', () => {
    const engine = createDsBindingEngine({ dsApi } as never, makeDeps() as never)
    expect(engine.mount([containerRule({ dataSourceId: 'global-1', recordLocator: { type: 'current-record' } }, [])])).toBe(true)
    expect(engine.mount([{ type: 'input', field: 'a' } as unknown as Rule])).toBe(false)
  })

  it('loadRecord 按字段填充容器内组件（含嵌套 items）', async () => {
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'global-1' }, [
      { type: 'input', field: 'name' } as unknown as Rule,
      { type: 'group', field: 'items', props: { rule: [{ type: 'input', field: 'product' }] } } as unknown as Rule,
    ])])
    await engine.loadRecord('rec_1')
    expect(dsApi.getData).toHaveBeenCalledWith('global-1', 'rec_1')
    expect(deps.api.setValue).toHaveBeenCalledWith('name', '张三')
    expect(deps.api.setValue).toHaveBeenCalledWith('items', [{ product: 'A', qty: 2 }])
  })

  it('写路径：onFieldChange 命中容器字段 → 防抖后 updateData', async () => {
    vi.useFakeTimers()
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_1' }, [{ type: 'input', field: 'name' } as unknown as Rule])])
    await vi.advanceTimersByTimeAsync(0) // 让 mount 的 resolveWritable microtask 完成
    const fieldCb = deps.onFieldChange.mock.calls[0][0] as (f: string) => void
    fieldCb('name')
    await vi.advanceTimersByTimeAsync(300)
    // write 时若无 loadRecord，version 为 undefined
    expect(dsApi.updateData).toHaveBeenCalledWith('ds_1', 'rec_1', expect.objectContaining({ name: expect.anything() }), undefined)
    vi.useRealTimers()
  })

  it('只读数据源（writable=false）跳过写', async () => {
    vi.useFakeTimers()
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi: { ...dsApi, getMetadata: vi.fn(async () => ({ data: { columns: [], writable: false } })) } } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_ro' }, [{ type: 'input', field: 'name' } as unknown as Rule])])
    await vi.advanceTimersByTimeAsync(0) // 让 mount 的 resolveWritable microtask 完成
    const fieldCb = deps.onFieldChange.mock.calls[0][0] as (f: string) => void
    fieldCb('name')
    await vi.advanceTimersByTimeAsync(300)
    expect(dsApi.updateData).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('flush 强制完成未决写入', async () => {
    vi.useFakeTimers()
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_1' }, [{ type: 'input', field: 'name' } as unknown as Rule])])
    await vi.advanceTimersByTimeAsync(0) // 让 mount 的 resolveWritable microtask 完成
    const fieldCb = deps.onFieldChange.mock.calls[0][0] as (f: string) => void
    fieldCb('name')
    await engine.flush()
    expect(dsApi.updateData).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('loadRecord 读取嵌套 BizDataVO（res.data.data）', async () => {
    // getData 返回 R<BizDataVO> = { data: { id, version, data: {...fields} } }
    const mockApi = {
      getData: vi.fn(async () => ({ data: { id: 'rec_test', version: 7, data: { name: '嵌套字段', count: 42 } } })),
      updateData: vi.fn(),
      getMetadata: vi.fn(),
    }
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi: mockApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_1' }, [{ type: 'input', field: 'name' } as unknown as Rule])])
    await engine.loadRecord('rec_test')
    expect(mockApi.getData).toHaveBeenCalledWith('ds_1', 'rec_test')
    expect(deps.api.setValue).toHaveBeenCalledWith('name', '嵌套字段')
  })

  it('flush 传入 loadRecord 记录的 version', async () => {
    vi.useFakeTimers()
    const mockApi = {
      getData: vi.fn(async () => ({ data: { id: 'rec_v', version: 5, data: { name: '姓名' } } })),
      updateData: vi.fn(async () => ({ data: null })),
      getMetadata: vi.fn(async () => ({ data: { columns: [], writable: true } })),
    }
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi: mockApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_v' }, [{ type: 'input', field: 'name' } as unknown as Rule])])
    await engine.loadRecord('rec_v')
    deps.onFieldChange.mock.calls[0][0]('name')
    await vi.advanceTimersByTimeAsync(300)
    // deps.recordId() 返回 'rec_1', getValue('name') 返回 '新值'
    expect(mockApi.updateData).toHaveBeenCalledWith('ds_v', 'rec_1', expect.objectContaining({ name: '新值' }), 5)
    vi.useRealTimers()
  })

  it('getLastRecord 返回最近 loadRecord 的字段数据', async () => {
    const mockApi = {
      getData: vi.fn(async () => ({ data: { id: 'rec_g', version: 10, data: { foo: 'bar', num: 123 } } })),
      updateData: vi.fn(),
      getMetadata: vi.fn(async () => ({ data: { columns: [], writable: true } })),
    }
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi: mockApi } as never, deps as never)
    const mounted = engine.mount([containerRule({ dataSourceId: 'ds_g' }, [{ type: 'input', field: 'foo' } as unknown as Rule])])
    expect(mounted).toBe(true)
    await engine.loadRecord('rec_g')
    expect(mockApi.getData).toHaveBeenCalledWith('ds_g', 'rec_g')
    const last = engine.getLastRecord()
    expect(last).toEqual({ foo: 'bar', num: 123 })
  })
})
