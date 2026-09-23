import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildEmptyBpmnXml } from '../../../src/engine/process/bpmn/empty-bpmn'
import { computeDeployHash } from '../../../src/engine/process/compiler/deploy-hash'

describe('buildEmptyBpmnXml — 与 Java 逐字符一致', () => {
  it('与黄金样本中 createDraft 返回的 bpmnXml 完全相同', () => {
    // 黄金样本里 runId 已被规范化成 <RUN>，因此可以直接拿它当输入参数比对
    const dir = join(process.cwd(), 'test', 'fixtures', 'golden')
    const file = readdirSync(dir).find((f) => f.includes('流程定义'))
    expect(file, '未找到「流程定义与实例全链路」的黄金样本').toBeDefined()

    const fixture = JSON.parse(readFileSync(join(dir, file as string), 'utf8')) as {
      steps: Array<{ id: string; response: { body: { data: { bpmnXml: string; key: string; name: string } } } }>
    }
    const step = fixture.steps.find((s) => s.id === 'createDraft')
    expect(step).toBeDefined()

    const expected = step!.response.body.data.bpmnXml
    const actual = buildEmptyBpmnXml(step!.response.body.data.key, step!.response.body.data.name, null)

    // 逐字符比对 —— 连缩进、自闭合写法、dc:Rect（不是 dc:Bounds）都必须一致
    expect(actual).toBe(expected)
  })

  it('结构要点：startEvent_1 与 dc:Rect（不是 dc:Bounds）', () => {
    const xml = buildEmptyBpmnXml('k', 'n')
    expect(xml).toContain('<bpmn:startEvent id="startEvent_1"/>')
    expect(xml).toContain('<dc:Rect x="160" y="160" width="36" height="36"/>')
    expect(xml).not.toContain('dc:Bounds')
  })

  it('无分类时 targetNamespace 用默认命名空间', () => {
    expect(buildEmptyBpmnXml('k', 'n')).toContain('targetNamespace="http://flowable.org/bpmn"')
  })

  it('有分类时 targetNamespace 用分类 ID（Flowable 会拿它当 category）', () => {
    expect(buildEmptyBpmnXml('k', 'n', 'cat-1')).toContain('targetNamespace="cat-1"')
  })

  it('分类为空白串时退回默认命名空间', () => {
    expect(buildEmptyBpmnXml('k', 'n', '   ')).toContain('targetNamespace="http://flowable.org/bpmn"')
  })

  it('processKey 同时出现在 process id 与 BPMNPlane 的 bpmnElement 上', () => {
    const xml = buildEmptyBpmnXml('my_key', 'n')
    expect(xml).toContain('<bpmn:process id="my_key"')
    expect(xml).toContain('bpmnElement="my_key"')
  })
})

describe('computeDeployHash — 对齐 Java computeDeployHash', () => {
  const xml = '<definitions/>'
  const configs = { Approve_1: '{"a":1}', __PROCESS__: '{"b":2}' }

  it('产出 64 位十六进制 SHA-256', () => {
    expect(computeDeployHash(xml, configs)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('对相同输入稳定', () => {
    expect(computeDeployHash(xml, configs)).toBe(computeDeployHash(xml, configs))
  })

  it('nodeConfigs 的键顺序不影响结果（对齐 Java 的 TreeMap）', () => {
    const a = computeDeployHash(xml, { b: '2', a: '1' })
    const b = computeDeployHash(xml, { a: '1', b: '2' })
    expect(a).toBe(b)
  })

  it('配置变化会改变指纹（这是它的用途：检测未变化而跳过部署）', () => {
    const before = computeDeployHash(xml, configs)
    const after = computeDeployHash(xml, { ...configs, Approve_1: '{"a":2}' })
    expect(after).not.toBe(before)
  })

  it('XML 变化会改变指纹', () => {
    expect(computeDeployHash('<a/>', configs)).not.toBe(computeDeployHash('<b/>', configs))
  })

  it('XML 首尾空白被 trim（对齐 Java trimToNull）', () => {
    expect(computeDeployHash('  <a/>  ', configs)).toBe(computeDeployHash('<a/>', configs))
  })

  it('XML 为空白时退化成字面量 "null|"（Java 字符串拼接的真实行为）', () => {
    // Java: trimToNull("") 返回 null，null + "|" 得到 "null|"
    const blank = computeDeployHash('   ', {})
    const literalNull = computeDeployHash('null', {})
    // 两者不同：前者是字符串 "null|{}"，后者是 "null|{}" —— 实际应相同
    expect(blank).toBe(literalNull)
  })

  it('空配置时也能算（序列化为 {}）', () => {
    expect(computeDeployHash(xml, {})).toMatch(/^[0-9a-f]{64}$/)
  })

  it('含中文的配置值不改变算法（UTF-8 编码）', () => {
    expect(computeDeployHash(xml, { n: '中文' })).toMatch(/^[0-9a-f]{64}$/)
    expect(computeDeployHash(xml, { n: '中文' })).not.toBe(computeDeployHash(xml, { n: '英文' }))
  })
})
