// ----- TDD: 总线步骤值模板变量补全源（输入 { 即列候选）-----
// npx vitest run src/components/business/__tests__/busTemplateCompletion.test.ts

import { describe, it, expect } from 'vitest'
import { EditorState } from '@codemirror/state'
import { CompletionContext } from '@codemirror/autocomplete'
import { makeBusTemplateSource } from '../busTemplateCompletion'

/** 在 doc 末尾请求补全（explicit = 手动呼出，与点击按钮同效） */
function ctxAtEnd(doc: string) {
  const state = EditorState.create({ doc })
  return new CompletionContext(state, doc.length, true)
}

describe('makeBusTemplateSource', () => {
  it('光标前有 { 时接管补全，from 指向 { 以便整段替换', () => {
    const src = makeBusTemplateSource(() => ['{row.id}', '{source}'])
    const res = src(ctxAtEnd('前缀{ro'))
    expect(res).not.toBeNull()
    expect(res!.from).toBe(2)
    expect(res!.options.map((o) => o.label)).toEqual(['{row.id}', '{source}'])
  })

  it('已输入完整模板时仍列候选（便于改字段名）', () => {
    const src = makeBusTemplateSource(() => ['{row.id}', '{row.status}'])
    const res = src(ctxAtEnd('{row.id'))
    expect(res!.options.map((o) => o.label)).toEqual(['{row.id}', '{row.status}'])
  })

  it('光标前没有 { 时不接管（交回默认补全）', () => {
    const src = makeBusTemplateSource(() => ['{row.id}'])
    expect(src(ctxAtEnd('plain text'))).toBeNull()
  })

  it('候选每次调用时重新取（触发器切换后不拿到旧候选）', () => {
    let vars = ['{row.id}']
    const src = makeBusTemplateSource(() => vars)
    expect(src(ctxAtEnd('{'))!.options).toHaveLength(1)
    vars = ['{node.id}', '{source}']
    expect(src(ctxAtEnd('{'))!.options).toHaveLength(2)
  })
})
