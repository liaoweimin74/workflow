/**
 * form-create rule 树的遍历工具。
 *
 * 设计器 schema 中存在三类嵌套：
 * - 布局容器（row/col 等）：内部字段在 `children`
 * - 子表单组件（group/subForm 等）：内部字段在 `props.rule`
 * - 子表组件（tableForm）：内部字段在 `props.columns[].rule`（每列一个 rule 数组）
 *
 * 所有需要"收集字段 / 写回配置"的逻辑都必须同时穿透这些结构，
 * 否则子表内部的字段（如 LookupPicker/dataPicker）无法被配置。
 */

export interface RuleLike {
  type?: string
  field?: string
  props?: Record<string, any>
  children?: RuleLike[]
}

/** 深度优先遍历 rule 树：穿透 children、props.rule、props.columns[].rule 三种嵌套 */
export function walkRules(rules: RuleLike[] | undefined, visit: (rule: RuleLike) => void): void {
  if (!rules) return
  for (const rule of rules) {
    visit(rule)
    if (Array.isArray(rule.children)) {
      walkRules(rule.children, visit)
    }
    const inner = rule.props?.rule
    if (Array.isArray(inner)) {
      walkRules(inner, visit)
    }
    const columns = rule.props?.columns
    if (Array.isArray(columns)) {
      for (const col of columns) {
        if (col && Array.isArray(col.rule)) {
          walkRules(col.rule, visit)
        }
      }
    }
  }
}

/** 收集指定组件类型的字段（field → props），穿透子表内部 */
export function collectFieldsOfType(rules: RuleLike[] | undefined, type: string): { field: string; props: Record<string, any> }[] {
  const out: { field: string; props: Record<string, any> }[] = []
  walkRules(rules, (rule) => {
    if (rule.type === type && rule.field) {
      out.push({ field: rule.field, props: rule.props || {} })
    }
  })
  return out
}

/** 收集全部字段 key（供回填映射 / 级联依赖的目标字段选择），穿透子表内部 */
export function collectFieldKeys(rules: RuleLike[] | undefined): string[] {
  const keys: string[] = []
  walkRules(rules, (rule) => {
    if (rule.field) keys.push(rule.field)
  })
  return keys
}

/**
 * 将 newProps 合并到匹配 type + field 的 rule 的 props（穿透子表内部）。
 * 找到并更新后返回 true；未找到返回 false。
 */
export function patchFieldProps(rules: RuleLike[] | undefined, type: string, field: string, newProps: Record<string, any>): boolean {
  let found = false
  walkRules(rules, (rule) => {
    if (found) return
    if (rule.type === type && rule.field === field) {
      rule.props = { ...(rule.props || {}), ...newProps }
      found = true
    }
  })
  return found
}