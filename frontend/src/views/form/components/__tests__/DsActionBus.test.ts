import { describe, it, expect, vi } from 'vitest'
import { createActionBus } from '../DsActionBus'

describe('DsActionBus', () => {
  it('按 trigger 分发动作链，模板变量先解析再执行', async () => {
    const executed: string[] = []
    const executor = vi.fn((op, target, resolved) => {
      executed.push(`${op}:${target}:${JSON.stringify(resolved)}`)
    })
    const bus = createActionBus(executor)
    bus.register([
      { trigger: 'field-change', steps: [
        { op: 'set-filter', target: 'ds_person', field: 'deptId', value: '{field.dept}' },
        { op: 'refresh', target: 'ds_person' },
      ]},
    ])
    await bus.emit('field-change', { field: { dept: 'IT' } })
    expect(executor).toHaveBeenCalledTimes(2)
    expect(executor.mock.calls[0][0]).toBe('set-filter')
    expect(executor.mock.calls[0][1]).toBe('ds_person')
    expect(executor.mock.calls[0][2]).toEqual({ field: 'deptId', value: 'IT' })
    expect(executor.mock.calls[1][0]).toBe('refresh')
  })

  it('未注册的 trigger 不执行', () => {
    const executor = vi.fn()
    const bus = createActionBus(executor)
    bus.register([{ trigger: 'record-change', steps: [{ op: 'refresh', target: 'x' }] }])
    bus.emit('field-change', {})
    expect(executor).not.toHaveBeenCalled()
  })

  it('异步 executor 顺序等待', async () => {
    const order: string[] = []
    const executor = vi.fn(async (op: string) => {
      order.push(op)
      await new Promise((r) => setTimeout(r, 5))
    })
    const bus = createActionBus(executor)
    bus.register([{ trigger: 't', steps: [{ op: 'set-filter', target: 'a' }, { op: 'refresh', target: 'a' }] }])
    await bus.emit('t', {})
    expect(order).toEqual(['set-filter', 'refresh'])
  })
})
