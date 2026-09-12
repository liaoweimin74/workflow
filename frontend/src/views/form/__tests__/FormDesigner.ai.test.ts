import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * FormDesigner AI 生成入口与回填链路的接线检查。
 * 表单设计器组件依赖 form-create、路由与 api，直接挂载成本过高，
 * 故按项目惯例（PageDesigner.card-mode.test.ts）做源码级接线断言。
 */
describe('FormDesigner AI generation entry', () => {
  const source = () => readFileSync(resolve(__dirname, '../FormDesigner.vue'), 'utf8')

  it('工具栏提供 AI 生成按钮并挂载弹窗', () => {
    const src = source()
    expect(src).toContain("import AiFormGenDialog from './components/AiFormGenDialog.vue'")
    expect(src).toContain('MagicStick')
    expect(src).toContain('>AI 生成</el-button>')
    expect(src).toContain('<AiFormGenDialog v-model="aiDialogVisible" @apply="handleAiApply" />')
  })

  it('回填复用 setRule + ensureRuleProps + enableCardDesignMode 管线', () => {
    const src = source()
    expect(src).toContain('const aiDialogVisible = ref(false)')
    expect(src).toContain('function handleAiApply(rule: unknown[])')
    expect(src).toContain('designerRef.value?.setRule(ensureRuleProps(enableCardDesignMode(rule as any[])))')
  })
})
