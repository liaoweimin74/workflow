import { describe, expect, it } from 'vitest'
import {
  assertPageSize,
  bindIntProperty,
  bindIntegerProperty,
  intQueryParam,
  integerQueryParam,
  integerQueryParamOrNull,
  longPathParam,
  toBoolOrNull,
  toInt,
  toTimestampOrNull,
} from '../../../src/framework/http/query-params'

/**
 * 查询参数绑定的单测（对齐 Java 的三条失败形态）。
 *
 * 这三条形态是契约场景「非法查询参数与分页边界」**实测**出来的，不是读代码推测的：
 *
 * | 形态 | HTTP | body code | 消息 |
 * |---|---|---|---|
 * | A 显式 `@RequestParam int\|Integer\|Long` | 500 | 500 | `Method parameter 'page': ... required type 'int'; For input string: "abc"` |
 * | B 绑定对象 `int` 字段 | 200 | 400 | `... for property 'page'; For input string: "abc"` |
 * | B' 绑定对象 `Integer` 字段 | 200 | 400 | `... required type 'java.lang.Integer'; ...`（无 property 段） |
 *
 * 单测的价值在于**消息模板逐字锁定**：契约只覆盖了每个形态的一两个参数名，
 * 而这里把「类型名怎么进消息」「空串走默认值」「溢出算失败」这些规则全部钉住，
 * 免得以后有人「顺手」简化模板。
 */

function messageOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error('预期抛错，但没有抛')
}

function errorNameOf(fn: () => unknown): string {
  try {
    fn()
  } catch (error) {
    return (error as Error).name
  }
  throw new Error('预期抛错，但没有抛')
}

describe('形态 A：显式 @RequestParam（失败 → 普通 Error ⇒ HTTP 500）', () => {
  it('int：消息里是 int，且抛的是普通 Error（不是 IllegalArgumentException）', () => {
    expect(intQueryParam('5', 'page', 1)).toBe(5)
    expect(messageOf(() => intQueryParam('abc', 'page', 1))).toBe(
      'Method parameter \'page\': Failed to convert value of type \'java.lang.String\'' +
        ' to required type \'int\'; For input string: "abc"',
    )
    // 必须是普通 Error：IllegalArgumentException 会被过滤器映射成 400，与 Java 的 500 分叉
    expect(errorNameOf(() => intQueryParam('abc', 'page', 1))).toBe('Error')
  })

  it('Integer：消息里是 java.lang.Integer', () => {
    expect(messageOf(() => integerQueryParam('abc', 'page', 1))).toBe(
      'Method parameter \'page\': Failed to convert value of type \'java.lang.String\'' +
        ' to required type \'java.lang.Integer\'; For input string: "abc"',
    )
    expect(integerQueryParam('7', 'size', 20)).toBe(7)
  })

  it('Long（路径变量）：消息里是 java.lang.Long', () => {
    expect(longPathParam('12', 'id')).toBe(12)
    expect(messageOf(() => longPathParam('contract-not-a-number', 'id'))).toBe(
      'Method parameter \'id\': Failed to convert value of type \'java.lang.String\'' +
        ' to required type \'java.lang.Long\'; For input string: "contract-not-a-number"',
    )
  })

  it('缺失 / 空串走 defaultValue；可空版本返回 null', () => {
    expect(intQueryParam(undefined, 'page', 1)).toBe(1)
    expect(intQueryParam('', 'page', 1)).toBe(1)
    expect(integerQueryParamOrNull(undefined, 'version')).toBeNull()
    expect(integerQueryParamOrNull('', 'version')).toBeNull()
    expect(integerQueryParamOrNull('3', 'version')).toBe(3)
  })

  it('严格按 Java 的数字语义：拒绝 12.5 / 1e3 / 0x10 / 空白 / 溢出；接受 +5 与 007', () => {
    for (const bad of ['12.5', '1e3', '0x10', ' 5 ', 'Infinity', 'NaN', '5,0']) {
      expect(messageOf(() => intQueryParam(bad, 'size', 20))).toContain('For input string:')
    }
    expect(intQueryParam('+5', 'size', 20)).toBe(5)
    expect(intQueryParam('007', 'size', 20)).toBe(7)
    // 32 位溢出（契约里 `size=99999999999999999999` 就是这一步）
    expect(messageOf(() => intQueryParam('2147483648', 'size', 20))).toContain(
      'For input string: "2147483648"',
    )
    expect(intQueryParam('2147483647', 'size', 20)).toBe(2147483647)
    // Long 允许更大的范围（BigInt 判界，避免双精度边界误判）
    expect(longPathParam('9223372036854775807', 'id')).toBe(Number('9223372036854775807'))
    expect(messageOf(() => longPathParam('9223372036854775808', 'id'))).toContain('For input string:')
  })
})

describe('形态 B / B\'：绑定对象字段（失败 → BusinessException(400) ⇒ HTTP 200 + body code 400）', () => {
  it('bindIntProperty：带 `for property` 段', () => {
    const error = (() => {
      try {
        bindIntProperty('abc', 'page', 1)
      } catch (e) {
        return e as { name: string; code: number; message: string }
      }
      throw new Error('预期抛错')
    })()
    expect(error.code).toBe(400)
    expect(error.message).toBe(
      'Failed to convert property value of type \'java.lang.String\'' +
        ' to required type \'int\' for property \'page\'; For input string: "abc"',
    )
    expect(bindIntProperty(undefined, 'page', 1)).toBe(1)
    expect(bindIntProperty('', 'size', 20)).toBe(20)
    expect(bindIntProperty('9', 'size', 20)).toBe(9)
  })

  it('bindIntegerProperty：**没有** `for property` 段（系统管理查询对象）', () => {
    const error = (() => {
      try {
        bindIntegerProperty('abc', 1)
      } catch (e) {
        return e as { code: number; message: string }
      }
      throw new Error('预期抛错')
    })()
    expect(error.code).toBe(400)
    expect(error.message).toBe(
      'Failed to convert value of type \'java.lang.String\' to required type' +
        ' \'java.lang.Integer\'; For input string: "abc"',
    )
  })
})

describe('分页边界与其余助手', () => {
  it('assertPageSize：size < 1 → IllegalArgumentException（HTTP 400）+ Spring Data 原话', () => {
    expect(() => assertPageSize(1)).not.toThrow()
    expect(() => assertPageSize(20)).not.toThrow()
    expect(messageOf(() => assertPageSize(0))).toBe('Page size must not be less than one')
    expect(messageOf(() => assertPageSize(-1))).toBe('Page size must not be less than one')
    // 必须是 IllegalArgumentException 形态：过滤器据此给 400（不是 500）
    expect(errorNameOf(() => assertPageSize(0))).toBe('IllegalArgumentException')
  })

  it('toInt：不做校验的宽松版本（仅用于 Java 侧本来就没这个参数的地方）', () => {
    expect(toInt(undefined, 5)).toBe(5)
    expect(toInt('7', 5)).toBe(7)
    expect(toInt('abc', 5)).toBe(5)
    expect(toInt('', 5)).toBe(5)
  })

  it('toBoolOrNull / toTimestampOrNull 的既有语义不变', () => {
    expect(toBoolOrNull('TRUE')).toBe(true)
    expect(toBoolOrNull('false')).toBe(false)
    expect(toBoolOrNull('yes')).toBeNull()
    expect(toBoolOrNull('')).toBeNull()
    expect(toTimestampOrNull('2026-01-02 03:04:05')?.getSeconds()).toBe(5)
    expect(toTimestampOrNull('bad')).toBeNull()
    expect(toTimestampOrNull(undefined)).toBeNull()
  })
})
