import { describe, expect, it } from 'vitest'
import { columnOptionLabel } from '../columnOption'

// Task 14-R1/30-B 需求③④：筛选列名统一「中文名(英文名)」，无中文降级英文名
// 签名：对象 { key, label }（恢复时对齐实现，原两参数签名为重置前半成品残留）
describe('columnOptionLabel', () => {
  it('有中文名 → 中文名(英文名)', () => {
    expect(columnOptionLabel({ key: 'reason', label: '请假事由' })).toBe('请假事由(reason)')
    expect(columnOptionLabel({ key: 'leaveType', label: '请假类型' })).toBe('请假类型(leaveType)')
  })

  it('无中文名（null/undefined/空串/空白）→ 降级英文名', () => {
    expect(columnOptionLabel({ key: 'reason' })).toBe('reason')
    expect(columnOptionLabel({ key: 'days', label: null })).toBe('days')
    expect(columnOptionLabel({ key: 'days', label: '' })).toBe('days')
    expect(columnOptionLabel({ key: 'days', label: '   ' })).toBe('days')
  })

  it('中文名与 key 相同 → 不重复拼接，只显示英文名', () => {
    expect(columnOptionLabel({ key: 'reason', label: 'reason' })).toBe('reason')
  })

  it('key 为空 → 返回空串', () => {
    expect(columnOptionLabel({ key: '', label: '请假事由' })).toBe('')
  })
})
