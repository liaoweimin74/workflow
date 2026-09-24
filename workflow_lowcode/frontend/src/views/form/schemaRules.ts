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

/**
 * 递归设置 rule 树中所有字段的 disabled（含 fcRow/col 布局 children、group/subForm 的 props.rule、
 * tableForm 的 props.columns[].rule 子表内部字段），保证只读查看下子表内部字段也不可编辑。
 */
export function deepDisableRules(rules: any[]): any[] {
  return rules.map(deepDisableField)
}

/** 单字段只读：设置 props.disabled 并递归到子字段（布局 children / props.rule / props.columns[].rule） */
export function deepDisableField(field: any): any {
  // 字符串子节点（text/button 文字内容）原样透传，避免 {...'文字'} 展开为字符索引对象
  if (typeof field !== 'object' || field === null) return field
  const f = field as Record<string, any>
  const fieldProps = (f.props as Record<string, any>) || {}
  const next: Record<string, any> = { ...f, props: { ...fieldProps, disabled: true } }
  if (Array.isArray(f.children)) {
    next.children = (f.children as any[]).map(deepDisableField)
  }
  // group/subForm 子表单：内部字段在 props.rule
  if (Array.isArray(fieldProps.rule)) {
    next.props = { ...next.props, rule: (fieldProps.rule as any[]).map(deepDisableField) }
  }
  // tableForm 子表：内部字段在 props.columns[].rule（每列一个 rule 数组）
  if (Array.isArray(fieldProps.columns)) {
    next.props = {
      ...next.props,
      columns: (fieldProps.columns as Record<string, any>[]).map((col) => {
        if (col && Array.isArray(col.rule)) {
          return { ...col, rule: (col.rule as any[]).map(deepDisableField) }
        }
        return col
      }),
    }
  }
  return next
}

/** 更新指定 field 的 props（合并 newProps，保留已有配置） */
export function updateFieldProps(rules: any[], field: string, type: string, newProps: Record<string, any>): void {
  walkRules(rules, (r) => {
    if (r?.type === type && r.field === field) {
      r.props = { ...(r.props || {}), ...newProps }
    }
  })
}

/**
 * 递归将 formContainer 类型转为 fcRow（props.rule → children），
 * 使 form-create 运行时能渲染容器及其子组件。
 * 与设计器 loadRule 钩子（vendor/config/rule/formContainer.js）逻辑一致。
 * 不修改原始 rule 对象，返回新数组。
 */
export function normalizeForRender(rules: any[]): any[] {
  return rules.map((rule) => {
    // 字符串/非对象子节点（text/button 等组件的文字内容）原样透传，
    // 避免 {...'文字'} 展开为字符索引对象 {0:'文',1:'字'} 被 form-create 当作未知组件 → fallback input
    if (typeof rule !== 'object' || rule === null) return rule
    const r = rule as Record<string, any>
    if (r.type === 'formContainer') {
      const props = { ...(r.props || {}) }
      const childRules = Array.isArray(props.rule) ? props.rule : []
      delete props.rule
      return {
        ...r,
        type: 'FcRow',
        props,
        children: normalizeForRender(childRules),
      }
    }
    // 递归处理 children 和 props.rule（subForm 等）
    const next: Record<string, any> = { ...r }
    if (Array.isArray(r.children)) {
      next.children = normalizeForRender(r.children)
    }
    if (r.props && Array.isArray(r.props.rule)) {
      next.props = { ...r.props, rule: normalizeForRender(r.props.rule) }
    }
    return next
  })
}
