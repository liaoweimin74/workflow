/**
 * 递归遍历 form-create rule 树。
 * 兼容两种容器结构：
 * - 布局容器（fcRow/fc-col 等）：子字段在 `children`
 * - subForm 保存结构：designer.getRule() 经 parseRule 后子字段在 `props.rule`（children 被删除）
 *
 * 背景：@form-create/designer 对 subForm 的 loadRule/parseRule 会做结构转换——
 * 设计器内以 FcRow+children 呈现，但 getRule() 输出为 subForm+props.rule。
 * 遍历 rule 时必须同时处理两种形态，否则子表内的字段（如 LookupPicker/dataPicker）
 * 既无法被发现、配置也无法写入（子表内字段渲染时 props 为空 → 数据源未配置）。
 */
export function walkRules(rules: any[], visit: (r: any) => void): void {
  for (const r of rules) {
    visit(r)
    if (Array.isArray(r?.children)) walkRules(r.children, visit)
    if (Array.isArray(r?.props?.rule)) walkRules(r.props.rule, visit)
  }
}

/** 收集 schema 中指定类型的字段（field → props） */
export function collectFieldsByType(rules: any[], type: string): { field: string; props: Record<string, any> }[] {
  const fields: { field: string; props: Record<string, any> }[] = []
  walkRules(rules, (r) => {
    if (r?.type === type && r.field) {
      fields.push({ field: r.field, props: r.props || {} })
    }
  })
  return fields
}

/** 收集 schema 中所有字段 key */
export function collectFieldKeys(rules: any[]): string[] {
  const keys: string[] = []
  walkRules(rules, (r) => {
    if (r?.field) keys.push(r.field)
  })
  return keys
}

/** 更新指定 field 的 props（合并 newProps，保留已有配置） */
export function updateFieldProps(rules: any[], field: string, type: string, newProps: Record<string, any>): void {
  walkRules(rules, (r) => {
    if (r?.type === type && r.field === field) {
      r.props = { ...(r.props || {}), ...newProps }
    }
  })
}
