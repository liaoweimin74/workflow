import { describe, expect, it } from 'vitest'
import {
  deploymentIdOf,
  extractFormConfig,
  parseInitiatorNodeId,
} from '../../../src/engine/process/process-design.service'

/**
 * `deployed-processes` 相关纯函数的单测。
 *
 * 契约回归覆盖了这些函数在**当前数据**下的结果（我们部署的测试流程没有配表单，
 * 所以 formDefId 一路是 null）。解析分支、容错分支只能在这里锁住。
 */

describe('extractFormConfig', () => {
  it('提取 formDefId 与字段权限', () => {
    expect(
      extractFormConfig(
        JSON.stringify({
          form: { formDefId: 'fd-1', fieldPermissions: { amount: 'readonly', reason: 'hidden' } },
        }),
      ),
    ).toEqual({ formDefId: 'fd-1', fieldPermissions: { amount: 'readonly', reason: 'hidden' } })
  })

  it('无 fieldPermissions 时返回 null（不是空对象）', () => {
    const cfg = extractFormConfig(JSON.stringify({ form: { formDefId: 'fd-1' } }))
    expect(cfg?.formDefId).toBe('fd-1')
    expect(cfg?.fieldPermissions).toBeNull()
  })

  it('无 form 节点 → null', () => {
    expect(extractFormConfig(JSON.stringify({ approval: { multiMode: '' } }))).toBeNull()
  })

  it('formDefId 缺失或为空串 → null', () => {
    expect(extractFormConfig(JSON.stringify({ form: {} }))).toBeNull()
    expect(extractFormConfig(JSON.stringify({ form: { formDefId: '' } }))).toBeNull()
  })

  it('非法 JSON → null（不抛异常，对齐 Java 的 try/catch 忽略）', () => {
    expect(extractFormConfig('{oops')).toBeNull()
  })

  it('form 是数组 → null', () => {
    expect(extractFormConfig(JSON.stringify({ form: [] }))).toBeNull()
  })
})

describe('parseInitiatorNodeId', () => {
  it('从编译产物里读 initiatorNodeId', () => {
    expect(parseInitiatorNodeId(JSON.stringify({ initiatorNodeId: 'Initiator_1' }))).toBe(
      'Initiator_1',
    )
  })

  it('缺失 / null / 非法 JSON → null', () => {
    expect(parseInitiatorNodeId(JSON.stringify({ nodes: [] }))).toBeNull()
    expect(parseInitiatorNodeId(JSON.stringify({ initiatorNodeId: null }))).toBeNull()
    expect(parseInitiatorNodeId('not json')).toBeNull()
  })
})

describe('deploymentIdOf', () => {
  it('从 key:version:uuid 里取最后一段', () => {
    expect(deploymentIdOf('contract_flow_x:2:0076ea25-b1eb-11f1-8e4b-7c8ae1a7aa09')).toBe(
      '0076ea25-b1eb-11f1-8e4b-7c8ae1a7aa09',
    )
  })

  it('段数不足时原样返回（不抛异常）', () => {
    expect(deploymentIdOf('plain')).toBe('plain')
    expect(deploymentIdOf('a:b')).toBe('a:b')
  })

  it('key 里含冒号时仍取最后一段', () => {
    expect(deploymentIdOf('k:1:2:uuid-x')).toBe('uuid-x')
  })
})
