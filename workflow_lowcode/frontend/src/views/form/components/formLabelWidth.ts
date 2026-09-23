/** 根据 form-create 规则树计算字段标签宽度。 */
export function measureFormLabelWidth(rules: any[]): number {
  const labels: string[] = []
  const collect = (items: any[]) => {
    for (const rule of items || []) {
      const label = rule?.title ?? rule?.label
      if (typeof label === 'string' && label.trim()) labels.push(label.trim())
      if (Array.isArray(rule?.children)) collect(rule.children)
      if (Array.isArray(rule?.props?.rule)) collect(rule.props.rule)
      if (Array.isArray(rule?.props?.columns)) {
        for (const column of rule.props.columns) {
          if (Array.isArray(column?.rule)) collect(column.rule)
        }
      }
    }
  }
  collect(rules)
  if (labels.length === 0) return 80

  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  const context = canvas?.getContext('2d')
  if (context && typeof window !== 'undefined') {
    const sample = document.createElement('span')
    document.body.appendChild(sample)
    const style = window.getComputedStyle(sample)
    context.font = [style.fontStyle, style.fontVariant, style.fontWeight, style.fontSize, style.fontFamily]
      .filter(Boolean)
      .join(' ')
    sample.remove()
    const maxTextWidth = Math.max(...labels.map(label => context.measureText(label).width))
    return Math.min(Math.max(Math.ceil(maxTextWidth) + 24, 72), 160)
  }

  const maxEstimatedWidth = Math.max(...labels.map(label =>
    [...label].reduce((width, char) => width + (char.charCodeAt(0) > 255 ? 14 : 7), 0)))
  return Math.min(Math.max(maxEstimatedWidth + 24, 72), 160)
}
