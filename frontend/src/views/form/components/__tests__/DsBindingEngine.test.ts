import { describe, it, expect, vi } from 'vitest'
import { createDsBindingEngine } from '../DsBindingEngine'
import type { Rule } from '@form-create/element-ui'

function containerRule(props: Record<string, unknown>, children: Rule[]): Rule {
  return { type: 'formContainer', field: 'fc_a', props, children } as unknown as Rule
}

describe('createDsBindingEngine', () => {
  const dsApi = {
    getData: vi.fn(async () => ({ data: { name: '张三', items: [{ product: 'A', qty: 2 }] } })),
    updateData: vi.fn(async () => ({ data: null })),
    getMetadata: vi.fn(async () => ({ data: { columns: [], writable: true } })),
  }

  beforeEach(() => {
    vi.clearAllMocks()
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
    expect(engine.mount([containerRule({ dataSourceId: 'ds_1', recordLocator: { type: 'current-record' } }, [])])).toBe(true)
    expect(engine.mount([{ type: 'input', field: 'a' } as unknown as Rule])).toBe(false)
  })

  it('loadRecord 按字段填充容器内组件（含嵌套 items）', async () => {
    const deps = makeDeps()
    const engine = createDsBindingEngine({ dsApi } as never, deps as never)
    engine.mount([containerRule({ dataSourceId: 'ds_1' }, [
      { type: 'input', field: 'name' } as unknown as Rule,
      { type: 'group', field: 'items', props: { rule: [{ type: 'input', field: 'product' }] } } as unknown as Rule,
    ])])
    await engine.loadRecord('rec_1')
    expect(dsApi.getData).toHaveBeenCalledWith('ds_1', 'rec_1')
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
    expect(dsApi.updateData).toHaveBeenCalledWith('ds_1', 'rec_1', expect.objectContaining({ name: expect.anything() }))
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
})
