/**
 * 从 form-create / Element Plus 的校验拒绝结果中提取第一条字段错误文案。
 * 兼容：Error/字符串、{ field: [{ message }] }、{ errors: [...] }、{ message }。
 */
export function firstValidateMessage(error: unknown): string {
  if (!error) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error !== 'object') return ''
  const obj = error as Record<string, unknown>
  if (typeof obj.message === 'string' && obj.message) return obj.message
  if (Array.isArray(obj.errors)) {
    for (const item of obj.errors) {
      const message = firstValidateMessage(item)
      if (message) return message
    }
  }
  for (const value of Object.values(obj)) {
    const message = firstValidateMessage(value)
    if (message) return message
  }
  return ''
}
