import { describe, it, expect, beforeEach } from 'vitest'
import { aiActionBus } from '../aiActionBus'

describe('aiActionBus', () => {
  beforeEach(() => aiActionBus.clear())

  it('emit 调用已注册处理器并传递 payload', () => {
    const seen: unknown[] = []
    aiActionBus.on('applyFormSchema', (p) => seen.push(p))

    aiActionBus.emit('applyFormSchema', [1, 2])

    expect(seen).toEqual([[1, 2]])
  })

  it('注销后不再触发', () => {
    const seen: unknown[] = []
    const off = aiActionBus.on('a', (p) => seen.push(p))
    off()

    aiActionBus.emit('a', 1)

    expect(seen).toEqual([])
  })

  it('单个处理器异常不影响其他处理器', () => {
    const seen: unknown[] = []
    aiActionBus.on('a', () => {
      throw new Error('boom')
    })
    aiActionBus.on('a', (p) => seen.push(p))

    aiActionBus.emit('a', 1)

    expect(seen).toEqual([1])
  })
})
