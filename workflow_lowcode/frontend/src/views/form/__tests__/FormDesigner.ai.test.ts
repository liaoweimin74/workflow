import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * FormDesigner 与统一 AI 助手的接线检查：
 * 设计器不再内嵌独立 AI 入口，改为注册上下文 + 监听回填动作。
 * （组件依赖 form-create/路由/api，直接挂载成本高，按项目惯例做源码级断言。）
 */
describe('FormDesigner AI assistant integration', () => {
  const source = () => readFileSync(resolve(__dirname, '../FormDesigner.vue'), 'utf8')

  it('工具栏不再内嵌 AI 生成入口', () => {
    const src = source()
    expect(src).not.toContain('>AI 生成</el-button>')
    expect(src).not.toContain('AiFormGenDialog')
    expect(src).not.toContain('aiDialogVisible')
  })

  it('注册页面上下文并监听 applyFormSchema 回填', () => {
    const src = source()
    expect(src).toContain("import { useAiAssistantStore } from '@/stores/aiAssistantStore'")
    expect(src).toContain("import { aiActionBus } from '@/utils/aiActionBus'")
    expect(src).toContain("aiActionBus.on('applyFormSchema'")
    expect(src).toContain("aiAssistantStore.setContext({ route: 'form-designer', formId: formId.value })")
    expect(src).toContain('designerRef.value?.setRule(ensureRuleProps(enableCardDesignMode(rule as any[])))')
    expect(src).toContain('aiAssistantStore.setContext(null)')
  })
})
