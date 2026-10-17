// ----- 总线步骤值模板变量补全 -----
// 值里的 {row.id} 不是 JS 而是 PageRendererPage.resolveStepValue 的点路径模板，
// 根名/字段名拼错不会报错、只静默取空，故输入 { 即列出当前触发器可用的模板。

import type { Completion, CompletionContext, CompletionResult, CompletionSource } from '@codemirror/autocomplete'

/**
 * @param getVars 候选模板清单（如 `{row.id}`），每次呼出补全时重新取，
 *                使触发器切换后立刻拿到新候选而不必重建编辑器。
 */
export function makeBusTemplateSource(getVars: () => string[]): CompletionSource {
  return (ctx: CompletionContext): CompletionResult | null => {
    const match = ctx.matchBefore(/\{[\w.]*$/)
    if (!match || (match.from === match.to && !ctx.explicit)) return null
    const options: Completion[] = getVars().map((label) => ({ label, type: 'variable' }))
    if (!options.length) return null
    return { from: match.from, options, validFor: /^\{[\w.]*$/ }
  }
}
