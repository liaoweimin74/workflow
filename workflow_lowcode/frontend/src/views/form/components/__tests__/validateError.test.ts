import { describe, expect, it } from 'vitest'
import { firstValidateMessage } from '../../validateError'

describe('firstValidateMessage', () => {
  it('取 form-create 字段错误里的首条文案', () => {
    expect(firstValidateMessage({
      name: [{ message: '请输入页面名称', field: 'name' }],
      key: [{ message: '请输入页面标识', field: 'key' }],
    })).toBe('请输入页面名称')
  })

  it('兼容 Element Plus errors 数组与 Error/字符串', () => {
    expect(firstValidateMessage({ errors: ['请输入菜单名称'] })).toBe('请输入菜单名称')
    expect(firstValidateMessage(new Error('请输入路由路径'))).toBe('请输入路由路径')
    expect(firstValidateMessage('请输入组件路径')).toBe('请输入组件路径')
  })

  it('无可用文案时返回空串', () => {
    expect(firstValidateMessage(undefined)).toBe('')
    expect(firstValidateMessage({})).toBe('')
  })
})
