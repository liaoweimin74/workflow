/**
 * IR 目标无关性（P2 spec）：模板生成只读 IR，IR 自身不依赖 form-create / Vue / EP。
 *
 * 静态检查兜住「分层回潮」：emit 里再写 schema.rule 这类直读、或 IR 反过来 import 契约表/
 * 目标框架，都会在这里红。行为检查兜住「emit 实际仍在读 schema」：同一份 IR 单独出码必须与
 * generatePage 逐字节一致，改 IR 的字段也必须直接反映到产物。
 */
import { describe, expect, it } from 'vitest'

import { emitFiles, emitManifest, emitTemplate } from '../emit'
import emitSource from '../emit?raw'
import chainEmitSource from '../chain-emit?raw'
import chainsSource from '../chains?raw'
import { generatePage } from '../generate'
import irSource from '../ir?raw'
import parseSource from '../parse?raw'
import { parseIr } from '../parse'
import reportSource from '../report?raw'
import reverseSource from '../reverse?raw'
import testPage from './fixtures/test_page.schema.json'

const META = { pageKey: 'test_page', pageName: 'test_page', exportedAt: '2026-10-22' }
/** 只认模块顶部的 import 语句：产物模板里的 import 文本（L.push("import ...")）不算依赖 */
const importsOf = (src: string) =>
  [...src.matchAll(/^import\s+[\s\S]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1])

describe('IR 目标无关性', () => {
  it('IR 模块零依赖：不 import form-create / vue / element-plus / 契约表', () => {
    expect(importsOf(irSource)).toEqual([])
    expect(irSource).not.toMatch(/require\s*\(/)
  })

  it('分层依赖单向：parse 与 emit 只依赖契约表与 IR，互不 import', () => {
    // chains = 判定侧（读 schema + 契约，产 IrChain），chain-emit = 目标侧（只读 IrChain）
    expect([...new Set(importsOf(parseSource))].sort()).toEqual(['./chains', './contract', './ir'])
    expect([...new Set(importsOf(emitSource))].sort()).toEqual(['./chain-emit', './contract', './ir'])
    expect([...new Set(importsOf(chainsSource))].sort()).toEqual(['./contract', './ir'])
    expect([...new Set(importsOf(chainEmitSource))].sort()).toEqual(['./ir'])
  })

  it('报告层只依赖契约表与回读器：不回头 import 生成入口', () => {
    // Task 2.4 起报告层读 target-profile（per-target 分桶的判定真值表，与 contract.ts
    // 同为单向依赖，不构成环）；仍然不许回头 import 生成入口
    expect([...new Set(importsOf(reportSource))].sort()).toEqual(['./contract', './ir', './reverse', './target-profile'])
    // generatePage 现在会调 report，回读器反指回生成入口就是运行时成环（type import 也会被改成值导入）
    expect(importsOf(reverseSource)).not.toContain('./generate')
  })

  it('模板 / manifest 生成只读 IR：三个入口都吃 IrPage，不接 schema', () => {
    expect(emitSource).toMatch(/export function emitTemplate\(ir: IrPage\): string/)
    expect(emitSource).toMatch(/export function emitFiles\(ir: IrPage\)/)
    // target 说明「这份 manifest 描述哪个端的产物」（默认 web，uni 走 generatePageUni），
    // 不是 schema：一份 IR 单入口的纪律不变
    expect(emitSource).toMatch(/export function emitManifest\(ir: IrPage, target: 'web' \| 'uniapp' = 'web'\)/)
    expect(emitSource).not.toMatch(/function\s+\w+\(schema\b/)
  })

  it('同一份 IR 脱离 schema 单独生成，产物与 manifest 逐字节一致', () => {
    const schema = testPage as Record<string, any>
    const ir = parseIr(schema as any, META)
    const viaIr = emitFiles(ir)
    expect(viaIr).toEqual(generatePage(schema as any, META).files)
    expect(emitManifest(ir)).toEqual(generatePage(schema as any, META).manifest)
    expect(emitTemplate(ir)).toBe(viaIr[ir.file])
  })

  it('产物随 IR 变化，而不是随 schema 变化（emit 不回头读原始节点）', () => {
    const ir = parseIr(testPage as any, META)
    ir.nodes[0].artifact.anchor = 'lc:node=MUTATED type=probe field=probe'
    expect(emitTemplate(ir)).toContain('lc:node=MUTATED type=probe field=probe')
  })
})
