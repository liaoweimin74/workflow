/**
 * 计算公式可视化编辑器的字段来源注册表（Task 145）。
 *
 * FormulaExpressionEditor 渲染在 fc-designer 属性面板（form-create 实例内部），
 * 拿不到设计器组件实例；通过模块级 provider 桥接：
 * - 设计器（FormDesigner/PageDesigner）setup 时 setFormulaFieldProvider，
 *   闭包内实时读 designerRef.getRule() 收集同层字段
 * - 编辑器打开弹窗时 getFormulaFieldOptions() 取当前候选
 *
 * 单页同时只有一个活跃设计器，模块单例安全；provider 抛错按空列表兜底。
 */

export interface FormulaFieldOption {
  /** 字段名（表达式引用键） */
  field: string
  /** 中文名（rule.title） */
  title?: string
  /** 组件类型（如 inputNumber / input / el-select） */
  type?: string
}

type FieldProvider = () => FormulaFieldOption[]

let provider: FieldProvider | null = null

export function setFormulaFieldProvider(fn: FieldProvider): void {
  provider = fn
}

export function getFormulaFieldOptions(): FormulaFieldOption[] {
  if (!provider) return []
  try {
    return provider() ?? []
  } catch {
    return []
  }
}
