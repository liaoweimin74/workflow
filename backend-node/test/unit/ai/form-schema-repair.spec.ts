import { describe, expect, it } from 'vitest'
import { FormSchemaValidator, repairTruncatedJson } from '../../../src/ai/service/form-schema-validator'

/**
 * repairTruncatedJson：GLM 长表单 schema 输出的两类确定性缺陷修复——
 *   ① 括号交错（validate 数组漏 `]` 直接闭合字段对象）
 *   ② 尾部截断（finish=stop 但缺闭合括号）
 * 背景：update_form E2E 中真实复现的模型输出缺陷（3 次输出 655/704 字符
 * 交错/截断），修复器恢复后 validate 全链路通过。
 */

const validator = new FormSchemaValidator()

const INTERLEAVED_RAW =
  '{"rule":[{"type":"input","field":"title","title":"标题","value":null,"validate":[{"required":true,"message":"请填写标题"}]},' +
  '{"type":"radio","field":"department","title":"部门","value":null,"options":[{"label":"销售部","value":"销售部"}],"validate":[{"required":true,"message":"请选择部门"}}]}'

const TRUNCATED_TAIL =
  '{"rule":[{"type":"input","field":"title","title":"标题"}],'

describe('repairTruncatedJson', () => {
  it('括号交错 → 补全 validate 数组闭合', () => {
    const repaired = repairTruncatedJson(INTERLEAVED_RAW)
    expect(repaired).not.toBeNull()
    const parsed = JSON.parse(repaired!)
    const dept = parsed.rule.find((f: { field: string }) => f.field === 'department')
    expect(dept.validate).toEqual([{ required: true, message: '请选择部门' }])
  })

  it('尾部悬挂逗号/未闭合 → 补全', () => {
    const repaired = repairTruncatedJson(TRUNCATED_TAIL)
    expect(repaired).not.toBeNull()
    expect(JSON.parse(repaired!).rule).toHaveLength(1)
  })

  it('完整 JSON → 透传', () => {
    expect(repairTruncatedJson('{"a":1}')).not.toBeNull()
    expect(repairTruncatedJson('{"a":1}')).toContain('"a"')
  })

  it('非对象文本 / 对象缺失 / 括号完全错乱 → null', () => {
    expect(repairTruncatedJson('plain text')).toBeNull()
    expect(repairTruncatedJson(']}{[')).toBeNull()
    expect(repairTruncatedJson('{"a":1}x{')).toBeNull()
  })

  it('validator.validate 对交错输出全链路通过（E2E 缺陷回归）', () => {
    const result = validator.validate(INTERLEAVED_RAW)
    expect(result.fields.map((f) => f.field)).toContain('department')
    expect(result.schema).toContain('请选择部门')
  })
})
